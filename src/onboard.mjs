import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { writeConfig } from "./config.mjs";
import { createProvider, PROVIDERS } from "./providers/index.mjs";
import { loginOpenAI } from "./auth/openai-oauth.mjs";
import { CHANNELS } from "./channels/index.mjs";
import { readSecret, writeSecret } from "./secrets.mjs";
import crypto from "node:crypto";
import { preparePermissions } from "./permissions.mjs";

const featureChoices = [
  ["updates", "Update checks every 6 hours"], ["scheduler", "User cron jobs"],
  ["skills", "Downloaded instruction skills (quarantined by default)"], ["workers", "Persistent purpose-built subagents"],
  ["computer", "Computer use"], ["learning", "Self-improving capabilities"],
  ["browser", "Browser control through the bundled Chrome extension"],
];

export async function onboard(ui, existing, env = process.env) {
  ui.setupBanner();
  ui.line("  Use ↑/↓ and Enter. Multi-select screens use Space.\n");

  ui.step(1, 9, "Introduction", "Let's get to know each other.");
  const name = await collectName(ui, existing.profile?.name);

  ui.step(2, 9, "Oracle", "Choose the mind behind Helios.");
  const ids = Object.keys(PROVIDERS);
  const selected = ids[await ui.choose("How should Helios think?", ids.map((id) => PROVIDERS[id].label))];
  const metadata = PROVIDERS[selected];
  let apiKey = null; let oauth = null;
  if (selected === "openai-codex") oauth = await loginOpenAI((url) => ui.line(`\nOpening ChatGPT sign-in. If needed:\n${url}\n`));
  else if (metadata.credential) {
    const key = (await ui.secret(`${metadata.credential}: `)).trim();
    apiKey = key || await readSecret(metadata.credential, env) || existing.credentials?.[metadata.credential];
    if (!apiKey) throw new Error(`${metadata.credential} is required.`);
  }
  let defaultModel = metadata.defaultModel;
  if (selected === "ollama-local") {
    const models = await localOllamaModels().catch(() => []);
    if (models.length) defaultModel = models[await ui.choose("Choose an installed Ollama model", models)];
    else ui.line("Ollama was not reachable on 127.0.0.1:11434. You can enter a model now and start Ollama before running Helios.");
  }
  const model = (await ui.question(`Model [${defaultModel}]: `)).trim() || defaultModel;

  ui.step(3, 9, "Domain", "Choose where Helios may work.");
  const workspaceInput = (await ui.question(`Workspace [${existing.workspace || process.cwd()}]: `)).trim();
  const workspace = path.resolve(workspaceInput || existing.workspace || process.cwd());
  await access(workspace, constants.R_OK | constants.W_OK).catch(() => { throw new Error(`Workspace is not readable and writable: ${workspace}`); });

  ui.step(4, 9, "Memory", "Keep durable knowledge private or in your vault.");
  const memoryChoice = await ui.choose("Where should durable memory live?", ["Local private storage", "Obsidian vault"]);
  let memory = { backend: "local", obsidian: null, logs: { user: false, assistant: false, tools: true, errors: true } };
  if (memoryChoice === 1) {
    const vaultValue = (await ui.question(`Obsidian vault path${existing.memory?.obsidian?.vaultPath ? ` [${existing.memory.obsidian.vaultPath}]` : ""}: `)).trim() || existing.memory?.obsidian?.vaultPath;
    if (!vaultValue) throw new Error("An Obsidian vault path is required.");
    const vaultPath = path.resolve(vaultValue);
    await access(vaultPath).catch(() => { throw new Error(`Obsidian vault does not exist: ${vaultPath}`); });
    const folder = (await ui.question("Helios folder inside vault [Helios]: ")).trim() || "Helios";
    if (folder.includes("..") || path.isAbsolute(folder)) throw new Error("The vault folder must be relative.");
    const logOptions = ["User requests", "Helios responses", "Tool actions", "Errors"];
    const chosenLogs = await ui.checkbox("What should Helios write to daily Obsidian logs?", logOptions, [2, 3]);
    memory = { backend: "obsidian", obsidian: { vaultPath, folder, memoryNote: "Memory.md", instructionsNote: "Instructions.md", logsFolder: "Logs" }, logs: { user: chosenLogs.includes(0), assistant: chosenLogs.includes(1), tools: chosenLogs.includes(2), errors: chosenLogs.includes(3) } };
  }

  ui.step(5, 9, "Messengers", "Let Helios answer only through channels you trust.");
  const channelIds = Object.keys(CHANNELS);
  const selectedChannels = await ui.checkbox("Connect messaging channels", channelIds.map((id) => CHANNELS[id].label), channelIds.map((id, index) => existing.channels?.[id]?.enabled ? index : -1).filter((index) => index >= 0));
  const channels = {};
  const channelSecrets = [];
  for (const index of selectedChannels) {
    const id = channelIds[index]; const channel = CHANNELS[id]; const configured = { enabled: true };
    for (const field of channel.fields) {
      const value = (await ui.secret(`${channel.label} · ${field.label}: `)).trim();
      const secretName = `HELIOS_${id}_${field.key}`.toUpperCase();
      const secret = value || await readSecret(secretName, env) || existing.channels?.[id]?.[field.key];
      if (!secret) throw new Error(`${channel.label} ${field.label} is required.`);
      channelSecrets.push([secretName, secret]);
    }
    const senders = (await ui.question(`${channel.label} allowed sender IDs (comma-separated, required): `)).split(",").map((item) => item.trim()).filter(Boolean);
    configured.allowedSenders = senders.length ? senders : existing.channels?.[id]?.allowedSenders || [];
    if (!configured.allowedSenders.length) throw new Error(`${channel.label} needs at least one allowed sender ID.`);
    channels[id] = configured;
  }

  ui.step(6, 9, "Gifts", "Choose the powers Helios awakens with.");
  const enabledFeatures = await ui.checkbox("Enable out-of-the-box features", featureChoices.map(([, label]) => label), featureChoices.map(([key], index) => existing[key]?.enabled ? index : -1).filter((index) => index >= 0));
  const enabled = new Set(enabledFeatures.map((index) => featureChoices[index][0]));

  ui.step(7, 9, "Guardrails", "Decide when actions require your blessing.");
  const autonomyIndex = await ui.choose("Action approval policy", ["Guarded — approve writes, commands, and external actions (recommended)", "Autonomous — ordinary actions run without approval"]);
  if (autonomyIndex === 1) ui.line("High-risk commands, skill installation, publishing, and capability changes still require approval.");

  ui.step(8, 9, "Permissions", "Grant selected powers once, then verify them.");
  const config = {
    ...existing, version: 2, profile: { name }, provider: selected, model, workspace, credentials: {}, memory, channels,
    autonomy: { mode: autonomyIndex === 0 ? "guarded" : "autonomous" },
    updates: { enabled: enabled.has("updates"), intervalHours: 6 }, scheduler: { enabled: enabled.has("scheduler") },
    skills: { enabled: enabled.has("skills") }, workers: { enabled: enabled.has("workers") },
    computer: { enabled: enabled.has("computer") }, learning: { enabled: enabled.has("learning") },
    browser: { ...existing.browser, enabled: enabled.has("browser") },
  };
  await verifyModel(config, { apiKey, oauth });
  if (metadata.credential && apiKey && !env[metadata.credential]) await writeSecret(metadata.credential, apiKey);
  if (oauth) await writeSecret("OPENAI_CODEX_AUTH", JSON.stringify(oauth));
  for (const [name, value] of channelSecrets) if (!env[name]) await writeSecret(name, value);
  if (config.browser.enabled && !(await readSecret("HELIOS_BROWSER_TOKEN", env))) {
    await writeSecret("HELIOS_BROWSER_TOKEN", crypto.randomBytes(32).toString("hex"));
  }
  await writeConfig(config, env);
  await preparePermissions({ ui, config, env });
  ui.step(9, 9, "Dawn", "Your agent is configured and ready.");
  ui.line(`\n${"  "}☀ Helios has risen\n  Model: ${selected}/${model}\n  Memory: ${memory.backend}\n  Channels: ${Object.keys(channels).join(", ") || "local only"}\n  Security: ${config.autonomy.mode}\n`);
  const start = await chooseLaunch(ui);
  if (!start) ui.line("\nRun `helios` when you're ready.\n");
  return { config, start };
}

export async function collectName(ui, currentName = "") {
  const fallback = String(currentName || "").trim();
  while (true) {
    const answer = (await ui.question(`Hi, I'm Helios. What can I call you?${fallback ? ` [${fallback}]` : ""} `)).trim() || fallback;
    if (answer) return answer.slice(0, 60);
    ui.line("Please enter the name you'd like Helios to use.");
  }
}

export async function chooseLaunch(ui) {
  return await ui.choose("Start Helios now?", ["Yes — open Helios", "Not right now"]) === 0;
}

async function localOllamaModels(fetchImpl = fetch) {
  const response = await fetchImpl("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error("Ollama unavailable.");
  return (await response.json()).models?.map((item) => item.name).filter(Boolean) || [];
}

async function verifyModel(config, { apiKey, oauth }) {
  const provider = createProvider({ id: config.provider, apiKey, auth: oauth, model: config.model });
  const result = await provider.complete({ system: "Reply with READY only.", messages: [{ role: "user", content: "Connection test" }], tools: [] });
  if (!result.text?.trim()) throw new Error("Model verification returned an empty response. Configuration was not saved.");
}
