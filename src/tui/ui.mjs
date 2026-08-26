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
const SMALL_WORDMARK = [
  "█  █ █▀▀ █   █ █▀▀█ █▀▀",
  "█▀▀█ █▀▀ █   █ █  █ ▀▀█",
  "▀  ▀ ▀▀▀ ▀▀▀ ▀ ▀▀▀▀ ▀▀▀",
];
const LARGE_WORDMARK = [
  "██╗  ██╗███████╗██╗     ██╗ ██████╗ ███████╗",
  "██║  ██║██╔════╝██║     ██║██╔═══██╗██╔════╝",
  "███████║█████╗  ██║     ██║██║   ██║███████╗",
  "██╔══██║██╔══╝  ██║     ██║██║   ██║╚════██║",
  "██║  ██║███████╗███████╗██║╚██████╔╝███████║",
  "╚═╝  ╚═╝╚══════╝╚══════╝╚═╝ ╚═════╝ ╚══════╝",
];
const HELIOS_AVATAR = [
  "        Y        ",
  "     Y YYY Y     ",
  "     YYYYYYY     ",
  "     YYYYYYY     ",
  "   YYYSSSSSYYY   ",
  "    YSSSSSSSY    ",
  "    YSKSSSKSY    ",
  "   YSSKSSSKSSY   ",
  "     SSSSSSS     ",
  "      SSSSWW     ",
  "     SSSWWWS     ",
  "    SSSWWWWSS    ",
  "    SSWWWWWSS    ",
  "    SSWWWWWSS    ",
  "      WWWWW      ",
  "      YYWYY      ",
  "                 ",
  "                 ",
];
export const CHAT_COMMANDS = ["/status", "/model", "/tools", "/sessions", "/capabilities", "/autonomy", "/clear", "/help", "/exit"];

export class TerminalUI {
  constructor({ input = stdin, output = stdout } = {}) {
    this.input = input;
    this.output = output;
    this.rl = readline.createInterface({ input, output, historySize: 200, removeHistoryDuplicates: true, completer: completeCommand });
    this.activityTimer = null;
    this.activityStarted = 0;
    this.activityText = "";
    this.streaming = false;
  }
  line(text = "") { this.output.write(`${text}\n`); }
  setupBanner() {
    this.output.write("\x1bc");
    this.line(); LARGE_WORDMARK.forEach((row) => this.line(paint(color.gold, `  ${row}`)));
    this.line(`${paint(color.border, "  ──┤")} ${paint(color.ivory, "AWAKEN YOUR AGENT")} ${paint(color.border, "├────────────────────")}`);
    this.line(paint(color.dim, "  The sun remembers. The sun reveals. Your work stays yours.")); this.line();
  }
  step(current, total, name, description = "") {
    this.line(`${paint(color.border, greekRule(8))} ${paint(color.gold, `${String(current).padStart(2, "0")}/${String(total).padStart(2, "0")}  ${name.toUpperCase()}`)} ${paint(color.border, greekRule(8))}`);
    if (description) this.line(paint(color.dim, `  ${description}`));
  }
  permissionStatus(name, status, tone = "dim") {
    const code = color[tone] || color.dim; const icon = tone === "green" ? "✓" : tone === "red" ? "×" : tone === "amber" ? "!" : "○";
    this.line(`  ${paint(code, icon)} ${name.padEnd(20)} ${paint(code, status)}`);
  }
  banner(meta) {
    this.output.write("\x1bc");
    const width = Math.min(Math.max(this.output.columns || 80, 64), 112);
    const inner = width - 2;
    const leftWidth = width >= 88 ? Math.floor(inner * 0.43) : inner;
    const rightWidth = inner - leftWidth - (width >= 88 ? 1 : 0);
    const title = ` Helios ${meta.version ? `v${meta.version}` : ""} `;
    this.line(`${paint(color.border, `╭─`)}${paint(color.gold, title)}${paint(color.border, `${"─".repeat(Math.max(0, width - title.length - 3))}╮`)}`);

    const left = welcomePanel(meta, leftWidth);
    const right = width >= 88 ? tipsPanel(meta, rightWidth) : [];
    const rows = Math.max(left.length, right.length);
    for (let index = 0; index < rows; index += 1) {
      const divider = width >= 88 ? `${paint(color.border, "│")}${padVisible(right[index] || "", rightWidth)}` : "";
      this.line(`${paint(color.border, "│")}${padVisible(left[index] || "", leftWidth)}${divider}${paint(color.border, "│")}`);
    }
    if (width < 88) {
      this.line(`${paint(color.border, "├" + "─".repeat(inner) + "┤")}`);
      for (const row of tipsPanel(meta, inner)) this.line(`${paint(color.border, "│")}${padVisible(row, inner)}${paint(color.border, "│")}`);
    }
    this.line(`${paint(color.border, `╰${"─".repeat(inner)}╯`)}`);
    this.line(`${paint(color.gold, "  ✦")} ${paint(color.dim, "Helios is ready. Ask for work, or type /help for commands.")}`);
    this.line();
  }
  async prompt(label = "YOU") {
    this.stopActivity();
    const width = Math.min(Math.max(this.output.columns || 80, 40), 112);
    this.line(paint(color.border, "─".repeat(width)));
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
    this.line(`\n${paint(color.border, `╭${"─".repeat(width - 2)}╮`)}`);
    this.line(`${paint(color.border, "│")} ${paint(color.amber, "APPROVAL REQUIRED")} ${paint(color.dim, action.title)}`);
    if (action.detail) for (const line of wrap(action.detail, width - 4).slice(0, 10)) this.line(`${paint(color.border, "│")} ${line}`);
    this.line(paint(color.border, `╰${"─".repeat(width - 2)}╯`));
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
    const lines = String(text).trim().split("\n");
    this.line(`${paint(color.cyan, "●")} ${lines.shift() || ""}`);
    for (const line of lines) this.line(`  ${line}`);
    this.line();
  }
  responseStart() {
    this.stopActivity(); this.streaming = true;
    this.output.write(`${paint(color.cyan, "●")} `);
  }
  responseDelta(delta) { this.output.write(String(delta).replace(/\n/g, "\n  ")); }
  responseEnd() { if (!this.streaming) return; this.streaming = false; this.output.write("\n\n"); }
  cancelled() { this.stopActivity(); if (this.streaming) { this.streaming = false; this.output.write("\n"); } this.line(`${paint(color.amber, "↳")} Turn cancelled. Type a correction or a new request.\n`); }
  error(error) { this.stopActivity(); this.line(`${paint(color.red, "×")} ${paint(color.bold, "Helios stopped this turn")}`); this.line(`  ${String(error).replace(/\n/g, "\n  ")}\n`); }
  close() { this.stopActivity(); this.rl.close(); }
}

