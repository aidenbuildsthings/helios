import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { readConfig } from "./config.mjs";
import { paths } from "./paths.mjs";
import { PROVIDERS } from "./providers/index.mjs";
import { readRuntime, verifyRuntimeOwner } from "./runtime.mjs";
import { readSecret } from "./secrets.mjs";
import { browserStatus } from "./browser/tools.mjs";

function result(level, name, detail, fix = null) { return { level, name, detail, fix }; }

export async function runDoctor({ env = process.env, platform = process.platform, readSecretImpl = readSecret } = {}) {
  const results = []; const locations = paths(env);
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  results.push(major > 22 || (major === 22 && (minor > 22 || (minor === 22 && patch >= 3))) ? result("pass", "Node.js", process.version) : result("fail", "Node.js", `${process.version} is unsupported.`, "Install Node.js 22.22.3 or newer."));
  let configExists = true;
  try { await access(locations.config, constants.R_OK); } catch { configExists = false; results.push(result("fail", "Configuration", "config.json does not exist.", "Run `helios onboard`.")); }
  let config;
  try { config = await readConfig(env); if (configExists) results.push(result("pass", "Configuration", locations.config)); }
  catch (error) { results.push(result("fail", "Configuration", error.message, "Repair or replace config.json, then run `helios onboard`.")); return results; }
  if (!config.provider || !PROVIDERS[config.provider]) results.push(result("fail", "Provider", config.provider ? `Unsupported provider: ${config.provider}` : "No provider configured.", "Run `helios onboard`."));
  else {
    results.push(result("pass", "Provider", `${config.provider}/${config.model || PROVIDERS[config.provider].defaultModel}`));
    const metadata = PROVIDERS[config.provider];
    if (metadata.credential && !(await readSecretImpl(metadata.credential, env))) results.push(result("fail", "Provider credentials", `${metadata.credential} is missing.`, platform === "darwin" ? "Run `helios onboard`." : `Set ${metadata.credential} in the service environment.`));
    else if (config.provider === "openai-codex") {
      const raw = await readSecretImpl("OPENAI_CODEX_AUTH", env);
      try { if (!JSON.parse(raw || "null")?.access) throw new Error(); results.push(result("pass", "ChatGPT sign-in", "OAuth credentials are present.")); }
      catch { results.push(result("fail", "ChatGPT sign-in", "OAuth credentials are missing or invalid.", "Run `helios onboard`.")); }
    } else if (metadata.credential) results.push(result("pass", "Provider credentials", `${metadata.credential} is available.`));
  }
  if (Object.keys(config.credentials || {}).length) results.push(result("fail", "Secret storage", "Plaintext credentials remain in config.json.", "Run `helios onboard` to migrate them to Keychain or environment variables."));
  else results.push(result("pass", "Secret storage", platform === "darwin" ? "No plaintext credentials; macOS Keychain is enabled." : "No plaintext credentials; service environment is required."));
  if (config.browser.enabled) {
    const token = await readSecretImpl("HELIOS_BROWSER_TOKEN", env);
    if (!token) results.push(result("fail", "Browser tool", "HELIOS_BROWSER_TOKEN is missing.", "Run `helios tools enable browser`."));
    else {
      const state = await browserStatus(config.browser.port, token);
      results.push(state.connected ? result("pass", "Browser tool", "The extension is connected.") : state.online ? result("warn", "Browser tool", "The bridge is online but no browser tab is connected.") : result("warn", "Browser tool", "Enabled; start Helios to bring the bridge online."));
    }
  }
  const workspace = path.resolve(config.workspace || ".");
  try { await access(workspace, constants.R_OK | constants.W_OK); results.push(result("pass", "Workspace", workspace)); }
  catch { results.push(result("fail", "Workspace", `${workspace} is missing or not readable/writable.`, "Choose an accessible directory with `helios onboard`.")); }
  for (const [id, channel] of Object.entries(config.channels || {}).filter(([, value]) => value?.enabled)) {
    if (!channel.allowedSenders?.length) results.push(result("fail", `${id} allowlist`, "No allowed sender IDs configured.", "Run `helios onboard` and add at least one sender ID."));
    else results.push(result("pass", `${id} allowlist`, `${channel.allowedSenders.length} sender(s).`));
    const keys = id === "slack" ? ["botToken", "appToken"] : ["token"];
    for (const key of keys) {
      const name = `HELIOS_${id}_${key}`.toUpperCase();
      results.push(await readSecretImpl(name, env) ? result("pass", `${id} credentials`, `${key} is available.`) : result("fail", `${id} credentials`, `${name} is missing.`, platform === "darwin" ? "Run `helios onboard`." : `Set ${name} in the service environment.`));
    }
  }
  try {
    const header = await readFile(locations.database).then((data) => data.subarray(0, 16).toString("utf8"));
    results.push(header === "SQLite format 3\u0000" ? result("pass", "State database", locations.database) : result("fail", "State database", "The database header is invalid.", "Restore ~/.helios/helios.db from backup."));
  } catch (error) { results.push(error?.code === "ENOENT" ? result("warn", "State database", "Not created yet; it will be created on first run.") : result("fail", "State database", error.message)); }
  if (platform !== "win32") {
    try { const mode = (await lstat(locations.config)).mode & 0o777; results.push(mode === 0o600 ? result("pass", "Config permissions", "0600") : result("fail", "Config permissions", mode.toString(8), `Run: chmod 600 ${locations.config}`)); } catch {}
  }
  const runtime = await readRuntime(env).catch(() => null);
  if (!runtime) results.push(result("warn", "Runtime", "Helios is not currently registered as running."));
  else if (await verifyRuntimeOwner(runtime)) results.push(result("pass", "Runtime", `Helios is running as PID ${runtime.pid}.`));
  else results.push(result("warn", "Runtime", "A stale or unverifiable runtime record exists.", "Starting Helios again will replace a stale record; do not delete it if that PID is active."));
  return results;
}

export function formatDoctor(results) {
  const icon = { pass: "✓", warn: "!", fail: "✗" };
  const lines = results.flatMap((item) => [`${icon[item.level]} ${item.name}: ${item.detail}`, ...(item.fix ? [`  Fix: ${item.fix}`] : [])]);
  const failures = results.filter((item) => item.level === "fail").length; const warnings = results.filter((item) => item.level === "warn").length;
  return { text: `${lines.join("\n")}\n\n${failures ? `${failures} error(s)` : "No errors"}${warnings ? ` · ${warnings} warning(s)` : ""}.`, failures, warnings };
}
