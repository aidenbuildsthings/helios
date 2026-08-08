import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";
import { paths } from "./paths.mjs";

const execFileAsync = promisify(execFile);
const service = (name) => `ai.helios.${name}`;

function runWithInput(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout.trim()) : reject(Object.assign(new Error(stderr.trim() || `${command} exited ${code}.`), { code, stderr: stderr.trim() })));
    child.stdin.end(input);
  });
}

async function windowsDatabase(env) {
  await mkdir(paths(env).home, { recursive: true, mode: 0o700 });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(paths(env).database);
  db.exec("CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, encrypted_value TEXT NOT NULL)");
  return db;
}

async function windowsCrypt(value, decrypt = false) {
  // Call DPAPI directly so protection does not depend on optional PowerShell modules.
  const operation = decrypt ? "Unprotect" : "Protect";
  const script = `$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());$p=[System.Security.Cryptography.ProtectedData]::${operation}($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))`;
  const result = await runWithInput("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], decrypt ? value : Buffer.from(value, "utf8").toString("base64"));
  return decrypt ? Buffer.from(result, "base64").toString("utf8") : result;
}

export async function readSecret(name, env = process.env) {
  if (env[name]?.trim()) return env[name].trim();
  if (process.platform === "darwin") {
    try { return (await execFileAsync("/usr/bin/security", ["find-generic-password", "-a", os.userInfo().username, "-s", service(name), "-w"], { maxBuffer: 100_000 })).stdout.trim() || null; }
    catch (error) { if (error?.code === 44 || error?.stderr?.includes("could not be found")) return null; throw new Error(`macOS Keychain failed for ${name}.`); }
  }
  if (process.platform === "win32") {
    const db = await windowsDatabase(env);
    try { const row = db.prepare("SELECT encrypted_value FROM secrets WHERE name=?").get(name); return row ? await windowsCrypt(row.encrypted_value, true) : null; }
    finally { db.close(); }
  }
  try { return await runWithInput("secret-tool", ["lookup", "service", "helios", "account", name], ""); }
  catch (error) { if (error?.code === 1 && !error.stderr) return null; if (error?.code === "ENOENT") throw new Error("Linux Secret Service is unavailable. Install libsecret-tools or provide secrets through the Helios service environment."); throw error; }
}

export async function writeSecret(name, value, env = process.env) {
  if (process.platform === "darwin") {
    await execFileAsync("/usr/bin/security", ["add-generic-password", "-U", "-a", os.userInfo().username, "-s", service(name), "-w", value], { maxBuffer: 100_000 }); return;
  }
  if (process.platform === "win32") {
    const encrypted = await windowsCrypt(value); const db = await windowsDatabase(env);
    try { db.prepare("INSERT INTO secrets(name,encrypted_value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET encrypted_value=excluded.encrypted_value").run(name, encrypted); }
    finally { db.close(); }
    return;
  }
  try { await runWithInput("secret-tool", ["store", "--label", `Helios ${name}`, "service", "helios", "account", name], value); }
  catch (error) { if (error?.code === "ENOENT") throw new Error("Linux Secret Service is unavailable. Install libsecret-tools or provide secrets through the Helios service environment."); throw error; }
}

export async function deleteSecret(name, env = process.env) {
  if (process.platform === "darwin") {
    try { await execFileAsync("/usr/bin/security", ["delete-generic-password", "-a", os.userInfo().username, "-s", service(name)], { maxBuffer: 100_000 }); return true; }
    catch (error) { if (error?.code === 44 || error?.stderr?.includes("could not be found")) return false; throw new Error(`macOS Keychain failed for ${name}.`); }
  }
  if (process.platform === "win32") {
    const db = await windowsDatabase(env); try { return db.prepare("DELETE FROM secrets WHERE name=?").run(name).changes > 0; } finally { db.close(); }
  }
  try { await runWithInput("secret-tool", ["clear", "service", "helios", "account", name], ""); return true; }
  catch (error) { if (error?.code === 1 && !error.stderr) return false; if (error?.code === "ENOENT") return false; throw error; }
}

export async function migrateLegacySecrets(config, env = process.env) {
  const pending = [];
  for (const [name, value] of Object.entries(config.credentials || {})) {
    if (name === "openaiCodex" && value?.access) pending.push(["OPENAI_CODEX_AUTH", JSON.stringify(value)]);
    else if (typeof value === "string" && value.trim()) pending.push([name, value.trim()]);
  }
  for (const [channel, values] of Object.entries(config.channels || {})) {
    for (const key of channel === "slack" ? ["botToken", "appToken"] : ["token"]) if (typeof values?.[key] === "string" && values[key].trim()) pending.push([`HELIOS_${channel}_${key}`.toUpperCase(), values[key].trim()]);
  }
  if (!pending.length) return { config, changed: false };
  for (const [name, value] of pending) if (!env[name]) await writeSecret(name, value, env);
  const channels = Object.fromEntries(Object.entries(config.channels || {}).map(([id, values]) => { const clean = { ...values }; delete clean.token; delete clean.botToken; delete clean.appToken; return [id, clean]; }));
  return { config: { ...config, credentials: {}, channels }, changed: true };
}
