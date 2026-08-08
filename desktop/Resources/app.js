const sections = [
  ["overview", "Overview", "▦"],
  ["chat", "Chat", "◫"],
  ["channels", "Channels", "⌁"],
  ["models", "Model", "◇"],
  ["skills", "Skills", "▧"],
  ["tools", "Tools", "⌘"],
  ["capabilities", "Capabilities", "✦"],
  ["activity", "Activity", "≡"],
  ["settings", "Settings", "⚙"],
];

const pending = new Map();
const main = document.querySelector("#main");
const nav = document.querySelector("#nav-items");
const palette = document.querySelector("#palette");
let snapshot = null;
let active = "overview";
let events = [];
let approval = null;
let currentSession = null;
let messages = [];
let chatBusy = false;
let chatError = "";
let seq = 0;
let sessionLoad = 0;

function call(method, params = {}) {
  const id = ++seq;
  webkit.messageHandlers.helios.postMessage({ id, method, params });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

window.__heliosReceive = (message) => {
  if (message.event) {
    events.unshift({ ...message, receivedAt: new Date() });
    events = events.slice(0, 200);
    if (message.event === "approval") {
      approval = message;
      renderApproval();
    }
    if (message.event === "bridge.error") {
      chatError = message.message || "The local bridge stopped.";
      if (!snapshot) main.innerHTML = connectionError("Unable to connect", chatError);
    }
    if (message.sessionId === currentSession && message.event === "status") {
      chatBusy = message.status !== "ready" && message.status !== "idle";
    }
    if (active === "activity" || (active === "chat" && message.sessionId === currentSession)) render();
    return;
  }
  const item = pending.get(message.id);
  if (!item) return;
  pending.delete(message.id);
  message.error ? item.reject(new Error(message.error)) : item.resolve(message.result);
};

for (const [id, label, icon] of sections) {
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.id = id;
  button.innerHTML = `<span class="nav-icon">${icon}</span><span>${label}</span>`;
  button.addEventListener("click", () => navigate(id));
  nav.appendChild(button);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function attr(value) { return esc(value); }
function count(value) { return Array.isArray(value) ? value.length : 0; }
function label(value, fallback = "NOT CONFIGURED") { return value ? esc(value) : fallback; }
function tone(enabled) { return enabled ? "online" : ""; }
function statusTag(text, kind = "") { return `<span class="tag ${kind}">${esc(text)}</span>`; }
function empty(text) { return `<div class="empty">${esc(text)}</div>`; }
function title(name, detail, actions = "") {
  return `<header class="view-header"><div><h1 class="prompt-title">${esc(name)}</h1><p class="subtitle">${esc(detail)}</p></div>${actions}</header>`;
}
function panel(name, body, action = "") {
  return `<section class="panel"><header class="panel-head"><span class="panel-title">${esc(name)}</span>${action}</header>${body}</section>`;
}
function kv(key, value) { return `<div class="kv"><span>${esc(key)}</span><span>${value}</span></div>`; }
function row(name, detail, end = "", icon = "·") {
  return `<div class="row"><div class="row-icon">${icon}</div><div class="grow"><div class="row-title">${esc(name)}</div><div class="row-detail">${esc(detail || "")}</div></div>${end}</div>`;
}
function connectionError(name, detail) {
  return `<div class="connection-card"><h1>&gt; ${esc(name)}</h1><p>${esc(detail)}</p><button id="retry" class="button primary">RETRY</button></div>`;
}
function describeEvent(event) {
  if (event.message) return event.message;
  if (event.call?.name) return event.call.name;
  if (event.status) return event.status;
  return "Helios runtime event";
}
function relativeDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "NOW";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M AGO`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}H AGO`;
  return `${Math.floor(seconds / 86400)}D AGO`;
}

function navigate(id) {
  active = id;
  closePalette();
  render();
  if (id === "chat") prepareChat();
}

function render() {
  if (!snapshot) return;
  const agent = snapshot.agent;
  document.querySelector("#health").innerHTML = `<span class="status-dot ${agent.service === "running" ? "online pulse" : "warn"}"></span><span>V${esc(agent.version)}</span>`;
  document.querySelector("#nav-host").textContent = agent.host || "LOCAL HOST";
  nav.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.id === active));

  const renderers = {
    overview: renderOverview,
    chat: renderChat,
    channels: renderChannels,
    models: renderModels,
    skills: renderSkills,
    tools: renderTools,
    capabilities: renderCapabilities,
    activity: renderActivity,
    settings: renderSettings,
  };
  renderers[active]();
}

