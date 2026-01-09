import { readConfig } from "../utils/config.js";
import { broadcastEvent } from "../services/clients.js";

function formatValorReais(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clampStr(value, maxLen) {
  const s = (value ?? "").toString();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export function makeOverlayTestHandler(rootDir) {
  return async function overlayTest(req, res) {
    const user = req.params.user;
    const isSession = req.authUser === user;
    if (!isSession) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const config = await readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    const body = req.body || {};

    const username = clampStr(body.username || "Teste", 40) || "Teste";
    const totalValue = Number(body.totalValue);
    const safeTotalValue = Number.isFinite(totalValue) && totalValue >= 0 ? totalValue : 5;

    const titleTemplate = clampStr(body.title || config.overlayMessage || "Nova compra", 160) || "Nova compra";
    const valorText = formatValorReais(safeTotalValue);
    const overlayMessage = titleTemplate
      .replace(/\{username\}/gi, username)
      .replace(/\{valor\}/gi, valorText);

    const buyerMessage = clampStr(body.message || "Isso é um alerta de teste.", 260);

    const soundFile = config?.sound || null;
    const soundUrl = soundFile ? `/${user}/sounds/${soundFile}` : null;

    broadcastEvent(user, "purchase", {
      username,
      totalValue: safeTotalValue,
      overlayMessage,
      buyerMessage,
      soundUrl,
      audioUrl: null,
      source: "overlay-test"
    });

    return res.json({ ok: true });
  };
}
