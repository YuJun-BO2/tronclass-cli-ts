import { randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { TronClass } from "tronclass-api";
import {
  DEFAULT_BASE_URL,
  loadConfig,
  saveConfig,
  loadCookies,
  saveCookies,
  savePendingCaptcha,
  loadPendingCaptcha,
  deletePendingCaptcha,
  cleanupStalePendingCaptchas,
  type PendingCaptcha,
} from "./client";
import { openFile } from "./ocr";

// Non-interactive FJU login flow with deferred captcha resume.
//
// Why this exists separately from `runAuth`: the SDK's `api.login()` requires
// an `ocrFunction` that synchronously returns a captcha code. For agent/skill
// usage, we want to defer the captcha step — save form state now, let the
// caller submit the code later via `tronclass auth captcha <id> <code>`.

const SERVICE_PATH = "/login?next=/user/index";

interface LoginForm {
  submitUrl: string;
  lt: string;
  execution: string;
  eventId: string;
  submitText: string;
  needsCaptcha: boolean;
  captchaUrl: string;
}

function getServiceUrl(): string {
  return `${DEFAULT_BASE_URL}${SERVICE_PATH}`;
}

function getLoginUrl(): string {
  const params = new URLSearchParams({
    ui_locales: "zh-TW",
    service: getServiceUrl(),
    locale: "zh_TW",
  });
  return `/cas/login?${params.toString()}`;
}

function extractInputValue(html: string, name: string, defaultValue = ""): string {
  const regex = new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, "i");
  const match = html.match(regex);
  if (!match) {
    const regex2 = new RegExp(`value=["']([^"']*)["'][^>]*name=["']${name}["']`, "i");
    const match2 = html.match(regex2);
    return match2 ? match2[1] : defaultValue;
  }
  return match[1];
}

