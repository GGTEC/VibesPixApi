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

async function dispatchCommands(rconClient, config, items, nameAboveMobHead) {

  for (const item of items) {

    const rawDescription = item.description;
    const produtoConfig = config.produtos?.[rawDescription];

    if (!produtoConfig) {
      console.warn(`Produto inválido: ${rawDescription}`);
      continue;
    }

    const purchaseQty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const commandsPerUnitRaw = produtoConfig.quantity ?? 1;
    const commandsPerUnit = Number(commandsPerUnitRaw) > 0 ? Number(commandsPerUnitRaw) : 1;
    const totalExecutions = purchaseQty * commandsPerUnit;

    const comandosConfig = produtoConfig.comandos ?? produtoConfig.comando;

    const comandos = Array.isArray(comandosConfig)
      ? comandosConfig
      : typeof comandosConfig === "string"
        ? [comandosConfig]
        : [];

    if (!comandos.length) {
      console.warn(`Produto sem comandos configurados: ${rawDescription}`);
      continue;
    }

    for (let i = 0; i < totalExecutions; i++) {
      
      for (const cmd of comandos) {

        const finalCmd = cmd.replace("{username}", nameAboveMobHead).replace("{nickname}", nameAboveMobHead);

        try {
          const resp = await rconClient.send(finalCmd);
          console.info(`RCON sent: produto=${rawDescription} qty=${totalExecutions} cmd=${finalCmd} resp=${resp ?? "(no resp)"}`);
        } catch (err) {
          console.error(`RCON send failed: produto=${rawDescription} cmd=${finalCmd}`, err);
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

    logEvent(rootDir, { level: "info", user: user || null, message: `webhook_received ${JSON.stringify(payload)}` });

    const orderNsu = payload?.order_nsu;
    const configForUser = await readConfig(rootDir, user);
    const savedBuyer = configForUser?.current_buyers?.find?.(b => b.order_nsu === orderNsu);
    const username = savedBuyer?.username;
    const ttsTexto = savedBuyer?.tts_message;

    const rawItems = Array.isArray(savedBuyer?.items) ? savedBuyer.items : payload?.items;
    const totalValue = Array.isArray(rawItems)
      ? rawItems.reduce((acc, it) => {
          const qty = Number(it?.quantity ?? 1) || 1;
          const price = Number(it?.price ?? it?.amount ?? 0) || 0;
          return acc + qty * price;
        }, 0)
      : 0;

    if (!payload || !username) {
      const reasons = [];
      if (!payload) reasons.push("payload ausente ou inválido");
      if (!username) reasons.push("nome do comprador ausente no registro");
      return res.status(400).json({ error: "Payload inválido", reasons });
    }

    if (!configForUser) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const config = configForUser;

    const itemsFromPayload = sanitizeItems(payload);
    const itemsFromSaved = Array.isArray(savedBuyer?.items) ? sanitizeItems({ items: savedBuyer.items }) : [];
    const items = itemsFromPayload.length ? itemsFromPayload : itemsFromSaved;


    if (!items.length) {
      return res.status(400).json({ error: "Nenhum item/descrição válido no payload" });
    }

    const backgroundWork = (async () => {
      const rcon = await Rcon.connect({ ...config.rcon, timeout: 5000 });

      try {
        await dispatchCommands(rcon, config, items, username);
      } finally {
        rcon.end();
      }

      const overlayTemplate = config?.overlayMessage || "Nova compra";
      const valorText = Number.isFinite(totalValue) ? totalValue.toFixed(2) : "0";

      const overlayFilled = overlayTemplate
        .replace(/\{username\}/gi, username || "")
        .replace(/\{valor\}/gi, valorText);

      const ttsCombined = [overlayFilled, ttsTexto].filter(Boolean).join(", ");

      const voice = config?.ttsVoice || undefined;

      const audioUrl = await synthesizeTTS(rootDir, user, ttsCombined, voice);
      const soundFile = config.sound || null;
      const soundUrl = soundFile ? `/${user}/sounds/${soundFile}` : null;
      const overlayMessage = overlayFilled || "Nova compra";
      const buyerMessage = ttsTexto || "";

      broadcastEvent(user, "purchase", {
        username,
        audioUrl,
        soundUrl,
        items: items.map(it => ({ description: it.description, quantity: it.quantity })),
        overlayMessage,
        buyerMessage,
        ttsMessage: buyerMessage
      });

      if (orderNsu) {
        await removeBuyer(rootDir, user, orderNsu);
      }
    })().catch(err => {
      logEvent(rootDir, { level: "error", user: user || null, message: `webhook_background_failed ${err.message}` });
    });

    res.json({ status: "OK", dispatchedAsync: true });

    void backgroundWork;
  }
}
