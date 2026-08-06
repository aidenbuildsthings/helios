import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { RISK } from "../approval.mjs";
import { objectSchema } from "./registry.mjs";

const execFileAsync = promisify(execFile);

export function isHighRiskCommand(command, args, workspace) {
  const name = path.basename(command).toLowerCase();
  const joined = args.join(" ").toLowerCase();
  if (["sudo", "shutdown", "reboot", "halt", "launchctl", "systemctl"].includes(name)) return true;
  if (["sh", "bash", "zsh", "fish", "osascript", "powershell", "pwsh", "cmd", "ssh", "scp", "curl", "wget", "nc", "ncat", "socat", "security", "secret-tool"].includes(name)) return true;
  if (args.some((arg) => path.isAbsolute(arg) || arg.split(/[\\/]/).includes(".."))) return true;
  if (name === "git" && /(^|\s)(reset\s+--hard|clean\s+-[^ ]*[fd])/.test(joined)) return true;
  if (["npm", "pnpm", "yarn"].includes(name) && /(^|\s)(publish|unpublish)(\s|$)/.test(joined)) return true;
  if (name === "rm" && args.some((arg) => /^-[^-]*[rf]/.test(arg)) && args.some((arg) => {
    if (arg.startsWith("-")) return false;
    const target = path.resolve(workspace, arg);
    const relative = path.relative(path.resolve(workspace), target);
    return target === path.parse(target).root || relative.startsWith("..") || path.isAbsolute(relative);
  })) return true;
  return false;
}

async function secureWorkspacePath(workspace, requested = ".", createParent = false) {
  const target = resolveWorkspacePath(workspace, requested); const root = await realpath(path.resolve(workspace));
  if (createParent) await mkdir(path.dirname(target), { recursive: true });
  let actual;
  try { actual = await realpath(target); } catch (error) { if (error?.code !== "ENOENT" || !createParent) throw error; actual = path.join(await realpath(path.dirname(target)), path.basename(target)); }
  const relative = path.relative(root, actual);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Resolved path escapes the Helios workspace through a symlink.");
  return actual;
}

export function commandEnvironment(env = process.env) {
  const allowed = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TERM", "SHELL", "USER", "LOGNAME"];
  return Object.fromEntries(allowed.filter((key) => env[key] != null).map((key) => [key, env[key]]));
}

export function resolveWorkspacePath(workspace, requested = ".") {
  const root = path.resolve(workspace);
  const target = path.resolve(root, requested);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Path is outside the Helios workspace.");
  return target;
}

export function workspaceTools({ workspace, approvals }) {
  return [
    {
      name: "read_file", description: "Read a UTF-8 file in the workspace.",
      inputSchema: objectSchema({ path: { type: "string" } }, ["path"]),
      run: async ({ path: file }) => readFile(await secureWorkspacePath(workspace, file), "utf8"),
    },
    {
      name: "list_files", description: "List a directory in the workspace.",
      inputSchema: objectSchema({ path: { type: "string" } }),
      run: async ({ path: directory = "." }) => {
        const root = await secureWorkspacePath(workspace, directory);
        const names = await readdir(root);
        return (await Promise.all(names.slice(0, 500).map(async (name) => {
          const info = await stat(path.join(root, name));
          return `${info.isDirectory() ? "dir " : "file"} ${name}`;
        }))).join("\n");
      },
    },
    {
      name: "write_file", description: "Write a UTF-8 file in the workspace after approval.",
      inputSchema: objectSchema({ path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
      run: async ({ path: file, content }) => {
        const target = await secureWorkspacePath(workspace, file, true);
        if (!(await approvals.require({ risk: RISK.WRITE, title: `Write ${file}`, detail: `${Buffer.byteLength(content)} bytes` }))) return "Rejected by operator.";
        await writeFile(target, content, "utf8");
        return `Wrote ${Buffer.byteLength(content)} bytes to ${file}.`;
      },
    },
    {
      name: "run_command", description: "Run a program in the workspace after approval. Pass arguments separately; shell syntax is not supported.",
      inputSchema: objectSchema({ command: { type: "string" }, args: { type: "array", items: { type: "string" } } }, ["command"]),
      run: async ({ command, args = [] }) => {
        const highRisk = isHighRiskCommand(command, args, workspace);
        if (!(await approvals.require({ risk: RISK.EXECUTE, highRisk, title: highRisk ? `High-risk command: ${command}` : `Run ${command}`, detail: args.join(" ") }))) return "Rejected by operator.";
        const result = await execFileAsync(command, args, { cwd: workspace, env: commandEnvironment(), timeout: 120_000, maxBuffer: 2_000_000 });
        return [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "Command completed successfully.";
      },
    },
  ];
}
