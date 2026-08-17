export async function checkedJson(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || body?.raw || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return body;
}

export async function readSSE(response, onEvent) {
  if (!response.ok) throw new Error(await response.text());
  await readLines(response, (line) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data && data !== "[DONE]") onEvent(JSON.parse(data));
  });
}

export async function readNDJSON(response, onValue) {
  if (!response.ok) throw new Error(await response.text());
  await readLines(response, (line) => { if (line.trim()) onValue(JSON.parse(line)); });
}

async function readLines(response, onLine) {
  if (!response.body) throw new Error("Provider returned an empty streaming response.");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
    for (const line of lines) onLine(line);
    if (done) break;
  }
  if (buffer) onLine(buffer);
}

export function openAITools(tools) {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

export function anthropicTools(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}
