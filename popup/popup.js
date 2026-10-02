import { getAccount, clearAccount, connectWithCode } from "../lib/account.js";
import { WEB_APP_URL } from "../lib/config.js";
import { normalizeDomain } from "../lib/domain.js";
import { getState, activeEntries, addBlock, removeBlock } from "../lib/storage.js";
import { formatRemaining } from "../lib/time.js";

const $ = (id) => document.getElementById(id);
const el = {
  badge: $("badge"),
  duration: $("duration"),
  addCurrent: $("addCurrent"),
  form: $("form"),
  input: $("input"),
  error: $("error"),
  list: $("list"),
  listEmpty: $("listEmpty"),
  incognitoStatus: $("incognitoStatus"),
  incognitoBtn: $("incognitoBtn"),
  accountConnected: $("accountConnected"),
  accountDisconnected: $("accountDisconnected"),
  accountEmail: $("accountEmail"),
  disconnectBtn: $("disconnectBtn"),
  openConnectPage: $("openConnectPage"),
  connectForm: $("connectForm"),
  connectCode: $("connectCode"),
  connectError: $("connectError"),
};

let blocklist = [];
let currentDomain = null;

const selectedMinutes = () => Number(el.duration.value);

async function detectCurrentDomain() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentDomain = tab?.url && /^https?:/.test(tab.url) ? normalizeDomain(tab.url) : null;
}

function render() {
  const active = activeEntries(blocklist);

  document.body.classList.toggle("active", active.length > 0);
  el.badge.textContent = active.length ? `${active.length} blocked` : "Off";

  const canAddCurrent = currentDomain && !active.some((entry) => entry.domain === currentDomain);
  el.addCurrent.hidden = !canAddCurrent;
  if (canAddCurrent) el.addCurrent.textContent = `Block ${currentDomain}`;

  el.listEmpty.hidden = active.length > 0;
  el.list.replaceChildren(
    ...active.map((entry) => {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.className = "domain";
      name.textContent = entry.domain;

      const time = document.createElement("span");
      time.className = "time";
      time.dataset.endsAt = entry.endsAt ?? "";
      time.textContent = formatRemaining(entry.endsAt);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Unblock ${entry.domain}`);
      remove.addEventListener("click", () => removeBlock(entry.domain));

      li.append(name, time, remove);
      return li;
    }),
  );
}

// Each site counts down on its own; when one expires the list is rebuilt without it.
function tick() {
  if (activeEntries(blocklist).length !== el.list.children.length) {
    render();
    return;
  }
  for (const time of el.list.querySelectorAll(".time")) {
    if (time.dataset.endsAt) time.textContent = formatRemaining(Number(time.dataset.endsAt));
  }
}

async function refresh() {
  ({ blocklist } = await getState());
  render();
}

// Only the user can switch on "Allow in Incognito" (Chrome gives extensions no way to do it themselves),
// so this row shows the current state and opens the page where that switch lives.
async function renderIncognito() {
  const allowed = await chrome.extension.isAllowedIncognitoAccess();
  document.body.classList.toggle("incognito-on", allowed);
  el.incognitoStatus.textContent = allowed
    ? "Blocked sites are blocked in Incognito windows too. Chrome shows its own plain “blocked” page there."
    : "Incognito windows are not blocked yet. Chrome needs “Allow in Incognito” switched on for this extension.";
  el.incognitoBtn.textContent = allowed ? "Manage" : "Block in Incognito";
  el.incognitoBtn.className = allowed ? "secondary" : "primary";
}

el.incognitoBtn.addEventListener("click", () => {
  const scheme = navigator.userAgent.includes("Edg/") ? "edge" : "chrome";
  chrome.tabs.create({ url: `${scheme}://extensions/?id=${chrome.runtime.id}` });
});

async function renderAccount() {
  const account = await getAccount();
  el.accountConnected.hidden = !account;
  el.accountDisconnected.hidden = !!account;
  if (account) el.accountEmail.textContent = account.email;
}

el.openConnectPage.addEventListener("click", () => {
  chrome.tabs.create({ url: `${WEB_APP_URL}/connect-extension` });
});

el.disconnectBtn.addEventListener("click", async () => {
  await clearAccount();
  renderAccount();
});

el.connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = el.connectCode.value.trim();
  el.connectError.hidden = true;
  if (!code) {
    el.connectError.hidden = false;
    el.connectError.textContent = "Paste the code shown on the website.";
    return;
  }
  try {
    await connectWithCode(code);
    el.connectCode.value = "";
    renderAccount();
  } catch (err) {
    el.connectError.hidden = false;
    el.connectError.textContent = err.message;
  }
});

el.addCurrent.addEventListener("click", () => addBlock(currentDomain, selectedMinutes()));

el.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const domain = normalizeDomain(el.input.value);
  el.error.hidden = domain !== null;
  if (!domain) {
    el.error.textContent = "Enter a valid site like youtube.com";
    return;
  }
  await addBlock(domain, selectedMinutes());
  el.input.value = "";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.blocklist) refresh();
  if (changes.account) renderAccount();
});

setInterval(tick, 1000);

await detectCurrentDomain();
await refresh();
await renderIncognito();
await renderAccount();
