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
