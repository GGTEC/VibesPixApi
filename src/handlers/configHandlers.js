import { normalizeOverlayGoal, readConfig, writeConfig } from "../utils/config.js";

export function makeGetConfigHandler(rootDir) {
  return async function getConfig(req, res) {
    const user = req.params.user;
    const apiKey = req.headers["x-api-key"];
    const isSession = req.authUser === user;

    const config = await readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    if (apiKey || isSession) {
      if (!isSession && apiKey !== config.apiKey) {
        return res.status(401).json({ error: "Não autorizado" });
      }
      return res.json(config);
    }

    const { apiKey: _ignored, webhookSecret, rcon, ...rest } = config;
    return res.json(rest);
  };
}

export function makeUpdateConfigHandler(rootDir) {
  return async function updateConfig(req, res) {
    const user = req.params.user;
    const apiKey = req.headers["x-api-key"];
    const isSession = req.authUser === user;
    const newConfig = req.body;

    const current = await readConfig(rootDir, user);
    if (!current) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    if (!isSession && apiKey !== current.apiKey) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const hasRcon = Boolean(newConfig?.rcon);
    const hasProdutos = newConfig?.produtos !== undefined;
    const hasSound = newConfig && Object.prototype.hasOwnProperty.call(newConfig, "sound");
    const hasInfinity = newConfig && Object.prototype.hasOwnProperty.call(newConfig, "infinitypayHandle");
    const hasOverlay = newConfig && Object.prototype.hasOwnProperty.call(newConfig, "overlayMessage");
    const hasOverlayGoal = newConfig && Object.prototype.hasOwnProperty.call(newConfig, "overlayGoal");
    const hasTtsVoice = newConfig && Object.prototype.hasOwnProperty.call(newConfig, "ttsVoice");
    const hasHome = newConfig && Object.prototype.hasOwnProperty.call(newConfig, "home");

    if (!hasRcon && !hasProdutos && !hasSound && !hasInfinity && !hasOverlay && !hasTtsVoice && !hasOverlayGoal && !hasHome) {
      return res.status(400).json({ error: "Config inválida" });
    }

    await writeConfig(rootDir, user, () => {
      const next = { ...current };

      if (hasRcon) {
        next.rcon = {
          host: newConfig.rcon?.host || "",
          port: newConfig.rcon?.port || "",
          password: newConfig.rcon?.password || ""
        };
      }

      if (hasProdutos) {
        next.produtos = newConfig.produtos || {};
      }

      if (hasSound) {
        next.sound = newConfig.sound || null;
      }

      if (hasInfinity) {
        next.infinitypayHandle = newConfig.infinitypayHandle || "";
      }

      if (hasOverlay) {
        next.overlayMessage = (newConfig.overlayMessage || "").toString();
      }

      if (hasOverlayGoal) {
        next.overlayGoal = normalizeOverlayGoal(newConfig.overlayGoal);
      }

      if (hasTtsVoice) {
        next.ttsVoice = (newConfig.ttsVoice || "").toString();
      }

      if (hasHome) {
        next.home = newConfig.home || {};
      }

      return next;
    });

    return res.json({ success: true });
  };
}
