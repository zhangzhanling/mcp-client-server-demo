# MCP Client + Server 学习 Demo 实现方案

> 依据：`requirements.md`
> 定位：用于学习 MCP 架构与调用流程的最小可运行项目，非生产级实现。
> 本方案对应需求文档第 6 节的阶段 0 ~ 阶段 6，采用「分阶段实施 + 每阶段验收」的协作方式。

## 1. 结论摘要（阶段 0：环境与 SDK 确认）

| 项目 | 取值 | 依据 |
|---|---|---|
| Node.js | v22.22.0 (LTS) | 本机已验证，满足 SDK `engines: node >=18` |
| npm | 10.9.4 | 本机已验证 |
| SDK 包 | `@modelcontextprotocol/sdk` | 需求文档第 3 节明确指定该包名 |
| SDK 版本 | `^1.32.1`（npm `latest`） | 当前稳定 v1 线；生态成熟、示例多、与需求文档 API 描述一致 |
| Zod | `^4` | SDK peer 依赖 `zod ^3.25 || ^4.0`，且 SDK 内部导入 `zod/v4` |
| Schema 写法 | `registerTool` 的 `inputSchema` 使用 **raw shape**（如 `{ name: z.string() }`） | v1 的 `McpServer.registerTool` 契约 |
| 模块系统 | ESM（`"type": "module"`） | 与 SDK `import` 子路径导出兼容 |
| 运行方式 | `tsc` 编译为 JS，Client 用 `process.execPath` + `dist/server.js` 拉起 Server 子进程 | 最稳定、路径明确、无 loader 运行时依赖 |
| 传输方式 | `StdioServerTransport` + `StdioClientTransport` | 需求文档第 3 节 |

### 关于两条 SDK 线的说明

- **v1**：包名 `@modelcontextprotocol/sdk`（本项目采用）。子路径导出：`server/mcp.js`、`server/stdio.js`、`client/index.js`、`client/stdio.js`；依赖 `cross-spawn`，Windows 子进程 spawn 兼容。
- **v2**：拆分为 `@modelcontextprotocol/server` + `@modelcontextprotocol/client`，实现 2026-07-28 规范，`registerTool` 使用 `z.object(...)`。本项目不采用。
- 需求文档第 3 节写明「官方 `@modelcontextprotocol/sdk`」，故锁定 v1。

> 提示：不同主版本 API 不完全相同，本文档以安装的 `1.32.x` 的类型定义与源码为准。

## 2. 交付文件与目录结构

```text
mcp-client-server-demo/
├── package.json            # type:module, scripts: build/clean/start/dev
├── tsconfig.json           # NodeNext ESM, ES2022, outDir dist
├── README.md               # 安装、运行、测试命令
├── docs/
│   ├── implementation-plan.md   # 本文档
│   └── learning-notes.md        # 各阶段协议观察、关键代码与疑问
└── src/
    ├── server.ts           # McpServer + 3 个 Tool + StdioServerTransport
    └── client.ts           # Client + StdioClientTransport + listTools + callTool
```

职责划分：

- `server.ts`：创建 `McpServer`、注册 Tool、创建 `StdioServerTransport` 并连接。
- `client.ts`：创建 `Client`、拉起 Server 子进程、创建 `StdioClientTransport`、连接、列出 Tool、调用 Tool、输出结果并清理连接。
- 避免过早拆分大量文件；本项目首要目标是理解调用链。

## 3. 依赖与配置文件方案

### 3.1 package.json（要点）

- `"type": "module"`
- dependencies：`@modelcontextprotocol/sdk@^1.32.1`、`zod@^4`
- devDependencies：`typescript`、`@types/node`
- scripts：
  - `"build": "tsc"`
  - `"clean": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true})\""`（跨平台，无需额外依赖）
  - `"start": "node dist/client.js"`（由 client 自动拉起 server）

### 3.2 tsconfig.json（要点）

- `module: "NodeNext"`、`moduleResolution: "NodeNext"`
- `target: "ES2022"`
- `rootDir: "src"`、`outDir: "dist"`
- `strict: true`
- `esModuleInterop: true`、`skipLibCheck: true`

