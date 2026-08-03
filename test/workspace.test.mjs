import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { workspaceTools, resolveWorkspacePath } from "../src/tools/workspace.mjs";

test("workspace paths cannot escape", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "helios-workspace-"));
  assert.throws(() => resolveWorkspacePath(root, "../secret"), /outside/);
});

test("writes remain behind approval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "helios-workspace-"));
  const tools = workspaceTools({ workspace: root, approvals: { require: async () => false } });
  const write = tools.find((tool) => tool.name === "write_file");
  assert.equal(await write.run({ path: "note.txt", content: "hello" }), "Rejected by operator.");
  await assert.rejects(() => readFile(path.join(root, "note.txt")));
});
