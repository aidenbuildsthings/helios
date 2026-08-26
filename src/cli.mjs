#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { createApp } from "./app.mjs";
import { readConfig, writeConfig } from "./config.mjs";
import { collectName, onboard } from "./onboard.mjs";
import { Store } from "./store.mjs";
import { TerminalUI } from "./tui/ui.mjs";
import { runChannels, startChannels } from "./gateway.mjs";
import { BrowserBridge } from "./browser/bridge.mjs";
import { CapabilityStore } from "./capabilities/store.mjs";
import { paths } from "./paths.mjs";
import { computerTools } from "./tools/computer.mjs";
import { checkForUpdate, installLatestUpdate, startUpdateChecks } from "./updates.mjs";
import { startScheduler, validateCron } from "./scheduler.mjs";
import { downloadSkill } from "./skills.mjs";
import { readSecret, writeSecret } from "./secrets.mjs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { formatDoctor, runDoctor } from "./doctor.mjs";
import { readRuntime, registerRuntime, restartHelios, startHelios, stopHelios, verifyRuntimeOwner } from "./runtime.mjs";
import { buildInfo, manageChannels, manageModels, manageTools, uninstallHelios } from "./management.mjs";

const [command = "chat", ...args] = process.argv.slice(2);
const ui = new TerminalUI();

async function chat() {
  const requestedSession = command === "--session" ? args[0] : args[0] === "--session" ? args[1] : null;
  let initial = await readConfig();
  if (!initial.provider) {
    const result = await onboard(ui, initial);
    if (!result.start) return;
  } else if (!initial.profile?.name) {
    const name = await collectName(ui);
    initial = { ...initial, profile: { name } };
    await writeConfig(initial);
  }
  const browserBridge = await startBrowserIfEnabled(await readConfig());
  let app;
  try { app = await createApp({ ui, sessionId: requestedSession }); }
  catch (error) { browserBridge?.stop(); throw error; }
  const background = await readRuntime().then((record) => record && verifyRuntimeOwner(record)).catch(() => false);
  let channels; let updates; let scheduler;
  let requestStop; const stop = new Promise((resolve) => { requestStop = resolve; });
  let activeTurn = null;
  const onTerminate = () => requestStop(null);
  const onInterrupt = () => { if (activeTurn) activeTurn.abort(); else requestStop(null); };
  process.once("SIGTERM", onTerminate); process.on("SIGINT", onInterrupt);
  try {
    if (!background) {
      channels = await startChannels({ config: app.config, ui });
      updates = startUpdateChecks({ config: app.config, ui });
      scheduler = await startScheduler({ config: app.config, ui });
    }
    const info = await buildInfo(fileURLToPath(import.meta.url));
    const banner = async () => ui.banner({
      model: `${app.config.provider}/${app.config.model}`, session: app.sessionId.slice(0, 8), workspace: app.workspace,
      version: info.version, name: app.config.profile?.name,
      capabilities: (await app.capabilityStore.list()).length, autonomy: app.config.autonomy.mode,
      memory: app.config.memory.backend,
      tools: app.agent.registry.definitions().map((tool) => tool.name),
      channels: Object.entries(app.config.channels || {}).filter(([, value]) => value.enabled).map(([id]) => id),
    });
    await banner();
    while (true) {
      const answer = await Promise.race([ui.prompt(), stop]); if (answer == null) break;
      const input = answer.trim();
      if (!input) continue;
      if (["/exit", "/quit"].includes(input)) break;
      if (input === "/help") { printChatHelp(); continue; }
      if (input === "/clear") { await banner(); continue; }
      if (input === "/status") {
        ui.line(`\n  Model       ${app.config.provider}/${app.config.model}\n  Session     ${app.sessionId}\n  Mode        ${app.config.autonomy.mode}\n  Workspace   ${app.workspace}\n  Tools       ${app.agent.registry?.definitions?.().length || app.registry?.definitions?.().length || "active"}\n`); continue;
      }
      if (input === "/model") { ui.line(`\n  ${app.config.provider}/${app.config.model}\n  Change it with ${paintInline("helios models set")}.\n`); continue; }
      if (input === "/tools") {
        const tools = app.agent.registry?.definitions?.() || app.registry?.definitions?.() || [];
        if (!tools.length) ui.line("\n  No local tools are active.\n");
        else ui.line(`\n${tools.map((tool) => `  ${tool.name}`).join("\n")}\n`);
        continue;
      }
      if (input === "/sessions") {
        const sessions = app.store.sessions();
        if (!sessions.length) ui.line("\n  No saved sessions.\n");
        else ui.line(`\n${sessions.map((session) => `  ${session.id === app.sessionId ? "●" : "○"} ${session.title || "Conversation"}  ${session.id.slice(0, 8)}  ${session.updated_at}`).join("\n")}\n`);
        ui.line(); continue;
      }
      if (input === "/capabilities") {
        const items = await app.capabilityStore.list();
        if (!items.length) ui.line("No learned capabilities yet. Helios will propose one when it recognizes a reusable workflow.");
        else items.forEach((item) => ui.line(`${paintCapability(item)}\n  ${item.description}\n  Trigger: ${item.trigger}\n`));
        ui.line(); continue;
      }
      if (input === "/autonomy") { ui.line(`Autonomy: ${app.config.autonomy.mode}\nChange it with \`helios autonomy on|off\`.\n`); continue; }
      activeTurn = new AbortController();
      try { await app.agent.send(input, activeTurn.signal); }
      catch (error) {
        if (activeTurn.signal.aborted || error?.name === "AbortError") ui.cancelled();
        else ui.error(error.message);
      } finally { activeTurn = null; }
    }
  } finally { process.off("SIGTERM", onTerminate); process.off("SIGINT", onInterrupt); channels?.stop(); updates?.stop(); scheduler?.stop(); browserBridge?.stop(); app.store.close(); }
}

