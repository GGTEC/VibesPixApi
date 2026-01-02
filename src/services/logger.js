import fs from "fs";
import path from "path";

function safeMessage(message) {
  return String(message ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 500);
}

export function logEvent(rootDir, { level = "info", user = null, message = "" } = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      level,
      user: user || null,
      message: safeMessage(message)
    };
    const logPath = path.join(rootDir, "logs.txt");
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch (err) {
    // Intencionalmente silencioso para não quebrar fluxo de requests
    return;
  }
}

export function readRecentLogs(rootDir, limit = 100) {
  try {
    const logPath = path.join(rootDir, "logs.txt");
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, "utf8");
    const lines = content.split(/\n+/).filter(Boolean);
    return lines.slice(-limit).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { ts: null, level: "info", user: null, message: line.slice(0, 500) };
      }
    });
  } catch {
    return [];
  }
}
