import express from "express";
import path from "path";
import fs from "fs";
import { readConfig } from "../utils/config.js";

export function buildConfigRoutes(rootDir) {
  const router = express.Router({ mergeParams: true });

  router.get("/config", (req, res) => {
    const user = req.params.user;
    const apiKey = req.headers["x-api-key"];

    const config = readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    if (apiKey) {
      if (apiKey !== config.apiKey) {
        return res.status(401).json({ error: "Não autorizado" });
      }
      return res.json(config);
    }

    const { apiKey: _, webhookSecret, rcon, ...rest } = config;
    res.json(rest);
  });

  router.post("/config", (req, res) => {
    const user = req.params.user;
    const apiKey = req.headers["x-api-key"];
    const newConfig = req.body;

    const configPath = path.join(rootDir, "users", user, "config.json");

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    let current;
    try {
      current = JSON.parse(fs.readFileSync(configPath));
    } catch {
      return res.status(500).json({ error: "Config inválida" });
    }

    if (apiKey !== current.apiKey) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    if (!newConfig.rcon || !newConfig.produtos) {
      return res.status(400).json({ error: "Config inválida" });
    }

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          ...current,
          rcon: newConfig.rcon,
          produtos: newConfig.produtos
        },
        null,
        2
      )
    );

    res.json({ success: true });
  });

  return router;
}
