// Storage shape: { blocklist: [{ domain: "youtube.com", endsAt: 1758300000000 | null }] }
// endsAt is when that site's block expires; null means "until I remove it".

export const DEFAULTS = { blocklist: [] };

export const isActive = (entry, now = Date.now()) => entry.endsAt == null || entry.endsAt > now;
export const activeEntries = (blocklist) => blocklist.filter((entry) => isActive(entry));

export async function getState() {
  const { blocklist } = await chrome.storage.local.get(DEFAULTS);
  return { blocklist: blocklist.filter((entry) => entry && typeof entry.domain === "string") };
}

// Re-adding a domain that is already listed restarts its timer with the new duration.
// minutes <= 0 means "until I remove it".
export async function addBlock(domain, minutes) {
  const { blocklist } = await getState();
  const entry = { domain, endsAt: minutes > 0 ? Date.now() + minutes * 60_000 : null };
  const others = activeEntries(blocklist).filter((e) => e.domain !== domain);
  await chrome.storage.local.set({ blocklist: [...others, entry] });
}

export async function removeBlock(domain) {
  const { blocklist } = await getState();
  await chrome.storage.local.set({ blocklist: blocklist.filter((e) => e.domain !== domain) });
}

export async function pruneExpired() {
  const { blocklist } = await getState();
  const active = activeEntries(blocklist);
  if (active.length !== blocklist.length) await chrome.storage.local.set({ blocklist: active });
}
