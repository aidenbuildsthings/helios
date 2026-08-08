import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Store } from "../src/store.mjs";

test("sessions preserve structured tool calls", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-store-"));
  const store = await new Store({ HELIOS_HOME: home }).open();
  const message = { role: "assistant", content: "", calls: [{ id: "1", name: "read_file", input: { path: "a" } }] };
  store.append("session", message);
  assert.deepEqual(store.messages("session"), [message]);
  store.close();
});

test("memory persists stable facts", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-memory-"));
  const store = await new Store({ HELIOS_HOME: home }).open();
  await store.remember("The fiscal year starts in April.");
  assert.match(await store.memory(), /fiscal year starts in April/);
  store.close();
});

test("Obsidian memory creates user-owned notes and daily logs", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-home-"));
  const vault = await mkdtemp(path.join(os.tmpdir(), "helios-vault-"));
  const config = { memory: { backend: "obsidian", obsidian: { vaultPath: vault, folder: "Helios", memoryNote: "Memory.md", instructionsNote: "Instructions.md", logsFolder: "Logs" }, logs: { assistant: true } } };
  const store = await new Store({ HELIOS_HOME: home }, config).open();
  await store.remember("Use concise weekly reports.");
  await store.log("Helios", "Report completed.");
  assert.match(await readFile(path.join(vault, "Helios", "Memory.md"), "utf8"), /concise weekly reports/);
  assert.match(await readFile(path.join(vault, "Helios", "Logs", `${new Date().toISOString().slice(0, 10)}.md`), "utf8"), /Report completed/);
  store.close();
});

test("persistent workers and cron jobs use the state database", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-state-"));
  const store = await new Store({ HELIOS_HOME: home }).open();
  store.saveWorker({ id: "researcher", name: "Researcher", instructions: "Cite evidence.", provider: "anthropic", model: "claude-sonnet-4-6" });
  store.saveCronJob({ id: "daily", name: "Daily", expression: "0 9 * * *", prompt: "Prepare report", workerId: "researcher" });
  assert.equal(store.worker("researcher").instructions, "Cite evidence.");
  assert.equal(store.worker("researcher").model, "claude-sonnet-4-6");
  assert.equal(store.cronJobs()[0].worker_id, "researcher");
  assert.equal(store.setCronJobEnabled("daily", false), true);
  assert.equal(store.cronJobs()[0].enabled, 0);
  store.setCronJobEnabled("daily", true);
  assert.equal(store.beginCronRun({ id: "run-1", jobId: "daily", scheduledSlot: "2026-08-03T09:00" }).id, "daily");
  assert.equal(store.beginCronRun({ id: "run-duplicate", jobId: "daily", scheduledSlot: "2026-08-03T09:00" }), null);
  assert.equal(store.finishCronRun("run-1", { status: "done", result: "Report ready" }), true);
  assert.equal(store.cronRuns("daily")[0].result, "Report ready");
  store.saveSubagentTask({ id: "task-1", workerId: "researcher", title: "Research competitors", status: "running" });
  store.setSubagentTaskStatus("task-1", "done");
  assert.equal(store.subagentTasks()[0].status, "done");
  store.close();
});
