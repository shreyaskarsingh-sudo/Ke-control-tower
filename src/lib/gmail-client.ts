import { getToken, saveToken } from "./token-store";

interface GmailToken {
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
}

async function refreshAccessToken(email: string, token: GmailToken): Promise<GmailToken> {
  if (!token.refresh_token) throw new Error("No refresh_token stored");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail token refresh failed: ${data.error}`);

  const refreshed: GmailToken = {
    access_token: data.access_token,
    refresh_token: token.refresh_token,
    expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  saveToken(email, "gmail", JSON.stringify(refreshed));
  return refreshed;
}

// Returns a valid access token, refreshing if needed
export async function getGmailAccessToken(email: string): Promise<string> {
  const raw = getToken(email, "gmail");
  if (!raw) throw new Error("Gmail not connected");

  let token: GmailToken;
  try {
    token = JSON.parse(raw);
  } catch {
    throw new Error("Gmail token corrupted");
  }

  // Refresh if expired or expiring in next 2 minutes
  if (token.expiry_date < Date.now() + 120_000) {
    token = await refreshAccessToken(email, token);
  }

  return token.access_token;
}

// Convenience: fetch Gmail API with auto-refresh
export async function gmailFetch(email: string, path: string, options?: RequestInit): Promise<Response> {
  const accessToken = await getGmailAccessToken(email);
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}
