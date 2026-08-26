import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readConfig, writeConfig } from "../src/config.mjs";

test("config writes atomically with private permissions", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "helios-config-"));
  const env = { HELIOS_HOME: home };
  await writeConfig({ version: 1, provider: "openai", credentials: {} }, env);
  assert.equal((await readConfig(env)).provider, "openai");
  assert.deepEqual((await readConfig(env)).profile, { name: null });
  assert.equal((await stat(path.join(home, "config.json"))).mode & 0o777, 0o600);
});
