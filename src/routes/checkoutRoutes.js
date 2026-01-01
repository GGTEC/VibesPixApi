import express from "express";
import fetch from "node-fetch";
import { generateOrderNsu, readConfig, writeConfig } from "../utils/config.js";

export function buildCheckoutRoutes(rootDir) {
  const router = express.Router({ mergeParams: true });

  router.post("/create_checkout_infinitepay", async (req, res) => {
    const user = req.params.user;
    const body = req.body || {};

    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.get("host");
    const selfWebhook = `${protocol}://${host}/${user}/api/webhook`;
    const selfThanks = `${protocol}://${host}/${user}/thanks`;

    const config = readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    const incomingItems = Array.isArray(body.items) ? body.items : [];
    const orderNsu = generateOrderNsu();

    const payload = {
      handle: config.infinitypayHandle,
      redirect_url: selfThanks,
      webhook_url: selfWebhook,
      order_nsu: orderNsu,
      items: incomingItems
    };

    if (!payload.handle) {
      return res.status(400).json({ error: "handle (InfinityPay) não configurado" });
    }

    const targetUrl = "https://api.infinitepay.io/invoices/public/checkout/links";

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    writeConfig(rootDir, user, current => {
      const list = Array.isArray(current.current_buyers)
        ? current.current_buyers
        : [];
      const entry = {
        order_nsu: orderNsu,
        username: body.customer_name || "Cliente",
        tts_message: body.tts_text || ""
      };
      const nextList = [...list.filter(b => b.order_nsu !== orderNsu), entry].slice(-50);
      return { ...current, current_buyers: nextList };
    });

    const rawBody = await response.text();
    let parsed = null;
    parsed = JSON.parse(rawBody);
    return res.status(response.status).json(parsed || rawBody || {});
  });

  return router;
}
