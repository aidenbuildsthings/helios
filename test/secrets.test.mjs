import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deleteSecret, readSecret, writeSecret } from "../src/secrets.mjs";

test("environment credentials take precedence on every platform", async () => {
  assert.equal(await readSecret("HELIOS_TEST_SECRET", { HELIOS_TEST_SECRET: "from-environment" }), "from-environment");
});

test("Windows secrets round-trip through DPAPI", { skip: process.platform !== "win32" }, async () => {
  const env = { HELIOS_HOME: path.join(os.tmpdir(), `helios-secrets-${crypto.randomUUID()}`) };
  await writeSecret("HELIOS_TEST_SECRET", "private-value", env);
  assert.equal(await readSecret("HELIOS_TEST_SECRET", env), "private-value");
  assert.equal(await deleteSecret("HELIOS_TEST_SECRET", env), true);
  assert.equal(await readSecret("HELIOS_TEST_SECRET", env), null);
});
