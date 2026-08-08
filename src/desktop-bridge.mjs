import crypto from "node:crypto";
import os from "node:os";
import readline from "node:readline";
import { createApp } from "./app.mjs";
import { CapabilityStore } from "./capabilities/store.mjs";
import { CHANNELS } from "./channels/index.mjs";
import { readConfig, writeConfig } from "./config.mjs";
import { buildInfo } from "./management.mjs";
import { paths } from "./paths.mjs";
import { createProvider, PROVIDERS } from "./providers/index.mjs";
import { loginOpenAI } from "./auth/openai-oauth.mjs";
import { deleteSecret, readSecret, writeSecret } from "./secrets.mjs";
import { readRuntime, restartHelios, verifyRuntimeOwner } from "./runtime.mjs";
import { runCronJob, validateCron } from "./scheduler.mjs";
import { Store } from "./store.mjs";

const MAX_LINE_BYTES = 1_000_000;

export async function runDesktopBridge({ input = process.stdin, output = process.stdout, env = process.env, cliPath = process.argv[1] } = {}) {
  const sessions = new Map();
  const approvals = new Map();
  const write = (message) => output.write(`${JSON.stringify(message)}\n`);
  const event = (name, payload = {}) => write({ event: name, ...payload });
  const resetSessions = () => { for (const app of sessions.values()) app.store.close(); sessions.clear(); };

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
        preferences: config.desktop,
        settings: { updates: Boolean(config.updates.enabled), scheduler: Boolean(config.scheduler.enabled) },
        providers: Object.entries(PROVIDERS).map(([id, value]) => ({ id, label: value.label, defaultModel: value.defaultModel, credential: value.credential || null, active: id === config.provider })),
        channels: Object.entries(CHANNELS).map(([id, value]) => ({ id, name: value.label, fields: value.fields, connected: Boolean(config.channels?.[id]?.enabled), allowedSenders: config.channels?.[id]?.allowedSenders || [] })),
        tools: [
          { id: "computer", name: "Computer use", enabled: Boolean(config.computer.enabled), description: "Native macOS accessibility control through xa11y." },
          { id: "browser", name: "Browser", enabled: Boolean(config.browser.enabled), description: "Local browser-extension bridge." },
          { id: "skills", name: "Skills", enabled: Boolean(config.skills.enabled), description: "Installed instruction-only skills." },
          { id: "learning", name: "Self-improvement", enabled: Boolean(config.learning.enabled), description: "Approved reusable capability learning." },
          { id: "workers", name: "Subagents", enabled: Boolean(config.workers.enabled), description: "Persistent purpose-built delegated agents." },
        ],
        sessions: store.sessions(100), skills: store.skills(), workers: store.workers(), subagentTasks: store.subagentTasks(), jobs: store.cronJobs(), cronRuns: store.cronRuns(),
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
    if (method === "chat.send") {
      const answer = await (await getSession(params.sessionId)).agent.send(String(params.text || ""));
      const chunks = String(answer).match(/[\s\S]{1,80}/g) || [];
      for (const chunk of chunks) {
        event("chat.delta", { sessionId: params.sessionId, delta: chunk });
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      return answer;
    }
    if (method === "approval.respond") {
      const resolve = approvals.get(params.approvalId);
      if (!resolve) return false;
      approvals.delete(params.approvalId);
      resolve(Boolean(params.approved));
      return true;
    }
    if (method === "config.set") {
      const allowed = new Set(["autonomy.mode", "computer.enabled", "browser.enabled", "skills.enabled", "learning.enabled", "workers.enabled", "updates.enabled", "scheduler.enabled", "desktop.theme", "desktop.reducedMotion", "desktop.compact"]);
      if (!allowed.has(params.key)) throw new Error("That setting cannot be changed from Desktop.");
      const config = await readConfig(env);
      const [section, key] = params.key.split(".");
      await writeConfig({ ...config, [section]: { ...config[section], [key]: params.value } }, env);
      if (["autonomy", "computer", "browser", "skills", "learning", "workers"].includes(section)) resetSessions();
      return snapshot();
    }
    if (method === "provider.set") {
      const id = String(params.provider || ""); const metadata = PROVIDERS[id];
      if (!metadata) throw new Error("Unknown model provider.");
      const model = String(params.model || metadata.defaultModel).trim() || metadata.defaultModel;
      let apiKey = metadata.credential ? String(params.apiKey || "").trim() || await readSecret(metadata.credential, env) : null;
      let auth = null;
      if (id === "openai-codex") {
        event("oauth.opening", { provider: id });
        auth = await loginOpenAI((url) => event("oauth.url", { provider: id, url }));
      } else if (metadata.credential && !apiKey) throw new Error(`${metadata.label} requires an API key.`);
      const provider = createProvider({ id, apiKey, auth, model });
      const check = await provider.complete({ system: "Reply with READY only.", messages: [{ role: "user", content: "Connection test" }], tools: [] });
      if (!check.text?.trim()) throw new Error("Model verification returned an empty response. Your current model was not changed.");
      if (metadata.credential && params.apiKey && !env[metadata.credential]) await writeSecret(metadata.credential, apiKey, env);
      if (auth) await writeSecret("OPENAI_CODEX_AUTH", JSON.stringify(auth), env);
      const config = await readConfig(env);
      await writeConfig({ ...config, provider: id, model }, env);
      resetSessions();
      return snapshot();
    }
    if (method === "channel.connect") {
      const id = String(params.channel || ""); const metadata = CHANNELS[id];
      if (!metadata) throw new Error("Unknown channel.");
      const allowedSenders = String(params.allowedSenders || "").split(",").map((value) => value.trim()).filter(Boolean);
      if (!allowedSenders.length) throw new Error("Add at least one allowed sender ID.");
      const secrets = [];
      for (const field of metadata.fields) {
        const secretName = `HELIOS_${id}_${field.key}`.toUpperCase();
        const value = String(params.secrets?.[field.key] || "").trim() || await readSecret(secretName, env);
        if (!value) throw new Error(`${metadata.label} ${field.label} is required.`);
        if (!env[secretName] && params.secrets?.[field.key]) secrets.push([secretName, value]);
      }
      for (const [name, value] of secrets) await writeSecret(name, value, env);
      const config = await readConfig(env);
      await writeConfig({ ...config, channels: { ...config.channels, [id]: { enabled: true, allowedSenders } } }, env);
      return snapshot();
    }
    if (method === "channel.disconnect") {
      const id = String(params.channel || ""); const metadata = CHANNELS[id];
      if (!metadata) throw new Error("Unknown channel.");
      const config = await readConfig(env); const channels = { ...config.channels }; delete channels[id];
      await writeConfig({ ...config, channels }, env);
      for (const field of metadata.fields) await deleteSecret(`HELIOS_${id}_${field.key}`.toUpperCase(), env).catch(() => {});
      return snapshot();
    }
    if (method === "service.restart") {
      const result = await restartHelios({ cliPath, env });
      return { pid: result.pid };
    }
    if (method === "skill.remove") {
      const config = await readConfig(env);
      const store = await new Store(env, config).open();
      try { return store.removeSkill(params.id); } finally { store.close(); }
    }
    if (method === "capability.remove") return new CapabilityStore(paths(env).capabilities).remove(params.id);
    if (method === "subagent.create") {
      const name = String(params.name || "").trim(); const instructions = String(params.instructions || "").trim();
      if (!name || !instructions) throw new Error("Subagent name and purpose are required.");
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
      if (!id) throw new Error("Subagent name must contain letters or numbers.");
      const config = await readConfig(env); const store = await new Store(env, config).open();
      try { store.saveWorker({ id, name, instructions, provider: config.provider, model: config.model }); return true; } finally { store.close(); }
    }
    if (method === "subagent.remove") {
      const config = await readConfig(env); const store = await new Store(env, config).open();
      try { return store.removeWorker(String(params.id || "")); } finally { store.close(); }
    }
    if (method === "cron.create") {
      const name = String(params.name || "").trim();
      const prompt = String(params.prompt || "").trim();
      const expression = validateCron(String(params.expression || "").trim());
      if (!name || !prompt) throw new Error("Job name and instructions are required.");
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
      if (!id) throw new Error("Job name must contain letters or numbers.");
      const config = await readConfig(env); const store = await new Store(env, config).open();
      try {
        if (store.cronJobs().some((job) => job.id === id)) throw new Error("A cron job with that name already exists.");
        const workerId = params.workerId ? String(params.workerId) : null;
        if (workerId && !store.worker(workerId)) throw new Error("The selected subagent no longer exists.");
        store.saveCronJob({ id, name, expression, prompt, workerId });
        return true;
      } finally { store.close(); }
    }
    if (method === "cron.setEnabled") {
      const config = await readConfig(env); const store = await new Store(env, config).open();
      try {
        if (!store.setCronJobEnabled(String(params.id || ""), Boolean(params.enabled))) throw new Error("Cron job not found.");
        return true;
      } finally { store.close(); }
    }
    if (method === "cron.remove") {
      const config = await readConfig(env); const store = await new Store(env, config).open();
      try { return store.removeCronJob(String(params.id || "")); } finally { store.close(); }
    }
    if (method === "cron.run") {
      const jobId = String(params.id || "");
      event("cron.started", { jobId });
      try {
        const result = await runCronJob({ jobId, ui: { status: (status) => event("status", { sessionId: `cron:${jobId}`, status }), toolStart: (call) => event("tool.start", { sessionId: `cron:${jobId}`, call }), toolEnd: (call, output) => event("tool.end", { sessionId: `cron:${jobId}`, call, result: String(output).slice(0, 20_000) }) }, env });
        if (!result) throw new Error("This cron job is paused or no longer exists.");
        event("cron.finished", { jobId, status: result.status });
        return result;
      } catch (error) { event("cron.finished", { jobId, status: "failed", message: error.message }); throw error; }
    }
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
