import { getState, activeEntries, pruneExpired } from "./lib/storage.js";
import { hostMatchesDomain } from "./lib/domain.js";

const ALARM_NAME = "block-expiry";

const blockedPageUrl = (domain) => `/blocked/blocked.html?site=${encodeURIComponent(domain)}`;

async function syncRules() {
  const { blocklist } = await getState();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();

  const addRules = activeEntries(blocklist).map(({ domain }, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: "redirect", redirect: { extensionPath: blockedPageUrl(domain) } },
    // "||domain^" matches the domain and all of its subdomains, but not lookalikes like "box.com" for "x.com".
    condition: { urlFilter: `||${domain}^`, resourceTypes: ["main_frame"] },
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules,
  });
}

// Rules only affect new navigations, so tabs already sitting on a blocked site need a nudge.
async function redirectOpenTabs() {
  const { blocklist } = await getState();
  const active = activeEntries(blocklist);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !/^https?:/.test(tab.url)) continue;
    const host = new URL(tab.url).hostname;
    const entry = active.find(({ domain }) => hostMatchesDomain(host, domain));
    if (entry) chrome.tabs.update(tab.id, { url: chrome.runtime.getURL(blockedPageUrl(entry.domain)) });
  }
}

// One alarm, always set to the soonest expiry; when it fires, that site is pruned and the alarm moves to the next one.
async function scheduleAlarm() {
  const { blocklist } = await getState();
  const expiries = activeEntries(blocklist)
    .map((entry) => entry.endsAt)
    .filter((endsAt) => endsAt != null);
  if (expiries.length) chrome.alarms.create(ALARM_NAME, { when: Math.min(...expiries) });
  else chrome.alarms.clear(ALARM_NAME);
}

async function apply() {
  await syncRules();
  await scheduleAlarm();
  await redirectOpenTabs();
}

// updateDynamicRules calls must not overlap (duplicate rule ids would throw), so run them one at a time.
let queue = Promise.resolve();
const queueApply = () => (queue = queue.then(apply).catch((err) => console.error("Focus Mode: apply failed", err)));

// The popup (and later the website sync) only write to storage; everything reacts from here.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blocklist) queueApply();
});

async function reconcile() {
  await pruneExpired();
  queueApply();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await pruneExpired();
  queueApply();
});

// Alarms are not guaranteed to survive a browser restart, so rebuild everything from storage.
chrome.runtime.onInstalled.addListener(reconcile);
chrome.runtime.onStartup.addListener(reconcile);
