import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { withRpcLogging } from "./rpc-logger.js";

const server = new McpServer({
  name: "mcp-client-server-demo",
  version: "1.0.0",
});

server.registerTool(
  "greet",
  {
    description: "Return a greeting for the given name.",
    inputSchema: { name: z.string() },
  },
  async ({ name }) => {
    console.error(`[server] handler greet start (name=${name})`);
    const text = `Hello, ${name}!`;
    console.error("[server] handler greet end");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "add",
  {
    description: "Return the sum of two numbers.",
    inputSchema: { a: z.number(), b: z.number() },
  },
  async ({ a, b }) => {
    console.error(`[server] handler add start (a=${a}, b=${b})`);
    const text = String(a + b);
    console.error("[server] handler add end");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "get_current_time",
  {
    description: "Return the current time as an ISO 8601 string.",
    inputSchema: {},
  },
  async () => {
    console.error("[server] handler get_current_time start");
    if (process.env.MCP_DEMO_FAULT === "get_current_time") {
      throw new Error(
        "intentional handler failure (MCP_DEMO_FAULT=get_current_time)",
      );
    }
    const text = new Date().toISOString();
    console.error("[server] handler get_current_time end");
    return { content: [{ type: "text", text }] };
  },
);

async function main(): Promise<void> {
  const transport = withRpcLogging(new StdioServerTransport(), "server");
  await server.connect(transport);
  console.error("[server] MCP server connected via stdio");
}

main().catch((error: unknown) => {
  console.error("[server] fatal error:", error);
  process.exit(1);
});
