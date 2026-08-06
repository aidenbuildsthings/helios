import crypto from "node:crypto";
import { createApp } from "./app.mjs";
import { Store } from "./store.mjs";

function fieldMatches(field, value, min, max) {
  return field.split(",").some((part) => {
    const [base, stepRaw] = part.split("/"); const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) return false;
    let start = min; let end = max;
    if (base !== "*") {
      const range = base.split("-").map(Number); start = range[0]; end = range.length === 2 ? range[1] : range[0];
    }
    return Number.isInteger(start) && Number.isInteger(end) && start >= min && end <= max && value >= start && value <= end && (value - start) % step === 0;
  });
}

function validateField(field, min, max) {
  if (!field) throw new Error("Cron field is empty.");
  for (const part of field.split(",")) {
    const [base, stepRaw] = part.split("/");
    if (stepRaw != null && (!/^\d+$/.test(stepRaw) || Number(stepRaw) < 1)) throw new Error(`Invalid cron step: ${part}.`);
    if (base === "*") continue;
    if (!/^\d+(?:-\d+)?$/.test(base)) throw new Error(`Invalid cron field: ${part}.`);
    const [start, end = start] = base.split("-").map(Number);
    if (start < min || end > max || start > end) throw new Error(`Cron value out of range: ${part}.`);
  }
}

export function cronMatches(expression, date = new Date()) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("Cron expressions need five fields: minute hour day month weekday.");
  const dayOfMonth = fieldMatches(fields[2], date.getDate(), 1, 31); const weekday = fieldMatches(fields[4], date.getDay(), 0, 6);
  const dayMatches = fields[2] === "*" ? weekday : fields[4] === "*" ? dayOfMonth : dayOfMonth || weekday;
  return fieldMatches(fields[0], date.getMinutes(), 0, 59) && fieldMatches(fields[1], date.getHours(), 0, 23) && dayMatches && fieldMatches(fields[3], date.getMonth() + 1, 1, 12);
}

export function validateCron(expression) {
  const fields = expression.trim().split(/\s+/); if (fields.length !== 5) throw new Error("Cron expressions need five fields: minute hour day month weekday.");
  [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]].forEach(([min, max], index) => validateField(fields[index], min, max));
  return expression.trim();
}

export async function startScheduler({ config, ui, env = process.env }) {
  if (!config.scheduler?.enabled) return null;
  const store = await new Store(env, config).open();
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    const now = new Date(); const slot = now.toISOString().slice(0, 16);
    try {
      for (const job of store.cronJobs()) {
        if (!job.enabled || job.last_slot === slot || !cronMatches(job.expression, now)) continue;
        store.markCronRun(job.id, slot);
        const app = await createApp({ ui: { ...ui, approve: async () => false, status: () => {}, toolStart: () => {}, toolEnd: () => {} }, sessionId: `cron:${job.id}:${crypto.randomUUID()}`, approvalMode: "guarded", surface: "scheduled", env });
        try {
          const worker = job.worker_id ? store.worker(job.worker_id) : null;
          const prompt = worker ? `Worker profile: ${worker.name}\n${worker.instructions}\n\nScheduled assignment:\n${job.prompt}` : job.prompt;
          const result = await app.agent.send(prompt);
          await store.log("Helios", `Cron ${job.name}\n\n${result}`);
        } catch (error) { await store.log("Error", `Cron ${job.name}: ${error.message}`); }
        finally { app.store.close(); }
      }
    } finally { running = false; }
  };
  const timer = setInterval(tick, 30_000); timer.unref?.(); void tick();
  return { stop: () => { clearInterval(timer); store.close(); } };
}