function welcomePanel(meta, width) {
  const name = String(meta.name || "").trim();
  const greeting = name ? `Welcome back, ${name}!` : "Welcome back!";
  const avatar = renderAvatar();
  const model = truncate(meta.model || "model not selected", Math.max(12, width - 4));
  const workspace = compactPath(meta.workspace, width - 2);
  const rows = [
    "",
    center(paint(color.bold, greeting), width),
    "",
    ...avatar.map((row) => center(row, width)),
    "",
    center(paint(color.dim, `${model} · ${meta.autonomy || "guarded"}`), width),
    center(paint(color.dim, workspace), width),
  ];
  return rows;
}

function tipsPanel(meta, width) {
  const lines = [
    "",
    `  ${paint(color.gold, "Tips for getting started")}`,
    `  ${truncate("Ask Helios to inspect, plan, or automate work here", Math.max(8, width - 4))}`,
    "",
    `  ${paint(color.border, "─".repeat(Math.max(1, width - 4)))}`,
    `  ${paint(color.gold, "Quick commands")}`,
    `  ${paint(color.cyan, "/model")} ${paint(color.dim, "change the model")}`,
    `  ${paint(color.cyan, "/tools")} ${paint(color.dim, "see available tools")}`,
    `  ${paint(color.cyan, "/help")} ${paint(color.dim, "show every command")}`,
    "",
    `  ${paint(color.dim, `session ${meta.session || "new"}`)}`,
  ];
  return lines;
}

function renderAvatar() {
  const palette = { Y: [251, 235, 78], S: [243, 186, 97], K: [0, 0, 0], W: [255, 255, 255] };
  const foreground = (pixel) => `\x1b[38;2;${palette[pixel].join(";")}m`;
  const background = (pixel) => `\x1b[48;2;${palette[pixel].join(";")}m`;
  const rows = [];
  for (let index = 0; index < HELIOS_AVATAR.length; index += 2) {
    const upper = HELIOS_AVATAR[index]; const lower = HELIOS_AVATAR[index + 1];
    rows.push([...upper].map((top, column) => {
      const bottom = lower[column];
      if (top === " " && bottom === " ") return " ";
      if (top === bottom) return `${background(top)} ${color.reset}`;
      if (top === " ") return `${foreground(bottom)}▄${color.reset}`;
      if (bottom === " ") return `${foreground(top)}▀${color.reset}`;
      return `${foreground(top)}${background(bottom)}▀${color.reset}`;
    }).join(""));
  }
  return rows;
}

function center(value, width) {
  const visible = stripTerminalCodes(value).length;
  return `${" ".repeat(Math.max(0, Math.floor((width - visible) / 2)))}${value}`;
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

function greekRule(repeats) { return `┈${"┯┷".repeat(repeats)}┈`; }
function padVisible(value, width) {
  const visible = stripTerminalCodes(value);
  return `${value}${" ".repeat(Math.max(0, width - visible.length))}`;
}
function stripTerminalCodes(value) { return String(value).replace(/\x1b\[[0-9;]*m/g, ""); }
function truncate(value, width) {
  const text = String(value || ""); return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
}

export function completeCommand(line) {
  if (!line.startsWith("/")) return [[], line];
  const hits = CHAT_COMMANDS.filter((command) => command.startsWith(line));
  return [hits.length ? hits : CHAT_COMMANDS, line];
}
