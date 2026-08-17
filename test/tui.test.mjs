import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { completeCommand, prepareRawInput, TerminalUI } from "../src/tui/ui.mjs";
import { stripAnsi } from "../src/tui/theme.mjs";

test("raw terminal input resumes after readline pauses stdin", () => {
  const input = new PassThrough();
  const rawModes = [];
  input.setRawMode = (enabled) => rawModes.push(enabled);
  input.pause();

  prepareRawInput(input);

  assert.equal(input.readableFlowing, true);
  assert.deepEqual(rawModes, [true]);
  input.destroy();
});

test("arrow keys select an onboarding option and restore terminal mode", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const rawModes = [];
  input.isTTY = true;
  input.setRawMode = (enabled) => rawModes.push(enabled);
  const ui = new TerminalUI({ input, output });

  const choice = ui.choose("How should Helios think?", ["ChatGPT", "OpenAI API key"]);
  input.write("\x1b[B\r");

  assert.equal(await choice, 1);
  assert.deepEqual(rawModes, [true, false]);
  ui.close();
  input.destroy();
  output.destroy();
});

test("space selects multiple onboarding options", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  const ui = new TerminalUI({ input, output });

  const choices = ui.checkbox("Features", ["Updates", "Computer use"]);
  input.write(" \x1b[B \r");

  assert.deepEqual(await choices, [0, 1]);
  ui.close();
  input.destroy();
  output.destroy();
});

test("secret entry stays active until Enter", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  const ui = new TerminalUI({ input, output });

  const secret = ui.secret("API key: ");
  input.write("abc\bD\r");

  assert.equal(await secret, "abD");
  ui.close();
  input.destroy();
  output.destroy();
});

test("conversation chrome keeps status compact and tool output private", () => {
  const input = new PassThrough(); const output = new PassThrough(); let rendered = "";
  output.on("data", (chunk) => { rendered += chunk; });
  const ui = new TerminalUI({ input, output });
  ui.banner({ model: "openai/gpt-test", session: "abc123", capabilities: 2, autonomy: "guarded", workspace: "/a/very/long/workspace/path" });
  ui.toolStart({ name: "read_file" });
  ui.toolEnd({ name: "read_file" }, "private file contents");
  ui.assistant("Ready to work.");
  const plain = stripAnsi(rendered);
  assert.match(plain, /██╗  ██╗███████╗/);
  assert.match(plain, /MODEL  openai\/gpt-test/);
  assert.match(plain, /✓ Read file/);
  assert.doesNotMatch(plain, /private file contents/);
  assert.match(plain, /● Helios\n\n  Ready to work\./);
  ui.close(); input.destroy(); output.destroy();
});

test("slash commands autocomplete from a shared command catalog", () => {
  assert.deepEqual(completeCommand("/sta")[0], ["/status"]);
  assert.ok(completeCommand("/")[0].includes("/sessions"));
});
