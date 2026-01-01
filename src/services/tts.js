import path from "path";
import fs from "fs";
import crypto from "crypto";
import { synthesize, synthesizeStream } from "@echristian/edge-tts";

export async function synthesizeTTS(rootDir, user, text, voice = "pt-BR-AntonioNeural") {
  if (!text) return null;

  const safeText = text.slice(0, 240);
  const hash = crypto
    .createHash("sha1")
    .update(`${voice}:${safeText}`)
    .digest("hex")
    .slice(0, 16);

  const ttsDir = path.join(rootDir, "users", user, "tts");
  const outPath = path.join(ttsDir, `${hash}.mp3`);

  try {
    if (!fs.existsSync(ttsDir)) {
      fs.mkdirSync(ttsDir, { recursive: true });
    }

    if (fs.existsSync(outPath)) {
      return `/${user}/tts/${hash}.mp3`;
    }

    let audioBuffer = null;

    try {
      const chunks = [];
      for await (const chunk of synthesizeStream({
        text: safeText,
        voice,
        language: voice.split("-").slice(0, 2).join("-") || "pt-BR",
        outputFormat: "audio-24khz-48kbitrate-mono-mp3"
      })) {
        if (chunk?.length) chunks.push(Buffer.from(chunk));
      }
      if (chunks.length) {
        audioBuffer = Buffer.concat(chunks);
      }
    } catch (errStream) {
      console.warn("TTS WARN synthesizeStream falhou, tentando synthesize", errStream);
    }

    if (!audioBuffer) {
      const res = await synthesize({
        text: safeText,
        voice,
        language: voice.split("-").slice(0, 2).join("-") || "pt-BR",
        outputFormat: "audio-24khz-48kbitrate-mono-mp3"
      });
      const audio = res?.audio;
      if (audio) {
        const buf = Buffer.from(audio);
        if (buf.length) audioBuffer = buf;
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("edge-tts (echristian) returned empty audio buffer");
    }

    fs.writeFileSync(outPath, audioBuffer);

    return `/${user}/tts/${hash}.mp3`;
  } catch (err) {
    console.error("TTS ERROR:", err);
    try {
      if (fs.existsSync(outPath) && fs.statSync(outPath).size === 0) {
        fs.unlinkSync(outPath);
      }
    } catch {}
    return null;
  }
}
