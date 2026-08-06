import crypto from "node:crypto";

const MAX_SKILL_BYTES = 100_000;
const CLAWHUB_ROOT = "https://clawhub.ai";

function clawHubSlug(value) {
  const direct = value.match(/^clawhub:(?:@[^/]+\/)?([a-z0-9][a-z0-9-]{0,99})$/i) || value.match(/^@[^/]+\/([a-z0-9][a-z0-9-]{0,99})$/i);
  if (direct) return direct[1].toLowerCase();
  try {
    const url = new URL(value);
    if (url.origin === CLAWHUB_ROOT) return url.pathname.match(/^\/[^/]+\/skills\/([a-z0-9][a-z0-9-]{0,99})\/?$/i)?.[1]?.toLowerCase() || null;
  } catch {}
  return null;
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error(`Download exceeds the ${Math.round(maxBytes / 1000)} KB safety limit.`);
  if (!response.body?.getReader) {
    const text = await response.text(); if (Buffer.byteLength(text) > maxBytes) throw new Error(`Download exceeds the ${Math.round(maxBytes / 1000)} KB safety limit.`); return text;
  }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error(`Download exceeds the ${Math.round(maxBytes / 1000)} KB safety limit.`); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((item) => Buffer.from(item))).toString("utf8");
}

export function normalizeSkillUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Skills require HTTPS.");
  if (url.hostname === "github.com") {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+SKILL\.md)$/i);
    if (!match) throw new Error("Use a GitHub URL pointing directly to a SKILL.md file.");
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`;
  }
  if (url.hostname !== "raw.githubusercontent.com") throw new Error("Only GitHub-hosted SKILL.md files are accepted in secure mode.");
  if (!url.pathname.toLowerCase().endsWith("/skill.md")) throw new Error("The URL must point to SKILL.md.");
  return url.toString();
}

export function parseSkill(content, source) {
  if (Buffer.byteLength(content) > MAX_SKILL_BYTES) throw new Error("Skill exceeds the 100 KB safety limit.");
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/);
  const values = {};
  for (const line of frontmatter?.[1]?.split("\n") || []) {
    const match = line.match(/^([a-zA-Z][\w-]*):\s*["']?(.+?)["']?\s*$/); if (match) values[match[1]] = match[2];
  }
  const name = values.name || content.match(/^#\s+(.+)$/m)?.[1];
  if (!name) throw new Error("SKILL.md needs a name in frontmatter or an H1 heading.");
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  return { id, name: String(name).slice(0, 100), description: String(values.description || "User-installed instruction skill.").slice(0, 240), source, content, sha256: crypto.createHash("sha256").update(content).digest("hex") };
}

export async function downloadSkill(value, fetchImpl = fetch) {
  const slug = clawHubSlug(value);
  if (slug) {
    const options = { headers: { accept: "application/json", "user-agent": "helios-skill-installer" }, redirect: "error", signal: AbortSignal.timeout(15_000) };
    const verify = await fetchImpl(`${CLAWHUB_ROOT}/api/v1/skills/${encodeURIComponent(slug)}/verify`, options);
    if (!verify.ok) throw new Error(`ClawHub verification failed: ${verify.status}.`);
    const verdict = JSON.parse(await readBounded(verify, 256_000));
    if (verdict.schema !== "clawhub.skill.verify.v1" || verdict.ok !== true || verdict.decision !== "pass" || verdict.security?.passed !== true) throw new Error(`ClawHub blocked this skill: ${verdict.reasons?.join(", ") || verdict.decision || "verification did not pass"}.`);
    const card = await fetchImpl(`${CLAWHUB_ROOT}/api/v1/skills/${encodeURIComponent(slug)}/card`, { ...options, headers: { accept: "text/markdown", "user-agent": "helios-skill-installer" } });
    if (!card.ok) throw new Error(`ClawHub skill card download failed: ${card.status}.`);
    return parseSkill(await readBounded(card, MAX_SKILL_BYTES), `clawhub:${slug}`);
  }
  const source = normalizeSkillUrl(value);
  const response = await fetchImpl(source, { headers: { "user-agent": "helios-skill-installer" }, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Skill download failed: ${response.status}.`);
  return parseSkill(await readBounded(response, MAX_SKILL_BYTES), source);
}
