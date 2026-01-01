import fetch from "node-fetch";
import { generateOrderNsu, readConfig, upsertBuyer } from "../utils/config.js";

export function makeCreateCheckoutHandler(rootDir) {
  return async function createCheckout(req, res) {
    const user = req.params.user;
    const body = req.body || {};

    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.get("host");
    const selfWebhook = `${protocol}://${host}/${user}/api/webhook`;
    const selfThanks = `${protocol}://${host}/${user}/thanks`;

    const config = await readConfig(rootDir, user);
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

    const entry = {
      order_nsu: orderNsu,
      username: body.customer_name || "Cliente",
      tts_message: body.tts_text || ""
    };
    await upsertBuyer(rootDir, user, entry);

    const rawBody = await response.text();
    let parsed = null;
    parsed = JSON.parse(rawBody);
    return res.status(response.status).json(parsed || rawBody || {});
  };
}
