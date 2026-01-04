import fetch from "node-fetch";
import { CHECKOUT_TTL_MS, generateOrderNsu, readConfig, upsertBuyer } from "../utils/config.js";
import { logEvent } from "../services/logger.js";

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
    const normalizedItems = incomingItems
      .map((item, idx) => {
        const quantity = Number(item?.quantity ?? 1) || 1;
        const price = Number(item?.amount ?? 0);
        const description = item?.description;
        return { description, quantity, price };
      })
      .filter(entry => entry.price > 0 && entry.quantity > 0);
    if (!normalizedItems.length) {
      return res.status(400).json({ error: "Itens inválidos para checkout" });
    }
    const orderNsu = generateOrderNsu();

    const payload = {
      handle: config.infinitypayHandle,
      redirect_url: selfThanks,
      webhook_url: selfWebhook,
      order_nsu: orderNsu,
      items: normalizedItems
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

    const now = new Date();

    const entry = {
      order_nsu: orderNsu,
      order_id: body.order_id || null,
      username: body.customer_name || "Cliente",
      tts_message: body.tts_text || "",
      items: normalizedItems,
      created_at: now,
      expires_at: new Date(now.getTime() + CHECKOUT_TTL_MS)
    };
    await upsertBuyer(rootDir, user, entry);

    logEvent(rootDir, { level: "info", user, message: "checkout_link_created" });

    const rawBody = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {/* keep raw string */}

    if (!response.ok) {
      return res.status(response.status).json({
        error: parsed?.error || parsed?.message || rawBody || "Erro ao criar checkout",
        status: response.status,
        details: parsed || rawBody || null
      });
    }

    return res.status(response.status).json(parsed || rawBody || { ok: true });
  };
}
