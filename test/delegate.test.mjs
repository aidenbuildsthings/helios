import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Store } from "../src/store.mjs";
import { delegateTool } from "../src/tools/delegate.mjs";
import { ToolRegistry } from "../src/tools/registry.mjs";

test("delegation uses the selected subagent model and records board state", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-delegate-")); const store = await new Store({ HELIOS_HOME: home }).open();
  store.saveWorker({ id: "research", name: "Research", instructions: "Verify sources.", provider: "anthropic", model: "claude-sonnet-4-6" });
  const selected = { complete: async () => ({ text: "Verified result", calls: [] }) }; let profileUsed;
  const tool = delegateTool({
    provider: { complete: async () => ({ text: "wrong provider", calls: [] }) }, providerForWorker: async (profile) => { profileUsed = profile; return selected; },
    registry: new ToolRegistry(), store, capabilityStore: { list: async () => [] }, workspace: home, parentSessionId: "parent", events: {},
  });
  assert.equal(await tool.run({ task: "Compare vendors", worker: "research" }), "Verified result");
  assert.equal(profileUsed.model, "claude-sonnet-4-6");
  assert.equal(store.subagentTasks()[0].status, "done");
  assert.equal(store.subagentTasks()[0].title, "Compare vendors");
  store.close();
});
