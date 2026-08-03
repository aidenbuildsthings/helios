import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CapabilityStore } from "../src/capabilities/store.mjs";
import { capabilityTools } from "../src/tools/capabilities.mjs";

const capability = {
  name: "Weekly Sales Report",
  description: "Build the weekly sales summary.",
  trigger: "The operator asks for the weekly sales report.",
  instructions: "Read the current sales export, calculate totals, and draft the summary.",
  verification: "Totals match the source export and the reporting period is stated.",
};

test("learned capabilities persist and track reuse", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "helios-capabilities-"));
  const store = new CapabilityStore(directory);
  const created = await store.create(capability);
  assert.equal(created.id, "weekly-sales-report");
  const tools = capabilityTools({ capabilities: store, approvals: { require: async () => true } });
  const result = await tools.find((tool) => tool.name === "use_capability").run({ id: created.id });
  assert.match(result, /calculate totals/);
  assert.equal((await store.get(created.id)).uses, 1);
});

test("rejected learning proposals create nothing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "helios-capabilities-"));
  const store = new CapabilityStore(directory);
  const tools = capabilityTools({ capabilities: store, approvals: { require: async () => false } });
  assert.match(await tools.find((tool) => tool.name === "learn_capability").run(capability), /rejected/);
  assert.deepEqual(await store.list(), []);
});

test("capabilities can be removed deliberately", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "helios-capabilities-"));
  const store = new CapabilityStore(directory);
  const created = await store.create(capability);
  assert.equal(await store.remove(created.id), true);
  assert.equal(await store.get(created.id), null);
});

test("capabilities improve with recoverable revision history", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "helios-capabilities-"));
  const store = new CapabilityStore(directory);
  const created = await store.create(capability);
  const improved = await store.improve(created.id, { ...capability, instructions: "Use the approved sales export and reconcile every total.", reason: "Reconciliation was missing.", evidence: "The corrected run matched finance." });
  assert.equal(improved.revision, 2);
  assert.equal(improved.history[0].instructions, capability.instructions);
});
