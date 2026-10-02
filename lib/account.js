import { API_BASE_URL } from "./config.js";

// Account storage: { account: { token, email } | null }. Separate from the local per-site blocklist in storage.js.
export async function getAccount() {
  const { account } = await chrome.storage.local.get({ account: null });
  return account;
}

export const setAccount = (account) => chrome.storage.local.set({ account });
export const clearAccount = () => chrome.storage.local.remove("account");

// Exchanges a one-time code (shown on the website's "Connect extension" page) for this device's own long-lived
// token. The extension never sees the user's password — see FOCUS_MODE_STACK_AND_API.md for why.
export async function connectWithCode(code) {
  const response = await fetch(`${API_BASE_URL}/api/auth/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Couldn't connect. Please try again.");

  await setAccount({ token: data.token, email: data.user.email });
  return data.user;
}
