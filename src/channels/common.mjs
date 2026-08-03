export async function checkedJson(response) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { text }; }
  if (!response.ok || data.ok === false) throw new Error(data.error || data.description || data.text || `${response.status} ${response.statusText}`);
  return data;
}

export function chunkMessage(text, limit) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let split = remaining.lastIndexOf("\n", limit);
    if (split < limit / 2) split = remaining.lastIndexOf(" ", limit);
    if (split < limit / 2) split = limit;
    chunks.push(remaining.slice(0, split).trim());
    remaining = remaining.slice(split).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
