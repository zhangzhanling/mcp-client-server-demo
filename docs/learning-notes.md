# 学习笔记：MCP 调用链观察

> 记录各阶段的协议观察、关键代码与疑问。
> SDK 版本：`@modelcontextprotocol/sdk@1.32.x`（v1 线）；文中 `node_modules` 路径的行号随版本可能变化，以方法名为准。

## 阶段 0：环境与 SDK 确认

- Node v22.x LTS；SDK 采用 `@modelcontextprotocol/sdk`（v1），Zod v4。
- v1 与 v2 差异：v1 单包 + `.js` 子路径导出（`server/mcp.js` 等），`registerTool` 的 `inputSchema` 用 **raw shape**；v2 拆成 `@modelcontextprotocol/server` / `client`，`inputSchema` 用 `z.object(...)`。

## 阶段 1：Server

- `new McpServer({name, version})`：创建 Server 实例，保存服务标识，内部维护 `_registeredTools`。
- `registerTool(name, {description, inputSchema}, handler)`：**只注册**，不执行 handler。注册时保存元数据与函数。
- `initialize` 响应中的 `capabilities.tools` 来自 SDK 自动声明；三个 Tool 的 JSON Schema 由 Zod raw shape 转换而来，仅在 `tools/list` 时返回。
- stdout 纯净性验证：直接向 `node dist/server.js` 管道输入 `initialize` + `tools/list`，stdout 仅含合法 JSON-RPC，`[server] ...` 日志只出现在 stderr。

## 阶段 2：Client 连接与 Tool 发现

- `new StdioClientTransport({command: process.execPath, args: [dist/server.js]})`：由 Client 负责 spawn，**不手动启动** server。
- `client.connect(transport)`：客户端**自动**发送 `initialize` 并发送 `notifications/initialized`，业务代码无需显式发送。
- `client.listTools()`：返回 Tool **元数据**（name/description/inputSchema），不是执行结果。
- Client 不 import 任何 handler，证明了协议边界：两端仅通过消息交互。

## 阶段 3：调用 Tool

- `client.callTool({name, arguments})` → 发送 MCP `tools/call`；返回 `CallToolResult`，`content` 为内容块数组，`isError` 标记失败。
- 观察：`greet({"name":"Tom"})` → `Hello, Tom!`；`add({"a":1,"b":2})` → `3`；`get_current_time({})` → ISO 字符串。

## 阶段 4：完整通信流程（原始 JSON-RPC）

`MCP_DEBUG=1` 时两端原始消息（节选）：

```text
[rpc:client] -> {"method":"initialize",...,"id":0}
[rpc:server] <- {"jsonrpc":"2.0","id":0,"method":"initialize",...}
[rpc:server] -> {"result":{...,"capabilities":{"tools":{...}},...},"id":0}
[rpc:client] -> {"method":"notifications/initialized","jsonrpc":"2.0"}
[rpc:client] -> {"method":"tools/list","jsonrpc":"2.0","id":1}
[rpc:client] -> {"method":"tools/call","params":{"name":"greet","arguments":{"name":"Tom"}},"id":2}
[rpc:server] <- {"id":2,"method":"tools/call",...}
[server] handler greet start (name=Tom)
[rpc:server] -> {"result":{"content":[{"type":"text","text":"Hello, Tom!"}]},"id":2}
[rpc:client] <- {"jsonrpc":"2.0","id":2,"result":{...}}
```

要点：

- request `id` 由 SDK 生成并关联请求/响应；业务代码不处理。
- `initialize` / `notifications/initialized` / `tools/list` 均由 SDK 在 `connect()`/`listTools()` 内自动发送。
- 分层：Transport 负责字节流（stdio），Protocol 层负责 JSON-RPC，McpServer 层负责 Tool 分发；应用日志与协议消息是两回事。
- **环境变量陷阱**：`StdioClientTransport` 默认只继承白名单环境变量（`getDefaultEnvironment()`），因此 `MCP_DEBUG` 不会自动传给子进程；需通过 `env` 选项显式转发。

## 阶段 5：故障与边界（实测结果）

| 场景 | 实际表现 | 产生/捕获层级 |
|---|---|---|
| Server 启动失败（command 不存在） | `connect()` 抛 `MCP error -32000: Connection closed` | Client transport / spawn |
| Tool 名称拼错 | `isError:true`，content 文本 `MCP error -32602: Tool does_not_exist not found` | Server 分发层 |
| 参数类型错误 | `isError:true`，`Input validation error: ... expected number, received string`，handler 未执行 | SDK Schema 校验层 |
| handler 抛异常 | `isError:true`，文本为抛出的错误信息 | handler → Server → 结果 |
| `close()` 后 | 子进程已退出（`process.kill(pid,0)` 抛错，`alive:false`） | Client / transport |

结论：失败以「工具结果（`isError`）」或「连接级异常」两种形态返回，需分别在业务层与 `try/catch` 中处理。

## 阶段 6：源码调用链（入口定位）

以已安装版本为准，按方法名搜索定位：

| 环节 | 入口 | 关键下一跳 |
|---|---|---|
| Client 连接/握手 | `client/index.js` `Client.connect()`（约 :274） | 设置 transport 回调 → `transport.start()` → 发送 `initialize` |
| 列出 Tool | `client/index.js` `Client.listTools()`（约 :554） | `Protocol.request()` 发送 `tools/list` |
| 调用 Tool | `client/index.js` `Client.callTool()`（约 :479） | `Protocol.request()` 发送 `tools/call`，校验 `CallToolResult` |
| Tool 注册 | `server/mcp.js` `registerTool()`（`_registeredTools` 于 :58） | 保存 name/description/schema/handler |
| tools/list 处理 | `server/mcp.js` `setRequestHandler(ListToolsRequestSchema)`（约 :107） | 读取 `_registeredTools` 生成定义 |
| tools/call 分发 | `server/mcp.js` `setRequestHandler(CallToolRequestSchema)`（约 :140） | 按 `params.name` 查 handler（约 :142）→ 校验入参 → 执行 |
| 请求路由 | `shared/protocol.js`（约 :289） | `this._requestHandlers.get(request.method)`，`setRequestHandler` 约 :914 |
| stdio 读写 | `client/stdio.js`（spawn 约 :65）、`server/stdio.js` | 进程 stdin/stdout 的 ReadBuffer/serialize |
| requestId 关联 | `shared/protocol.js` | 发送时分配 `id`，收到响应按 `id` 匹配 pending resolver |

一次 `callTool` 的完整链路：

```text
client.callTool()
  -> Protocol.request(tools/call, id=N)
    -> transport.send()
      -> [stdio] server stdin
        -> Protocol 读取 -> 按 method 路由 -> mcp.js tools/call handler
          -> _registeredTools[name].handler(args)
            -> 返回值封装为 CallToolResult
      <- [stdio] server stdout
    <- transport.onmessage
  <- 按 id=N 匹配 resolver -> 返回给 callTool 调用方
```

## 待深入

- `initialize` 协商出的 `protocolVersion`（当前 `2025-11-25`）如何影响能力集。
- 通知（notifications）在 `listChanged` 等场景的触发时机。
- 下一阶段：不依赖 SDK 手写 Mini MCP，对照实现 `initialize` / `tools/list` / `tools/call`。
