import { synthesizeTTS } from "../services/tts.js";
import { readConfig } from "../utils/config.js";

export function makeTestTtsHandler(rootDir) {
  return async function testTts(req, res) {
    const user = req.params.user;
    const isSession = req.authUser === user;

    if (!isSession) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const body = req.body || {};
    const requestedVoice = (body.voice || "").toString().trim();
    const rawText = (body.text || "").toString();
    const text = rawText.trim() || "Teste de voz do overlay";
    const fallbackVoice = "pt-BR-AntonioNeural";
    const TIMEOUT_MS = 2000;

    const runWithTimeout = (work, label) => Promise.race([
      work,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), TIMEOUT_MS))
    ]);

    try {
      const config = await readConfig(rootDir, user);
      if (!config) {
        return res.status(404).json({ error: "Config não encontrada" });
      }

      const voice = requestedVoice || config.ttsVoice || undefined;

      let url = await runWithTimeout(synthesizeTTS(rootDir, user, text, voice), "tts");
      let usedVoice = voice || fallbackVoice;
      let fallbackUsed = false;

      if (!url) {
        url = await runWithTimeout(synthesizeTTS(rootDir, user, text, fallbackVoice), "tts-fallback");
        usedVoice = fallbackVoice;
        fallbackUsed = true;
      }

      if (!url) {
        return res.status(500).json({ error: "Falha ao sintetizar TTS" });
      }

      return res.json({ url, voice: usedVoice, fallbackUsed });
    } catch (err) {
      const isTimeout = /timeout/i.test(err?.message || "");
      const status = isTimeout ? 504 : 500;
      return res.status(status).json({ error: err?.message || "Erro ao testar TTS" });
    }
  };
}
