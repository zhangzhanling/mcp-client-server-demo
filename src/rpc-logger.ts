import type {
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  JSONRPCMessage,
  MessageExtraInfo,
} from "@modelcontextprotocol/sdk/types.js";

const debugEnabled =
  process.env.MCP_DEBUG === "1" || process.env.MCP_DEBUG === "true";

type MessageHandler = (
  message: JSONRPCMessage,
  extra?: MessageExtraInfo,
) => void;

export function withRpcLogging(transport: Transport, label: string): Transport {
  let messageHandler: MessageHandler | undefined;

  const wrapper: Transport = {
    start: () => transport.start(),
    send: async (message: JSONRPCMessage, options?: TransportSendOptions) => {
      if (debugEnabled) {
        console.error(`[rpc:${label}] -> ${JSON.stringify(message)}`);
      }
      await transport.send(message, options);
    },
    close: () => transport.close(),
  };

  Object.defineProperty(wrapper, "sessionId", {
    get: () => transport.sessionId,
    configurable: true,
  });
  Object.defineProperty(wrapper, "onclose", {
    get: () => transport.onclose,
    set: (fn: (() => void) | undefined) => {
      transport.onclose = fn;
    },
    configurable: true,
  });
  Object.defineProperty(wrapper, "onerror", {
    get: () => transport.onerror,
    set: (fn: ((error: Error) => void) | undefined) => {
      transport.onerror = fn;
    },
    configurable: true,
  });
  Object.defineProperty(wrapper, "onmessage", {
    get: () => messageHandler,
    set: (fn: MessageHandler | undefined) => {
      messageHandler = fn;
      transport.onmessage = (message, extra) => {
        if (debugEnabled) {
          console.error(`[rpc:${label}] <- ${JSON.stringify(message)}`);
        }
        messageHandler?.(message, extra);
      };
    },
    configurable: true,
  });
  Object.defineProperty(wrapper, "setProtocolVersion", {
    value: (version: string) => transport.setProtocolVersion?.(version),
    configurable: true,
  });

  return wrapper;
}
