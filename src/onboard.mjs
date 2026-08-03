import { access } from "node:fs/promises";
import path from "node:path";
import { writeConfig } from "./config.mjs";
import { PROVIDERS } from "./providers/index.mjs";
import { loginOpenAI } from "./auth/openai-oauth.mjs";
import { CHANNELS } from "./channels/index.mjs";

const yes = async (ui, label, defaultYes = false) => {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await ui.question(`${label} [${hint}] `)).trim();
  return answer ? /^y(es)?$/i.test(answer) : defaultYes;
};

export async function onboard(ui, existing) {
  ui.line("\n◆ HELIOS SETUP");
  ui.line("One setup for your model, memory, channels, and learning.\n");

  ui.line("1/5  MODEL");
  const ids = Object.keys(PROVIDERS);
  const selected = ids[await ui.choose("How should Helios think?", ids.map((id) => PROVIDERS[id].label))];
  const metadata = PROVIDERS[selected];
  const credentials = { ...existing.credentials };
  if (selected === "openai-codex") {
    credentials.openaiCodex = await loginOpenAI((url) => ui.line(`\nOpening ChatGPT sign-in. If needed, visit:\n${url}\n`));
  } else {
    const key = (await ui.question(`${metadata.credential}: `)).trim();
    if (!key) throw new Error("An API key is required.");
    credentials[metadata.credential] = key;
  }
  const model = (await ui.question(`Model [${metadata.defaultModel}]: `)).trim() || metadata.defaultModel;

  ui.line("\n2/5  WORKSPACE & MEMORY");
  const workspaceInput = (await ui.question(`Workspace [${process.cwd()}]: `)).trim();
  const workspace = path.resolve(workspaceInput || process.cwd());
  const useObsidian = await yes(ui, "Use an Obsidian vault for memory, logs, and instructions?");
  let memory = { backend: "local", obsidian: null };
  if (useObsidian) {
    const vaultPath = path.resolve((await ui.question("Obsidian vault path: ")).trim());
    await access(vaultPath).catch(() => { throw new Error(`Obsidian vault does not exist: ${vaultPath}`); });
    const folder = (await ui.question("Helios folder inside vault [Helios]: ")).trim() || "Helios";
    if (folder.includes("..") || path.isAbsolute(folder)) throw new Error("The Helios vault folder must be a relative folder name.");
    memory = { backend: "obsidian", obsidian: { vaultPath, folder, memoryNote: "Memory.md", instructionsNote: "Instructions.md", logsFolder: "Logs" } };
  }

  ui.line("\n3/5  CHANNELS");
  ui.line("Connected channels start automatically while Helios is running.");
  const channels = { ...existing.channels };
  for (const [id, channel] of Object.entries(CHANNELS)) {
    if (!(await yes(ui, `Connect ${channel.label}?`, Boolean(channels[id]?.enabled)))) continue;
    const configured = { enabled: true };
    for (const field of channel.fields) {
      const value = (await ui.question(`${field.label}: `)).trim();
      configured[field.key] = value || channels[id]?.[field.key];
      if (!configured[field.key]) throw new Error(`${field.label} is required.`);
    }
    channels[id] = configured;
  }

  ui.line("\n4/5  AUTONOMY");
  const autonomous = await yes(ui, "Let Helios run ordinary commands and computer actions without asking?", true);

  ui.line("\n5/5  SELF-IMPROVEMENT");
  ui.line("Helios can turn verified, repeatable workflows into reusable capabilities. New capabilities still require your approval.");
  const learning = await yes(ui, "Enable self-improvement?", true);

  const config = { ...existing, provider: selected, model, workspace, credentials, memory, channels, autonomy: { mode: autonomous ? "autonomous" : "guarded" }, learning: { enabled: learning } };
  await writeConfig(config);
  ui.line(`\n✓ Helios is ready\n  Memory: ${memory.backend === "obsidian" ? `Obsidian · ${memory.obsidian.vaultPath}` : "local persistent storage"}\n  Channels: ${Object.entries(channels).filter(([, value]) => value?.enabled).map(([id]) => id).join(", ") || "none"}\n  Learning: ${learning ? "on" : "off"}\n\nRun \`helios\`.\n`);
  return config;
}
