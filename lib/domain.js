// Turns user input ("https://www.YouTube.com/watch?v=1") into a bare domain ("youtube.com"), or null if invalid.
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
  host = host.replace(/^www\./, "");
  if (!/^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(host)) return null;
  return host;
}

export function hostMatchesDomain(host, domain) {
  return host === domain || host.endsWith("." + domain);
}
