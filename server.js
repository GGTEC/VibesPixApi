import path from "path";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Wrap WebSocket to avoid process-crashing errors (e.g., 403 handshakes from providers)
const BaseWebSocket = WebSocket;
class SafeWebSocket extends BaseWebSocket {
  constructor(...args) {
    super(...args);
    this.on("error", (err) => {
      console.warn("WebSocket connection error", err?.message || err);
    });
  }
}

// Set globals before importing any code that might initialize WebSocket (edge-tts)
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = SafeWebSocket;
} else if (globalThis.WebSocket !== SafeWebSocket) {
  globalThis.WebSocket = SafeWebSocket;
}

if (typeof globalThis.fetch !== "function") {
  globalThis.fetch = fetch;
}

if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Delay app import so globals are already patched for edge-tts
const bootstrap = async () => {
  const { createApp } = await import("./src/app.js");
  await import("./src/services/mongo.js");
  const { logEvent } = await import("./src/services/logger.js");

  const app = createApp(__dirname);

  app.listen(3000, () => {
    console.log("Overlay multi-usuário rodando na porta 3000 versão 2.0.1");
    logEvent(__dirname, { level: "info", message: "server_started" });
  });
};

bootstrap().catch((err) => {
  console.error("Server bootstrap failed", err);
  process.exit(1);
});