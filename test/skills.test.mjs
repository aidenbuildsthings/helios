import assert from "node:assert/strict";
import test from "node:test";
import { downloadSkill, normalizeSkillUrl, parseSkill } from "../src/skills.mjs";

test("skills only accept direct GitHub SKILL.md sources", () => {
  assert.equal(normalizeSkillUrl("https://github.com/acme/tools/blob/abc123/report/SKILL.md"), "https://raw.githubusercontent.com/acme/tools/abc123/report/SKILL.md");
  assert.throws(() => normalizeSkillUrl("https://evil.example/SKILL.md"), /Only GitHub/);
});

test("skill metadata records source and digest", () => {
  const skill = parseSkill("---\nname: weekly-report\ndescription: Builds weekly reports.\n---\n# Weekly\n", "https://raw.githubusercontent.com/a/b/c/SKILL.md");
  assert.equal(skill.id, "weekly-report"); assert.equal(skill.sha256.length, 64);
});

test("ClawHub installs only verification-passed instruction cards", async () => {
  const responses = [
    new Response(JSON.stringify({ schema: "clawhub.skill.verify.v1", ok: true, decision: "pass", security: { passed: true } })),
    new Response("---\nname: Weather\ndescription: Forecast instructions\n---\n# Weather\n"),
  ];
  const skill = await downloadSkill("@publisher/weather", async () => responses.shift());
  assert.equal(skill.source, "clawhub:weather");
  assert.equal(skill.name, "Weather");
});

test("ClawHub rejects unverified skills", async () => {
  const response = new Response(JSON.stringify({ schema: "clawhub.skill.verify.v1", ok: true, decision: "unscanned", reasons: ["not scanned"], security: { passed: false } }));
  await assert.rejects(() => downloadSkill("clawhub:unknown", async () => response), /blocked.*not scanned/i);
});
