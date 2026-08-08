import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("desktop bridge returns real empty state without exposing credentials", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-desktop-"));
  const child = spawn(process.execPath, [path.join(root, "src", "cli.mjs"), "desktop-bridge"], {
    env: { ...process.env, HELIOS_HOME: home }, stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end('{"id":1,"method":"snapshot","params":{}}\n');
  let output = "";
  for await (const chunk of child.stdout) output += chunk;
  const response = JSON.parse(output.trim());
  assert.equal(response.id, 1);
  assert.equal(response.result.agent.provider, null);
  assert.deepEqual(response.result.sessions, []);
  assert.equal(JSON.stringify(response).includes("credentials"), false);
});
