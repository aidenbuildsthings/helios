import crypto from "node:crypto";
import os from "node:os";
import readline from "node:readline";
import { createApp } from "./app.mjs";
import { CapabilityStore } from "./capabilities/store.mjs";
import { CHANNELS } from "./channels/index.mjs";
import { readConfig, writeConfig } from "./config.mjs";
import { buildInfo } from "./management.mjs";
import { paths } from "./paths.mjs";
import { PROVIDERS } from "./providers/index.mjs";
import { readRuntime, verifyRuntimeOwner } from "./runtime.mjs";
import { Store } from "./store.mjs";

const MAX_LINE_BYTES = 1_000_000;

export async function runDesktopBridge({ input = process.stdin, output = process.stdout, env = process.env, cliPath = process.argv[1] } = {}) {
  const sessions = new Map();
  const approvals = new Map();
  const write = (message) => output.write(`${JSON.stringify(message)}\n`);
  const event = (name, payload = {}) => write({ event: name, ...payload });

  async function snapshot() {
    const config = await readConfig(env);
    const store = await new Store(env, config).open();
    const capabilities = new CapabilityStore(paths(env).capabilities);
    try {
      const runtime = await readRuntime(env).catch(() => null);
      const running = Boolean(runtime && await verifyRuntimeOwner(runtime));
      return {
        agent: {
          name: "HELIOS", status: "online", service: running ? "running" : "stopped", version: (await buildInfo(cliPath)).version,
          provider: config.provider, model: config.model, autonomy: config.autonomy.mode,
          workspace: config.workspace, host: `${os.hostname()} · ${os.platform()} ${os.release()} (${os.arch()})`,
          memory: config.memory.backend === "obsidian" ? config.memory.obsidian : "local",
        },
        providers: Object.entries(PROVIDERS).map(([id, value]) => ({ id, label: value.label, defaultModel: value.defaultModel, active: id === config.provider })),
        channels: Object.entries(CHANNELS).map(([id, value]) => ({ id, name: value.label, connected: Boolean(config.channels?.[id]?.enabled), allowedSenders: config.channels?.[id]?.allowedSenders || [] })),
        tools: [
          { id: "computer", name: "Computer use", enabled: Boolean(config.computer.enabled), description: "Native macOS accessibility control through xa11y." },
          { id: "browser", name: "Browser", enabled: Boolean(config.browser.enabled), description: "Local browser-extension bridge." },
          { id: "skills", name: "Skills", enabled: Boolean(config.skills.enabled), description: "Installed instruction-only skills." },
          { id: "learning", name: "Self-improvement", enabled: Boolean(config.learning.enabled), description: "Approved reusable capability learning." },
          { id: "workers", name: "Sub-agents", enabled: Boolean(config.workers.enabled), description: "Persistent delegated workers." },
        ],
        sessions: store.sessions(100), skills: store.skills(), workers: store.workers(), jobs: store.cronJobs(),
        capabilities: await capabilities.list(),
      };
    } finally { store.close(); }
  }

  async function getSession(id) {
    if (sessions.has(id)) return sessions.get(id);
    const ui = {
      approve: (action) => new Promise((resolve) => {
        const approvalId = crypto.randomUUID();
        approvals.set(approvalId, resolve);
        event("approval", { approvalId, action });
      }),
      status: (status) => event("status", { sessionId: id, status }),
      toolStart: (call) => event("tool.start", { sessionId: id, call }),
      toolEnd: (call, result) => event("tool.end", { sessionId: id, call, result: String(result).slice(0, 20_000) }),
    };
    const app = await createApp({ ui, sessionId: id, env, surface: "local" });
    sessions.set(id, app);
    return app;
  }

  async function invoke(method, params = {}) {
    if (method === "snapshot") return snapshot();
    if (method === "session.messages") {
      const config = await readConfig(env);
      const store = await new Store(env, config).open();
      try { return store.messages(params.sessionId); } finally { store.close(); }
    }
    if (method === "chat.send") return (await getSession(params.sessionId)).agent.send(String(params.text || ""));
    if (method === "approval.respond") {
      const resolve = approvals.get(params.approvalId);
      if (!resolve) return false;
      approvals.delete(params.approvalId);
      resolve(Boolean(params.approved));
      return true;
    }
    if (method === "config.set") {
      const allowed = new Set(["autonomy.mode", "computer.enabled", "browser.enabled", "skills.enabled", "learning.enabled", "workers.enabled"]);
      if (!allowed.has(params.key)) throw new Error("That setting cannot be changed from Desktop.");
      const config = await readConfig(env);
      const [section, key] = params.key.split(".");
      await writeConfig({ ...config, [section]: { ...config[section], [key]: params.value } }, env);
      return snapshot();
    }
    if (method === "skill.remove") {
      const config = await readConfig(env);
      const store = await new Store(env, config).open();
      try { return store.removeSkill(params.id); } finally { store.close(); }
    }
    if (method === "capability.remove") return new CapabilityStore(paths(env).capabilities).remove(params.id);
    throw new Error(`Unknown desktop method: ${method}`);
  }

  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  reader.on("line", (line) => {
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) { event("error", { message: "Desktop request exceeded the 1 MB limit." }); return; }
    let request;
    try { request = JSON.parse(line); } catch { event("error", { message: "Desktop sent invalid JSON." }); return; }
    Promise.resolve(invoke(request.method, request.params))
      .then((result) => write({ id: request.id, result }), (error) => write({ id: request.id, error: error.message }));
  });
  await new Promise((resolve) => reader.once("close", resolve));
  for (const app of sessions.values()) app.store.close();
}
