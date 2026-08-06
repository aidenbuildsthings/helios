let connectedTab = null;
let bridgeToken = null;

chrome.action.onClicked.addListener(async (tab) => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  bridgeToken = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  const paired = await fetch("http://127.0.0.1:47821/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: bridgeToken }) });
  if (!paired.ok) throw new Error("Start `helios browser` before connecting a tab.");
  connectedTab = tab.id;
  await chrome.action.setBadgeText({ tabId: tab.id, text: "ON" });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#00b8d9" });
});

async function execute(task) {
  if (!connectedTab) throw new Error("Click the Helios extension icon on a tab first.");
  if (task.action === "navigate") {
    const url = new URL(task.input.url);
    if (url.protocol !== "https:") throw new Error("Helios browser navigation requires HTTPS.");
    await chrome.tabs.update(connectedTab, { url: url.href });
    return { ok: true, url: url.href };
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: connectedTab }, args: [task],
    func: (command) => {
      if (command.action === "snapshot") return { title: document.title, url: location.href, text: document.body.innerText.slice(0, 30000) };
      const element = document.querySelector(command.input.selector);
      if (!element) throw new Error(`No element matches ${command.input.selector}`);
      if (command.action === "click") element.click();
      if (command.action === "type") {
        element.focus(); element.value = command.input.text;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return { ok: true };
    },
  });
  return result;
}

async function poll() {
  try {
    if (!bridgeToken) throw new Error("Not paired.");
    const task = await fetch("http://127.0.0.1:47821/next", { headers: { "x-helios-token": bridgeToken } }).then((response) => response.json());
    if (task) {
      let result;
      try { result = await execute(task); } catch (error) { result = { error: error.message }; }
      await fetch("http://127.0.0.1:47821/result", { method: "POST", headers: { "content-type": "application/json", "x-helios-token": bridgeToken }, body: JSON.stringify({ id: task.id, ...result }) });
    }
  } catch { /* Bridge is optional and local. */ }
  setTimeout(poll, 400);
}

poll();
