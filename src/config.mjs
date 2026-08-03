import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "./paths.mjs";

export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  provider: null,
  model: null,
  workspace: null,
  credentials: {},
  channels: {},
  memory: { backend: "local", obsidian: null },
  learning: { enabled: true },
  browser: { port: 47821 },
  autonomy: { mode: "autonomous" },
});

export async function readConfig(env = process.env) {
  const file = paths(env).config;
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      credentials: { ...DEFAULT_CONFIG.credentials, ...parsed.credentials },
      channels: { ...DEFAULT_CONFIG.channels, ...parsed.channels },
      memory: { ...DEFAULT_CONFIG.memory, ...parsed.memory },
      learning: { ...DEFAULT_CONFIG.learning, ...parsed.learning },
      browser: { ...DEFAULT_CONFIG.browser, ...parsed.browser },
      autonomy: { ...DEFAULT_CONFIG.autonomy, ...parsed.autonomy },
    };
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(DEFAULT_CONFIG);
    throw new Error(`Helios could not read ${file}: ${error.message}`);
  }
}

export async function writeConfig(config, env = process.env) {
  const { home, config: file } = paths(env);
  await mkdir(home, { recursive: true, mode: 0o700 });
  const temp = path.join(home, `.config-${process.pid}.tmp`);
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
  await chmod(file, 0o600);
}

export function credentialFor(config, name, env = process.env) {
  return env[name]?.trim() || config.credentials?.[name]?.trim() || null;
}
