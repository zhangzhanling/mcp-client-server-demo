# MCP Client + Server 学习 Demo 实施指南

> 用途：将本文档交给 AI 编程助手，让它按阶段生成代码、协助调试，并在每个阶段解释 MCP 的真实运行机制。
>
> 项目定位：这是一个用于学习 MCP 架构与调用流程的最小可运行项目，不是生产级 MCP 实现。

## 1. 学习目标

使用 **TypeScript + 官方 MCP TypeScript SDK + stdio**，实现一个可以实际运行的 MCP Client 和 MCP Server。

完成后，应该能够独立解释并验证以下流程：

```text
Client 启动 Server 子进程
        ↓
建立 stdio 通信
        ↓
initialize：初始化与能力协商
        ↓
tools/list：发现 Server 暴露的 Tool
        ↓
Client 展示可用 Tool 定义
        ↓
tools/call：调用指定 Tool
        ↓
Server 执行 Tool handler
        ↓
返回 CallToolResult
        ↓
Client 输出调用结果
```

第一阶段**不接入 LLM**。Client 由代码显式选择 Tool 并调用它。这样可以先隔离并理解 MCP Client/Server 协议，不把 LLM 的决策逻辑混进来。

## 2. 要达到的目的

完成项目后，应当能够：

1. 说清楚 MCP、JSON-RPC、Transport、SDK 四者的关系。
2. 区分 MCP Client、MCP Server、Tool handler 各自的职责。
3. 理解 `initialize`、`tools/list`、`tools/call` 分别解决什么问题。
4. 知道 `registerTool()` 是如何把 Tool 的名称、描述、输入 Schema 与执行函数关联起来的。
5. 知道 `listTools()` 获取的是 Tool 定义，而不是执行 Tool。
6. 知道 `callTool()` 发起的是 MCP 工具调用，不是直接调用 Server 里的 JavaScript 函数。
7. 理解 stdio 如何让 Client 与 Server 子进程通信，以及为什么 Server 不应把普通日志写入 stdout。
8. 能够根据日志和断点追踪一次调用从 Client 到 Server 再返回的路径。
9. 为下一阶段“不使用 SDK 实现 Mini MCP”做好准备。

## 3. 技术约束

- 语言：TypeScript。
- 运行环境：Node.js 当前受支持的 LTS 版本。
- MCP 实现：官方 `@modelcontextprotocol/sdk`。
- 传输方式：`StdioClientTransport` + `StdioServerTransport`。
- Schema 校验：使用 SDK 示例/当前版本推荐的 Zod 集成方式。
- 模块系统：采用项目模板与 SDK 版本兼容的 ESM 配置。
- 不接入真实 LLM、外部 API、数据库或文件系统。
- 不实现 HTTP、Resource、Prompt、OAuth、Sampling、Elicitation、Tasks 等扩展能力。
- 先检查官方 SDK 当前文档与包版本，再生成代码；不要假设不同主版本的 API 完全相同。

官方参考：

- TypeScript SDK 仓库：<https://github.com/modelcontextprotocol/typescript-sdk>
- Examples：<https://github.com/modelcontextprotocol/typescript-sdk/tree/main/examples>
- Server 包：<https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/server>
- Client 包：<https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/client>

## 4. Demo 功能范围

Server 只暴露以下三个简单 Tool：

| Tool 名称 | 输入 | 行为 | 用途 |
|---|---|---|---|
| `greet` | `name: string` | 返回问候语 | 理解字符串参数与文本结果 |
| `add` | `a: number, b: number` | 返回两数之和 | 理解参数 Schema 与结果 |
| `get_current_time` | 无参数 | 返回当前时间的 ISO 字符串 | 理解无参数 Tool |

所有 Tool 都只做纯本地操作，避免无关业务复杂度。

预期测试示例：

- `greet({ name: "Tom" })` → 返回包含 `Hello, Tom!` 的文本。
- `add({ a: 1, b: 2 })` → 返回包含 `3` 的文本。
- `get_current_time({})` → 返回有效的 ISO 时间字符串。

注意：上面是预期语义，不要求把结果硬编码成完全相同的 JSON；具体返回结构应符合当前 SDK 版本的类型定义。

## 5. 建议项目结构

```text
mcp-client-server-demo/
├── package.json
├── tsconfig.json
├── README.md
├── docs/
│   └── learning-notes.md
└── src/
    ├── server.ts
    └── client.ts
```

职责划分：

- `server.ts`：创建 `McpServer`、注册 Tool、创建 `StdioServerTransport` 并连接。
- `client.ts`：创建 `Client`、启动 Server 子进程、创建 `StdioClientTransport`、连接、列出 Tool、调用 Tool、输出结果并清理连接。
- `README.md`：记录安装、运行、测试命令。
- `docs/learning-notes.md`：记录每个阶段的协议观察、关键代码与疑问。

