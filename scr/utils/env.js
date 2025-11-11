import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const ENV_FILES = [".env", ".env_local"];

let loaded = false;

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    if (!key || key.startsWith("#")) {
      continue;
    }

    if (process.env[key] !== undefined) {
      continue;
    }

    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

export function ensureEnvLoaded() {
  if (loaded) {
    return;
  }

  for (const name of ENV_FILES) {
    const filePath = resolve(ROOT_DIR, name);
    loadEnvFile(filePath);
  }

  loaded = true;
}

export function requireEnv(key) {
  ensureEnvLoaded();
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} environment variable is not set`);
  }
  return value;
}

export function getEnv(key, fallback = undefined) {
  ensureEnvLoaded();
  return process.env[key] ?? fallback;
}