async function service() {
  const config = await readConfig(); const runtime = await registerRuntime({ cliPath: fileURLToPath(import.meta.url) });
  let browserBridge; let app;
  let channels; let updates; let scheduler; let finish; const stopped = new Promise((resolve) => { finish = resolve; });
  const stop = () => finish(); process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    browserBridge = await startBrowserIfEnabled(config); app = await createApp({ ui, surface: "remote" });
    channels = await startChannels({ config, ui }); updates = startUpdateChecks({ config, ui }); scheduler = await startScheduler({ config, ui }); ui.line(`Helios service ready (PID ${process.pid}).`); await stopped;
  } finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); channels?.stop(); updates?.stop(); scheduler?.stop(); browserBridge?.stop(); app?.store.close(); await runtime.release(); }
}

async function startBrowserIfEnabled(config) {
  if (!config.browser.enabled) return null;
  const token = await readSecret("HELIOS_BROWSER_TOKEN");
  if (!token) { ui.line("Browser tool is enabled but HELIOS_BROWSER_TOKEN is unavailable. Run `helios tools enable browser`."); return null; }
  try { return await new BrowserBridge({ port: config.browser.port, appToken: token }).start(); }
  catch (error) { if (error?.code === "EADDRINUSE") return null; throw error; }
}

