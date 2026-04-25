import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CookieJar } from "tough-cookie";
import { TronClass } from "tronclass-api";

const CONFIG_DIR = path.join(os.homedir(), ".tronclass-cli");
const COOKIE_FILE = path.join(CONFIG_DIR, "cookies.json");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const PENDING_CAPTCHA_DIR = path.join(CONFIG_DIR, "pending-captcha");
const PENDING_CAPTCHA_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const DEFAULT_BASE_URL = "https://elearn2.fju.edu.tw";

export interface CliConfig {
  username?: string;
  studentId?: string;
  userId?: number;
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
}

export async function getSessionInfo(baseUrl: string): Promise<SessionInfo> {
  const jar = await loadCookies();
  const cookies = await jar.getCookies(baseUrl);
  const sessionCookie = cookies.find((c) => c.key === "session");

  if (!sessionCookie) return { loginTime: null };

  const loginTime = sessionCookie.creation instanceof Date ? sessionCookie.creation : null;

  return { loginTime };
}

export async function clearAuth(): Promise<void> {
  await fs.rm(COOKIE_FILE, { force: true }).catch(() => {});
  await fs.rm(CONFIG_FILE, { force: true }).catch(() => {});
  await fs.rm(PENDING_CAPTCHA_DIR, { recursive: true, force: true }).catch(() => {});
}

export interface PendingCaptcha {
  id: string;
  school: "fju";
  baseUrl: string;
  username: string;
  submitUrl: string;
  lt: string;
  execution: string;
  eventId: string;
  submitText: string;
  cookies: unknown;
  imagePath: string;
  createdAt: number;
}

function pendingCaptchaPath(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("Invalid captcha id.");
  }
  return path.join(PENDING_CAPTCHA_DIR, `${id}.json`);
}

export async function savePendingCaptcha(state: PendingCaptcha): Promise<void> {
  await fs.mkdir(PENDING_CAPTCHA_DIR, { recursive: true, mode: 0o700 });
  const filePath = pendingCaptchaPath(state.id);
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
}

export async function loadPendingCaptcha(id: string): Promise<PendingCaptcha> {
  const filePath = pendingCaptchaPath(id);
  let data: string;
  try {
    data = await fs.readFile(filePath, "utf-8");
  } catch {
    throw new Error(`No pending captcha with id '${id}'. It may have expired or already been used.`);
  }
  const state = JSON.parse(data) as PendingCaptcha;
  if (Date.now() - state.createdAt > PENDING_CAPTCHA_TTL_MS) {
    await deletePendingCaptcha(id).catch(() => {});
    throw new Error(`Pending captcha '${id}' has expired. Please run 'auth login' again.`);
  }
  return state;
}

export async function deletePendingCaptcha(id: string): Promise<void> {
  await fs.rm(pendingCaptchaPath(id), { force: true }).catch(() => {});
}

export async function cleanupStalePendingCaptchas(): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(PENDING_CAPTCHA_DIR);
  } catch {
    return;
  }
  const now = Date.now();
  await Promise.all(entries.map(async (entry) => {
    if (!entry.endsWith(".json")) return;
    const full = path.join(PENDING_CAPTCHA_DIR, entry);
    try {
      const data = await fs.readFile(full, "utf-8");
      const state = JSON.parse(data) as PendingCaptcha;
      if (now - state.createdAt > PENDING_CAPTCHA_TTL_MS) {
        await fs.rm(full, { force: true });
      }
    } catch {
      // ignore malformed files
    }
  }));
}

// Look up the caller's TronClass internal user_id (distinct from `user_no`,
// the school's 學號). Cached to config on first hit. Used by endpoints like
// /api/activities/{aid}/students/{uid}/...
//
// /api/profile returns the full current-user record on the FJU TronClass
// tenant; other common paths (/api/me, /api/users/me, ...) all 404 there.
export async function getCurrentUserId(
  api: TronClass,
  config: CliConfig,
): Promise<number | null> {
  if (typeof config.userId === "number") return config.userId;
  try {
    const res = await api.callJson<any>("/api/profile");
    const id = typeof res?.id === "number" ? res.id : Number(res?.id);
    if (Number.isFinite(id) && id > 0) {
      await saveConfig({ userId: id });
      return id;
    }
  } catch { /* ignore — caller decides how to surface */ }
  return null;
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
