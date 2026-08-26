import assert from "node:assert/strict";
import test from "node:test";
import { HELIOS_FRAMES, renderHeliosAvatar } from "../src/tui/avatar.mjs";
import { stripAnsi } from "../src/tui/theme.mjs";

test("Helios avatar frames are animation-ready and geometrically stable", () => {
  assert.deepEqual(Object.keys(HELIOS_FRAMES), ["idle", "blink"]);
  for (const sprite of Object.values(HELIOS_FRAMES)) {
    assert.equal(sprite.length, 18);
    assert.ok(sprite.every((row) => row.length === 17));
  }
  const idle = renderHeliosAvatar("idle");
  assert.equal(idle.length, 9);
  assert.ok(idle.every((row) => stripAnsi(row).length === 17));
});

test("Helios avatar uses true color and transparent outer cells", () => {
  const rendered = renderHeliosAvatar().join("\n");
  assert.match(rendered, /38;2;255;229;0m/);
  assert.match(rendered, /38;2;255;183;77m/);
  assert.match(rendered, /38;2;8;8;10m/);
  assert.match(rendered, /38;2;248;248;246m/);
  assert.equal(stripAnsi(renderHeliosAvatar()[0])[0], " ");
});
