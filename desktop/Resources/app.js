const sections = [
  ["overview", "Overview", "▦"],
  ["chat", "Chat", "◫"],
  ["channels", "Channels", "⌁"],
  ["models", "Model", "◇"],
  ["skills", "Skills", "▧"],
  ["tools", "Tools", "⌘"],
  ["capabilities", "Capabilities", "✦"],
  ["cron", "Cron Jobs", "◷"],
  ["subagents", "Subagents", "⌘"],
  ["activity", "Activity", "≡"],
  ["settings", "Settings", "⚙"],
];

const pending = new Map();
const main = document.querySelector("#main");
const nav = document.querySelector("#nav-items");
const navSettings = document.querySelector("#nav-settings");
const palette = document.querySelector("#palette");
let snapshot = null;
let active = "overview";
let events = [];
let approval = null;
let currentSession = null;
let messages = [];
let chatBusy = false;
let chatError = "";
let streamingText = "";
let seq = 0;
let sessionLoad = 0;

function call(method, params = {}) {
  const id = ++seq;
  webkit.messageHandlers.helios.postMessage({ id, method, params });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Helios took too long to respond. Please retry.")); }, 120_000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
  });
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
      chatBusy = false; streamingText = "";
      for (const item of pending.values()) item.reject(new Error(chatError));
      pending.clear();
      if (!snapshot) main.innerHTML = connectionError("Unable to connect", chatError);
    }
    if (message.event === "bridge.reconnecting") showToast("Helios disconnected. Reconnecting…", "warn");
    if (message.event === "bridge.ready") { showToast("Helios connected", "online"); if (snapshot) reload(); }
    if (message.event === "chat.delta" && message.sessionId === currentSession) { streamingText += message.delta || ""; if (active === "chat") renderChat(); }
    if (message.event === "cron.finished") { showToast(message.status === "done" ? "Scheduled job finished" : message.message || "Scheduled job failed", message.status === "done" ? "online" : "danger"); if (active === "cron") reload(); }
    if (message.event === "oauth.opening") showToast("Opening secure ChatGPT sign-in…");
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
  (id === "settings" ? navSettings : nav).appendChild(button);
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
function showToast(message, kind = "") {
  let tray = document.querySelector("#toasts");
  if (!tray) { tray = document.createElement("div"); tray.id = "toasts"; document.body.appendChild(tray); }
  const toast = document.createElement("div"); toast.className = `toast ${kind}`; toast.textContent = message; tray.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}
function markdown(value) {
  const blocks = [];
  let text = esc(value).replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, language, code) => {
    const index = blocks.push(`<pre><span>${language || "CODE"}</span><code>${code}</code></pre>`) - 1;
    return `@@BLOCK${index}@@`;
  });
  text = text.replace(/^### (.+)$/gm, "<h4>$1</h4>").replace(/^## (.+)$/gm, "<h3>$1</h3>").replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^(?:- |\* )(.+)$/gm, "<div class=\"md-list\">• $1</div>").replace(/\n/g, "<br>");
  return text.replace(/@@BLOCK(\d+)@@/g, (_, index) => blocks[Number(index)]);
}
async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const area = document.createElement("textarea"); area.value = value; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select();
  document.execCommand("copy"); area.remove();
}
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
  applyPreferences();
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
    cron: renderCron,
    subagents: renderSubagents,
    activity: renderActivity,
    settings: renderSettings,
  };
  renderers[active]();
}