function renderOverview() {
  const agent = snapshot.agent;
  const connected = snapshot.channels.filter((channel) => channel.connected).length;
  const recent = events.slice(0, 5);
  main.innerHTML = `<div class="view">
    <section class="hero">
      <div class="hero-content">
        <div class="eyebrow"><span class="status-dot ${agent.service === "running" ? "online pulse" : "warn"}"></span>${agent.service === "running" ? "DAEMON RUNNING" : "DAEMON STOPPED"} · ${esc(agent.host)}</div>
        <h1>AGENTS THAT RUN<br>YOUR BUSINESS.</h1>
        <p>LOCAL-FIRST BUSINESS AGENT WITH DURABLE SESSIONS, PERSISTENT MEMORY, EXPLICIT APPROVALS, CONNECTED CHANNELS, AND OPT-IN COMPUTER CONTROL.</p>
        <div class="hero-actions"><button id="open-chat" class="button primary">◫ CHAT WITH HELIOS</button><button id="refresh" class="button">↻ REFRESH STATUS</button></div>
      </div>
    </section>
    <section class="metrics">
      <div class="metric"><span class="metric-label">SESSIONS</span><strong>${count(snapshot.sessions)}</strong></div>
      <div class="metric"><span class="metric-label">CONNECTED CHANNELS</span><strong>${connected}</strong></div>
      <div class="metric"><span class="metric-label">INSTALLED SKILLS</span><strong>${count(snapshot.skills)}</strong></div>
      <div class="metric"><span class="metric-label">AGENT STATUS</span><strong class="${agent.service === "running" ? "online-text" : ""}">${agent.service === "running" ? "LIVE" : "OFF"}</strong></div>
    </section>
    <section class="columns">
      ${panel("Runtime", `<div class="panel-body">${kv("model", label(agent.model))}${kv("provider", label(agent.provider))}${kv("memory", label(agent.memory))}${kv("autonomy", statusTag(agent.autonomy, agent.autonomy === "autonomous" ? "warn" : ""))}${kv("workspace", label(agent.workspace))}</div>`)}
      ${panel("Recent sessions", snapshot.sessions.length ? snapshot.sessions.slice(0, 6).map((session) => row(session.title || "Helios session", relativeDate(session.updated_at || session.updatedAt || session.createdAt), "", "◫")).join("") : empty("No sessions yet. Start a chat to create one."), statusTag(`${count(snapshot.sessions)} TOTAL`))}
    </section>
    <section class="columns equal">
      ${panel("Scheduled jobs", snapshot.jobs.length ? snapshot.jobs.slice(0, 6).map((job) => row(job.name || "Scheduled job", job.expression || job.schedule || "Configured", statusTag(job.enabled === false ? "OFF" : "ACTIVE", job.enabled === false ? "" : "online"), "◷")).join("") : empty("No cron jobs configured."))}
      ${panel("Live activity", recent.length ? recent.map((event) => row(event.event, describeEvent(event), "", "›")).join("") : empty("Activity appears here while Helios works."), statusTag(`${events.length} EVENTS`))}
    </section>
  </div>`;
  document.querySelector("#open-chat").onclick = () => navigate("chat");
  document.querySelector("#refresh").onclick = reload;
}

async function prepareChat() {
  if (!currentSession) currentSession = snapshot.sessions[0]?.id || crypto.randomUUID();
  await loadSession(currentSession);
}

async function loadSession(id) {
  const load = ++sessionLoad;
  currentSession = id;
  messages = [];
  chatError = "";
  renderChat();
  try {
    const result = await call("session.messages", { sessionId: id });
    if (load !== sessionLoad) return;
    messages = Array.isArray(result) ? result : [];
  } catch (error) {
    if (load !== sessionLoad) return;
    chatError = error.message;
  }
  renderChat();
}

function renderMessage(message) {
  if (message.role === "tool") return `<div class="tool-event">TOOL · ${esc(message.name || message.toolName || "RESULT")}<br>${esc(String(message.content || "").slice(0, 500))}</div>`;
  const role = message.role === "user" ? "user" : "assistant";
  const error = message.error ? " error" : "";
  const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "");
  return `<div class="message ${role}${error}"><div class="avatar">${role === "user" ? "YOU" : "H"}</div><div class="bubble">${esc(content)}</div></div>`;
}

