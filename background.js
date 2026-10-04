import { getState, activeEntries, pruneExpired } from "./lib/storage.js";
import { hostMatchesDomain } from "./lib/domain.js";
import { getAccount } from "./lib/account.js";
import { getSyncedState, refreshCurrentSession, refreshSites } from "./lib/sync.js";

const EXPIRY_ALARM = "block-expiry"; // next local-timer expiry
const SESSION_ALARM = "session-expiry"; // the synced session's own endsAt
const POLL_ALARM = "sync-poll"; // periodic re-check while connected
const SYNCED_RULE_ID_OFFSET = 10000; // keeps synced rule ids from ever colliding with local ones

const blockedPageUrl = (domain, synced) =>
  `/blocked/blocked.html?site=${encodeURIComponent(domain)}${synced ? "&synced=1" : ""}`;

function isSessionActive(session) {
  return !!session && session.status === "active" && (session.endsAt == null || session.endsAt > Date.now());
}

// Every domain currently being blocked: local per-site timers plus the synced focus session, combined.
async function activeBlocks() {
  const { blocklist } = await getState();
  const blocks = activeEntries(blocklist).map(({ domain }) => ({ domain, synced: false }));

  const account = await getAccount();
  if (account) {
    const { sites, session } = await getSyncedState();
    if (isSessionActive(session)) {
      for (const site of sites) if (site.enabled) blocks.push({ domain: site.domain, synced: true });
    }
  }
  return blocks;
}

async function syncRules() {
  const blocks = await activeBlocks();
  const addRules = blocks.map(({ domain, synced }, i) => ({
    id: (synced ? SYNCED_RULE_ID_OFFSET : 0) + i + 1,
    priority: 1,
    action: { type: "redirect", redirect: { extensionPath: blockedPageUrl(domain, synced) } },
    // "||domain^" matches the domain and all of its subdomains, but not lookalikes like "box.com" for "x.com".
    condition: { urlFilter: `||${domain}^`, resourceTypes: ["main_frame"] },
  }));

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules,
  });
}

// Rules only affect new navigations, so tabs already sitting on a blocked site need a nudge.
async function redirectOpenTabs() {
  const blocks = await activeBlocks();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !/^https?:/.test(tab.url)) continue;
    const host = new URL(tab.url).hostname;
    const block = blocks.find(({ domain }) => hostMatchesDomain(host, domain));
    if (block) chrome.tabs.update(tab.id, { url: chrome.runtime.getURL(blockedPageUrl(block.domain, block.synced)) });
  }
}

async function scheduleLocalAlarm() {
  const { blocklist } = await getState();
  const expiries = activeEntries(blocklist)
    .map((entry) => entry.endsAt)
    .filter((endsAt) => endsAt != null);
  if (expiries.length) chrome.alarms.create(EXPIRY_ALARM, { when: Math.min(...expiries) });
  else chrome.alarms.clear(EXPIRY_ALARM);
}

async function scheduleSessionAlarm() {
  const account = await getAccount();
  if (!account) return chrome.alarms.clear(SESSION_ALARM);
  const { session } = await getSyncedState();
  if (isSessionActive(session) && session.endsAt) chrome.alarms.create(SESSION_ALARM, { when: session.endsAt });
  else chrome.alarms.clear(SESSION_ALARM);
}

async function apply() {
  await syncRules();
  await scheduleLocalAlarm();
  await scheduleSessionAlarm();
  await redirectOpenTabs();
}

// updateDynamicRules calls must not overlap (duplicate rule ids would throw), so run them one at a time.
let queue = Promise.resolve();
const queueApply = () => (queue = queue.then(apply).catch((err) => console.error("Focus Mode: apply failed", err)));

// Pulls the latest sites + session from the server. The storage writes inside refreshSites/refreshCurrentSession
// trigger queueApply via the listener below, so callers don't need to call it themselves.
async function syncWithServer() {
  const account = await getAccount();
  if (!account) return;
  try {
    await refreshSites();
    await refreshCurrentSession();
  } catch (err) {
    console.error("Focus Mode: sync failed", err);
  }
}

// The popup only writes to storage; everything reacts from here.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.blocklist || changes.account || changes.syncedSites || changes.syncedSession) queueApply();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === EXPIRY_ALARM) {
    await pruneExpired();
    queueApply();
  } else if (alarm.name === SESSION_ALARM || alarm.name === POLL_ALARM) {
    await syncWithServer();
  }
});

// Alarms are not guaranteed to survive a browser restart, so rebuild everything from storage and from the server.
async function reconcile() {
  await pruneExpired();
  await syncWithServer();
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(reconcile);
chrome.runtime.onStartup.addListener(reconcile);