> 说明：server 与 client 为两个独立入口、互不 import，ESM 下无需跨文件相对导入扩展名处理。

## 4. 分阶段实施方案

### 阶段 1 — 只实现 Server（`src/server.ts`）

目标：创建并连接一个 stdio MCP Server，暴露三个 Tool。

涉及 MCP 概念：MCP Server、Tool 定义（name/description/inputSchema）、stdio Transport、能力协商被 Client 触发。

实现要点：

1. `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"`。
2. `import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"`。
3. `import { z } from "zod"`。
4. `new McpServer({ name, version })`。
5. 用 `registerTool(name, config, handler)` 注册三个 Tool，`inputSchema` 使用 raw shape：

   | Tool | inputSchema | handler 返回（content 文本） |
   |---|---|---|
   | `greet` | `{ name: z.string() }` | `Hello, <name>!` |
   | `add` | `{ a: z.number(), b: z.number() }` | 两数之和的字符串 |
   | `get_current_time` | `{}` | `new Date().toISOString()` |

   返回结构统一为 `{ content: [{ type: "text", text: "..." }] }`。

6. `await server.connect(new StdioServerTransport())`。
7. 教学日志一律 `console.error`（stderr）；**stdout 只保留 MCP 协议通信**。

学习重点：`registerTool()` 是否立即执行 handler（否，仅注册元数据与函数）；描述与 Schema 何时被 Client 获取（`tools/list` 时）。

验收标准：Server 能被 Client 拉起，且 stdout 无普通日志污染协议。

### 阶段 2 — Client 连接与 Tool 发现（`src/client.ts`）

目标：Client 拉起 Server 子进程，连接并列出 Tool 定义。

实现要点：

1. `import { Client } from "@modelcontextprotocol/sdk/client/index.js"`。
2. `import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"`。
3. `new Client({ name, version })`。
4. `new StdioClientTransport({ command: process.execPath, args: [distServerPath] })`。
   - 路径用 `fileURLToPath(new URL(...))` 或基于 `import.meta.url` 解析为**绝对路径**，避免相对路径问题。
   - 不手动启动 server 脚本，`connect()` 负责子进程生命周期与 JSON-RPC 初始化。
5. `await client.connect(transport)`（内部触发 `initialize` 握手）。
6. `await client.listTools()`，格式化输出每个 Tool 的 `name`、`description`、`inputSchema`。
7. 用 `try/finally` 确保 `await client.close()`（关闭 transport 并终止子进程）。

学习重点：`connect()` 触发的初始化流程；`initialize` 请求/响应内容；`tools/list` 返回的是元数据而非执行结果；Client 无需导入 Server 的 handler。

验收标准：运行 Client 后能看到三个 Tool 的定义。

### 阶段 3 — 通过 Client 调用 Tool

目标：依次调用三个 Tool 并输出结果。

实现要点：

1. `await client.callTool({ name: "greet", arguments: { name: "Tom" } })`。
2. `await client.callTool({ name: "add", arguments: { a: 1, b: 2 } })`。
3. `await client.callTool({ name: "get_current_time", arguments: {} })`。
4. 每次输出：Tool 名称、输入参数、`result.content`；检查 `result.isError` 并做可读处理。

学习重点：`callTool()` 与 MCP `tools/call` 的对应；Server 如何按名称找到 handler；handler 返回值如何变成 MCP 结果；参数不符 Schema / handler 异常的表现；requestId 与响应的关联由哪层负责。

验收标准：三个 Tool 均调用成功，结果符合预期语义（不要求与占位 JSON 完全一致）。

### 阶段 4 — 观察完整通信流程

目标：用 stderr 教学日志还原一次调用的完整路径。

实现要点：

- Client：开始连接 / 已连接 / 请求列出 Tool / 收到结果 / 正在关闭连接。
- Server：handler 内记录收到与开始执行某 Tool、执行结束。
- 提供 `MCP_DEBUG` 环境变量开关，用于观察「原始 JSON-RPC 消息」，并与「应用层日志」明确区分。
- 不修改 SDK 内部协议代码来伪造日志。