async function main() {
  if (!["darwin", "linux"].includes(process.platform)) throw new Error("Helios supports macOS and Linux.");
  if (["help", "-h", "--help"].includes(command)) {
    ui.line(`Helios — local business agent

  helios                                 Start a conversation
  helios onboard                         Configure Helios
  helios update                          Update only the Helios agent
  helios uninstall [--purge]            Remove Helios; optionally remove user data
  helios doctor                          Full installation diagnostics
  helios ping                            Quick background-service liveness check
  helios start|stop|restart              Control the background service
  helios version                         Print build and installation information
  helios models [list|set]               View or change the active model
  helios channels [list|add|edit|remove] Manage messaging channels
  helios skills [list|add|remove]        Manage instruction-only skills
  helios tools [list|enable|disable]     Manage browser and computer tools
  helios sessions                        List conversations
  helios capabilities                    Manage learned capabilities
  helios subagent                        Create a persistent subagent
  helios subagent list|remove            Manage persistent subagents
  helios cron                            Manage scheduled prompts
  helios autonomy [on|off|status]        Control autonomous execution
  helios help                            Show this command list
`);
  } else if (command === "onboard") {
    const result = await onboard(ui, await readConfig());
    if (result.start) await chat();
  }
  else if (command === "update") {
    ui.line("Checking for a verified Helios release…");
    const result = await installLatestUpdate();
    ui.line(result.updated ? `\n✓ Updated Helios ${result.installed} → ${result.latest}.\nRun \`helios restart\` if another Helios process is still running.` : `Helios ${result.installed} is already current.`);
  } else if (command === "doctor") {
    ui.line("\nHELIOS DOCTOR\n"); const report = formatDoctor(await runDoctor()); ui.line(report.text); if (report.failures) process.exitCode = 1;
  } else if (command === "restart") {
    const result = await restartHelios({ cliPath: fileURLToPath(import.meta.url) }); ui.line(`Helios restarted (PID ${result.pid}).`);
  } else if (command === "start") {
    const result = await startHelios({ cliPath: fileURLToPath(import.meta.url) }); ui.line(result.started ? `Helios started (PID ${result.pid}).` : `Helios is already running (PID ${result.pid}).`);
  } else if (command === "stop") {
    const result = await stopHelios({ cliPath: fileURLToPath(import.meta.url) }); ui.line(result.stopped ? `Helios stopped (PID ${result.pid}).` : "Helios is not running.");
  } else if (command === "ping") {
    const runtime = await readRuntime(); const live = runtime && await verifyRuntimeOwner(runtime);
    if (live) ui.line(`pong · Helios is alive (PID ${runtime.pid}, since ${runtime.startedAt}).`);
    else { ui.line("Helios is not running. Start it with `helios start`."); process.exitCode = 1; }
  } else if (["version", "--version", "-v"].includes(command)) {
    const info = await buildInfo(fileURLToPath(import.meta.url)); ui.line(`Helios ${info.version}\nCommit: ${info.commit}\nInstalled: ${info.installedAt}`);
  } else if (command === "models") await manageModels(ui, args);
  else if (command === "tools") await manageTools(ui, args);
  else if (command === "uninstall") {
    const purge = args.includes("--purge");
    const approved = await ui.approve({ title: `Uninstall Helios${purge ? " and permanently delete its data" : ""}`, detail: purge ? "This removes the program, configuration, sessions, memory, skills, and logs." : "The program will be removed. ~/.helios data will be preserved." });
    if (!approved) throw new Error("Uninstall cancelled.");
    await stopHelios({ cliPath: fileURLToPath(import.meta.url) }); const result = await uninstallHelios({ cliPath: fileURLToPath(import.meta.url), purge });
    ui.line(`Helios removed from ${result.installRoot}.${result.dataRemoved ? " User data was also removed." : " User data was preserved in ~/.helios."}`);
  } else if (command === "status") {
    const config = await readConfig();
    ui.line(`Provider: ${config.provider || "not configured"}\nModel: ${config.model || "not configured"}\nWorkspace: ${config.workspace || "not configured"}\nAutonomy: ${config.autonomy.mode}`);
  } else if (command === "sessions") {
    const store = await new Store().open();
    try { store.sessions().forEach((session) => ui.line(`${session.id}  ${session.updated_at}`)); }
    finally { store.close(); }
  } else if (command === "channels") {
    if (args[0] === "run") await runChannels({ config: await readConfig(), ui });
    else await manageChannels(ui, args);
  } else if (command === "autonomy") {
    const action = args[0] || "status";
    const config = await readConfig();
    if (action === "status") ui.line(`Autonomy: ${config.autonomy.mode}`);
    else if (action === "on" || action === "off") {
      config.autonomy = { mode: action === "on" ? "autonomous" : "guarded" };
      await writeConfig(config);
      ui.line(action === "on" ? "Autonomy enabled. Ordinary workspace writes, commands, and computer actions no longer ask for approval. High-risk commands still require confirmation." : "Autonomy disabled. Helios will request approval for actions.");
    } else throw new Error("Usage: helios autonomy [on|off|status]");
  } else if (command === "computer") {
    const action = args[0] || "status";
    if (action !== "status") throw new Error("Usage: helios computer status");
    const tools = await computerTools({ approvals: { require: async () => true } });
    try {
      const apps = await tools.find((tool) => tool.name === "computer_apps").run({});
      ui.line(`Computer control is ready.\n\n${apps}`);
    } catch (error) {
      if (/accessibility|permission/i.test(error.message)) throw new Error(`${error.message}\nGrant your terminal Accessibility and Screen Recording access in System Settings → Privacy & Security, then run this check again.`);
      throw error;
    }
  } else if (command === "updates") {
    const result = await checkForUpdate();
    ui.line(result.available ? `Helios ${result.latest} is available: ${result.url}` : `Helios ${result.installed} is current.`);
  } else if (command === "workers") {
    const action = args[0] || "list"; const config = await readConfig(); const store = await new Store(process.env, config).open();
    try {
      if (action === "list") { const items = store.workers(); if (!items.length) ui.line("No persistent workers."); else items.forEach((item) => ui.line(`${item.id}  ${item.name}`)); }
      else if (action === "add") {
        const name = (args[1] || await ui.question("Worker name: ")).trim(); const id = slug(name);
        const instructions = (await ui.question("Worker instructions: ")).trim(); if (!instructions) throw new Error("Worker instructions are required.");
        store.saveWorker({ id, name, instructions }); ui.line(`Created worker ${id}.`);
      } else if (action === "remove") { if (!store.removeWorker(args[1] || "")) throw new Error("Worker not found."); ui.line("Worker removed."); }
      else throw new Error("Usage: helios workers [list|add [name]|remove <id>]");
    } finally { store.close(); }
  } else if (command === "subagent") {
    const action = args[0] || "add"; let config = await readConfig(); const store = await new Store(process.env, config).open();
    try {
      if (action === "list") {
        const items = store.workers();
        if (!items.length) ui.line("No persistent subagents yet. Run `helios subagent` to create one.");
        else items.forEach((item) => ui.line(`${item.id}  ${item.name}  ${item.provider || config.provider}/${item.model || config.model}\n  ${item.instructions}`));
      } else if (action === "add") {
        const name = (args[1] || await ui.question("Subagent name: ")).trim(); const id = slug(name);
        const purpose = (await ui.question("What will this subagent be used for? ")).trim();
        if (!purpose) throw new Error("A subagent purpose is required.");
        const choice = await ui.choose("Choose its model", [`Use current model (${config.provider}/${config.model})`, "Connect or choose another provider"]);
        if (choice === 1) { await manageModels(ui, ["set"]); config = await readConfig(); }
        store.saveWorker({ id, name, instructions: purpose, provider: config.provider, model: config.model });
        ui.line(`Created subagent ${id}. Helios can now delegate matching work to it.`);
      } else if (action === "remove") {
        if (!store.removeWorker(args[1] || "")) throw new Error("Subagent not found.");
        ui.line("Subagent removed.");
      } else throw new Error("Usage: helios subagent [add [name]|list|remove <id>]");
    } finally { store.close(); }
  } else if (command === "cron") {
    const action = args[0] || "list"; const config = await readConfig(); const store = await new Store(process.env, config).open();
    try {
      if (action === "list") { const items = store.cronJobs(); if (!items.length) ui.line("No cron jobs."); else items.forEach((item) => ui.line(`${item.id}  ${item.expression}  ${item.name}`)); }
      else if (action === "add") {
        const name = (await ui.question("Job name: ")).trim(); const expression = validateCron((await ui.question("Cron (minute hour day month weekday): ")).trim());
        const prompt = (await ui.question("Prompt: ")).trim(); if (!name || !prompt) throw new Error("Job name and prompt are required.");
        const workers = store.workers(); const workerIndex = await ui.choose("Run as subagent", ["No subagent", ...workers.map((item) => `${item.name} (${item.id})`)]);
        store.saveCronJob({ id: slug(name), name, expression, prompt, workerId: workerIndex ? workers[workerIndex - 1].id : null }); ui.line(`Created cron job ${slug(name)}.`);
      } else if (action === "remove") { if (!store.removeCronJob(args[1] || "")) throw new Error("Cron job not found."); ui.line("Cron job removed."); }
      else throw new Error("Usage: helios cron [list|add|remove <id>]");
    } finally { store.close(); }
  } else if (command === "skills") {
    const action = args[0] || "list"; const config = await readConfig(); const store = await new Store(process.env, config).open();
    try {
      if (action === "list") { const items = store.skills(); if (!items.length) ui.line("No installed skills."); else items.forEach((item) => ui.line(`${item.id}  ${item.name}\n  ${item.source}\n  sha256:${item.sha256}`)); }
      else if (action === "install" || action === "add") {
        const source = args[1] || (await ui.question("ClawHub skill or GitHub SKILL.md URL: ")).trim(); const skill = await downloadSkill(source);
        ui.line(`\nSkill: ${skill.name}\nSource: ${skill.source}\nSHA-256: ${skill.sha256}\n\n${skill.content.slice(0, 2000)}${skill.content.length > 2000 ? "\n…" : ""}`);
        if (!(await ui.approve({ title: `Install instruction skill “${skill.name}”`, detail: "Skills are untrusted instructions. Helios will not execute bundled code, but the text may influence model behavior." }))) throw new Error("Skill installation cancelled.");
        store.saveSkill(skill); if (!config.skills.enabled) await writeConfig({ ...config, skills: { enabled: true } }); ui.line(`Installed ${skill.id}.`);
      } else if (action === "remove") { if (!store.removeSkill(args[1] || "")) throw new Error("Skill not found."); ui.line("Skill removed."); }
      else throw new Error("Usage: helios skills [list|add <clawhub-skill-or-github-url>|remove <id>]");
    } finally { store.close(); }
  } else if (command === "capabilities") {
    const action = args[0] || "list";
    const capabilities = new CapabilityStore(paths().capabilities);
    if (action === "list") {
      const items = await capabilities.list();
      if (!items.length) ui.line("No learned capabilities.");
      else items.forEach((item) => ui.line(`${item.id}  ${item.name}  (${item.uses || 0} uses)`));
    } else if (action === "show") {
      const item = await capabilities.get(args[1] || "");
      if (!item) throw new Error("Capability not found.");
      ui.line(`${item.name}\n${item.description}\n\nUse when:\n${item.trigger}\n\nInstructions:\n${item.instructions}\n\nVerification:\n${item.verification}`);
    } else if (action === "remove") {
      const item = await capabilities.get(args[1] || "");
      if (!item) throw new Error("Capability not found.");
      if (await ui.approve({ title: `Forget “${item.name}”`, detail: item.description })) {
        await capabilities.remove(item.id); ui.line(`Forgot ${item.id}.`);
      }
    } else throw new Error("Usage: helios capabilities [list|show <id>|remove <id>]");
  } else if (command === "browser") {
    const config = await readConfig();
    let token = await readSecret("HELIOS_BROWSER_TOKEN"); if (!token) { token = crypto.randomBytes(32).toString("hex"); await writeSecret("HELIOS_BROWSER_TOKEN", token); }
    const bridge = await new BrowserBridge({ port: config.browser.port, appToken: token }).start();
    ui.line(`Helios browser bridge is listening on 127.0.0.1:${config.browser.port}.\nLoad the installed browser-extension folder in Chrome and click its toolbar icon.`);
    await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
    bridge.stop();
  } else if (command === "service") await service();
  else if (command === "chat" || command === "tui" || command === "--session") await chat();
  else throw new Error(`Unknown command: ${command}. Run \`helios --help\`.`);
}

function paintCapability(item) { return `◆ ${item.name}  [${item.id}]  ${item.uses || 0} uses`; }
function paintInline(value) { return `\`${value}\``; }
function printChatHelp() {
  ui.line(`\n  Conversation\n    /status        Current model, session, mode, and workspace\n    /model         Show the active model\n    /tools         List tools available in this session\n    /sessions      List saved conversations\n    /capabilities  List learned capabilities\n\n  Controls\n    Tab            Complete slash commands\n    Ctrl+C         Cancel a turn; press again while idle to exit\n    /clear         Redraw the terminal\n    /help          Show this guide\n    /exit          Leave Helios\n`);
}
function slug(value) { const id = String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50); if (!id) throw new Error("Name must contain letters or numbers."); return id; }

main().catch((error) => { if (ui) ui.error(error.message); else console.error(error.message); process.exitCode = 1; }).finally(() => ui?.close());
