import { apiFetch } from "./api.js";

// The API sends ISO date strings; everything downstream works in epoch ms, same convention the website uses.
function normalizeSession(session) {
  if (!session) return null;
  return { ...session, endsAt: session.endsAt ? new Date(session.endsAt).getTime() : null };
}

export async function getSyncedState() {
  const { syncedSites, syncedSession } = await chrome.storage.local.get({ syncedSites: [], syncedSession: null });
  return { sites: syncedSites, session: syncedSession };
}

export async function refreshSites() {
  const { sites } = await apiFetch("/api/sites");
  await chrome.storage.local.set({ syncedSites: sites });
  return sites;
}

export async function refreshCurrentSession() {
  const { session } = await apiFetch("/api/focus/current");
  const normalized = normalizeSession(session);
  await chrome.storage.local.set({ syncedSession: normalized });
  return normalized;
}

async function applySession(raw) {
  const normalized = normalizeSession(raw);
  await chrome.storage.local.set({ syncedSession: normalized });
  return normalized;
}

export async function startSession(minutes) {
  const { session } = await apiFetch("/api/focus/start", { method: "POST", body: { minutes } });
  return applySession(session);
}

export async function pauseSession() {
  const { session } = await apiFetch("/api/focus/pause", { method: "POST" });
  return applySession(session);
}

export async function resumeSession() {
  const { session } = await apiFetch("/api/focus/resume", { method: "POST" });
  return applySession(session);
}

// Best-effort: a duplicate, an account that isn't connected yet, or a network blip shouldn't block the local add.
export async function addSiteExtention(domain) {
  try {
    await apiFetch("/api/sites", { method: "POST", body: { domain } });
  } catch {
    // ignore
  }
}

export async function endSession() {
  await apiFetch("/api/focus/end", { method: "POST" });
  await chrome.storage.local.set({ syncedSession: null });
}

// Best-effort: declarativeNetRequest already did the actual blocking; losing this report isn't worth surfacing.
export async function reportBlocked(domain) {
  try {
    await apiFetch("/api/usage/blocked", { method: "POST", body: { domain } });
  } catch {
    // ignore
  }
}
