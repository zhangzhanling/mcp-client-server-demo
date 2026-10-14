import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../dist/server.js", import.meta.url));

async function connect(env = {}) {
  const client = new Client({ name: "failure-tests", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env,
    stderr: "ignore",
  });
  await client.connect(transport);
  return { client, transport };
}

async function report(title, fn) {
  console.log(`\n=== ${title} ===`);
  try {
    const value = await fn();
    console.log(`  outcome: ${JSON.stringify(value)}`);
  } catch (error) {
    console.log(`  threw: ${error?.message ?? String(error)}`);
  }
}

await report("Server 启动失败：command 不存在", async () => {
  const client = new Client({ name: "c", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: "definitely-not-a-real-binary-xyz",
    args: [],
    stderr: "ignore",
  });
  try {
    await client.connect(transport);
    return "connect() unexpectedly succeeded";
  } finally {
    await client.close().catch(() => {});
  }
});

await report("tools/call：Tool 名称拼错", async () => {
  const { client } = await connect();
  try {
    const result = await client.callTool({
      name: "does_not_exist",
      arguments: {},
    });
    return { isError: result.isError, content: result.content };
  } finally {
    await client.close();
  }
});

await report("tools/call：参数类型错误 (add.a = string)", async () => {
  const { client } = await connect();
  try {
    const result = await client.callTool({
      name: "add",
      arguments: { a: "one", b: 2 },
    });
    return { isError: result.isError, content: result.content };
  } finally {
    await client.close();
  }
});

await report("tools/call：handler 抛异常 (get_current_time)", async () => {
  const { client } = await connect({ MCP_DEMO_FAULT: "get_current_time" });
  try {
    const result = await client.callTool({
      name: "get_current_time",
      arguments: {},
    });
    return { isError: result.isError, content: result.content };
  } finally {
    await client.close();
  }
});

await report("资源清理：close() 后 Server 子进程退出", async () => {
  const { client, transport } = await connect();
  const pid = transport.pid;
  await client.close();
  await new Promise((resolve) => setTimeout(resolve, 200));
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    alive = false;
  }
  return { pid, alive };
});