学习重点：哪些流程由 SDK 自动处理、哪些是业务代码；Transport / JSON-RPC / Tool 分发各层职责；`initialize` 与 `tools/list` 是否由业务代码显式发送（按所装版本源码回答）。

验收标准：能用日志 + 源码说明一次 Tool 调用的完整路径。

### 阶段 5 — 故障与边界测试

测试场景与观察记录：

| 场景 | 预期表现 | 错误产生/捕获层级 |
|---|---|---|
| Tool 名称拼错 | 返回错误结果（`isError` 或抛错） | Server 分发层 |
| 参数缺失/类型错误 | SDK Schema 校验拦截 | SDK 校验层（handler 不执行） |
| handler 抛异常 | `isError: true` 的结果 | handler → Server → 结果 |
| Server 启动失败 | Client `connect()` 抛错 | Client transport 层 |
| Client 连接/调用失败 | 可读错误输出 | Client |
| 调用完成清理 | `client.close()` 后子进程退出 | Client/transport |
| stdout 检查 | 无意外日志 | Server |

验收标准：失败时有可理解的错误输出，资源按预期清理。

### 阶段 6 — 阅读 SDK 源码并建立调用链

以当前安装版本为准，先搜索方法定义与调用位置，不要假定文件路径/类名不变。追踪链路：

1. Client `connect()` → 初始化握手。
2. Client `listTools()` → 工具列表请求。
3. Client `callTool()` → 工具调用请求。
4. Server Tool 注册 API → 元数据与 handler 的保存方式。
5. Server 请求分发 → 按方法与 Tool 名执行 handler。
6. `StdioClientTransport` / `StdioServerTransport` → 进程流读写。
7. 协议层 → requestId 关联、响应返回与错误处理。

每条链路记录：入口方法、关键下一跳、关键数据结构、输入传递、返回值回传，以及哪些属于 MCP 协议要求、哪些属于 SDK 实现。

验收标准：能画出从 `client.callTool()` 到 Server handler 再返回 Client 的源码调用链，并写入 `docs/learning-notes.md`。

## 5. 运行与验收命令

从项目根目录 `mcp-client-server-demo/` 执行：

```bash
npm install
npm run build
npm start
```

预期：一条 `npm start` 命令启动 Client，Client 自动拉起 Server，完成 `initialize` → `tools/list` → 三次 `tools/call`，并在终端输出 Tool 定义与调用结果。

## 6. 完成后的自测清单

- [ ] Client 能启动 Server 子进程。
- [ ] Client 和 Server 使用 stdio 通信。
- [ ] 初始化流程成功完成。
- [ ] `tools/list` 能返回三个 Tool 的定义。
- [ ] `greet` 调用成功。
- [ ] `add` 调用成功。
- [ ] `get_current_time` 调用成功。
- [ ] 能解释 `registerTool()`、`listTools()`、`callTool()` 的职责。
- [ ] 能区分 MCP 方法、SDK API、Tool handler。
- [ ] stdout 没有非协议日志。
- [ ] 失败场景有合理处理。
- [ ] Client/Transport/Server 子进程能正常清理。
- [ ] 已记录关键源码入口和调用链。

## 7. 代码质量与安全约束

- 只实现学习所需的最小功能，不加入不必要的抽象。
- 输入 Schema 明确，类型由 TypeScript 正确推导。
- 不把 MCP 协议消息或调试日志写入 stdio Server 的 stdout。
- 使用 `try/finally` 或 SDK 推荐的生命周期管理方式清理 Client/Transport。
- 不硬编码与旧版本绑定的 API；以当前安装版本为准。
- 不接入 LLM，不把手动选择 Tool 描述成 LLM 的 Function Calling。
- 不实现文件读写 Tool。

## 8. 下一阶段预告（本项目不实现）

不使用 MCP SDK，手写教学用 Mini MCP，仅实现最小范围的 `initialize`、`tools/list`、`tools/call` 与 stdio 消息处理，与官方 SDK 逐项对照。仅用于学习，不作为完整规范实现或生产代码。
