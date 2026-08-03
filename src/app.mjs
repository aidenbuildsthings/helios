import crypto from "node:crypto";
import path from "node:path";
import { Agent } from "./agent/agent.mjs";
import { ApprovalController } from "./approval.mjs";
import { credentialFor, readConfig, writeConfig } from "./config.mjs";
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

export async function createApp({ ui, sessionId, env = process.env, approvalMode }) {
  const config = await readConfig(env);
  if (!config.provider) throw new Error("Helios is not configured. Run `helios onboard`.");
  const metadata = PROVIDERS[config.provider];
  const apiKey = metadata.credential ? credentialFor(config, metadata.credential, env) : null;
  const auth = config.credentials.openaiCodex;
  if (metadata.credential && !apiKey) throw new Error(`Missing ${metadata.credential}. Run \`helios onboard\`.`);
  if (config.provider === "openai-codex" && !auth?.access) throw new Error("ChatGPT login is missing. Run `helios onboard`.");
  const workspace = path.resolve(config.workspace || process.cwd());
  const store = await new Store(env, config).open();
  const approvals = new ApprovalController((action) => ui.approve(action), { mode: approvalMode || config.autonomy.mode });
  const capabilityStore = new CapabilityStore(paths(env).capabilities);
  const registry = new ToolRegistry();
  const learningTools = config.learning.enabled ? capabilityTools({ capabilities: capabilityStore, approvals }) : [];
  const availableTools = [...workspaceTools({ workspace, approvals }), ...memoryTools({ store, approvals }), ...learningTools];
  availableTools.push(...await computerTools({ approvals }));
  if (await browserReady(config.browser.port)) availableTools.push(...browserTools({ port: config.browser.port }));
  for (const tool of availableTools) registry.add(tool);
  const provider = createProvider({
    id: config.provider, apiKey, auth, model: config.model || metadata.defaultModel,
    saveAuth: async (nextAuth) => { config.credentials.openaiCodex = nextAuth; await writeConfig(config, env); },
  });
  const id = sessionId || crypto.randomUUID();
  registry.add(delegateTool({ provider, registry, store, capabilityStore, workspace, parentSessionId: id, events: { status: (status) => ui.status(status) } }));
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
