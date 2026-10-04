import { API_BASE_URL } from "./config.js";
import { clearAccount, getAccount } from "./account.js";

export class ApiError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// Authenticates with the bearer token from account.js instead of a cookie — see lib/account.js for why.
export async function apiFetch(path, { method = "GET", body } = {}) {
  const account = await getAccount();
  if (!account) throw new ApiError({ status: 0, code: "not_connected", message: "Not connected." });

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${account.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({ status: 0, code: "network_error", message: "Can't reach the server." });
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    // The token was revoked or expired server-side — drop it so the UI falls back to "not connected".
    if (response.status === 401) {
      await clearAccount();
      await chrome.storage.local.remove(["syncedSites", "syncedSession"]);
    }
    throw new ApiError({
      status: response.status,
      code: data?.error?.code ?? "unknown_error",
      message: data?.error?.message ?? "Something went wrong.",
    });
  }
  return data;
}
