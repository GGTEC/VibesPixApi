import fs from "fs";
import path from "path";
import crypto from "crypto";

export function configPathFor(rootDir, user) {
  return path.join(rootDir, "users", user, "config.json");
}

export function readConfig(rootDir, user) {
  const configPath = configPathFor(rootDir, user);
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath));
  } catch {
    return null;
  }
}

export function writeConfig(rootDir, user, updater) {
  const configPath = configPathFor(rootDir, user);
  const current = readConfig(rootDir, user);
  if (!current) return false;
  const next = typeof updater === "function" ? updater(current) : current;
  try {
    fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function generateOrderNsu(len = 8) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