async function parseLoginForm(api: TronClass): Promise<LoginForm> {
  const loginUrl = getLoginUrl();
  const response = await api.call(loginUrl);
  const finalUrl = response.url;
  const html = await response.text();

  const captchaRegex = /<img[^>]*src=["']([^"']*captcha[^"']*)["']/i;
  const captchaMatch = html.match(captchaRegex);
  const captchaSrc = captchaMatch ? captchaMatch[1] : "";

  const captchaUrlStr = captchaSrc ? new URL(captchaSrc, finalUrl).toString() : "";
  const captchaUrl = captchaUrlStr.replace(DEFAULT_BASE_URL, "");

  return {
    submitUrl: finalUrl.replace(DEFAULT_BASE_URL, ""),
    lt: extractInputValue(html, "lt"),
    execution: extractInputValue(html, "execution"),
    eventId: extractInputValue(html, "_eventId", "submit"),
    submitText: extractInputValue(html, "submit"),
    needsCaptcha: /<input[^>]*name=["']captcha["']/i.test(html),
    captchaUrl,
  };
}

async function downloadCaptcha(api: TronClass, captchaUrl: string): Promise<string> {
  const response = await api.call(captchaUrl);
  const arrayBuffer = await response.arrayBuffer();
  const filePath = path.join(os.tmpdir(), `tronclass-cli-captcha-${Date.now()}.jpg`);
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

function generateCaptchaId(): string {
  return randomBytes(6).toString("hex");
}

async function finalizeFjuLogin(api: TronClass, sdkJar: CookieJar, username: string): Promise<void> {
  const checkResponse = await api.call(SERVICE_PATH);
  const finalUrl = checkResponse.url;
  const html = await checkResponse.text();

  const updatedCookies = await sdkJar.getCookies(DEFAULT_BASE_URL);
  const hasSessionCookie = updatedCookies.some((cookie: any) => cookie.key === "session");
  const loginFailed = finalUrl.includes("/cas/login") || html.includes('name="execution"');

  if (loginFailed || !hasSessionCookie) {
    throw new Error("Authentication failed. Please check username, password, and captcha.");
  }

  let studentId = "";
  const match = html.match(/<input[^>]*id=["']userId["'][^>]*value=["']([^"']*)["']/i);
  if (match) {
    studentId = match[1];
  }

  await saveCookies(sdkJar);
  await saveConfig({
    username,
    studentId,
    baseUrl: DEFAULT_BASE_URL,
    school: "fju",
  });

  console.log(`Authenticated as ${username}${studentId ? ` (ID: ${studentId})` : ""}. Session saved.`);
}

// Non-interactive FJU flow: parse the CAS form, save pending state (no password!),
// print a captcha ID, exit. The caller completes the login later via
// `auth captcha --password <p> <id> <code>`.
export async function runFjuAuthNonInteractive(username: string): Promise<void> {
  const config = await loadConfig();
  const jar = await loadCookies();
  const api = new TronClass(DEFAULT_BASE_URL);
  (api as any).auth.loggedIn = true;

  const sdkJar: CookieJar = (api as any).httpClient.jar;
  const cookies = await jar.getCookies(DEFAULT_BASE_URL);
  for (const cookie of cookies) {
    await sdkJar.setCookie(cookie, DEFAULT_BASE_URL);
  }

  // Short-circuit: reuse existing session if still valid for the same user.
  if (config.username === username && config.baseUrl === DEFAULT_BASE_URL) {
    try {
      const checkResponse = await api.call(SERVICE_PATH);
      const finalUrl = checkResponse.url;
      const body = await checkResponse.text();
      const updatedCookies = await sdkJar.getCookies(DEFAULT_BASE_URL);
      const hasSessionCookie = updatedCookies.some((cookie: any) => cookie.key === "session");
      const loginFailed = finalUrl.includes("/cas/login") || body.includes('name="execution"');

      if (!loginFailed && hasSessionCookie) {
        console.log(`Already authenticated as ${username}. Session restored.`);
        return;
      }
    } catch {
      // fall through to fresh login
    }
  } else {
    await sdkJar.removeAllCookies();
  }

  const loginForm = await parseLoginForm(api);
  if (!loginForm.lt || !loginForm.execution) {
    throw new Error("Failed to parse FJU CAS login form.");
  }

  if (!loginForm.needsCaptcha) {
    // FJU always serves a captcha in practice — this branch should be unreachable.
    // If the server ever stops asking for one, there's nothing to defer, so tell
    // the caller to use the standard --password login instead.
    throw new Error(
      "FJU login page did not serve a captcha; --non-interactive has nothing to defer. " +
        "Use 'tronclass auth login --fju --password <p> <user>' instead.",
    );
  }

  let imagePath = "";
  if (loginForm.captchaUrl) {
    try {
      imagePath = await downloadCaptcha(api, loginForm.captchaUrl);
    } catch {
      // best-effort
    }
  }

  await cleanupStalePendingCaptchas();
  const id = generateCaptchaId();
  // Password is intentionally *not* persisted to the pending-captcha state:
  // the file lives on disk for up to 10 minutes, and storing a plaintext
  // password there would be a security regression versus passing it on
  // the command line. The caller supplies --password at resume time.
  const state: PendingCaptcha = {
    id,
    school: "fju",
    baseUrl: DEFAULT_BASE_URL,
    username,
    submitUrl: loginForm.submitUrl,
    lt: loginForm.lt,
    execution: loginForm.execution,
    eventId: loginForm.eventId || "submit",
    submitText: loginForm.submitText,
    cookies: sdkJar.toJSON(),
    imagePath,
    createdAt: Date.now(),
  };
  await savePendingCaptcha(state);

  console.log("Captcha required to complete login.");
  if (imagePath) {
    if (openFile(imagePath)) {
      console.log(`Captcha image opened: ${imagePath}`);
    } else {
      console.log(`Captcha image saved to: ${imagePath}`);
      console.log(`(View it manually, or run: base64 ${imagePath})`);
    }
  } else if (loginForm.captchaUrl) {
    console.log(`Captcha URL: ${loginForm.captchaUrl}`);
  }
  console.log("");
  console.log(`Captcha ID: ${id}`);
  console.log(`To complete login, run:`);
  console.log(`  tronclass auth captcha --password <password> ${id} <code>`);
}

export async function resumeFjuAuthWithCaptcha(
  id: string,
  code: string,
  password: string,
): Promise<void> {
  if (!code) {
    throw new Error("Missing captcha code.");
  }
  if (!password) {
    throw new Error("Missing --password. The pending captcha state does not store passwords; supply it again at resume time.");
  }

  const state = await loadPendingCaptcha(id);
  if (state.school !== "fju") {
    throw new Error(`Captcha '${id}' is not an FJU login session.`);
  }

  const api = new TronClass(state.baseUrl);
  (api as any).auth.loggedIn = true;

  // The httpClient's `fetcher` is bound to its original empty jar at construction time,
  // so replacing `jar` alone is not enough — we must rebuild the fetcher too. Otherwise
  // the CAS session cookies (Path=/cas) aren't sent, and the server rejects the `execution` token.
  //
  // `CookieJar.fromJSON` throws on a malformed shape and can also return `null` for some
  // corruption modes. Handle both so a truncated state file fails loudly instead of
  // letting `null` / a half-built jar reach the fetcher.
  let restoredJar: CookieJar | null;
  try {
    restoredJar = CookieJar.fromJSON(state.cookies as any);
  } catch (err: any) {
    await deletePendingCaptcha(id).catch(() => {});
    throw new Error(
      `Pending captcha state '${id}' has a corrupted cookie store (${err?.message ?? err}). Please re-run 'auth login --fju --non-interactive'.`,
    );
  }
  if (!restoredJar) {
    await deletePendingCaptcha(id).catch(() => {});
    throw new Error(
      `Pending captcha state '${id}' has a corrupted cookie store. Please re-run 'auth login --fju --non-interactive'.`,
    );
  }
  (api as any).httpClient.jar = restoredJar;
  (api as any).httpClient.fetcher = fetchCookie(fetch, restoredJar);
  const sdkJar: CookieJar = restoredJar;

  const formData = new URLSearchParams();
  formData.set("username", state.username);
  formData.set("password", password);
  formData.set("lt", state.lt);
  formData.set("execution", state.execution);
  formData.set("_eventId", state.eventId);
  if (state.submitText) {
    formData.set("submit", state.submitText);
  }
  formData.set("captcha", code);

  await api.call(state.submitUrl, {
    method: "POST",
    body: formData,
  });

  // CAS `execution` tokens are one-time-use, so the saved state is spent whether
  // the submission succeeded or failed. Always clean up in `finally`, but rethrow
  // with guidance so the user knows they must re-run `auth login`.
  try {
    await finalizeFjuLogin(api, sdkJar, state.username);
  } catch (err: any) {
    throw new Error(
      `${err.message} The pending captcha state has been cleared — re-run 'tronclass auth login --fju --password <p> <user>' to try again.`,
    );
  } finally {
    await deletePendingCaptcha(id).catch(() => {});
    if (state.imagePath) {
      await fs.rm(state.imagePath, { force: true }).catch(() => {});
    }
  }
}