function renderChat() {
  const agent = snapshot.agent;
  const relevantEvents = events.filter((event) => event.sessionId === currentSession && (event.event === "tool.start" || event.event === "tool.end")).slice(0, 4).reverse();
  const sessionOptions = snapshot.sessions.map((session) => `<option value="${attr(session.id)}" ${session.id === currentSession ? "selected" : ""}>${esc(session.title || session.id.slice(0, 8))}</option>`).join("");
  const suggestions = [
    "Summarize what you remember about my business",
    "Review today’s activity and flag anything important",
    "What can you help me automate right now?",
    "Check your current setup and report any problems",
  ];
  const timeline = messages.map(renderMessage).join("") + relevantEvents.map((event) => `<div class="tool-event">${event.event === "tool.start" ? "RUNNING" : "FINISHED"} · ${esc(event.call?.name || "TOOL")}</div>`).join("");
  const emptyState = `<div class="empty-chat"><div class="mark"></div><div><h2>&gt; TALK TO HELIOS</h2><p>MESSAGES ROUTE TO THE REAL LOCAL AGENT CORE WITH YOUR ACTIVE MODEL, MEMORY, TOOLS, AND APPROVAL SETTINGS.</p></div><div class="suggestions">${suggestions.map((suggestion) => `<button class="suggestion" data-prompt="${attr(suggestion)}">${esc(suggestion)}</button>`).join("")}</div></div>`;

  main.innerHTML = `<div class="view chat-view"><div class="chat-shell">
    <header class="view-header chat-header">
      <div><h1 class="prompt-title">CHAT</h1><p class="subtitle">DIRECT SESSION WITH THE AGENT CORE</p></div>
      <div class="chat-controls">
        ${snapshot.sessions.length ? `<div class="select-wrap">◫ <select id="session-select" aria-label="Chat session">${sessionOptions}</select></div>` : ""}
        <div class="select-wrap">◇ <span>${label(agent.model)}</span></div>
        <button id="new-session" class="button">＋ NEW</button>
      </div>
    </header>
    <section class="chat-panel">
      <div class="chat-status"><span><i class="status-dot ${agent.service === "running" ? "online pulse" : "warn"}"></i>HELIOS CORE · ${esc(agent.autonomy)}</span><span>${chatBusy ? "WORKING…" : "READY"}</span></div>
      <div id="messages" class="messages">${timeline || emptyState}${chatBusy ? `<div class="message assistant"><div class="avatar">H</div><div class="bubble"><span class="thinking"><i></i>THINKING</span></div></div>` : ""}</div>
      ${chatError ? `<div class="chat-error">⚠ ${esc(chatError)}</div>` : ""}
      <div class="composer"><div class="input-wrap"><span>&gt;</span><input id="prompt" autocomplete="off" placeholder="Message Helios…" ${chatBusy ? "disabled" : ""}></div><button id="send" class="button primary" ${chatBusy ? "disabled" : ""}>↑ SEND</button></div>
    </section>
    <div class="chat-foot"><span class="tag">ENTER</span> SEND · RUNS LOCALLY ON ${esc(agent.host.split(" · ")[0])}</div>
  </div></div>`;

  const list = document.querySelector("#messages");
  list.scrollTop = list.scrollHeight;
  document.querySelector("#new-session").onclick = () => {
    currentSession = crypto.randomUUID();
    messages = [];
    chatError = "";
    renderChat();
    document.querySelector("#prompt").focus();
  };
  const selector = document.querySelector("#session-select");
  if (selector) selector.onchange = () => loadSession(selector.value);
  document.querySelectorAll(".suggestion").forEach((button) => button.onclick = () => sendMessage(button.dataset.prompt));
  document.querySelector("#send").onclick = () => sendMessage();
  document.querySelector("#prompt").onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  };
}

async function sendMessage(prefilled) {
  if (chatBusy) return;
  const input = document.querySelector("#prompt");
  const text = String(prefilled ?? input?.value ?? "").trim();
  if (!text) return;
  messages.push({ role: "user", content: text });
  chatBusy = true;
  chatError = "";
  renderChat();
  try {
    const answer = await call("chat.send", { sessionId: currentSession, text });
    messages.push({ role: "assistant", content: answer });
    await reload(false);
  } catch (error) {
    chatError = error.message;
    messages.push({ role: "assistant", content: `Error: ${error.message}`, error: true });
  } finally {
    chatBusy = false;
    renderChat();
    document.querySelector("#prompt")?.focus();
  }
}

