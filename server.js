import path from "path";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import fetch from "node-fetch";
import { createApp } from "./src/app.js";
import "./src/services/mongo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket;
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

const app = createApp(__dirname);

app.listen(3000, () => {
  console.log("Overlay multi-usuário rodando na porta 3000");
});