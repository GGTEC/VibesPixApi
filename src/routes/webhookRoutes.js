import express from "express";
import path from "path";
import fs from "fs";
import { Rcon } from "rcon-client";
import { readConfig, writeConfig } from "../utils/config.js";
import { synthesizeTTS } from "../services/tts.js";
import { broadcastEvent } from "../services/clients.js";

export function buildWebhookRoutes(rootDir) {
  const router = express.Router({ mergeParams: true });

  router.post("/api/webhook", async (req, res) => {
    const user = req.params.user;
    const payload = req.body;

    try {
      const logPath = path.join(rootDir, "webhook.log");
      const entry = {
        ts: new Date().toISOString(),
        user,
        payload
      };
      fs.appendFileSync(logPath, JSON.stringify(entry, null, 2) + "\n---\n");
    } catch (err) {
      console.warn("Webhook log write failed", err);
    }

    const orderNsu = payload?.order_nsu || null;
    const configForUser = readConfig(rootDir, user);
    const savedBuyer = configForUser?.current_buyers?.find?.(b => b.order_nsu === orderNsu);
    const player = savedBuyer?.username || payload?.player || "cliente";
    const ttsTexto = savedBuyer?.tts_message || null;

    if (!payload || !player) {
      const reasons = [];
      if (!payload) reasons.push("payload ausente ou inválido");
      if (!player) reasons.push("nome do comprador ausente no registro");
      return res.status(400).json({
        error: "Payload inválido",
        reasons
      });
    }

    if (!configForUser) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    const config = configForUser;

    const items = Array.isArray(payload.items) && payload.items.length
      ? payload.items
      : [{ description: payload.product || null, quantity: 1 }];

    const hasValidItem = items.some(it => typeof it?.description === "string" && it.description.trim());
    if (!hasValidItem) {
      return res.status(400).json({ error: "Nenhum item/descrição válido no payload" });
    }

    try {
      const rcon = await Rcon.connect({
        ...config.rcon,
        timeout: 5000
      });

      for (const item of items) {
        const rawDescription = item?.description;
        if (!rawDescription) continue;

        const produto = rawDescription
          .split("|")
          .map(p => p.trim())
          .filter(Boolean)[0];

        const qtd = Number(item?.quantity) > 0 ? Number(item.quantity) : 1;

        if (!config.produtos?.[produto]) {
          console.warn(`Produto inválido: ${produto}`);
          continue;
        }

        const comandosConfig =
          config.produtos[produto].comandos ?? config.produtos[produto].comando;

        const comandos = Array.isArray(comandosConfig)
          ? comandosConfig
          : typeof comandosConfig === "string"
            ? [comandosConfig]
            : [];

        if (!comandos.length) {
          console.warn(`Produto sem comandos configurados: ${produto}`);
          continue;
        }

        for (let i = 0; i < qtd; i++) {
          for (const cmd of comandos) {
            await rcon.send(
              cmd
                .replace("{player}", player)
                .replace("%player%", player)
                .replace("{username}", player)
                .replace("%username%", player)
            );
          }
        }
      }

      rcon.end();

      const mensagemTTS = ttsTexto || `${player} comprou itens`;
      const audioUrl = await synthesizeTTS(rootDir, user, mensagemTTS);

      const soundFile = config.sound || null;
      const soundUrl = soundFile ? `/${user}/sounds/${soundFile}` : null;

      broadcastEvent(user, "purchase", {
        player,
        audioUrl,
        soundUrl,
        items: items.map(it => ({
          description: it?.description,
          quantity: it?.quantity ?? 1
        }))
      });

      res.json({ status: "OK", audioUrl, soundUrl });

      if (orderNsu) {
        writeConfig(rootDir, user, current => {
          const list = Array.isArray(current.current_buyers) ? current.current_buyers : [];
          return {
            ...current,
            current_buyers: list.filter(b => b.order_nsu !== orderNsu)
          };
        });
      }
    } catch (err) {
      console.error("RCON ERROR:", err);
      res.status(500).json({
        error: "Erro ao executar RCON",
        detail: err?.message || String(err),
        code: err?.code
      });
    }
  });

  return router;
}
