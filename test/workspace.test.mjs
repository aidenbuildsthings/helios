import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { commandEnvironment, workspaceTools, resolveWorkspacePath } from "../src/tools/workspace.mjs";

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

test("workspace reads reject symlink escapes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "helios-workspace-"));
  const outside = path.join(await mkdtemp(path.join(os.tmpdir(), "helios-outside-")), "secret.txt");
  await writeFile(outside, "secret");
  await symlink(outside, path.join(root, "link.txt"));
  const tools = workspaceTools({ workspace: root, approvals: { require: async () => true } });
  await assert.rejects(() => tools.find((tool) => tool.name === "read_file").run({ path: "link.txt" }), /symlink/);
});

test("command environment excludes agent credentials", () => {
  const result = commandEnvironment({ PATH: "/bin", HOME: "/tmp/user", OPENAI_API_KEY: "secret", HELIOS_DISCORD_TOKEN: "secret" });
  assert.deepEqual(result, { PATH: "/bin", HOME: "/tmp/user" });
});
