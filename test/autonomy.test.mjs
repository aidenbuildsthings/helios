import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalController, RISK } from "../src/approval.mjs";
import { isHighRiskCommand } from "../src/tools/workspace.mjs";

test("autonomous mode skips ordinary command approval", async () => {
  let asked = false;
  const approvals = new ApprovalController(async () => { asked = true; return false; }, { mode: "autonomous" });
  assert.equal(await approvals.require({ risk: RISK.EXECUTE, title: "Run git status" }), true);
  assert.equal(asked, false);
});

test("autonomous mode still confirms explicitly high-risk operations", async () => {
  let asked = false;
  const approvals = new ApprovalController(async () => { asked = true; return false; }, { mode: "autonomous" });
  assert.equal(await approvals.require({ risk: RISK.EXECUTE, highRisk: true, title: "Danger" }), false);
  assert.equal(asked, true);
});

test("destructive commands targeting outside the workspace are high risk", () => {
  assert.equal(isHighRiskCommand("rm", ["-rf", "/"], "/tmp/work"), true);
  assert.equal(isHighRiskCommand("git", ["status"], "/tmp/work"), false);
  assert.equal(isHighRiskCommand("git", ["reset", "--hard"], "/tmp/work"), true);
});
