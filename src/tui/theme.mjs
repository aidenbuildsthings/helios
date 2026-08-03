const esc = "\x1b[";
export const color = {
  reset: `${esc}0m`, bold: `${esc}1m`, dim: `${esc}2m`,
  cyan: `${esc}38;5;45m`, amber: `${esc}38;5;214m`, red: `${esc}38;5;203m`, green: `${esc}38;5;84m`,
};
export const paint = (code, text) => `${code}${text}${color.reset}`;
export const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
