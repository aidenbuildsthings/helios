import { readFile, realpath, rm, unlink } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { readConfig, writeConfig } from "./config.mjs";
import { CHANNELS } from "./channels/index.mjs";
import { createProvider, PROVIDERS } from "./providers/index.mjs";
import { loginOpenAI } from "./auth/openai-oauth.mjs";
import { deleteSecret, readSecret, writeSecret } from "./secrets.mjs";
import { browserStatus } from "./browser/tools.mjs";
import { paths } from "./paths.mjs";

export async function manageModels(ui, args, env = process.env) {
  const config = await readConfig(env);
  if ((args[0] || "set") === "list") {
    Object.entries(PROVIDERS).forEach(([id, value]) => ui.line(`${id === config.provider ? "●" : "○"} ${id}  ${value.label}${id === config.provider ? `  ${config.model}` : ""}`));
    return;
  }
  if ((args[0] || "set") !== "set") throw new Error("Usage: helios models [list|set]");
  const ids = Object.keys(PROVIDERS); const id = ids[await ui.choose("Choose a model provider", ids.map((item) => PROVIDERS[item].label))];
  const metadata = PROVIDERS[id]; let apiKey = null; let auth = null;
  if (id === "openai-codex") auth = await loginOpenAI((url) => ui.line(`\nOpen this ChatGPT sign-in URL if your browser does not open:\n${url}\n`));
  else if (metadata.credential) {
    apiKey = (await ui.secret(`${metadata.credential}: `)).trim() || await readSecret(metadata.credential, env);
    if (!apiKey) throw new Error(`${metadata.credential} is required.`);
  }
  let suggested = metadata.defaultModel;
  if (id === "ollama-local") {
    const available = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3_000) }).then((response) => response.ok ? response.json() : null).then((body) => body?.models?.map((item) => item.name).filter(Boolean) || []).catch(() => []);
    if (available.length) suggested = available[await ui.choose("Choose an installed Ollama model", available)];
  }
  const model = (await ui.question(`Model [${suggested}]: `)).trim() || suggested;
  const provider = createProvider({ id, apiKey, auth, model });
  const check = await provider.complete({ system: "Reply with READY only.", messages: [{ role: "user", content: "Connection test" }], tools: [] });
  if (!check.text?.trim()) throw new Error("Model verification returned an empty response; the old model remains active.");
  if (metadata.credential && apiKey && !env[metadata.credential]) await writeSecret(metadata.credential, apiKey);
  if (auth) await writeSecret("OPENAI_CODEX_AUTH", JSON.stringify(auth));
  await writeConfig({ ...config, provider: id, model }, env);
  ui.line(`Model changed to ${id}/${model}.`);
}

export async function manageChannels(ui, args, env = process.env) {
  const action = args[0] || "list"; const config = await readConfig(env);
  if (["list", "status"].includes(action)) {
    Object.entries(CHANNELS).forEach(([id, value]) => ui.line(`${config.channels?.[id]?.enabled ? "●" : "○"} ${id}  ${value.label}`));
    return;
  }
  if (["add", "edit", "modify", "connect"].includes(action)) {
    const ids = Object.keys(CHANNELS); const requested = args[1]; const id = requested && CHANNELS[requested] ? requested : ids[await ui.choose("Choose a channel", ids.map((item) => CHANNELS[item].label))];
    const channel = CHANNELS[id]; const next = { enabled: true };
    for (const field of channel.fields) {
      const secretName = `HELIOS_${id}_${field.key}`.toUpperCase();
      const value = (await ui.secret(`${channel.label} · ${field.label}: `)).trim() || await readSecret(secretName, env);
      if (!value) throw new Error(`${channel.label} ${field.label} is required.`);
      if (!env[secretName]) await writeSecret(secretName, value);
    }
    const previous = config.channels?.[id]?.allowedSenders || [];
    next.allowedSenders = (await ui.question(`${channel.label} allowed sender IDs [${previous.join(",")}]: `)).split(",").map((item) => item.trim()).filter(Boolean);
    if (!next.allowedSenders.length) next.allowedSenders = previous;
    if (!next.allowedSenders.length) throw new Error("At least one allowed sender ID is required.");
    await writeConfig({ ...config, channels: { ...config.channels, [id]: next } }, env); ui.line(`${channel.label} connected. Run \`helios restart\` if the background service is running.`); return;
  }
  if (["remove", "disconnect"].includes(action)) {
    const id = args[1]; if (!CHANNELS[id]) throw new Error("Usage: helios channels remove <telegram|discord|slack>");
    const channels = { ...config.channels }; delete channels[id]; await writeConfig({ ...config, channels }, env);
    for (const field of CHANNELS[id].fields) await deleteSecret(`HELIOS_${id}_${field.key}`.toUpperCase()).catch(() => {});
    ui.line(`${CHANNELS[id].label} removed. Environment-managed secrets, if any, must be removed from the service environment.`); return;
  }
  throw new Error("Usage: helios channels [list|add [name]|edit [name]|remove <name>]");
}

