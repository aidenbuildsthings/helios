import readline from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { color, paint } from "./theme.mjs";

const LOGO = [
  "██╗  ██╗███████╗██╗     ██╗ ██████╗ ███████╗",
  "██║  ██║██╔════╝██║     ██║██╔═══██╗██╔════╝",
  "███████║█████╗  ██║     ██║██║   ██║███████╗",
  "██╔══██║██╔══╝  ██║     ██║██║   ██║╚════██║",
  "██║  ██║███████╗███████╗██║╚██████╔╝███████║",
  "╚═╝  ╚═╝╚══════╝╚══════╝╚═╝ ╚═════╝ ╚══════╝",
];

export class TerminalUI {
  constructor() { this.rl = readline.createInterface({ input: stdin, output: stdout }); }
  line(text = "") { stdout.write(`${text}\n`); }
  banner(meta) {
    stdout.write("\x1bc");
    if ((stdout.columns || 80) >= 58) LOGO.forEach((line) => this.line(paint(color.cyan, line)));
    else this.line(`${paint(color.cyan, "◆")} ${paint(color.bold, "H E L I O S")}`);
    this.line();
    this.line(`${paint(color.bold, "YOUR BUSINESS AGENT")}  ${paint(color.dim, "Local · capable · under your control")}`);
    this.line(paint(color.dim, `Model ${meta.model}   Session ${meta.session}   Learned ${meta.capabilities || 0}   Autonomy ${meta.autonomy || "guarded"}`));
    this.line(paint(color.dim, `Workspace ${meta.workspace}`));
    this.line(paint(color.dim, "─".repeat(Math.min(stdout.columns || 80, 96))));
    this.line();
  }
  async prompt(label = "YOU") {
    this.line(paint(color.dim, "┌─ What should Helios do?"));
    return this.rl.question(`${paint(color.cyan, "└▶")} ${paint(color.bold, label)}  `);
  }
  async question(text) { return this.rl.question(text); }
  async secret(text) {
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") return this.question(text);
    this.rl.pause(); emitKeypressEvents(stdin); stdin.setRawMode(true); stdout.write(text);
    let value = "";
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        stdin.off("keypress", onKey); stdin.setRawMode(false); this.rl.resume(); stdout.write("\n");
        if (error) reject(error); else resolve(value);
      };
      const onKey = (character, key = {}) => {
        if (key.ctrl && key.name === "c") { finish(new Error("Cancelled.")); return; }
        if (key.name === "return") { finish(); return; }
        if (key.name === "backspace") { if (value) { value = value.slice(0, -1); stdout.write("\b \b"); } return; }
        if (!key.ctrl && !key.meta && character && !/[\r\n]/.test(character)) { value += character; stdout.write("•"); }
      };
      stdin.on("keypress", onKey);
    });
  }
  async choose(title, options) {
    if (stdin.isTTY && typeof stdin.setRawMode === "function") return this.pick(title, options, false);
    this.line(`\n${paint(color.bold, title)}`);
    options.forEach((option, index) => this.line(`  ${paint(color.cyan, String(index + 1))}  ${option}`));
    while (true) {
      const answer = Number(await this.question("\nChoose: ")) - 1;
      if (options[answer]) return answer;
    }
  }
  async checkbox(title, options, selected = []) {
    if (stdin.isTTY && typeof stdin.setRawMode === "function") return this.pick(title, options, true, selected);
    this.line(`\n${title}\n${options.map((item, index) => `  ${index + 1}  ${item}`).join("\n")}`);
    const answer = (await this.question("Select comma-separated numbers (blank for none): ")).trim();
    return answer ? answer.split(",").map((item) => Number(item.trim()) - 1).filter((index) => options[index]) : [];
  }
  async pick(title, options, multiple, selected = []) {
    this.rl.pause();
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    let cursor = 0;
    const chosen = new Set(selected);
    const render = (first = false) => {
      if (!first) stdout.write(`\x1b[${options.length}A`);
      options.forEach((option, index) => {
        const marker = multiple ? (chosen.has(index) ? "◉" : "○") : (index === cursor ? "◆" : " ");
        const pointer = index === cursor ? paint(color.cyan, "›") : " ";
        stdout.write(`\x1b[2K${pointer} ${marker} ${option}\n`);
      });
    };
    this.line(`\n${paint(color.bold, title)}${multiple ? paint(color.dim, "  Space to select · Enter to continue") : ""}`);
    render(true);
    return new Promise((resolve, reject) => {
      const finish = (value, error) => {
        stdin.off("keypress", onKey);
        stdin.setRawMode(false);
        this.rl.resume();
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
      stdin.on("keypress", onKey);
    });
  }
  async approve(action) {
    const width = Math.min(76, Math.max(42, (stdout.columns || 80) - 4));
    this.line(`\n${paint(color.amber, `╭${"─".repeat(width - 2)}╮`)}`);
    this.line(`${paint(color.amber, "│")} ${paint(color.bold, "APPROVAL REQUIRED")} ${paint(color.dim, action.title)}`);
    if (action.detail) for (const line of wrap(action.detail, width - 4).slice(0, 10)) this.line(`${paint(color.amber, "│")} ${line}`);
    this.line(paint(color.amber, `╰${"─".repeat(width - 2)}╯`));
    return /^y(es)?$/i.test((await this.question(`  ${paint(color.amber, "Approve?")} [y/N] `)).trim());
  }
  status(text) { stdout.write(`\x1b[2K\r${paint(color.dim, `Helios · ${text}`)}`); }
  toolStart(call) { this.status(`using ${call.name}`); }
  toolEnd(call, output) {
    stdout.write("\x1b[2K\r");
    this.line(`${paint(color.green, "✓")} ${paint(color.dim, call.name)} ${paint(color.dim, summarize(output))}`);
  }
  assistant(text) {
    stdout.write("\x1b[2K\r");
    this.line(`${paint(color.cyan, "◆ HELIOS")}`);
    this.line();
    for (const line of text.trim().split("\n")) this.line(line);
    this.line();
  }
  error(error) { stdout.write(`\x1b[2K\r${paint(color.red, `Error: ${error}`)}\n\n`); }
  close() { this.rl.close(); }
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

function summarize(value) {
  const line = String(value).replace(/\s+/g, " ").trim();
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}