function renderChannels() {
  main.innerHTML = `<div class="view">${title("Channels", "TERMINAL AND CONNECTED CHANNELS SHARE THE SAME LOCAL AGENT CORE")}${panel("Connected surfaces", snapshot.channels.map((channel) => row(channel.name, `${channel.allowedSenders.length} ALLOWED SENDER${channel.allowedSenders.length === 1 ? "" : "S"}`, statusTag(channel.connected ? "LIVE" : "OFF", tone(channel.connected)), channel.id === "telegram" ? "➤" : channel.id === "discord" ? "◉" : "#")).join(""))}</div>`;
}

function renderModels() {
  const agent = snapshot.agent;
  main.innerHTML = `<div class="view">${title("Model", "THE DESKTOP USES THE PROVIDER CONFIGURED BY HELIOS")}${panel("Available providers", snapshot.providers.map((provider) => row(provider.label, provider.active ? agent.model : provider.defaultModel, provider.active ? statusTag("ACTIVE", "online") : statusTag("AVAILABLE"), "◇")).join(""))}</div>`;
}

function renderSkills() {
  main.innerHTML = `<div class="view">${title("Skills", "INSTALLED INSTRUCTION-ONLY SKILLS")}${panel("Installed", snapshot.skills.length ? snapshot.skills.map((skill) => row(skill.name, skill.source || "LOCAL", `<button class="button danger remove-skill" data-id="${attr(skill.id)}">REMOVE</button>`, "▧")).join("") : empty("No skills installed."), statusTag(`${count(snapshot.skills)} TOTAL`))}</div>`;
  document.querySelectorAll(".remove-skill").forEach((button) => button.onclick = async () => {
    if (!confirm("Remove this skill from Helios?")) return;
    await call("skill.remove", { id: button.dataset.id });
    await reload();
  });
}

function renderTools() {
  main.innerHTML = `<div class="view">${title("Tools", "MANAGE LOCAL TOOLS AND AGENT RUNTIME CAPABILITIES")}${panel("Tool access", snapshot.tools.map((tool) => row(tool.name, tool.description, `<button class="toggle ${tool.enabled ? "on" : ""}" data-id="${attr(tool.id)}" aria-label="Toggle ${attr(tool.name)}"></button>`, "⌘")).join(""))}</div>`;
  document.querySelectorAll(".toggle").forEach((button) => button.onclick = async () => {
    const tool = snapshot.tools.find((item) => item.id === button.dataset.id);
    snapshot = await call("config.set", { key: `${tool.id}.enabled`, value: !tool.enabled });
    render();
  });
}

function renderCapabilities() {
  main.innerHTML = `<div class="view">${title("Capabilities", "APPROVED REUSABLE PLAYBOOKS LEARNED BY HELIOS")}${panel("Learned capabilities", snapshot.capabilities.length ? snapshot.capabilities.map((capability) => row(capability.name, capability.trigger || "LEARNED LOCALLY", `<span class="tag">REV ${esc(capability.revision)} · ${esc(capability.uses || 0)} USES</span><button class="button danger forget" data-id="${attr(capability.id)}">FORGET</button>`, "✦")).join("") : empty("No capabilities learned yet."), statusTag(`${count(snapshot.capabilities)} TOTAL`))}</div>`;
  document.querySelectorAll(".forget").forEach((button) => button.onclick = async () => {
    if (!confirm("Permanently forget this learned capability?")) return;
    await call("capability.remove", { id: button.dataset.id });
    await reload();
  });
}

function renderActivity() {
  main.innerHTML = `<div class="view">${title("Activity", "LIVE EVENTS FROM THIS DESKTOP SESSION", `<button id="clear-events" class="button">CLEAR</button>`)}${panel("Event stream", events.length ? events.map((event) => row(event.event, describeEvent(event), statusTag(relativeDate(event.receivedAt)), "›")).join("") : empty("No live activity yet."), statusTag(`${events.length} EVENTS`))}</div>`;
  document.querySelector("#clear-events").onclick = () => { events = []; render(); };
}

