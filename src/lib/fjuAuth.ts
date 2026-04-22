import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import prompts from "prompts";
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

// Resolve a command name to its full path via PATH, or return null if not found.
// spawn() never throws synchronously for ENOENT — it emits an error event instead,
// so we must check existence before spawning to get reliable true/false results.
function resolveCommand(cmd: string): string | null {
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of dirs) {
    const full = path.join(dir, cmd);
    if (existsSync(full)) return full;
  }
  return null;
}

function openFile(filePath: string): boolean {
  const tryOpen = (cmd: string, args: string[], opts: object = {}): boolean => {
    const resolved = resolveCommand(cmd);
    if (!resolved) return false;
    try {
      const child = spawn(resolved, args, { detached: true, stdio: "ignore", ...opts });
      child.on("error", () => {}); // extra safety against late errors
      child.unref();
      return true;
    } catch {
      return false;
    }
  };

  if (process.platform === "win32") {
    // cmd.exe is always available on Windows
    const child = spawn("cmd", ["/c", "start", "", filePath], {
      detached: true, stdio: "ignore", windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
    return true;
  }
  if (process.platform === "darwin") {
    return tryOpen("open", [filePath]);
  }
  // Linux: try viewers in order (xdg-open absent in minimal/headless envs)
  return (
    tryOpen("xdg-open", [filePath]) ||
    tryOpen("display",  [filePath]) ||
    tryOpen("eog",      [filePath]) ||
    tryOpen("feh",      [filePath])
  );
}

async function promptPassword(): Promise<string> {
  const response = await prompts(
    {
      type: "password",
      name: "password",
      message: "Password",
      validate: (value: string) => (value ? true : "Password is required."),
    },
    {
      onCancel: () => {
        throw new Error("Input cancelled.");
      },
    },
  );

  return response.password as string;
}

async function promptCaptcha(): Promise<string> {
  const response = await prompts(
    {
      type: "text",
      name: "captcha",
      message: "Captcha",
      validate: (value: string) => (value ? true : "Captcha is required."),
    },
    {
      onCancel: () => {
        throw new Error("Input cancelled.");
      },
    },
  );

  return response.captcha as string;
}

export interface FjuAuthOptions {
  password?: string;
  nonInteractive?: boolean;
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

export async function runFjuAuth(username: string, options: FjuAuthOptions = {}): Promise<void> {
  const nonInteractive = options.nonInteractive ?? options.password !== undefined;

  const config = await loadConfig();
  const jar = await loadCookies();
  const api = new TronClass(DEFAULT_BASE_URL);
  (api as any).auth.loggedIn = true;

  const sdkJar: CookieJar = (api as any).httpClient.jar;
  const cookies = await jar.getCookies(DEFAULT_BASE_URL);
  for (const cookie of cookies) {
    await sdkJar.setCookie(cookie, DEFAULT_BASE_URL);
  }

  // Try existing cookies first — may already be authenticated
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
      // ignore, fall through to fresh login
    }
  } else {
    await sdkJar.removeAllCookies();
  }

  const password = options.password ?? (await promptPassword());

  const loginForm = await parseLoginForm(api);
  if (!loginForm.lt || !loginForm.execution) {
    throw new Error("Failed to parse FJU CAS login form.");
  }

  const formData = new URLSearchParams();
  formData.set("username", username);
  formData.set("password", password);
  formData.set("lt", loginForm.lt);
  formData.set("execution", loginForm.execution);
  formData.set("_eventId", loginForm.eventId || "submit");
  if (loginForm.submitText) {
    formData.set("submit", loginForm.submitText);
  }

  if (loginForm.needsCaptcha) {
    let imagePath = "";
    if (loginForm.captchaUrl) {
      try {
        imagePath = await downloadCaptcha(api, loginForm.captchaUrl);
      } catch {
        // fall through — we'll report missing image below
      }
    }

    if (nonInteractive) {
      await cleanupStalePendingCaptchas();
      const id = generateCaptchaId();
      const state: PendingCaptcha = {
        id,
        school: "fju",
        baseUrl: DEFAULT_BASE_URL,
        username,
        password,
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
      console.log(`  tronclass auth captcha ${id} <code>`);
      return;
    }

    if (imagePath) {
      if (openFile(imagePath)) {
        console.log(`Captcha image opened: ${imagePath}`);
      } else {
        console.log(`Captcha image saved to: ${imagePath}`);
        console.log(`No image viewer found. View the file manually, or run: base64 ${imagePath}`);
      }
    } else if (loginForm.captchaUrl) {
      console.log(`Captcha URL: ${loginForm.captchaUrl}`);
    }

    const captcha = await promptCaptcha();
    formData.set("captcha", captcha);
  }

  await api.call(loginForm.submitUrl, {
    method: "POST",
    body: formData,
  });

  await finalizeFjuLogin(api, sdkJar, username);
}

export async function resumeFjuAuthWithCaptcha(id: string, code: string): Promise<void> {
  if (!code) {
    throw new Error("Missing captcha code.");
  }

  const state = await loadPendingCaptcha(id);
  if (state.school !== "fju") {
    throw new Error(`Captcha '${id}' is not an FJU login session.`);
  }

  const api = new TronClass(state.baseUrl);
  (api as any).auth.loggedIn = true;
  const sdkJar: CookieJar = (api as any).httpClient.jar;

  const restoredJar = CookieJar.fromJSON(JSON.stringify(state.cookies));
  const cookies = await restoredJar.getCookies(state.baseUrl);
  for (const cookie of cookies) {
    await sdkJar.setCookie(cookie, state.baseUrl);
  }

  const formData = new URLSearchParams();
  formData.set("username", state.username);
  formData.set("password", state.password);
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

  try {
    await finalizeFjuLogin(api, sdkJar, state.username);
  } finally {
    await deletePendingCaptcha(id).catch(() => {});
    if (state.imagePath) {
      await fs.rm(state.imagePath, { force: true }).catch(() => {});
    }
  }
}
