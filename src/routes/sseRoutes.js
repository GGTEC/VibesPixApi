import express from "express";
import { addClient, removeClient } from "../services/clients.js";

export function buildSseRoutes() {
  const router = express.Router({ mergeParams: true });

  router.get("/events", (req, res) => {
    const { user } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write("event: connected\ndata: ok\n\n");

    addClient(user, res);

    const heartbeat = setInterval(() => {
      res.write("event: ping\ndata: {}\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeClient(user, res);
    });
  });

  return router;
}
