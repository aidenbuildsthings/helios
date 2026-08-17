const esc = "\x1b[";
export const color = {
  reset: `${esc}0m`, bold: `${esc}1m`, dim: `${esc}2m`,
  cyan: `${esc}38;5;220m`, gold: `${esc}38;5;220m`, bronze: `${esc}38;5;172m`, ivory: `${esc}38;5;230m`,
  amber: `${esc}38;5;214m`, red: `${esc}38;5;203m`, green: `${esc}38;5;114m`,
};
export const paint = (code, text) => `${code}${text}${color.reset}`;
export const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
