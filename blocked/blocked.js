import { normalizeDomain } from "../lib/domain.js";
import { getState, activeEntries } from "../lib/storage.js";
import { getSyncedState, reportBlocked } from "../lib/sync.js";
import { formatRemaining } from "../lib/time.js";

const $ = (id) => document.getElementById(id);

// The site/synced params can be crafted by any web page (this page is web-accessible), so only trust
// "site" once it passes domain validation; "synced" just decides which data source to read from storage.
const params = new URLSearchParams(location.search);
const site = normalizeDomain(params.get("site") ?? "");
const synced = params.get("synced") === "1";

let blocklist = [];
let syncedSession = null;
let reported = false;

function renderSynced() {
  const active = !!syncedSession && syncedSession.status === "active";
  const name = site ?? "This site";

  $("title").textContent = active ? "Stay focused" : "Focus time finished";
  $("message").textContent = active
    ? `${name} is blocked for the rest of your focus session.`
    : `Nice work. ${name} is available again.`;

  $("timerBlock").hidden = !active;
  if (active) $("timer").textContent = formatRemaining(syncedSession.endsAt);

  const link = $("continue");
  link.hidden = active || !site;
  if (site) link.href = `https://${site}`;

  if (active && !reported && site) {
    reported = true;
    reportBlocked(site);
  }
}

function renderLocal() {
  const entry = activeEntries(blocklist).find((e) => e.domain === site);
  const name = site ?? "This site";
  const timed = entry?.endsAt != null;

  $("title").textContent = entry ? "Stay focused" : "Focus time finished";
  $("message").textContent = !entry
    ? `Nice work. ${name} is available again.`
    : timed
      ? `${name} is blocked until its timer runs out.`
      : `${name} is blocked until you remove it from Focus Mode.`;

  $("timerBlock").hidden = !timed;
  if (timed) $("timer").textContent = formatRemaining(entry.endsAt);

  const link = $("continue");
  link.hidden = !!entry || !site;
  if (site) link.href = `https://${site}`;
}

const render = () => (synced ? renderSynced() : renderLocal());

$("back").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else chrome.tabs.update({ url: "chrome://newtab" });
});

async function refresh() {
  if (synced) ({ session: syncedSession } = await getSyncedState());
  else ({ blocklist } = await getState());
  render();
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") refresh();
});

setInterval(render, 1000);

await refresh();
