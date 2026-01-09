import { addClient, removeClient } from "../services/clients.js";
import { logEvent } from "../services/logger.js";

export function makeSseHandler() {
  return function sse(req, res) {
    const { user } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Nginx: evita buffering (SSE precisa de flush contínuo)
    res.setHeader("X-Accel-Buffering", "no");

    // Garante envio imediato dos headers
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    try {
      logEvent(process.cwd(), { level: "info", user: user || null, message: "sse_connected" });
    } catch {
      // ignore
    }

    // Ajuda o browser a reconectar rápido.
    res.write("retry: 2000\n");
    res.write("event: connected\ndata: ok\n\n");

    addClient(user, res);

    const heartbeat = setInterval(() => {
      res.write("event: ping\ndata: {}\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeClient(user, res);

      try {
        logEvent(process.cwd(), { level: "info", user: user || null, message: "sse_disconnected" });
      } catch {
        // ignore
      }
    });
  };
}
