import axios, { AxiosInstance, AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import prompts from "prompts";
import { CookieJar } from "tough-cookie";

const BASE_URL = "https://elearn2.fju.edu.tw";
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

interface HttpClient {
  client: AxiosInstance;
  jar: CookieJar;
}

function getServiceUrl(): string {
  return `${BASE_URL}${SERVICE_PATH}`;
}

function getLoginUrl(): string {
  const params = new URLSearchParams({
    ui_locales: "zh-TW",
    service: getServiceUrl(),
    locale: "zh_TW",
  });
  return `${BASE_URL}/cas/login?${params.toString()}`;
}

function getResponseUrl(response: AxiosResponse, fallback: string): string {
  const requestObj = response.request as { res?: { responseUrl?: string } } | undefined;
  return requestObj?.res?.responseUrl ?? fallback;
}

function extractInputValue($: cheerio.CheerioAPI, name: string, defaultValue = ""): string {
  const value = $(`input[name="${name}"]`).first().attr("value");
  return value ?? defaultValue;
}

async function parseLoginForm(client: AxiosInstance): Promise<LoginForm> {
  const loginUrl = getLoginUrl();
  const response = await client.get<string>(loginUrl, { responseType: "text" });
  const finalUrl = getResponseUrl(response, loginUrl);
  const $ = cheerio.load(response.data);

  const captchaSrc = $("img")
    .toArray()
    .map((element) => $(element).attr("src") ?? "")
    .find((src) => src.toLowerCase().includes("captcha")) ?? "";

  const captchaUrl = captchaSrc ? new URL(captchaSrc, finalUrl).toString() : "";

  return {
    submitUrl: finalUrl,
    lt: extractInputValue($, "lt"),
    execution: extractInputValue($, "execution"),
    eventId: extractInputValue($, "_eventId", "submit"),
    submitText: extractInputValue($, "submit"),
    needsCaptcha: $('input[name="captcha"]').length > 0,
    captchaUrl,
  };
}

async function downloadCaptcha(client: AxiosInstance, captchaUrl: string): Promise<string> {
  const response = await client.get<ArrayBuffer>(captchaUrl, { responseType: "arraybuffer" });
  const filePath = path.join(os.tmpdir(), `tronclass-cli-captcha-${Date.now()}.jpg`);
  await fs.writeFile(filePath, Buffer.from(response.data));
  return filePath;
}

function openFile(filePath: string): boolean {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", filePath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return true;
    }

    if (process.platform === "darwin") {
      const child = spawn("open", [filePath], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    }

    const child = spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
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

async function createHttpClient(): Promise<HttpClient> {
  const { wrapper } = await import("axios-cookiejar-support");
  const jar = new CookieJar();

  const wrapped = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      maxRedirects: 20,
      headers: {
        Referer: `${BASE_URL}/`,
        "User-Agent": "tronclass-cli-ts/0.1.0",
      },
    } as any),
  );

  return {
    client: wrapped as AxiosInstance,
    jar,
  };
}

export async function runFjuAuth(username: string): Promise<void> {
  const password = await promptPassword();

  const { client, jar } = await createHttpClient();

  const loginForm = await parseLoginForm(client);
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
    if (loginForm.captchaUrl) {
      try {
        const captchaFile = await downloadCaptcha(client, loginForm.captchaUrl);
        if (openFile(captchaFile)) {
          console.log(`Captcha image opened: ${captchaFile}`);
        } else {
          console.log(`Captcha image saved: ${captchaFile}`);
        }
      } catch {
        console.log(`Captcha URL: ${loginForm.captchaUrl}`);
      }
    }

    const captcha = await promptCaptcha();
    formData.set("captcha", captcha);
  }

  await client.post(loginForm.submitUrl, formData.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const checkResponse = await client.get<string>(getServiceUrl(), { responseType: "text" });
  const finalUrl = getResponseUrl(checkResponse, getServiceUrl());
  const body = checkResponse.data ?? "";

  const cookies = await jar.getCookies(BASE_URL);
  const hasSessionCookie = cookies.some((cookie) => cookie.key === "session");
  const loginFailed = finalUrl.includes("/cas/login") || body.includes('name="execution"');

  if (loginFailed || !hasSessionCookie) {
    throw new Error("Authentication failed. Please check username, password, and captcha.");
  }

  console.log(`Authenticated as ${username}.`);
}