function applyPreferences() {
  const preferences = snapshot?.preferences || {};
  document.documentElement.dataset.theme = preferences.theme || "system";
  document.documentElement.classList.toggle("reduced-motion", Boolean(preferences.reducedMotion));
  document.documentElement.classList.toggle("compact", Boolean(preferences.compact));
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
  return `<div class="message ${role}${error}"><div class="avatar">${role === "user" ? "YOU" : "H"}</div><div class="bubble"><div class="message-content">${role === "assistant" ? markdown(content) : esc(content)}</div>${role === "assistant" ? `<button class="copy-message" aria-label="Copy response">COPY</button>` : ""}</div></div>`;
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
  const timeline = messages.map(renderMessage).join("") + (streamingText ? renderMessage({ role: "assistant", content: streamingText }) : "") + relevantEvents.map((event) => `<div class="tool-event">${event.event === "tool.start" ? "RUNNING" : "FINISHED"} · ${esc(event.call?.name || "TOOL")}</div>`).join("");
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
      <div id="messages" class="messages">${timeline || emptyState}${chatBusy && !streamingText ? `<div class="message assistant"><div class="avatar">H</div><div class="bubble"><span class="thinking"><i></i>THINKING</span></div></div>` : ""}</div>
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
  document.querySelectorAll(".copy-message").forEach((button) => button.onclick = async () => {
    await copyText(button.parentElement.querySelector(".message-content").innerText);
    button.textContent = "COPIED"; setTimeout(() => { button.textContent = "COPY"; }, 1200);
  });
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
  streamingText = "";
  chatBusy = true;
  chatError = "";
  renderChat();
  try {
    const answer = await call("chat.send", { sessionId: currentSession, text });
    streamingText = ""; messages.push({ role: "assistant", content: answer });
    await reload(false);
  } catch (error) {
    streamingText = "";
    chatError = error.message;
    messages.push({ role: "assistant", content: `Error: ${error.message}`, error: true });
  } finally {
    chatBusy = false;
    renderChat();
    document.querySelector("#prompt")?.focus();
  }
}

function renderChannels() {
  main.innerHTML = `<div class="view">${title("Channels", "CONNECT MESSAGING APPS TO THE SAME GUARDED LOCAL AGENT CORE")}${panel("Messaging channels", snapshot.channels.map((channel) => row(channel.name, channel.connected ? `${channel.allowedSenders.length} ALLOWED SENDER${channel.allowedSenders.length === 1 ? "" : "S"}` : "NOT CONNECTED", `<button class="button manage-channel" data-id="${attr(channel.id)}">${channel.connected ? "MANAGE" : "CONNECT"}</button>${statusTag(channel.connected ? "LIVE" : "OFF", tone(channel.connected))}`, channel.id === "telegram" ? "➤" : channel.id === "discord" ? "◉" : "#")).join(""))}</div>`;
  document.querySelectorAll(".manage-channel").forEach((button) => button.onclick = () => openChannelDialog(button.dataset.id));
}

function renderModels() {
  const agent = snapshot.agent;
  main.innerHTML = `<div class="view">${title("Model", "CHOOSE AND VERIFY THE MODEL HELIOS USES", `<button id="change-model" class="button primary">◇ CHANGE MODEL</button>`)}${panel("Available providers", snapshot.providers.map((provider) => row(provider.label, provider.active ? agent.model : provider.defaultModel, provider.active ? statusTag("ACTIVE", "online") : `<button class="button select-provider" data-id="${attr(provider.id)}">SELECT</button>`, "◇")).join(""))}</div>`;
  document.querySelector("#change-model").onclick = () => openModelDialog(agent.provider);
  document.querySelectorAll(".select-provider").forEach((button) => button.onclick = () => openModelDialog(button.dataset.id));
}

