import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseHeliosProcesses, registerRuntime, verifyRuntimeOwner } from "../src/runtime.mjs";

test("runtime registration is private and released by its owner", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-runtime-")); const env = { HELIOS_HOME: home };
  const runtime = await registerRuntime({ cliPath: "/tmp/helios/src/cli.mjs", env });
  assert.equal(JSON.parse(await readFile(path.join(home, "runtime.json"))).pid, process.pid);
  await runtime.release();
  await assert.rejects(() => readFile(path.join(home, "runtime.json")), /ENOENT/);
});

test("runtime ownership requires the recorded Helios command", async () => {
  assert.equal(await verifyRuntimeOwner({ pid: process.pid, cliPath: "/tmp/helios/src/cli.mjs" }, async () => ({ stdout: "node /tmp/helios/src/cli.mjs" })), true);
  assert.equal(await verifyRuntimeOwner({ pid: process.pid, cliPath: "/tmp/helios/src/cli.mjs" }, async () => ({ stdout: "unrelated-process" })), false);
});

test("legacy process discovery stays inside the current installation root", () => {
  const cli = "/Users/test/.local/share/helios/0.2.2-123/src/cli.mjs";
  const matches = parseHeliosProcesses(`101 node /Users/test/.local/share/helios/0.2.1-100/src/cli.mjs\n102 node /tmp/helios/src/cli.mjs`, cli, 999);
  assert.deepEqual(matches.map((item) => item.pid), [101]);
});