export async function manageTools(ui, args, env = process.env) {
  const action = args[0] || "list"; const config = await readConfig(env); const id = args[1];
  const items = { computer: Boolean(config.computer.enabled), browser: Boolean(config.browser.enabled) };
  if (["list", "status"].includes(action)) {
    for (const [name, enabled] of Object.entries(items)) {
      let detail = enabled ? "enabled" : "disabled";
      if (name === "browser" && enabled) {
        const token = await readSecret("HELIOS_BROWSER_TOKEN", env); const state = token ? await browserStatus(config.browser.port, token) : { online: false, connected: false };
        detail = state.connected ? "extension connected" : state.online ? "bridge online · connect a tab" : "enabled · starts with Helios";
      }
      ui.line(`${enabled ? "●" : "○"} ${name}  ${detail}`);
    }
    return;
  }
  if (!Object.hasOwn(items, id) || !["enable", "disable"].includes(action)) throw new Error("Usage: helios tools [list|enable <browser|computer>|disable <browser|computer>]");
  const enabled = action === "enable";
  if (id === "browser" && enabled && !(await readSecret("HELIOS_BROWSER_TOKEN", env))) {
    await writeSecret("HELIOS_BROWSER_TOKEN", crypto.randomBytes(32).toString("hex"));
  }
  await writeConfig({ ...config, [id]: { ...config[id], enabled } }, env);
  ui.line(`${id} ${enabled ? "enabled" : "disabled"}.${id === "browser" && enabled ? " Install the bundled Chrome extension, then click its icon on the tab Helios may use." : ""}`);
}

export async function buildInfo(cliPath = fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(path.resolve(cliPath)));
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const build = await readFile(path.join(root, "build.json"), "utf8").then(JSON.parse).catch(() => ({}));
  return { version: build.version || pkg.version, commit: build.commit || "source checkout", installedAt: build.installedAt || "not installed" };
}

export async function uninstallHelios({ cliPath, purge = false, env = process.env }) {
  const resolvedCli = await realpath(cliPath); const versionDir = path.dirname(path.dirname(resolvedCli)); const installRoot = path.dirname(versionDir);
  const configuredRoot = path.resolve(env.HELIOS_INSTALL_DIR || path.join(os.homedir(), ".local", "share", "helios"));
  const expectedRoot = await realpath(configuredRoot).catch(() => configuredRoot);
  if (installRoot !== expectedRoot || !/^\d+\.\d+\.\d+-\d{14}$/.test(path.basename(versionDir))) throw new Error("Refusing to uninstall a source checkout or unrecognized installation path.");
  const bin = path.resolve(env.HELIOS_BIN_DIR || path.join(os.homedir(), ".local", "bin"), "helios");
  await unlink(bin).catch((error) => { if (error?.code !== "ENOENT") throw error; });
  await rm(expectedRoot, { recursive: true, force: true });
  if (purge) {
    const names = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OLLAMA_API_KEY", "OPENAI_CODEX_AUTH", "HELIOS_BROWSER_TOKEN", ...Object.entries(CHANNELS).flatMap(([id, channel]) => channel.fields.map((field) => `HELIOS_${id}_${field.key}`.toUpperCase()))];
    for (const name of names) await deleteSecret(name).catch(() => {});
    await rm(paths(env).home, { recursive: true, force: true });
  }
  return { installRoot: expectedRoot, dataRemoved: purge };
}
