import path from "path";
import fs from "fs";
import crypto from "crypto";
import sdk from "microsoft-cognitiveservices-speech-sdk";
import { logEvent } from "./logger.js";

const ALLOWED_TTS_VOICES = new Set([
  "pt-BR-ThalitaMultilingualNeural",
  "pt-BR-AntonioNeural",
  "pt-BR-FranciscaNeural",
  "pt-PT-DuarteNeural",
  "pt-PT-RaquelNeural"
]);
const DEFAULT_VOICE = "pt-BR-AntonioNeural";
const DEFAULT_REGION = "brazilsouth";
const AUDIO_FORMAT = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;

export async function synthesizeTTS(rootDir, user, text, voice = "pt-BR-AntonioNeural") {
  if (!text) return null;

  const finalVoice = ALLOWED_TTS_VOICES.has(voice) ? voice : DEFAULT_VOICE;
  const { key: speechKey, region: speechRegion } = resolveAzureCredentials();

  if (!speechKey || !speechRegion) {
    logEvent(rootDir, {
      level: "error",
      user: user || null,
      message: "tts_missing_azure_credentials"
    });
    return null;
  }

  const safeText = text.slice(0, 240);
  const hash = crypto
    .createHash("sha1")
    .update(`${finalVoice}:${safeText}`)
    .digest("hex")
    .slice(0, 16);

  const ttsDir = path.join(rootDir, "users", user, "tts");
  const outPath = path.join(ttsDir, `${hash}.mp3`);

  logEvent(rootDir, {
    level: "info",
    user: user || null,
    message: `tts_begin voice=${finalVoice} len=${safeText.length}`
  });

  try {
    if (!fs.existsSync(ttsDir)) {
      fs.mkdirSync(ttsDir, { recursive: true });
    }

    if (fs.existsSync(outPath)) {
      logEvent(rootDir, {
        level: "info",
        user: user || null,
        message: `tts_cache_hit voice=${finalVoice} file=${hash}.mp3`
      });
      return `/${user}/tts/${hash}.mp3`;
    }

    await synthesizeWithAzure({
      text: safeText,
      voice: finalVoice,
      filePath: outPath,
      speechKey,
      speechRegion
    });

    const stats = fs.statSync(outPath);
    if (!stats?.size) {
      throw new Error("azure-tts wrote empty file");
    }

    logEvent(rootDir, {
      level: "info",
      user: user || null,
      message: `tts_done voice=${finalVoice} file=${hash}.mp3`
    });

    return `/${user}/tts/${hash}.mp3`;
  } catch (err) {
    console.error("TTS ERROR:", err);
    logEvent(rootDir, {
      level: "error",
      user: user || null,
      message: `tts_exception msg=${err?.message || "unknown"}`
    });
    try {
      if (fs.existsSync(outPath) && fs.statSync(outPath).size === 0) {
        fs.unlinkSync(outPath);
      }
    } catch {}
    return null;
  }
}

export function getAllowedTtsVoices() {
  return Array.from(ALLOWED_TTS_VOICES);
}

export function getDefaultTtsVoice() {
  return DEFAULT_VOICE;
}

function resolveAzureCredentials() {
  const key = (process.env.AZURE_SPEECH_KEY || process.env.SPEECH_KEY || "").trim();
  const region = (process.env.AZURE_SPEECH_REGION || process.env.SPEECH_REGION || DEFAULT_REGION).trim();
  return { key, region };
}

async function synthesizeWithAzure({ text, voice, filePath, speechKey, speechRegion }) {
  const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
  speechConfig.speechSynthesisVoiceName = voice;
  speechConfig.speechSynthesisOutputFormat = AUDIO_FORMAT;
  const audioConfig = sdk.AudioConfig.fromAudioFileOutput(filePath, AUDIO_FORMAT);
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  await new Promise((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result?.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          return resolve();
        }
        return reject(new Error(result?.errorDetails || "azure-tts failed"));
      },
      (err) => {
        synthesizer.close();
        reject(err);
      }
    );
  });
}
