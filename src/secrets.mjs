import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const service = (name) => `ai.helios.${name}`;

export async function readSecret(name, env = process.env) {
  if (env[name]?.trim()) return env[name].trim();
  if (process.platform !== "darwin") return null;
  try { return (await execFileAsync("/usr/bin/security", ["find-generic-password", "-a", os.userInfo().username, "-s", service(name), "-w"], { maxBuffer: 100_000 })).stdout.trim() || null; }
  catch (error) { if (error?.code === 44 || error?.stderr?.includes("could not be found")) return null; throw new Error(`macOS Keychain failed for ${name}.`); }
}

export async function writeSecret(name, value) {
  if (process.platform !== "darwin") throw new Error(`On VPS/Linux, set ${name} in the Helios service environment. Helios does not write plaintext secrets to disk.`);
  await execFileAsync("/usr/bin/security", ["add-generic-password", "-U", "-a", os.userInfo().username, "-s", service(name), "-w", value], { maxBuffer: 100_000 });
}

export async function deleteSecret(name) {
  if (process.platform !== "darwin") return false;
  try {
    await execFileAsync("/usr/bin/security", ["delete-generic-password", "-a", os.userInfo().username, "-s", service(name)], { maxBuffer: 100_000 });
    return true;
  } catch (error) {
    if (error?.code === 44 || error?.stderr?.includes("could not be found")) return false;
    throw new Error(`macOS Keychain failed for ${name}.`);
  }
}

export async function migrateLegacySecrets(config, env = process.env) {
  const pending = [];
  for (const [name, value] of Object.entries(config.credentials || {})) {
    if (name === "openaiCodex" && value?.access) pending.push(["OPENAI_CODEX_AUTH", JSON.stringify(value)]);
    else if (typeof value === "string" && value.trim()) pending.push([name, value.trim()]);
  }
  for (const [channel, values] of Object.entries(config.channels || {})) {
    for (const key of channel === "slack" ? ["botToken", "appToken"] : ["token"]) {
      if (typeof values?.[key] === "string" && values[key].trim()) pending.push([`HELIOS_${channel}_${key}`.toUpperCase(), values[key].trim()]);
    }
  }
  if (!pending.length) return { config, changed: false };
  if (process.platform !== "darwin") {
    const names = pending.map(([name]) => name).join(", ");
    throw new Error(`Legacy plaintext secrets found. Move them to the Helios service environment (${names}), then run onboarding to rewrite the configuration.`);
  }
  for (const [name, value] of pending) if (!env[name]) await writeSecret(name, value);
  const channels = Object.fromEntries(Object.entries(config.channels || {}).map(([id, values]) => {
    const clean = { ...values }; delete clean.token; delete clean.botToken; delete clean.appToken; return [id, clean];
  }));
  return { config: { ...config, credentials: {}, channels }, changed: true };
}
