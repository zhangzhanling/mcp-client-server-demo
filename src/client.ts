import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { withRpcLogging } from "./rpc-logger.js";

const serverPath = fileURLToPath(new URL("./server.js", import.meta.url));

async function callAndPrint(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  console.error(
    `[client] calling tools/call ${name} with ${JSON.stringify(args)}...`,
  );
  const result = await client.callTool({ name, arguments: args });

  console.log(`\n> ${name}(${JSON.stringify(args)})`);
  if (result.isError) {
    console.error(`[client] ${name} returned isError`);
    console.log(`  error: ${JSON.stringify(result.content)}`);
  } else {
    console.log(`  result: ${JSON.stringify(result.content)}`);
  }
  console.error(`[client] received result for ${name}`);
}

async function main(): Promise<void> {
  const client = new Client({
    name: "mcp-client-server-demo-client",
    version: "1.0.0",
  });

  const childEnv: Record<string, string> = {};
  for (const key of ["MCP_DEBUG", "MCP_DEMO_FAULT"]) {
    const value = process.env[key];
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }

  const transport = withRpcLogging(
    new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      env: childEnv,
    }),
    "client",
  );

  try {
    console.error("[client] connecting...");
    await client.connect(transport);
    console.error("[client] connected");

    console.error("[client] requesting tools/list...");
    const { tools } = await client.listTools();

    console.log(`Available tools (${tools.length}):`);
    for (const tool of tools) {
      const description = tool.description ?? "(no description)";
      console.log(`- ${tool.name}: ${description}`);
      console.log(`  inputSchema: ${JSON.stringify(tool.inputSchema)}`);
    }

    await callAndPrint(client, "greet", { name: "Tom" });
    await callAndPrint(client, "add", { a: 1, b: 2 });
    await callAndPrint(client, "get_current_time", {});
  } finally {
    console.error("[client] closing connection...");
    await client.close();
    console.error("[client] connection closed");
  }
}

main().catch((error: unknown) => {
  console.error("[client] fatal error:", error);
  process.exit(1);
});
