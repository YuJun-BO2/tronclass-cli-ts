import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CookieJar } from "tough-cookie";
import { TronClass } from "tronclass-api";

const CONFIG_DIR = path.join(os.homedir(), ".tronclass-cli");
const COOKIE_FILE = path.join(CONFIG_DIR, "cookies.json");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export const DEFAULT_BASE_URL = "https://elearn2.fju.edu.tw";

export interface CliConfig {
  username?: string;
  studentId?: string;
  baseUrl: string;
  school?: string;
}

export async function loadConfig(): Promise<CliConfig> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const json = JSON.parse(data);
    return { baseUrl: DEFAULT_BASE_URL, ...json };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL };
  }
}

export async function saveConfig(config: Partial<CliConfig>): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const existing = await loadConfig();
  const merged = { ...existing, ...config };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
}

export async function loadCookies(): Promise<CookieJar> {
  try {
    const data = await fs.readFile(COOKIE_FILE, "utf-8");
    const json = JSON.parse(data);
    return CookieJar.fromJSON(json);
  } catch {
    return new CookieJar();
  }
}

export async function saveCookies(jar: CookieJar): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const json = jar.toJSON();
  await fs.writeFile(COOKIE_FILE, JSON.stringify(json, null, 2), "utf-8");
}

export interface SessionInfo {
  loginTime: Date | null;
  expiresAt: Date | null;
}

export async function getSessionInfo(baseUrl: string): Promise<SessionInfo> {
  const jar = await loadCookies();
  const cookies = await jar.getCookies(baseUrl);
  const sessionCookie = cookies.find((c) => c.key === "session");

  if (!sessionCookie) return { loginTime: null, expiresAt: null };

  const loginTime = sessionCookie.creation instanceof Date ? sessionCookie.creation : null;

  // Token format: V2-1-<uuid>.<base64_userId>.<expiry_ms>.<signature>
  const parts = sessionCookie.value.split(".");
  const expiryMs = parts.length >= 3 ? Number(parts[2]) : NaN;
  const expiresAt = Number.isFinite(expiryMs) ? new Date(expiryMs) : null;

  return { loginTime, expiresAt };
}

export async function clearAuth(): Promise<void> {
  await fs.rm(COOKIE_FILE, { force: true }).catch(() => {});
  await fs.rm(CONFIG_FILE, { force: true }).catch(() => {});
}

export async function initApi(): Promise<{ api: TronClass; config: CliConfig }> {
  const config = await loadConfig();
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const jar = await loadCookies();
  const cookies = await jar.getCookies(baseUrl);
  const hasSessionCookie = cookies.length > 0;

  if (!hasSessionCookie) {
    throw new Error("Not authenticated. Please run 'tronclass auth login <username>' first.");
  }

  const api = new TronClass(baseUrl);
  (api as any).auth.loggedIn = true;
  const sdkJar = (api as any).httpClient.jar;
  for (const cookie of cookies) {
    await sdkJar.setCookie(cookie, baseUrl);
  }
  return { api, config };
}
