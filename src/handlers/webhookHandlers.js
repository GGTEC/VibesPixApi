import path from "path";
import fs from "fs";
import { Rcon } from "rcon-client";
import { normalizeOverlayGoal, readConfig, removeBuyer, writeConfig } from "../utils/config.js";
import { ensureUserDbSetup, getDbForUser } from "../services/mongo.js";
import { ObjectId } from "mongodb";
import { synthesizeTTS } from "../services/tts.js";
import { broadcastEvent } from "../services/clients.js";
import { logEvent } from "../services/logger.js";

function logStep(rootDir, user, step, extra = {}) {
  logEvent(rootDir, {
    level: "info",
    user: user || null,
    message: `webhook_step ${step} ${JSON.stringify(extra)}`
  });
}

function sanitizeItems(payload) {
  const items = Array.isArray(payload.items) && payload.items.length
    ? payload.items
    : [{ description: payload.product || null, quantity: 1 }];

  const validItems = items.filter(it => typeof it?.description === "string" && it.description.trim());
  return validItems.map(it => ({ description: it.description, quantity: Number(it.quantity) || 1 }));
}

function formatValorReais(value) {
  if (!Number.isFinite(value)) return "0";

  const rounded = Math.round(value * 100) / 100;
  const hasCents = Math.abs(rounded % 1) > 1e-9;

  if (!hasCents) {
    return String(Math.trunc(rounded));
  }

  return rounded.toFixed(2).replace(".", ",");
}

function computeProdutoValorReais(produto, quantity = 1) {
  const valorCents = Number(produto?.valor ?? produto?.price ?? 0) || 0;
  const qty = Number(quantity) > 0 ? Number(quantity) : 1;
  return (valorCents * qty) / 100;
}

function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

