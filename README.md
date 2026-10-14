# MCP Client + Server 学习 Demo

使用 **TypeScript + 官方 `@modelcontextprotocol/sdk` + stdio** 实现的最小可运行 MCP Client / Server。
用于理解 MCP 调用链：Client 拉起 Server 子进程 → `initialize` → `tools/list` → `tools/call` → 返回结果。

> 本项目是学习 Demo，不接入 LLM、外部 API、数据库或文件系统，不覆盖完整 MCP 规范。

## 环境

- Node.js（当前 LTS，本项目验证于 v22.x）
- npm

## 安装

```bash
npm install
```

## 构建

```bash
npm run build      # tsc 编译 src/ -> dist/
npm run clean      # 删除 dist/
```

## 运行（推荐方式：编译后运行）

```bash
npm run build
npm start          # node dist/client.js，由 Client 自动拉起 dist/server.js
```

预期输出：`initialize` 完成、列出 3 个 Tool（`greet` / `add` / `get_current_time`），并依次调用它们打印结果，最后关闭连接、Server 子进程退出。

## 观察真实 JSON-RPC 消息

```bash
# Windows PowerShell
$env:MCP_DEBUG="1"; npm start; Remove-Item Env:\MCP_DEBUG
# bash
MCP_DEBUG=1 npm start
```

开启后 Client 与 Server 两侧的原始 JSON-RPC 消息会以 `[rpc:client]` / `[rpc:server]` 前缀写入 **stderr**（`->` 发送，`<-` 接收），可对照 request `id` 观察请求与响应的关联。

## 故障与边界测试

```bash
npm run build
npm run test:failures
```

覆盖：Server 启动失败、Tool 名称拼错、参数类型错误、handler 抛异常、`close()` 后子进程退出。

## 目录结构

```text
mcp-client-server-demo/
├── package.json
├── tsconfig.json
├── README.md
├── docs/
│   ├── implementation-plan.md   # 分阶段实现方案
│   └── learning-notes.md        # 各阶段协议观察与调用链记录
├── scripts/
│   └── failure-tests.mjs        # 阶段 5 故障/边界测试
└── src/
    ├── server.ts                # McpServer + 3 tools + StdioServerTransport
    ├── client.ts                # Client + StdioClientTransport + listTools + callTool
    └── rpc-logger.ts            # MCP_DEBUG 原始 JSON-RPC 日志包装
```

## 说明

- Server 的 stdout 仅用于 MCP 协议通信；所有调试日志写入 stderr。
- Client 用 `process.execPath` + `dist/server.js` 绝对路径拉起 Server，跨平台且不依赖 `npx`。
- `MCP_DEBUG` 需通过 `StdioClientTransport` 的 `env` 显式转发给子进程（SDK 默认只继承白名单环境变量）。