function openChannelDialog(id) {
  const channel = snapshot.channels.find((item) => item.id === id); const box = document.querySelector("#dialog");
  box.classList.remove("hidden");
  box.innerHTML = `<section class="dialog"><header class="panel-head"><span class="panel-title">${channel.connected ? "MANAGE" : "CONNECT"} ${esc(channel.name).toUpperCase()}</span><button id="close-dialog" class="icon-button">×</button></header><div class="dialog-content form-stack">${channel.fields.map((field) => `<label>${esc(field.label).toUpperCase()}<input class="channel-secret" data-key="${attr(field.key)}" type="password" placeholder="${channel.connected ? "Leave blank to keep current value" : field.label}" autocomplete="off"></label>`).join("")}<label>ALLOWED SENDER IDS<input id="channel-senders" value="${attr(channel.allowedSenders.join(", "))}" placeholder="123456, 987654"><small>Only these account IDs can message Helios. Separate multiple IDs with commas.</small></label><div id="channel-error" class="form-error hidden"></div></div><footer class="dialog-actions">${channel.connected ? `<button id="disconnect-channel" class="button danger">DISCONNECT</button>` : ""}<button id="cancel-channel" class="button">CANCEL</button><button id="save-channel" class="button primary">${channel.connected ? "SAVE" : "CONNECT"}</button></footer></section>`;
  const close = () => box.classList.add("hidden"); document.querySelector("#close-dialog").onclick = close; document.querySelector("#cancel-channel").onclick = close;
  box.onclick = (event) => { if (event.target === box) close(); };
  document.querySelector("#save-channel").onclick = async () => {
    const secrets = Object.fromEntries([...document.querySelectorAll(".channel-secret")].map((input) => [input.dataset.key, input.value]));
    try { snapshot = await call("channel.connect", { channel: id, secrets, allowedSenders: document.querySelector("#channel-senders").value }); close(); render(); showRestartNotice("Channel saved"); }
    catch (error) { const target = document.querySelector("#channel-error"); target.textContent = error.message; target.classList.remove("hidden"); }
  };
  if (channel.connected) document.querySelector("#disconnect-channel").onclick = async () => {
    if (!confirm(`Disconnect ${channel.name}?`)) return;
    snapshot = await call("channel.disconnect", { channel: id }); close(); render(); showRestartNotice("Channel disconnected");
  };
}

function openModelDialog(selectedId) {
  const box = document.querySelector("#dialog"); const initial = snapshot.providers.find((item) => item.id === selectedId) || snapshot.providers[0];
  box.classList.remove("hidden");
  box.innerHTML = `<section class="dialog"><header class="panel-head"><span class="panel-title">CHANGE MODEL</span><button id="close-dialog" class="icon-button">×</button></header><div class="dialog-content form-stack"><label>PROVIDER<select id="model-provider">${snapshot.providers.map((provider) => `<option value="${attr(provider.id)}" ${provider.id === initial.id ? "selected" : ""}>${esc(provider.label)}</option>`).join("")}</select></label><label>MODEL<input id="model-name" value="${attr(initial.active ? snapshot.agent.model : initial.defaultModel)}" autocomplete="off"></label><label id="api-key-wrap">API KEY<input id="model-key" type="password" placeholder="Leave blank to use the saved key" autocomplete="off"></label><div id="oauth-note" class="notice hidden">YOUR BROWSER WILL OPEN FOR SECURE CHATGPT SIGN-IN.</div><div id="model-error" class="form-error hidden"></div></div><footer class="dialog-actions"><button id="cancel-model" class="button">CANCEL</button><button id="save-model" class="button primary">VERIFY & USE</button></footer></section>`;
  const close = () => box.classList.add("hidden"); document.querySelector("#close-dialog").onclick = close; document.querySelector("#cancel-model").onclick = close;
  box.onclick = (event) => { if (event.target === box) close(); };
  const providerSelect = document.querySelector("#model-provider");
  const sync = () => { const provider = snapshot.providers.find((item) => item.id === providerSelect.value); document.querySelector("#model-name").value = provider.active ? snapshot.agent.model : provider.defaultModel; document.querySelector("#api-key-wrap").classList.toggle("hidden", !provider.credential); document.querySelector("#oauth-note").classList.toggle("hidden", provider.id !== "openai-codex"); };
  providerSelect.onchange = sync; sync();
  document.querySelector("#save-model").onclick = async () => {
    const button = document.querySelector("#save-model"); button.disabled = true; button.textContent = "VERIFYING…";
    try { snapshot = await call("provider.set", { provider: providerSelect.value, model: document.querySelector("#model-name").value, apiKey: document.querySelector("#model-key").value }); close(); render(); showRestartNotice("Model verified and saved"); }
    catch (error) { const target = document.querySelector("#model-error"); target.textContent = error.message; target.classList.remove("hidden"); button.disabled = false; button.textContent = "VERIFY & USE"; }
  };
}