避免过早拆分成大量文件。此项目的首要目标是理解调用链，而不是设计大型工程。

## 6. 实施步骤

### 阶段 0：检查 SDK 与运行环境

1. 确认 Node.js 和 npm 可用。
2. 阅读官方 TypeScript SDK 的当前快速开始文档与 `examples/tools/`。
3. 确认当前稳定 SDK 版本、包名、导入路径及 Tool Schema 写法。
4. 使用与该版本匹配的 ESM/TypeScript 配置。
5. 记录所采用的 SDK 版本，避免后续代码与文档版本不一致。

**验收标准：** 能说明项目采用哪个 SDK 版本，以及选择该版本的依据。

### 阶段 1：只实现 Server

在 `src/server.ts` 中：

1. 创建 MCP Server，填写名称和版本。
2. 注册 `greet`、`add`、`get_current_time` 三个 Tool。
3. 每个 Tool 都声明名称、描述、输入 Schema 和 handler。
4. 创建 `StdioServerTransport`。
5. 调用 SDK 提供的连接方法启动 Server。
6. 确保 stdout 只用于 MCP 协议通信；调试信息写入 stderr。

**学习重点：**

- Server 实例保存了哪些信息？
- `registerTool()` 是否立即执行 handler？为什么？
- Tool 的描述与 Schema 在什么时候会被 Client 获取？
- 为什么 stdio Server 不能随意 `console.log()` 到 stdout？

**验收标准：** Server 可以由 Client 启动，不会因为 stdout 日志污染协议消息。

### 阶段 2：实现 Client 的连接与 Tool 发现

在 `src/client.ts` 中：

1. 创建 MCP `Client` 实例。
2. 使用 `StdioClientTransport` 指定启动 `server.ts` 的命令和参数。
3. 使用 SDK 推荐方式启动 TypeScript Server；确保子进程启动命令兼容当前构建/执行方案。
4. 连接 Client 与 Transport。
5. 调用 `listTools()`。
6. 将 Tool 的名称、描述和输入 Schema 格式化输出。
7. 在完成或出错时正确关闭连接并清理子进程。

**学习重点：**

- Client 如何启动并连接 Server？
- `connect()` 背后触发了哪些初始化流程？
- `initialize` 的请求与响应分别包含什么？
- `tools/list` 返回的是元数据还是 Tool 执行结果？
- 为什么 Client 不需要直接导入 Server 中的 handler 函数？

**验收标准：** 运行 Client 后，能够看到三个 Tool 的定义。

### 阶段 3：通过 Client 调用 Tool

在 Client 中依次调用：

1. `greet`，参数为 `{ name: "Tom" }`。
2. `add`，参数为 `{ a: 1, b: 2 }`。
3. `get_current_time`，使用符合 SDK 要求的空参数对象或调用形式。

输出每次调用的 Tool 名称、输入参数和返回结果。对错误进行可读的处理。

**学习重点：**

- `callTool()` 的参数如何对应 MCP 的 `tools/call`？
- Server 如何根据 Tool 名称找到 handler？
- handler 返回的内容如何变成 MCP 的工具调用结果？
- 如果 Tool 名称不存在、参数不符合 Schema 或 handler 抛出异常，会发生什么？
- 一次请求的 ID 与响应是如何关联的？SDK 哪一层负责处理？

**验收标准：** 三个 Tool 均可通过 MCP Client 调用，结果符合预期。

### 阶段 4：观察完整通信流程

在 Client 和 Server 的关键位置添加**写入 stderr 的教学日志**，例如：

- Client 开始连接。
- Client 已连接。
- Client 请求列出 Tool。
- Server 收到/开始执行某个 Tool（若 SDK 的封装层不便直接观察原始协议，则在 handler 内记录）。
- Tool 执行结束。
- Client 收到结果。
- Client 正在关闭连接。

不要为了打印日志而修改 SDK 内部协议代码。要区分“应用层日志”和“真实 JSON-RPC 原始消息”：前者只能说明业务代码执行到了某一步，不能单独证明线上/管道中的原始消息长什么样。

**学习重点：**

- 哪些流程由 SDK 自动处理？
- 哪些代码是自己写的业务逻辑？
- 哪一层负责 Transport，哪一层负责 JSON-RPC，哪一层负责 Tool 分发？
- `initialize` 和 `tools/list` 是否都由业务代码显式发送？请根据所用 SDK 版本的真实实现回答，不要凭猜测。

**验收标准：** 能用日志和源码说明一次 Tool 调用的完整路径。

### 阶段 5：故障与边界测试

至少测试以下场景：

