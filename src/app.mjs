import crypto from "node:crypto";
import path from "node:path";
import { Agent } from "./agent/agent.mjs";
import { ApprovalController } from "./approval.mjs";
import { readConfig, writeConfig } from "./config.mjs";
import { createProvider, PROVIDERS } from "./providers/index.mjs";
import { Store } from "./store.mjs";
import { ToolRegistry } from "./tools/registry.mjs";
import { memoryTools } from "./tools/memory.mjs";
import { delegateTool } from "./tools/delegate.mjs";
import { workspaceTools } from "./tools/workspace.mjs";
import { browserReady, browserTools } from "./browser/tools.mjs";
import { paths } from "./paths.mjs";
import { CapabilityStore } from "./capabilities/store.mjs";
import { capabilityTools } from "./tools/capabilities.mjs";
import { computerTools } from "./tools/computer.mjs";
import { skillTools } from "./tools/skills.mjs";
import { migrateLegacySecrets, readSecret, writeSecret } from "./secrets.mjs";

export async function createApp({ ui, sessionId, env = process.env, approvalMode, surface = "local" }) {
  let config = await readConfig(env);
  const migration = await migrateLegacySecrets(config, env);
  config = migration.config;
  if (migration.changed) await writeConfig(config, env);
  if (!config.provider) throw new Error("Helios is not configured. Run `helios onboard`.");
  const metadata = PROVIDERS[config.provider];
  const apiKey = metadata.credential ? await readSecret(metadata.credential, env) || config.credentials?.[metadata.credential] : null;
  const storedAuth = await readSecret("OPENAI_CODEX_AUTH", env);
  const auth = storedAuth ? JSON.parse(storedAuth) : config.credentials?.openaiCodex;
  if (metadata.credential && !apiKey) throw new Error(`Missing ${metadata.credential}. Run \`helios onboard\`.`);
  if (config.provider === "openai-codex" && !auth?.access) throw new Error("ChatGPT login is missing. Run `helios onboard`.");
  const workspace = path.resolve(config.workspace || process.cwd());
  const store = await new Store(env, config).open();
  const approvals = new ApprovalController((action) => ui.approve(action), { mode: approvalMode || config.autonomy.mode });
  const capabilityStore = new CapabilityStore(paths(env).capabilities);
  const registry = new ToolRegistry();
  const learningTools = config.learning.enabled ? capabilityTools({ capabilities: capabilityStore, approvals }) : [];
  const local = surface === "local";
  const availableTools = [...(local ? workspaceTools({ workspace, approvals }) : []), ...memoryTools({ store, approvals }), ...(local ? learningTools : [])];
  if (local && config.skills.enabled) availableTools.push(...skillTools({ store }));
  if (local && config.computer.enabled) availableTools.push(...await computerTools({ approvals }));
  const browserToken = local ? await readSecret("HELIOS_BROWSER_TOKEN", env) : null;
  if (local && browserToken && await browserReady(config.browser.port, browserToken)) availableTools.push(...browserTools({ port: config.browser.port, token: browserToken }));
  for (const tool of availableTools) registry.add(tool);
  const provider = createProvider({
    id: config.provider, apiKey, auth, model: config.model || metadata.defaultModel,
    saveAuth: async (nextAuth) => writeSecret("OPENAI_CODEX_AUTH", JSON.stringify(nextAuth)),
  });
  const id = sessionId || crypto.randomUUID();
  if (local && config.workers.enabled) registry.add(delegateTool({ provider, registry, store, capabilityStore, workspace, parentSessionId: id, events: { status: (status) => ui.status(status) } }));
  const agent = await new Agent({
    provider, registry, store, capabilityStore, sessionId: id, workspace, learning: config.learning.enabled,
    events: {
      status: (status) => ui.status(status),
      toolStart: (call) => ui.toolStart(call),
      toolEnd: (call, output) => ui.toolEnd(call, output),
    },
  }).initialize();
  return { agent, config, store, capabilityStore, sessionId: id, workspace };
}
