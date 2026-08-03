#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { createApp } from "./app.mjs";
import { readConfig, writeConfig } from "./config.mjs";
import { onboard } from "./onboard.mjs";
import { Store } from "./store.mjs";
import { TerminalUI } from "./tui/ui.mjs";
import { CHANNELS } from "./channels/index.mjs";
import { runChannels, startChannels } from "./gateway.mjs";
import { BrowserBridge } from "./browser/bridge.mjs";
import { CapabilityStore } from "./capabilities/store.mjs";
import { paths } from "./paths.mjs";
import { computerTools } from "./tools/computer.mjs";

const ui = new TerminalUI();
const [command = "chat", ...args] = process.argv.slice(2);

async function chat() {
  const requestedSession = command === "--session" ? args[0] : args[0] === "--session" ? args[1] : null;
  const app = await createApp({ ui, sessionId: requestedSession });
  const channels = await startChannels({ config: app.config, ui });
  const banner = async () => ui.banner({ model: `${app.config.provider}/${app.config.model}`, session: app.sessionId.slice(0, 8), workspace: app.workspace, capabilities: (await app.capabilityStore.list()).length, autonomy: app.config.autonomy.mode });
  await banner();
  try {
    while (true) {
      const input = (await ui.prompt()).trim();
      if (!input) continue;
      if (["/exit", "/quit"].includes(input)) break;
      if (input === "/help") { ui.line("/help  /sessions  /capabilities  /autonomy  /clear  /exit\n"); continue; }
      if (input === "/clear") { await banner(); continue; }
      if (input === "/sessions") {
        app.store.sessions().forEach((session) => ui.line(`${session.id}  ${session.updated_at}`));
        ui.line(); continue;
      }
      if (input === "/capabilities") {
        const items = await app.capabilityStore.list();
        if (!items.length) ui.line("No learned capabilities yet. Helios will propose one when it recognizes a reusable workflow.");
        else items.forEach((item) => ui.line(`${paintCapability(item)}\n  ${item.description}\n  Trigger: ${item.trigger}\n`));
        ui.line(); continue;
      }
      if (input === "/autonomy") { ui.line(`Autonomy: ${app.config.autonomy.mode}\nChange it with \`helios autonomy on|off\`.\n`); continue; }
      try { ui.assistant(await app.agent.send(input)); }
      catch (error) { ui.error(error.message); }
    }
  } finally { channels?.stop(); app.store.close(); }
}

async function main() {
  if (["help", "-h", "--help"].includes(command)) {
    ui.line("Helios — local business agent\n\n  helios                              Start a new conversation\n  helios --session <id>               Resume a conversation\n  helios onboard                      Configure a provider\n  helios sessions                     List conversations\n  helios capabilities                 Manage learned capabilities\n  helios autonomy [on|off|status]     Control autonomous execution\n  helios computer status              Check built-in computer control\n  helios status                       Show local configuration\n  helios channels status              Show channel connections\n  helios channels connect [name]      Connect Slack, Discord, or Telegram\n  helios channels run                 Run connected channel adapters\n  helios browser                      Run the local browser bridge\n");
  } else if (command === "onboard") await onboard(ui, await readConfig());
  else if (command === "status") {
    const config = await readConfig();
    ui.line(`Provider: ${config.provider || "not configured"}\nModel: ${config.model || "not configured"}\nWorkspace: ${config.workspace || "not configured"}\nAutonomy: ${config.autonomy.mode}`);
  } else if (command === "sessions") {
    const store = await new Store().open();
    try { store.sessions().forEach((session) => ui.line(`${session.id}  ${session.updated_at}`)); }
    finally { store.close(); }
  } else if (command === "channels") {
    const action = args[0] || "status";
    const config = await readConfig();
    if (action === "status") {
      Object.keys(CHANNELS).forEach((id) => ui.line(`${config.channels?.[id]?.enabled ? "●" : "○"} ${CHANNELS[id].label}`));
    } else if (action === "connect") {
      const ids = Object.keys(CHANNELS);
      const id = args[1] || ids[await ui.choose("Connect a channel", ids.map((item) => CHANNELS[item].label))];
      if (!CHANNELS[id]) throw new Error(`Unsupported channel: ${id}`);
      const channel = { enabled: true };
      for (const field of CHANNELS[id].fields) channel[field.key] = (await ui.question(`${field.label}: `)).trim();
      config.channels = { ...config.channels, [id]: channel };
      await writeConfig(config);
      ui.line(`${CHANNELS[id].label} connected. It will start automatically with \`helios\`.`);
    } else if (action === "run") await runChannels({ config, ui });
    else throw new Error("Usage: helios channels [status|connect|run]");
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
    const bridge = await new BrowserBridge({ port: config.browser.port }).start();
    ui.line(`Helios browser bridge is listening on 127.0.0.1:${config.browser.port}.\nLoad the installed browser-extension folder in Chrome and click its toolbar icon.`);
    await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
    bridge.stop();
  } else if (command === "chat" || command === "tui" || command === "--session") await chat();
  else throw new Error(`Unknown command: ${command}. Run \`helios --help\`.`);
}

function paintCapability(item) { return `◆ ${item.name}  [${item.id}]  ${item.uses || 0} uses`; }

main().catch((error) => { ui.error(error.message); process.exitCode = 1; }).finally(() => ui.close());
