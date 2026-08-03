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
  const config = { memory: { backend: "obsidian", obsidian: { vaultPath: vault, folder: "Helios", memoryNote: "Memory.md", instructionsNote: "Instructions.md", logsFolder: "Logs" } } };
  const store = await new Store({ HELIOS_HOME: home }, config).open();
  await store.remember("Use concise weekly reports.");
  await store.log("Helios", "Report completed.");
  assert.match(await readFile(path.join(vault, "Helios", "Memory.md"), "utf8"), /concise weekly reports/);
  assert.match(await readFile(path.join(vault, "Helios", "Logs", `${new Date().toISOString().slice(0, 10)}.md`), "utf8"), /Report completed/);
  store.close();
});
