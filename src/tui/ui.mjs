import readline from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { color, paint } from "./theme.mjs";

export function prepareRawInput(input) {
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
}

const SPINNER = ["·", "✦", "✧", "✦"];

export class TerminalUI {
  constructor({ input = stdin, output = stdout } = {}) {
    this.input = input;
    this.output = output;
    this.rl = readline.createInterface({ input, output, historySize: 200, removeHistoryDuplicates: true });
    this.activityTimer = null;
    this.activityStarted = 0;
    this.activityText = "";
  }
  line(text = "") { this.output.write(`${text}\n`); }
  banner(meta) {
    this.output.write("\x1bc");
    const width = Math.min(Math.max(this.output.columns || 80, 48), 96);
    this.line(`${paint(color.cyan, "✦")}  ${paint(color.bold, "H E L I O S")}  ${paint(color.dim, "local business agent")}`);
    this.line(paint(color.dim, "─".repeat(width)));
    this.line(`${paint(color.dim, "model")} ${meta.model}   ${paint(color.dim, "session")} ${meta.session}   ${paint(color.dim, "mode")} ${meta.autonomy || "guarded"}`);
    this.line(`${paint(color.dim, "memory")} ${meta.capabilities || 0} learned capabilities   ${paint(color.dim, "workspace")} ${compactPath(meta.workspace, width)}`);
    this.line(paint(color.dim, "─".repeat(width)));
    this.line(`${paint(color.dim, "Type a message")}  ${paint(color.cyan, "/help")} ${paint(color.dim, "commands")}  ${paint(color.cyan, "↑↓")} ${paint(color.dim, "history")}  ${paint(color.cyan, "Ctrl+C")} ${paint(color.dim, "exit")}`);
    this.line();
  }
  async prompt(label = "YOU") {
    this.stopActivity();
    return this.rl.question(`${paint(color.cyan, "❯")} `);
  }
  async question(text) { return this.rl.question(text); }
  async secret(text) {
    if (!this.input.isTTY || typeof this.input.setRawMode !== "function") return this.question(text);
    this.rl.pause(); prepareRawInput(this.input); this.output.write(text);
    let value = "";
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        this.input.off("keypress", onKey); this.input.setRawMode(false); if (!this.rl.closed) this.rl.resume(); this.output.write("\n");
        if (error) reject(error); else resolve(value);
      };
      const onKey = (character, key = {}) => {
        if (key.ctrl && key.name === "c") { finish(new Error("Cancelled.")); return; }
        if (key.name === "return") { finish(); return; }
        if (key.name === "backspace") { if (value) { value = value.slice(0, -1); this.output.write("\b \b"); } return; }
        if (!key.ctrl && !key.meta && character && !/[\r\n]/.test(character)) { value += character; this.output.write("•"); }
      };
      this.input.on("keypress", onKey);
    });
  }
  async choose(title, options) {
    if (this.input.isTTY && typeof this.input.setRawMode === "function") return this.pick(title, options, false);
    this.line(`\n${paint(color.bold, title)}`);
    options.forEach((option, index) => this.line(`  ${paint(color.cyan, String(index + 1))}  ${option}`));
    while (true) {
      const answer = Number(await this.question("\nChoose: ")) - 1;
      if (options[answer]) return answer;
    }
  }
  async checkbox(title, options, selected = []) {
    if (this.input.isTTY && typeof this.input.setRawMode === "function") return this.pick(title, options, true, selected);
    this.line(`\n${title}\n${options.map((item, index) => `  ${index + 1}  ${item}`).join("\n")}`);
    const answer = (await this.question("Select comma-separated numbers (blank for none): ")).trim();
    return answer ? answer.split(",").map((item) => Number(item.trim()) - 1).filter((index) => options[index]) : [];
  }
  async pick(title, options, multiple, selected = []) {
    this.rl.pause();
    prepareRawInput(this.input);
    let cursor = 0;
    const chosen = new Set(selected);
    const render = (first = false) => {
      if (!first) this.output.write(`\x1b[${options.length}A`);
      options.forEach((option, index) => {
        const marker = multiple ? (chosen.has(index) ? "◉" : "○") : (index === cursor ? "◆" : " ");
        const pointer = index === cursor ? paint(color.cyan, "›") : " ";
        this.output.write(`\x1b[2K${pointer} ${marker} ${option}\n`);
      });
    };
    this.line(`\n${paint(color.bold, title)}${multiple ? paint(color.dim, "  Space to select · Enter to continue") : ""}`);
    render(true);
    return new Promise((resolve, reject) => {
      const finish = (value, error) => {
        this.input.off("keypress", onKey);
        this.input.setRawMode(false);
        if (!this.rl.closed) this.rl.resume();
        if (error) reject(error); else resolve(value);
      };
      const onKey = (_text, key = {}) => {
        if (key.ctrl && key.name === "c") { finish(null, new Error("Cancelled.")); return; }
        if (key.name === "up") cursor = (cursor - 1 + options.length) % options.length;
        else if (key.name === "down") cursor = (cursor + 1) % options.length;
        else if (multiple && key.name === "space") chosen.has(cursor) ? chosen.delete(cursor) : chosen.add(cursor);
        else if (key.name === "return") { finish(multiple ? [...chosen].sort((a, b) => a - b) : cursor); return; }
        else return;
        render();
      };
      this.input.on("keypress", onKey);
    });
  }
  async approve(action) {
    const width = Math.min(76, Math.max(42, (this.output.columns || 80) - 4));
    this.line(`\n${paint(color.amber, `╭${"─".repeat(width - 2)}╮`)}`);
    this.line(`${paint(color.amber, "│")} ${paint(color.bold, "APPROVAL REQUIRED")} ${paint(color.dim, action.title)}`);
    if (action.detail) for (const line of wrap(action.detail, width - 4).slice(0, 10)) this.line(`${paint(color.amber, "│")} ${line}`);
    this.line(paint(color.amber, `╰${"─".repeat(width - 2)}╯`));
    return /^y(es)?$/i.test((await this.question(`  ${paint(color.amber, "Approve?")} [y/N] `)).trim());
  }
  status(text) {
    if (text === "ready" || text === "idle") { this.stopActivity(); return; }
    this.startActivity(text);
  }
  startActivity(text) {
    this.stopActivity();
    this.activityText = text; this.activityStarted = Date.now();
    if (!this.output.isTTY) { this.line(`${paint(color.dim, "…")} ${humanize(text)}`); return; }
    let frame = 0;
    const render = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - this.activityStarted) / 1000));
      this.output.write(`\x1b[2K\r${paint(color.cyan, SPINNER[frame++ % SPINNER.length])} ${paint(color.dim, humanize(this.activityText))}${elapsed >= 2 ? paint(color.dim, ` · ${elapsed}s`) : ""}`);
    };
    render(); this.activityTimer = setInterval(render, 160); this.activityTimer.unref?.();
  }
  stopActivity() {
    if (this.activityTimer) clearInterval(this.activityTimer);
    this.activityTimer = null;
    if (this.output.isTTY && this.activityText) this.output.write("\x1b[2K\r");
    this.activityText = "";
  }
  toolStart(call) { this.startActivity(humanize(call.name)); }
  toolEnd(call, output) {
    const elapsed = this.activityStarted ? Date.now() - this.activityStarted : 0;
    this.stopActivity();
    const failed = /^Tool failed:/i.test(String(output));
    this.line(`${paint(failed ? color.red : color.green, failed ? "×" : "✓")} ${paint(color.dim, humanize(call.name))}${elapsed >= 100 ? paint(color.dim, ` · ${formatDuration(elapsed)}`) : ""}`);
  }
  assistant(text) {
    this.stopActivity();
    this.line(`${paint(color.cyan, "●")} ${paint(color.bold, "Helios")}`);
    this.line();
    for (const line of String(text).trim().split("\n")) this.line(`  ${line}`);
    this.line();
  }
  error(error) { this.stopActivity(); this.line(`${paint(color.red, "×")} ${paint(color.bold, "Helios stopped this turn")}`); this.line(`  ${String(error).replace(/\n/g, "\n  ")}\n`); }
  close() { this.stopActivity(); this.rl.close(); }
}

function wrap(text, width) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  const lines = []; let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > width && current) { lines.push(current); current = word; }
    else current = `${current} ${word}`.trim();
  }
  if (current) lines.push(current);
  return lines;
}

function humanize(value) { return String(value || "working").replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()); }
function formatDuration(milliseconds) { return milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`; }
function compactPath(value, width) {
  const text = String(value || "not set"); const limit = Math.max(18, width - 30);
  return text.length > limit ? `…${text.slice(-(limit - 1))}` : text;
}
