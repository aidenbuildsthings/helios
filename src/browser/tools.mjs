import { objectSchema } from "../tools/registry.mjs";

async function request(port, token, action, input) {
  const response = await fetch(`http://127.0.0.1:${port}/action`, { method: "POST", headers: { "content-type": "application/json", "x-helios-token": token }, body: JSON.stringify({ action, input }) });
  if (!response.ok) throw new Error(await response.text());
  return JSON.stringify(await response.json());
}

export function browserTools({ port, token }) {
  return [
    { name: "browser_snapshot", description: "Read the URL, title, and visible text of the connected browser tab.", inputSchema: objectSchema({}), run: () => request(port, token, "snapshot", {}) },
    { name: "browser_navigate", description: "Navigate the connected tab to an HTTPS URL.", inputSchema: objectSchema({ url: { type: "string" } }, ["url"]), run: ({ url }) => request(port, token, "navigate", { url }) },
    { name: "browser_click", description: "Click a visible element using a CSS selector.", inputSchema: objectSchema({ selector: { type: "string" } }, ["selector"]), run: ({ selector }) => request(port, token, "click", { selector }) },
    { name: "browser_type", description: "Replace the value of an input using a CSS selector.", inputSchema: objectSchema({ selector: { type: "string" }, text: { type: "string" } }, ["selector", "text"]), run: ({ selector, text }) => request(port, token, "type", { selector, text }) },
  ];
}

export async function browserReady(port, token) {
  try { return (await fetch(`http://127.0.0.1:${port}/health`, { headers: { "x-helios-token": token }, signal: AbortSignal.timeout(250) })).ok; }
  catch { return false; }
}
