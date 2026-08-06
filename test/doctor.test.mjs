import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";
import { formatDoctor, runDoctor } from "../src/doctor.mjs";
import { writeConfig } from "../src/config.mjs";

test("doctor reports a healthy configured installation", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "helios-doctor-")); const workspace = path.join(home, "workspace"); await mkdir(workspace);
  const env = { HELIOS_HOME: home, OPENAI_API_KEY: "test" };
  await writeConfig({ version: 2, provider: "openai", model: "gpt-test", workspace, credentials: {}, channels: {}, autonomy: { mode: "guarded" } }, env);
  await writeFile(path.join(home, "helios.db"), Buffer.from("SQLite format 3\0rest"));
  const results = await runDoctor({ env, platform: process.platform, readSecretImpl: async (name, values) => values[name] || null });
  assert.equal(results.some((item) => item.level === "fail"), false);
  assert.match(formatDoctor(results).text, /No errors/);
});

test("doctor surfaces missing onboarding and provider", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "helios-doctor-")); const env = { HELIOS_HOME: home };
  const results = await runDoctor({ env, platform: "linux", readSecretImpl: async () => null });
  assert.equal(results.some((item) => item.name === "Configuration" && item.level === "fail"), true);
  assert.equal(results.some((item) => item.name === "Provider" && item.level === "fail"), true);
});
