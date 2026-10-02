import { normalizeDomain } from "../lib/domain.js";
import { getState, activeEntries } from "../lib/storage.js";
import { formatRemaining } from "../lib/time.js";

const $ = (id) => document.getElementById(id);

// The site param can be crafted by any web page (this page is web-accessible), so only trust it once it passes domain validation.
const site = normalizeDomain(new URLSearchParams(location.search).get("site") ?? "");

let blocklist = [];

function render() {
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

$("back").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else chrome.tabs.update({ url: "chrome://newtab" });
});

async function refresh() {
  ({ blocklist } = await getState());
  render();
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") refresh();
});

setInterval(render, 1000);

await refresh();
