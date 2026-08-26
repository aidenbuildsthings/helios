const PALETTE = Object.freeze({
  Y: [255, 229, 0],
  S: [255, 183, 77],
  K: [8, 8, 10],
  W: [248, 248, 246],
});

const IDLE = [
  "        Y        ",
  "    Y  YYY  Y    ",
  "    YYYYYYYYY    ",
  "  YYYYYYYYYYYYY  ",
  " YYSSSSSSSSSSSYY ",
  " YSSSSSSSSSSSSSY ",
  " YSSKKSSSSSKKSSY ",
  " YSSKKSSSSSKKSSY ",
  "YYSSSSSSSSSSSSSYY",
  "  SSSSSSSSSSSSS  ",
  "    SSSSSSSWW    ",
  "   SSSSSSWWWWSS  ",
  "  SSSSSWWWWWWSSS ",
  "  SSSSWWWWWWWWSS ",
  "  SSSWWWWWWWWWSS ",
  "     WWWWWWW     ",
  "     WW   WW     ",
  "     YY   YY     ",
];

const BLINK = IDLE.map((row, index) => index === 6 || index === 7
  ? row.replaceAll("KK", index === 6 ? "SS" : "KK")
  : row);

export const HELIOS_FRAMES = Object.freeze({ idle: IDLE, blink: BLINK });

export function renderHeliosAvatar(frame = "idle") {
  const sprite = HELIOS_FRAMES[frame] || HELIOS_FRAMES.idle;
  const width = sprite[0].length;
  if (!sprite.every((row) => row.length === width)) throw new Error("Helios avatar rows must have equal width.");

  const output = [];
  for (let row = 0; row < sprite.length; row += 2) {
    const upper = sprite[row];
    const lower = sprite[row + 1] || " ".repeat(width);
    output.push([...upper].map((top, column) => renderPixel(top, lower[column])).join(""));
  }
  return output;
}

function renderPixel(top, bottom) {
  if (top === " " && bottom === " ") return " ";
  if (top === " ") return `${foreground(bottom)}▄\x1b[0m`;
  if (bottom === " ") return `${foreground(top)}▀\x1b[0m`;
  return `${foreground(top)}${background(bottom)}▀\x1b[0m`;
}

function foreground(key) {
  const [red, green, blue] = PALETTE[key];
  return `\x1b[38;2;${red};${green};${blue}m`;
}

function background(key) {
  const [red, green, blue] = PALETTE[key];
  return `\x1b[48;2;${red};${green};${blue}m`;
}