function showRestartNotice(message) {
  showToast(`${message}. Restart Helios to apply it everywhere.`, "online");
  const tray = document.querySelector("#toasts"); const toast = tray?.lastElementChild;
  if (toast) { const button = document.createElement("button"); button.textContent = "RESTART"; button.onclick = async () => { button.disabled = true; await call("service.restart"); showToast("Helios restarted", "online"); }; toast.appendChild(button); }
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

function renderCron() {
  const jobs = snapshot.jobs || [];
  const workers = snapshot.workers || [];
  const runs = snapshot.cronRuns || [];
  const jobRows = jobs.map((job) => {
    const worker = workers.find((item) => item.id === job.worker_id);
    const lastRun = job.last_slot ? `LAST RUN ${relativeDate(`${job.last_slot}:00Z`)}` : "NOT RUN YET";
    return `<article class="cron-card"><div class="cron-time"><b>${esc(job.expression)}</b><span>LOCAL TIME</span></div><div class="grow"><div class="row-title">${esc(job.name)}</div><div class="row-detail">${esc(job.prompt)}</div><div class="cron-meta">${esc(worker ? `SUBAGENT · ${worker.name}` : "HELIOS")} · ${esc(lastRun)}</div></div><button class="button run-cron" data-id="${attr(job.id)}" ${job.enabled ? "" : "disabled"}>▶ RUN NOW</button><button class="toggle ${job.enabled ? "on" : ""}" data-cron-toggle="${attr(job.id)}" aria-label="Toggle ${attr(job.name)}"></button><button class="icon-button remove-cron" data-id="${attr(job.id)}" aria-label="Remove ${attr(job.name)}">×</button></article>`;
  }).join("");
  main.innerHTML = `<div class="view cron-view">
    ${title("Cron Jobs", "SCHEDULE RECURRING WORK THROUGH THE LOCAL HELIOS SERVICE", `<button id="new-cron" class="button primary">＋ NEW JOB</button>`)}
    ${!snapshot.settings?.scheduler ? `<div class="notice">SCHEDULED JOBS ARE OFF. ENABLE THEM IN SETTINGS TO RUN ACTIVE JOBS.</div>` : ""}
    ${panel("Schedule", jobRows || empty("No cron jobs yet. Create one to give Helios recurring work."), statusTag(`${jobs.filter((job) => job.enabled).length} ACTIVE`))}
    ${panel("Run history", runs.length ? runs.slice(0, 20).map((run) => { const job = jobs.find((item) => item.id === run.job_id); const detail = run.error || run.result || "Running…"; return `<details class="history-row"><summary><span class="status-dot ${run.status === "done" ? "online" : run.status === "failed" ? "danger" : "warn"}"></span><b>${esc(job?.name || run.job_id)}</b><span>${esc(run.status.toUpperCase())}</span><time>${esc(relativeDate(run.finished_at || run.started_at))}</time></summary><div>${markdown(detail)}</div></details>`; }).join("") : empty("Run results and failures will appear here."), statusTag(`${runs.length} RUNS`))}
    ${panel("How schedules work", `<div class="panel-body">${kv("Every weekday at 9 AM", "0 9 * * 1-5")}${kv("Every day at 6 PM", "0 18 * * *")}${kv("Every hour", "0 * * * *")}<p class="helper-copy">Jobs use your Mac’s local time. After sleep or downtime, Helios recovers the most recent missed run from the last 24 hours. Scheduled actions stay in guarded mode.</p></div>`)}
  </div>`;
  document.querySelector("#new-cron").onclick = openCronDialog;
  document.querySelectorAll("[data-cron-toggle]").forEach((button) => button.onclick = async () => {
    const job = jobs.find((item) => item.id === button.dataset.cronToggle);
    await call("cron.setEnabled", { id: job.id, enabled: !job.enabled }); await reload();
  });
  document.querySelectorAll(".run-cron").forEach((button) => button.onclick = async () => {
    button.disabled = true; button.textContent = "RUNNING…";
    try { await call("cron.run", { id: button.dataset.id }); await reload(); }
    catch (error) { showToast(error.message, "danger"); button.disabled = false; button.textContent = "▶ RUN NOW"; }
  });
  document.querySelectorAll(".remove-cron").forEach((button) => button.onclick = async () => {
    if (!confirm("Remove this scheduled job?")) return;
    await call("cron.remove", { id: button.dataset.id }); await reload();
  });
}

function openCronDialog() {
  const box = document.querySelector("#dialog");
  const workers = snapshot.workers || [];
  box.classList.remove("hidden");
  box.innerHTML = `<section class="dialog"><header class="panel-head"><span class="panel-title">NEW CRON JOB</span><button id="close-dialog" class="icon-button" aria-label="Close">×</button></header><div class="dialog-content form-stack"><label>NAME<input id="cron-name" placeholder="Morning briefing" maxlength="80"></label><label>SCHEDULE<select id="cron-preset"><option value="0 9 * * 1-5">Weekdays at 9:00 AM</option><option value="0 9 * * *">Every day at 9:00 AM</option><option value="0 18 * * *">Every day at 6:00 PM</option><option value="0 * * * *">Every hour</option><option value="custom">Custom cron expression</option></select></label><label id="cron-custom-wrap" class="hidden">CRON EXPRESSION<input id="cron-expression" value="0 9 * * 1-5" spellcheck="false"><small>Minute · hour · day · month · weekday. Uses local time.</small></label><label>WHAT SHOULD HELIOS DO?<textarea id="cron-prompt" placeholder="Review today’s calendar and send me a concise morning briefing…" maxlength="4000"></textarea></label><label>RUN AS<select id="cron-worker"><option value="">Helios</option>${workers.map((worker) => `<option value="${attr(worker.id)}">${esc(worker.name)}</option>`).join("")}</select></label><div id="cron-error" class="form-error hidden"></div></div><footer class="dialog-actions"><button id="cancel-cron" class="button">CANCEL</button><button id="save-cron" class="button primary">CREATE JOB</button></footer></section>`;
  const close = () => box.classList.add("hidden");
  document.querySelector("#close-dialog").onclick = close; document.querySelector("#cancel-cron").onclick = close;
  box.onclick = (event) => { if (event.target === box) close(); };
  const preset = document.querySelector("#cron-preset");
  preset.onchange = () => {
    const custom = preset.value === "custom";
    document.querySelector("#cron-custom-wrap").classList.toggle("hidden", !custom);
    if (!custom) document.querySelector("#cron-expression").value = preset.value;
  };
  document.querySelector("#save-cron").onclick = async () => {
    const errorBox = document.querySelector("#cron-error");
    try {
      await call("cron.create", { name: document.querySelector("#cron-name").value, expression: document.querySelector("#cron-expression").value, prompt: document.querySelector("#cron-prompt").value, workerId: document.querySelector("#cron-worker").value });
      close(); await reload();
    } catch (error) { errorBox.textContent = error.message; errorBox.classList.remove("hidden"); }
  };
  document.querySelector("#cron-name").focus();
}

function renderSubagents() {
  const workers = snapshot.workers || [];
  const tasks = snapshot.subagentTasks || [];
  const columns = [
    ["queued", "Queued"], ["running", "In progress"], ["done", "Done"], ["failed", "Needs attention"],
  ];
  const cards = (status) => tasks.filter((task) => task.status === status).map((task) => {
    const worker = workers.find((item) => item.id === task.worker_id);
    return `<article class="task-card ${status}"><div class="task-card-top"><span>${esc(worker?.name || "General subagent")}</span>${statusTag(status, status === "running" ? "warn" : status === "done" ? "online" : status === "failed" ? "danger" : "")}</div><p>${esc(task.title)}</p><time>${esc(relativeDate(task.updated_at))}</time></article>`;
  }).join("") || `<div class="board-empty">NO TASKS</div>`;
  main.innerHTML = `<div class="view subagent-view">
    ${title("Subagents", "PERSISTENT SPECIALISTS HELIOS CAN DELEGATE MATCHING WORK TO", `<button id="new-subagent" class="button primary">＋ NEW SUBAGENT</button>`)}
    <section class="agent-strip">${workers.length ? workers.map((worker) => `<article class="agent-profile"><div class="agent-avatar">${esc(worker.name.slice(0, 2).toUpperCase())}</div><div class="grow"><strong>${esc(worker.name)}</strong><p>${esc(worker.instructions)}</p><span>${esc(worker.provider || snapshot.agent.provider)}/${esc(worker.model || snapshot.agent.model)}</span></div><button class="icon-button remove-subagent" data-id="${attr(worker.id)}" aria-label="Remove ${attr(worker.name)}">×</button></article>`).join("") : `<div class="empty-agent"><b>NO SUBAGENTS YET</b><span>Create a specialist here or run <code>helios subagent</code>.</span></div>`}</section>
    <section class="kanban">${columns.map(([status, name]) => `<div class="board-column"><header><span>${name}</span><b>${tasks.filter((task) => task.status === status).length}</b></header><div class="board-cards">${cards(status)}</div></div>`).join("")}</section>
  </div>`;
  document.querySelector("#new-subagent").onclick = openSubagentDialog;
  document.querySelectorAll(".remove-subagent").forEach((button) => button.onclick = async () => {
    if (!confirm("Remove this subagent profile? Existing task history will remain.")) return;
    await call("subagent.remove", { id: button.dataset.id }); await reload();
  });
}

function openSubagentDialog() {
  const box = document.querySelector("#dialog");
  box.classList.remove("hidden");
  box.innerHTML = `<section class="dialog"><header class="panel-head"><span class="panel-title">NEW SUBAGENT</span><button id="close-dialog" class="icon-button" aria-label="Close">×</button></header><div class="dialog-content form-stack"><label>NAME<input id="subagent-name" placeholder="Research analyst" maxlength="80"></label><label>WHAT WILL THEY BE USED FOR?<textarea id="subagent-purpose" placeholder="Research competitors, verify sources, and return concise evidence…" maxlength="2000"></textarea></label><label>MODEL<div class="select-wrap">◇ <span>${label(snapshot.agent.provider)}/${label(snapshot.agent.model)}</span></div><small>Uses the active provider. Run <code>helios subagent</code> in Terminal to connect a different provider.</small></label></div><footer class="dialog-actions"><button id="cancel-subagent" class="button">CANCEL</button><button id="save-subagent" class="button primary">CREATE SUBAGENT</button></footer></section>`;
  const close = () => box.classList.add("hidden");
  document.querySelector("#close-dialog").onclick = close; document.querySelector("#cancel-subagent").onclick = close;
  box.onclick = (event) => { if (event.target === box) close(); };
  document.querySelector("#save-subagent").onclick = async () => {
    const name = document.querySelector("#subagent-name").value.trim(); const instructions = document.querySelector("#subagent-purpose").value.trim();
    if (!name || !instructions) return;
    await call("subagent.create", { name, instructions }); close(); await reload();
  };
  document.querySelector("#subagent-name").focus();
}

function renderActivity() {
  main.innerHTML = `<div class="view">${title("Activity", "LIVE EVENTS FROM THIS DESKTOP SESSION", `<button id="clear-events" class="button">CLEAR</button>`)}${panel("Event stream", events.length ? events.map((event) => row(event.event, describeEvent(event), statusTag(relativeDate(event.receivedAt)), "›")).join("") : empty("No live activity yet."), statusTag(`${events.length} EVENTS`))}</div>`;
  document.querySelector("#clear-events").onclick = () => { events = []; render(); };
}

function renderSettings() {
  const agent = snapshot.agent; const preferences = snapshot.preferences || {};
  main.innerHTML = `<div class="view">${title("Settings", "LOCAL CONFIGURATION AND INSTALL STATUS")}
    ${panel("Appearance", `<div class="setting-row"><div><b>THEME</b><p>FOLLOW YOUR MAC BY DEFAULT, OR OVERRIDE IT.</p></div><div class="segmented">${["system", "light", "dark"].map((theme) => `<button data-theme-value="${theme}" class="${(preferences.theme || "system") === theme ? "active" : ""}">${theme}</button>`).join("")}</div></div>${settingToggle("Reduced motion", "Turn off interface animations and pulsing indicators.", "desktop.reducedMotion", preferences.reducedMotion)}${settingToggle("Compact layout", "Fit more rows and cards on screen.", "desktop.compact", preferences.compact)}`)}
    <section class="columns equal">
      ${panel("Agent", `<div class="panel-body">${kv("version", esc(agent.version))}${kv("service", statusTag(agent.service, agent.service === "running" ? "online" : "warn"))}${kv("provider", label(agent.provider))}${kv("model", label(agent.model))}${kv("host", label(agent.host))}</div>`)}
      ${panel("Storage", `<div class="panel-body">${kv("workspace", label(agent.workspace))}${kv("memory", label(agent.memory))}${kv("distribution", "OPTIONAL MACOS APP")}</div>`)}
    </section>
    <section class="columns equal">
      ${panel("Agent behavior", `${settingToggle("Autonomous mode", "Ordinary actions proceed without repeated approval.", "autonomy.mode", agent.autonomy === "autonomous", "autonomous", "guarded")}${settingToggle("Self-improvement", "Propose reusable capabilities after verified workflows.", "learning.enabled", snapshot.tools.find((tool) => tool.id === "learning")?.enabled)}${settingToggle("Subagents", "Allow Helios to delegate matching bounded work.", "workers.enabled", snapshot.tools.find((tool) => tool.id === "workers")?.enabled)}`)}
      ${panel("Background", `${settingToggle("Automatic updates", "Check for verified releases every six hours.", "updates.enabled", snapshot.settings?.updates ?? true)}${settingToggle("Scheduled jobs", "Run enabled cron jobs with the background service.", "scheduler.enabled", snapshot.settings?.scheduler ?? true)}`)}
    </section>
    <section class="columns equal">
      ${panel("Privacy", row("Private local bridge", "NO LISTENING PORT. CREDENTIALS NEVER ENTER THE WEB VIEW.", statusTag("LOCAL", "online"), "⌂"))}
      ${panel("Desktop", row("Native macOS app", "INSTALL OR OPEN IT ANY TIME WITH HELIOS DESKTOP.", statusTag("OPTIONAL"), "◇"))}
    </section>
  </div>`;
  document.querySelectorAll("[data-theme-value]").forEach((button) => button.onclick = () => updateSetting("desktop.theme", button.dataset.themeValue));
  document.querySelectorAll("[data-setting]").forEach((button) => button.onclick = () => updateSetting(button.dataset.setting, button.classList.contains("on") ? button.dataset.off : button.dataset.on));
}

function settingToggle(name, detail, key, enabled, on = "true", off = "false") {
  return `<div class="setting-row"><div><b>${esc(name)}</b><p>${esc(detail)}</p></div><button class="toggle ${enabled ? "on" : ""}" data-setting="${attr(key)}" data-on="${attr(on)}" data-off="${attr(off)}" aria-label="Toggle ${attr(name)}"></button></div>`;
}

async function updateSetting(key, raw) {
  const value = raw === "true" ? true : raw === "false" ? false : raw;
  snapshot = await call("config.set", { key, value }); render();
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
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  showToast(event.reason?.message || "Something went wrong. Please retry.", "danger");
});

async function reload(shouldRender = true) {
  const previous = snapshot;
  const next = await call("snapshot");
  if (previous) {
    const known = new Set((previous.cronRuns || []).map((run) => run.id));
    for (const run of (next.cronRuns || []).filter((item) => !known.has(item.id) && item.status === "failed")) {
      const job = (next.jobs || []).find((item) => item.id === run.job_id);
      showToast(`${job?.name || "Scheduled job"} failed: ${run.error || "Open Cron Jobs for details."}`, "danger");
    }
  }
  snapshot = next;
  if (shouldRender) render();
}

reload().catch((error) => {
  main.innerHTML = connectionError("Unable to connect", error.message);
  document.querySelector("#retry")?.addEventListener("click", () => reload());
});
setInterval(() => reload(active === "overview" || active === "cron").catch(() => {}), 30_000);
