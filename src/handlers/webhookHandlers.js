import path from "path";
import fs from "fs";
import { Rcon } from "rcon-client";
import { readConfig, removeBuyer } from "../utils/config.js";
import { synthesizeTTS } from "../services/tts.js";
import { broadcastEvent } from "../services/clients.js";
import { logEvent } from "../services/logger.js";

function sanitizeItems(payload) {
  const items = Array.isArray(payload.items) && payload.items.length
    ? payload.items
    : [{ description: payload.product || null, quantity: 1 }];

  const validItems = items.filter(it => typeof it?.description === "string" && it.description.trim());
  return validItems.map(it => ({ description: it.description, quantity: Number(it.quantity) || 1 }));
}

async function dispatchCommands(rconClient, config, items, player) {
  for (const item of items) {
    const rawDescription = item.description;
    if (!rawDescription) continue;

    const produto = rawDescription
      .split("|")
      .map(p => p.trim())
      .filter(Boolean)[0];

    const qtd = Number(item.quantity) > 0 ? Number(item.quantity) : 1;

    if (!config.produtos?.[produto]) {
      console.warn(`Produto inválido: ${produto}`);
      continue;
    }

    const comandosConfig = config.produtos[produto].comandos ?? config.produtos[produto].comando;

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
        const finalCmd = cmd
          .replace("{player}", player)
          .replace("%player%", player)
          .replace("{username}", player)
          .replace("%username%", player);

        try {
          const resp = await rconClient.send(finalCmd);
          console.info(`RCON sent: produto=${produto} qty=${qtd} cmd=${finalCmd} resp=${resp ?? "(no resp)"}`);
        } catch (err) {
          console.error(`RCON send failed: produto=${produto} cmd=${finalCmd}`, err);
          throw err;
        }
      }
    }
  }
}

export function makeWebhookHandler(rootDir) {
  return async function webhook(req, res) {
    const user = req.params.user;
    const payload = req.body;

    try {
      const logPath = path.join(rootDir, "webhook.log");
      const entry = { ts: new Date().toISOString(), user, payload };
      fs.appendFileSync(logPath, JSON.stringify(entry, null, 2) + "\n---\n");
    } catch (err) {
      console.warn("Webhook log write failed", err);
    }

    logEvent(rootDir, { level: "info", user: user || null, message: "webhook_received" });

    const orderNsu = payload?.order_nsu || null;
    const configForUser = await readConfig(rootDir, user);
    const savedBuyer = configForUser?.current_buyers?.find?.(b => b.order_nsu === orderNsu);
    const player = savedBuyer?.username || payload?.player || "cliente";
    const ttsTexto = savedBuyer?.tts_message || null;

    if (!payload || !player) {
      const reasons = [];
      if (!payload) reasons.push("payload ausente ou inválido");
      if (!player) reasons.push("nome do comprador ausente no registro");
      return res.status(400).json({ error: "Payload inválido", reasons });
    }

    if (!configForUser) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    const config = configForUser;

    const items = sanitizeItems(payload);
    console.info("Webhook items", items);
    if (!items.length) {
      return res.status(400).json({ error: "Nenhum item/descrição válido no payload" });
    }

    try {
      const rcon = await Rcon.connect({ ...config.rcon, timeout: 5000 });

      await dispatchCommands(rcon, config, items, player);

      rcon.end();

      const mensagemTTS = ttsTexto || `${player} comprou itens`;
      const audioUrl = await synthesizeTTS(rootDir, user, mensagemTTS);

      const soundFile = config.sound || null;
      const soundUrl = soundFile ? `/${user}/sounds/${soundFile}` : null;

      broadcastEvent(user, "purchase", {
        player,
        audioUrl,
        soundUrl,
        items: items.map(it => ({ description: it.description, quantity: it.quantity }))
      });

      res.json({ status: "OK", audioUrl, soundUrl });

      if (orderNsu) {
        await removeBuyer(rootDir, user, orderNsu);
      }
    } catch (err) {
      console.error("RCON ERROR:", err);
      res.status(500).json({
        error: "Erro ao executar RCON",
        detail: err?.message || String(err),
        code: err?.code
      });
    }
  };
}