async function logPurchase(rootDir, user, purchase) {
  const { db } = await ensureUserDbSetup(user);
  const col = db.collection("purchases");
  const now = new Date();

  const orderNsu = purchase?.order_nsu || purchase?.orderNsu || null;
  if (orderNsu) {
    // Webhooks podem repetir: tornamos idempotente por order_nsu.
    await col.updateOne(
      { order_nsu: orderNsu },
      {
        $set: { ...purchase, order_nsu: orderNsu, updatedAt: now },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );
    return;
  }

  await col.insertOne({ ...purchase, createdAt: now });
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

    logStep(rootDir, user, "received", { hasPayload: Boolean(payload), items: payload?.items?.length || 0, order_nsu: payload?.order_nsu });

    const orderNsu = payload?.order_nsu;
    const configForUser = await readConfig(rootDir, user);
    const savedBuyer = configForUser?.current_buyers?.find?.(b => b.order_nsu === orderNsu);
    const username = savedBuyer?.username
      || payload?.customer_name
      || payload?.username
      || payload?.name
      || "Cliente";
    const ttsTexto = savedBuyer?.tts_message || payload?.tts_text || "";
    const ttsVoice = savedBuyer?.tts_voice || payload?.tts_voice || payload?.ttsVoice || null;

    const rawItems = Array.isArray(savedBuyer?.items) && savedBuyer.items.length
      ? savedBuyer.items
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

    const totalValueCents = rawItems.reduce((acc, it) => {
      const qty = Number(it?.quantity ?? 1) || 1;
      const price = Number(it?.price ?? it?.amount ?? 0) || 0;
      return acc + qty * price;
    }, 0);

    const totalValueReais = Number.isFinite(totalValueCents) ? totalValueCents / 100 : 0;

    if (!payload || !rawItems.length) {
      logStep(rootDir, user, "reject_payload", { hasPayload: Boolean(payload), rawItems: rawItems.length });
      const reasons = [];
      if (!payload) reasons.push("payload ausente ou inválido");
      if (!rawItems.length) reasons.push("sem itens válidos no payload");
      return res.status(400).json({ error: "Payload inválido", reasons });
    }

    if (!configForUser) {
      logStep(rootDir, user, "reject_config_missing", {});
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const config = configForUser;

    const itemsFromPayload = sanitizeItems(payload);
    const itemsFromSaved = Array.isArray(savedBuyer?.items) ? sanitizeItems({ items: savedBuyer.items }) : [];
    const items = itemsFromPayload.length ? itemsFromPayload : itemsFromSaved;

    if (!items.length) {
      logStep(rootDir, user, "reject_items_empty", {});
      return res.status(400).json({ error: "Nenhum item/descrição válido no payload" });
    }

    const backgroundWork = (async () => {
      const rconConfig = config?.rcon || {};

      // Garante collection/índices do usuário antes de registrar compra.
      await ensureUserDbSetup(user);

      if (!rconConfig.host || !rconConfig.port || !rconConfig.password) {
        logStep(rootDir, user, "skip_rcon_missing_config", {
          host: rconConfig.host || "",
          port: rconConfig.port || "",
          hasPassword: Boolean(rconConfig.password)
        });
      } else {
        logStep(rootDir, user, "rcon_connect_start", { host: rconConfig.host, port: rconConfig.port, items: items.length });

        let rcon = null;
        try {
          rcon = await Rcon.connect({ ...rconConfig, timeout: 5000 });

          rcon.on("end", () => {
            logStep(rootDir, user, "rcon_closed", { host: rconConfig.host, port: rconConfig.port });
          });

          rcon.on("error", (err) => {
            logEvent(rootDir, {
              level: "error",
              user: user || null,
              message: `webhook_rcon_error host=${rconConfig.host} port=${rconConfig.port} msg=${err?.message || "unknown"}`
            });
          });

          logStep(rootDir, user, "rcon_dispatch_start", { items: items.map(it => ({ d: it.description, q: it.quantity })) });
          await dispatchCommands(rcon, config, items, username);
          logStep(rootDir, user, "rcon_dispatch_done", {});
        } catch (err) {
          logEvent(rootDir, {
            level: "error",
            user: user || null,
            message: `webhook_rcon_dispatch_failed msg=${err?.message || "unknown"}`
          });
          logStep(rootDir, user, "rcon_dispatch_error", { msg: err?.message || "unknown" });
        } finally {
          try {
            rcon?.end?.();
          } catch {
            // ignore
          }
        }
      }

      const overlayTemplate = config?.overlayMessage || "Nova compra";
      const valorText = formatValorReais(totalValueReais);

      const overlayFilled = overlayTemplate
        .replace(/\{username\}/gi, username || "")
        .replace(/\{valor\}/gi, valorText);

      const ttsCombined = [overlayFilled, ttsTexto].filter(Boolean).join("; ");

      const voice = ttsVoice || config?.ttsVoice || undefined;

      logStep(rootDir, user, "tts_start", { voice });
      let audioUrl = null;
      try {
        audioUrl = await synthesizeTTS(rootDir, user, ttsCombined, voice);
      } catch (err) {
        logEvent(rootDir, {
          level: "error",
          user: user || null,
          message: `webhook_tts_error msg=${err?.message || "unknown"}`
        });
        logStep(rootDir, user, "tts_error", { msg: err?.message || "unknown" });
      }
      logStep(rootDir, user, "tts_done", { hasAudio: Boolean(audioUrl) });
      const soundFile = config.sound || null;
      const soundUrl = soundFile ? `/${user}/sounds/${soundFile}` : null;
      const overlayMessage = overlayFilled || "Nova compra";
      const buyerMessage = ttsTexto || "";

      const purchaseValue = Number.isFinite(totalValueReais) ? totalValueReais : 0;
      if (purchaseValue > 0) {
        try {
          logStep(rootDir, user, "goal_update_start", { add: purchaseValue });
          await writeConfig(rootDir, user, (current) => {
            const goal = normalizeOverlayGoal(current?.overlayGoal);
            goal.current = Math.max(0, (goal.current || 0) + purchaseValue);
            return { ...current, overlayGoal: goal };
          });
          logStep(rootDir, user, "goal_update_done", {});
        } catch (err) {
          logEvent(rootDir, {
            level: "error",
            user: user || null,
            message: `webhook_overlay_goal_update_failed msg=${err?.message || "unknown"}`
          });
        }
      } else {
        logEvent(rootDir, {
          level: "warn",
          user: user || null,
          message: `webhook_goal_skip_zero_value orderNsu=${orderNsu || ""} totalValueReais=${totalValueReais}`
        });
      }

      broadcastEvent(user, "purchase", {
        username,
        audioUrl,
        soundUrl,
        items: items.map(it => ({ description: it.description, quantity: it.quantity })),
        overlayMessage,
        buyerMessage,
        ttsMessage: buyerMessage,
        totalValue: purchaseValue
      });
      logStep(rootDir, user, "broadcast_purchase", { overlayMessage, hasAudio: Boolean(audioUrl), hasSound: Boolean(soundUrl) });

      // Registra a compra no Mongo (purchases)
      try {
        await logPurchase(rootDir, user, {
          order_nsu: orderNsu || null,
          username,
          overlayMessage,
          ttsMessage: buyerMessage,
          ttsVoice: ttsVoice || config?.ttsVoice || null,
          totalValue: purchaseValue,
          items: items.map(it => ({ description: it.description, quantity: it.quantity })),
          source: "webhook"
        });
        logStep(rootDir, user, "purchase_logged", { orderNsu: orderNsu || null });
      } catch (err) {
        logEvent(rootDir, {
          level: "error",
          user: user || null,
          message: `webhook_purchase_log_failed msg=${err?.message || "unknown"}`
        });
        logStep(rootDir, user, "purchase_log_error", { msg: err?.message || "unknown" });
      }

      if (orderNsu) {
        await removeBuyer(rootDir, user, orderNsu);
        logStep(rootDir, user, "remove_buyer_done", { orderNsu });
      }
    })().catch(err => {
      const context = {
        user,
        orderNsu,
        host: config?.rcon?.host,
        port: config?.rcon?.port,
        items: items.map(it => ({ d: it.description, q: it.quantity })).slice(0, 5)
      };
      logEvent(rootDir, {
        level: "error",
        user: user || null,
        message: `webhook_background_failed msg=${err?.message || "unknown"} ctx=${JSON.stringify(context)}`
      });
    });

    logStep(rootDir, user, "response_sent", {});
    res.json({ status: "OK", dispatchedAsync: true });

    void backgroundWork;
  }
}

export function makeTestProductHandler(rootDir) {
  return async function testProduct(req, res) {
    const user = req.params.user;
    const isSession = req.authUser === user;
    if (!isSession) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    try {
      const result = await runTestProduct(rootDir, user, req.body);
      return res.json(result);
    } catch (err) {
      const status = Number(err?.statusCode) || 500;
      if (status >= 500) {
        logEvent(rootDir, { level: "error", user, message: `test_product_failed msg=${err?.message || "unknown"}` });
      }
      return res.status(status).json({ error: err?.message || "Erro ao testar produto" });
    }
  };
}

// Permite reuso do fluxo de teste pelo /admin.
export async function runTestProduct(rootDir, user, body) {
  const { productId, quantity = 1, username = "Tester", ttsText = "", simulateOverlay = true, ttsVoice = null } = body || {};
  if (!productId) throw httpError(400, "productId obrigatório");

  const config = await readConfig(rootDir, user);
  if (!config) throw httpError(404, "Config não encontrada");

  const produto = config?.produtos?.[productId];
  if (!produto) throw httpError(404, "Produto não encontrado");

  const rconConfig = config?.rcon || {};
  if (!rconConfig.host || !rconConfig.port || !rconConfig.password) {
    throw httpError(400, "Config RCON ausente para teste");
  }

  const items = [{ description: productId, quantity: Number(quantity) > 0 ? Number(quantity) : 1 }];

  const rcon = await Rcon.connect({ ...rconConfig, timeout: 5000 });
  try {
    await dispatchCommands(rcon, config, items, username);
  } finally {
    rcon.end();
  }

  const purchaseValue = computeProdutoValorReais(produto, quantity);
  let audioUrl = null;
  let overlayMessage = null;
  let soundUrl = null;

  if (simulateOverlay) {
    const overlayTemplate = config?.overlayMessage || "Nova compra";
    const valorText = formatValorReais(purchaseValue);
    overlayMessage = overlayTemplate
      .replace(/\{username\}/gi, username)
      .replace(/\{valor\}/gi, valorText);

    const ttsCombined = [overlayMessage, ttsText].filter(Boolean).join("; ");
    const voice = ttsVoice || config?.ttsVoice || undefined;

    try {
      audioUrl = await synthesizeTTS(rootDir, user, ttsCombined, voice);
    } catch (err) {
      logEvent(rootDir, { level: "warn", user, message: `test_tts_failed msg=${err?.message || "unknown"}` });
    }

    const soundFile = config?.sound || null;
    soundUrl = soundFile ? `/${user}/sounds/${soundFile}` : null;

    broadcastEvent(user, "purchase", {
      username,
      audioUrl,
      soundUrl,
      items: items.map(it => ({ description: it.description, quantity: it.quantity })),
      overlayMessage,
      buyerMessage: ttsText || "",
      ttsMessage: ttsText || "",
      totalValue: purchaseValue
    });

    try {
      await logPurchase(rootDir, user, {
        username,
        overlayMessage,
        ttsMessage: ttsText || "",
        ttsVoice: ttsVoice || config?.ttsVoice || null,
        totalValue: purchaseValue,
        items: items.map(it => ({ description: it.description, quantity: it.quantity })),
        source: "test-product"
      });
    } catch (err) {
      logEvent(rootDir, { level: "error", user, message: `test_purchase_log_failed msg=${err?.message || "unknown"}` });
    }
  }

  return { ok: true, purchaseValue, overlayMessage, audioUrl, soundUrl };
}

export function makeListPurchasesHandler(rootDir) {
  return async function listPurchases(req, res) {
    const user = req.params.user;
    const isSession = req.authUser === user;
    if (!isSession) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const db = await getDbForUser(user);
    const docs = await db
      .collection("purchases")
      .find()
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const purchases = docs.map(doc => ({
      ...doc,
      _id: doc._id?.toString?.() || doc._id
    }));

    return res.json({ purchases });
  };
}

export function makeReplayPurchaseHandler(rootDir) {
  return async function replayPurchase(req, res) {
    const user = req.params.user;
    const isSession = req.authUser === user;
    if (!isSession) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const { purchaseId } = req.body || {};
    if (!purchaseId) {
      return res.status(400).json({ error: "purchaseId obrigatório" });
    }

    let purchase = null;
    try {
      const db = await getDbForUser(user);
      purchase = await db.collection("purchases").findOne({ _id: new ObjectId(purchaseId) });
    } catch (err) {
      return res.status(400).json({ error: "purchaseId inválido" });
    }

    if (!purchase) {
      return res.status(404).json({ error: "Compra não encontrada" });
    }

    const config = await readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    const rconConfig = config?.rcon || {};
    if (!rconConfig.host || !rconConfig.port || !rconConfig.password) {
      return res.status(400).json({ error: "Config RCON ausente para replay" });
    }

    const items = Array.isArray(purchase.items)
      ? purchase.items.map(it => ({ description: it.description, quantity: it.quantity }))
      : [];
    if (!items.length) {
      return res.status(400).json({ error: "Compra sem itens válidos" });
    }

    const username = purchase.username || "Cliente";

    const rcon = await Rcon.connect({ ...rconConfig, timeout: 5000 });
    try {
      await dispatchCommands(rcon, config, items, username);
    } finally {
      rcon.end();
    }

    const overlayMessage = purchase.overlayMessage
      || (config.overlayMessage || "Nova compra")
        .replace(/\{username\}/gi, username)
        .replace(/\{valor\}/gi, formatValorReais(Number(purchase.totalValue || 0)));

    const ttsMessage = purchase.ttsMessage || "";
    const voice = purchase.ttsVoice || purchase.tts_voice || config?.ttsVoice || undefined;
    let audioUrl = null;
    try {
      const ttsCombined = [overlayMessage, ttsMessage].filter(Boolean).join("; ");
      audioUrl = await synthesizeTTS(rootDir, user, ttsCombined, voice);
    } catch (err) {
      logEvent(rootDir, { level: "error", user, message: `replay_tts_failed msg=${err?.message || "unknown"}` });
    }

    const soundFile = config?.sound || null;
    const soundUrl = soundFile ? `/${user}/sounds/${soundFile}` : null;

    broadcastEvent(user, "purchase", {
      username,
      audioUrl,
      soundUrl,
      items,
      overlayMessage,
      buyerMessage: ttsMessage,
      ttsMessage,
      totalValue: Number(purchase.totalValue || 0)
    });

    return res.json({ ok: true, overlayMessage, audioUrl, soundUrl });
  };
}
