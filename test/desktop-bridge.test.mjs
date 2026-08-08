import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Store } from "../src/store.mjs";

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
  assert.deepEqual(response.result.subagentTasks, []);
  assert.equal(response.result.preferences.theme, "system");
  assert.equal(JSON.stringify(response).includes("credentials"), false);
});

test("desktop bridge returns persisted messages for the selected chat session", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-desktop-chat-"));
  const env = { ...process.env, HELIOS_HOME: home };
  const store = await new Store(env, {}).open();
  const saved = { role: "assistant", content: "Persisted Helios response" };
  store.append("desktop-session", { role: "user", content: "Saved question" });
  store.append("desktop-session", saved);
  store.close();

  const child = spawn(process.execPath, [path.join(root, "src", "cli.mjs"), "desktop-bridge"], {
    env, stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end('{"id":2,"method":"session.messages","params":{"sessionId":"desktop-session"}}\n');
  let output = "";
  for await (const chunk of child.stdout) output += chunk;
  const response = JSON.parse(output.trim());
  assert.equal(response.id, 2);
  assert.deepEqual(response.result.at(-1), saved);
});

test("desktop bridge creates, pauses, and removes cron jobs", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-desktop-cron-"));
  const env = { ...process.env, HELIOS_HOME: home };
  const request = async (id, method, params = {}) => {
    const child = spawn(process.execPath, [path.join(root, "src", "cli.mjs"), "desktop-bridge"], { env, stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.end(`${JSON.stringify({ id, method, params })}\n`);
    let output = "";
    for await (const chunk of child.stdout) output += chunk;
    return JSON.parse(output.trim());
  };
  assert.equal((await request(1, "cron.create", { name: "Morning brief", expression: "0 9 * * 1-5", prompt: "Prepare a briefing" })).result, true);
  assert.equal((await request(2, "cron.setEnabled", { id: "morning-brief", enabled: false })).result, true);
  assert.equal((await request(3, "snapshot")).result.jobs[0].enabled, 0);
  assert.equal((await request(4, "cron.remove", { id: "morning-brief" })).result, true);
  assert.deepEqual((await request(5, "snapshot")).result.jobs, []);
});