- Tool 名称拼错。
- Tool 参数缺失或类型错误。
- Tool handler 抛出异常。
- Server 启动失败。
- Client 连接或调用失败。
- 调用完成后 Client 是否关闭连接、Server 子进程是否退出。
- Server stdout 是否存在意外日志。

记录每种场景的实际表现，并说明错误是在哪一层产生、捕获和返回的。

**验收标准：** 失败时有可理解的错误输出，程序能按预期清理资源。

### 阶段 6：阅读 SDK 源码并建立调用链

在 Demo 运行成功后，再从 SDK 源码追踪以下链路。以当前安装的 SDK 版本为准，先搜索方法定义与调用位置，不要假定源码文件路径或内部类名永远不变。

1. Client 的 `connect()` → 初始化握手。
2. Client 的 `listTools()` → 发送工具列表请求。
3. Client 的 `callTool()` → 发送工具调用请求。
4. Server 的 Tool 注册 API → Tool 元数据与 handler 如何被保存。
5. Server 的请求分发 → 如何根据请求方法和 Tool 名称执行 handler。
6. `StdioClientTransport` / `StdioServerTransport` → 如何读写进程流。
7. 协议层 → 如何关联 request ID、返回响应并处理错误。

每追踪一条链路，都记录：

- 入口方法。
- 关键调用的下一跳。
- 关键数据结构。
- 输入如何传递。
- 返回值如何回到调用方。
- 哪些属于 MCP 协议要求，哪些属于 SDK 的具体实现。

**验收标准：** 可以画出从 `client.callTool()` 到 Server handler，再返回 Client 的源码调用链。

## 7. 运行与调试要求

请 AI 根据当前 SDK 版本生成可运行的 `package.json`、`tsconfig.json`、`src/server.ts` 和 `src/client.ts`，并提供精确的安装与运行命令。

建议提供两种运行方式中的一种，优先选择更稳定、最容易调试的方式：

- 使用当前 Node.js/TypeScript 工具链直接运行 TypeScript；或
- 先编译为 JavaScript，再由 Node.js 启动编译产物。

如果采用编译方式，需要明确 Client 启动 Server 的实际命令、编译输出路径和相对路径解析方式。不要把示例中的占位命令当作可直接运行的命令。

运行成功后，应能一条命令启动 Client，由 Client 自动启动 Server 并完成发现与调用。

## 8. 代码质量与安全约束

- 只实现学习所需的最小功能，不加入不必要的抽象。
- 输入 Schema 必须明确，类型必须由 TypeScript 正确推导。
- 不要把 MCP 协议消息或调试日志写到 stdio Server 的 stdout。
- 使用 `try/finally` 或 SDK 推荐的生命周期管理方式清理 Client/Transport。
- 不要硬编码与特定旧版本 SDK 绑定的 API；先确认当前依赖版本。
- 不要声称 Demo 已经覆盖全部 MCP 规范。
- 不接入 LLM，不把 Client 中手动选择 Tool 描述成 LLM 的 Function Calling。
- 不实现文件读写 Tool，以免把学习重点转移到文件系统权限和路径安全。

## 9. 完成后的自测清单

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

## 10. 给 AI 编程助手的协作指令

请严格遵循以下方式帮助我完成项目：

1. **分阶段实施，不要一次性生成全部代码。** 先完成阶段 0，确认 SDK 版本和项目配置，再进入阶段 1。
2. 每个阶段先说明本阶段目标、涉及的 MCP 概念和要创建/修改的文件。
3. 每次只提交当前阶段所需的最小代码变更。
4. 给出可复制的终端命令，并说明从哪个目录执行。
5. 代码生成后解释关键行，尤其要区分 SDK API 与 MCP 协议方法。
6. 每个阶段提供验收步骤、预期输出和常见错误排查。
7. 如果官方 SDK API 已变化，以当前安装版本的官方文档、类型定义和源码为准；明确指出版本差异，不要猜测。
8. 遇到错误时先根据完整错误信息定位原因，不要无依据地重写整个项目。
9. 鼓励我先预测运行结果，再解释实际输出，帮助我建立原理层面的理解。
10. 阶段 6 请引导我按调用链阅读源码，不要只给源码文件清单。
11. 当前项目不接入 LLM；完成后再讨论如何将 MCP Client 集成到 Agent Loop。
12. 除非我明确要求，否则不要提前扩展到 Resource、Prompt、HTTP、OAuth 等主题。

## 11. 下一阶段预告（本项目不实现）

完成本 Demo 后，再独立开展下一阶段：

**不使用 MCP SDK，手写一个教学用 Mini MCP**，仅实现最小范围的 `initialize`、`tools/list`、`tools/call` 与 stdio 消息处理，并与官方 SDK 的实现逐项对照。

Mini MCP 仅用于学习，不应被当作完整的 MCP 规范实现或生产代码。
