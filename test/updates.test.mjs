import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "../src/updates.mjs";

test("update versions compare numerically", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9") > 0, true);
  assert.equal(compareVersions("v1.0.0", "1.0.0"), 0);
});
