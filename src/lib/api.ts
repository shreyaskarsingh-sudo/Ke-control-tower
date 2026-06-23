// Resolves the correct API base path for both local dev and production
// Local: fetch('/api/...') → Vite proxies to localhost:3001
// Production: fetch('/_api/app/ke-control-tower/api/...')
function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (isLocal) return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  // pathname is /gokwik/ke-control-tower/... → parts[1] = "ke-control-tower"
  const appName = parts.length >= 2 ? parts[1] : "";
  return `/_api/app/${appName}`;
}

export function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { credentials: "include", ...init });
}
