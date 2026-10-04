const DISPLAY_PREFIX = /^(www|m|mobile)\./;

// Turns user input ("https://www.YouTube.com/watch?v=1" or "m.youtube.com") into a bare domain
// ("youtube.com"), or null if invalid. Matches the backend's/web's normalizeDomain exactly, so a
// site added here, on the website, or synced from a focus session all resolve to the same domain.
export function normalizeDomain(input) {
  if (typeof input !== "string") return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = "https://" + value;

  let host;
  try {
    host = new URL(value).hostname;
  } catch {
    return null;
  }

  // Only strip the prefix when a real domain remains ("m.com" must stay "m.com").
  const stripped = host.replace(DISPLAY_PREFIX, "");
  if (stripped.includes(".")) host = stripped;

  if (!/^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(host)) return null;
  return host;
}

export function hostMatchesDomain(host, domain) {
  return host === domain || host.endsWith("." + domain);
}