function renderSettings() {
  const agent = snapshot.agent;
  main.innerHTML = `<div class="view">${title("Settings", "LOCAL CONFIGURATION AND INSTALL STATUS")}
    <section class="columns equal">
      ${panel("Agent", `<div class="panel-body">${kv("version", esc(agent.version))}${kv("service", statusTag(agent.service, agent.service === "running" ? "online" : "warn"))}${kv("provider", label(agent.provider))}${kv("model", label(agent.model))}${kv("host", label(agent.host))}</div>`)}
      ${panel("Storage", `<div class="panel-body">${kv("workspace", label(agent.workspace))}${kv("memory", label(agent.memory))}${kv("distribution", "OPTIONAL MACOS APP")}</div>`)}
    </section>
    <section class="columns equal">
      ${panel("Autonomy", row(agent.autonomy, "HIGH-RISK ACTIONS STILL REQUIRE EXPLICIT APPROVAL.", `<button id="autonomy" class="toggle ${agent.autonomy === "autonomous" ? "on" : ""}"></button>`, "⚙"))}
      ${panel("Privacy", row("Private local bridge", "NO LISTENING PORT. CREDENTIALS NEVER ENTER THE WEB VIEW.", statusTag("LOCAL", "online"), "⌂"))}
    </section>
  </div>`;
  document.querySelector("#autonomy").onclick = async () => {
    snapshot = await call("config.set", { key: "autonomy.mode", value: agent.autonomy === "guarded" ? "autonomous" : "guarded" });
    render();
  };
}

function renderApproval() {
  const box = document.querySelector("#approval");
  const action = approval.action || {};
  box.classList.remove("hidden");
  box.innerHTML = `<section class="dialog"><header class="panel-head"><span class="panel-title">APPROVAL REQUIRED</span>${statusTag("LOCAL REVIEW", "warn")}</header><div class="dialog-content"><h2>&gt; ${esc(action.title || "HELIOS REQUESTS PERMISSION")}</h2><p>${esc(action.detail || "Review this action before Helios continues.")}</p></div><footer class="dialog-actions"><button id="deny" class="button danger">DENY</button><button id="approve" class="button primary">APPROVE ONCE</button></footer></section>`;
  const decide = async (approved) => {
    await call("approval.respond", { approvalId: approval.approvalId, approved });
    approval = null;
    box.classList.add("hidden");
  };
  document.querySelector("#deny").onclick = () => decide(false);
  document.querySelector("#approve").onclick = () => decide(true);
}

function openPalette() {
  palette.classList.remove("hidden");
  palette.innerHTML = `<section class="palette"><div class="palette-search"><span>⌕</span><input id="palette-query" placeholder="Jump to section…"><span class="tag">ESC</span></div><div id="palette-results" class="palette-results"></div></section>`;
  const query = document.querySelector("#palette-query");
  const results = document.querySelector("#palette-results");
  const update = () => {
    const value = query.value.trim().toLowerCase();
    const matches = sections.filter(([id, name]) => !value || id.includes(value) || name.toLowerCase().includes(value));
    results.innerHTML = matches.map(([id, name, icon], index) => `<button class="palette-result ${index === 0 ? "selected" : ""}" data-id="${id}"><span class="nav-icon">${icon}</span>${name}</button>`).join("") || empty("No matching section.");
    results.querySelectorAll("button").forEach((button) => button.onclick = () => navigate(button.dataset.id));
  };
  query.oninput = update;
  query.onkeydown = (event) => {
    const items = [...results.querySelectorAll("button")];
    const selected = Math.max(0, items.findIndex((item) => item.classList.contains("selected")));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[selected]?.classList.remove("selected");
      const next = event.key === "ArrowDown" ? Math.min(selected + 1, items.length - 1) : Math.max(selected - 1, 0);
      items[next]?.classList.add("selected");
    } else if (event.key === "Enter") items[selected]?.click();
  };
  palette.onclick = (event) => { if (event.target === palette) closePalette(); };
  update();
  query.focus();
}
function closePalette() { palette.classList.add("hidden"); }

document.querySelector("#palette-button").onclick = openPalette;
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); palette.classList.contains("hidden") ? openPalette() : closePalette(); }
  if (event.key === "Escape") closePalette();
});

async function reload(shouldRender = true) {
  snapshot = await call("snapshot");
  if (shouldRender) render();
}

reload().catch((error) => {
  main.innerHTML = connectionError("Unable to connect", error.message);
  document.querySelector("#retry")?.addEventListener("click", () => reload());
});
