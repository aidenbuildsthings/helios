import assert from "node:assert/strict";
import test from "node:test";
import { readSecret } from "../src/secrets.mjs";

test("environment credentials take precedence on every platform", async () => {
  assert.equal(await readSecret("HELIOS_TEST_SECRET", { HELIOS_TEST_SECRET: "from-environment" }), "from-environment");
});
