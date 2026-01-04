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

    try {
      const config = await readConfig(rootDir, user);
      if (!config) {
        return res.status(404).json({ error: "Config não encontrada" });
      }

      const voice = requestedVoice || config.ttsVoice || undefined;

      let url = await synthesizeTTS(rootDir, user, text, voice);
      let usedVoice = voice || fallbackVoice;
      let fallbackUsed = false;

      if (!url) {
        url = await synthesizeTTS(rootDir, user, text, fallbackVoice);
        usedVoice = fallbackVoice;
        fallbackUsed = true;
      }

      if (!url) {
        return res.status(500).json({ error: "Falha ao sintetizar TTS" });
      }

      return res.json({ url, voice: usedVoice, fallbackUsed });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Erro ao testar TTS" });
    }
  };
}
