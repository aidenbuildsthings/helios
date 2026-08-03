import { RISK } from "../approval.mjs";
import { objectSchema } from "./registry.mjs";

function limited(text, max = 40_000) { return text.length > max ? `${text.slice(0, max)}\n…truncated…` : text; }

export async function computerTools({ approvals }) {
  let xa11y;
  try { xa11y = await import("@crowecawcaw/xa11y"); }
  catch { return []; }
  const app = async (name) => name ? xa11y.App.byName(name) : xa11y.App.foreground();
  const act = async (title, detail, operation) => {
    if (!(await approvals.require({ risk: RISK.EXTERNAL, title, detail }))) return "Rejected by operator.";
    await operation(); return "Computer action completed.";
  };
  return [
    {
      name: "computer_apps", description: "List running desktop applications exposed through the operating system accessibility tree.",
      inputSchema: objectSchema({}),
      run: async () => (await xa11y.App.list()).map((item) => `${item.isForeground ? "*" : " "} ${item.name} (pid ${item.pid ?? "unknown"})`).join("\n"),
    },
    {
      name: "computer_inspect", description: "Inspect the structured accessibility tree of an application. Omit app to inspect the foreground application.",
      inputSchema: objectSchema({ app: { type: "string" }, depth: { type: "integer", minimum: 1, maximum: 12 } }),
      run: async ({ app: name, depth = 6 }) => limited(await (await app(name)).dump(Math.min(12, Math.max(1, depth)))),
    },
    {
      name: "computer_press", description: "Press a desktop UI element selected from the accessibility tree. Inspect first and use a precise selector.",
      inputSchema: objectSchema({ app: { type: "string" }, selector: { type: "string" } }, ["selector"]),
      run: async ({ app: name, selector }) => act("Press computer control", `${name || "foreground app"}: ${selector}`, async () => (await app(name)).locator(selector).press()),
    },
    {
      name: "computer_set_value", description: "Set the value of a text field or editable desktop control. Inspect first and use a precise selector.",
      inputSchema: objectSchema({ app: { type: "string" }, selector: { type: "string" }, value: { type: "string" } }, ["selector", "value"]),
      run: async ({ app: name, selector, value }) => act("Type into computer control", `${name || "foreground app"}: ${selector}`, async () => (await app(name)).locator(selector).setValue(value)),
    },
    {
      name: "computer_shortcut", description: "Send a global keyboard shortcut to the foreground application. Key names use PascalCase such as Enter, Tab, Escape, and modifiers such as LeftMeta.",
      inputSchema: objectSchema({ key: { type: "string" }, modifiers: { type: "array", items: { type: "string" } } }, ["key"]),
      run: async ({ key, modifiers = [] }) => act("Send keyboard shortcut", `${modifiers.join("+")}${modifiers.length ? "+" : ""}${key}`, async () => xa11y.inputSim.chord(key, modifiers)),
    },
  ];
}
