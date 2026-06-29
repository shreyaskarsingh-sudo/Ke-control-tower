import crypto from "crypto";
import fs from "fs";
import path from "path";

const TOKENS_FILE = path.join(process.cwd(), ".tokens.json");

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "fallback-secret-32-chars-minimum!";
  return crypto.scryptSync(secret, "csm-tower-salt", 32);
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", getKey(), iv);
  let enc = cipher.update(text, "utf8", "hex");
  enc += cipher.final("hex");
  return iv.toString("hex") + ":" + enc;
}

function decrypt(text: string): string {
  const [ivHex, enc] = text.split(":");
  const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(), Buffer.from(ivHex, "hex"));
  let dec = decipher.update(enc, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

function read(): Record<string, string> {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return {};
    return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(data: Record<string, string>) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2));
}

export function saveToken(email: string, service: "slack" | "gmail" | "jira", token: string) {
  const store = read();
  store[`${service}:${email}`] = encrypt(token);
  write(store);
}

export function getToken(email: string, service: "slack" | "gmail" | "jira"): string | null {
  const store = read();
  const enc = store[`${service}:${email}`];
  if (!enc) return null;
  try { return decrypt(enc); } catch { return null; }
}

export function hasToken(email: string, service: "slack" | "gmail" | "jira"): boolean {
  const store = read();
  return !!store[`${service}:${email}`];
}

export function removeToken(email: string, service: "slack" | "gmail" | "jira") {
  const store = read();
  delete store[`${service}:${email}`];
  write(store);
}
