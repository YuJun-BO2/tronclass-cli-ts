import prompts from "prompts";
import { TronClass } from "tronclass-api";
import { saveConfig, saveCookies } from "./client";
import { promptUserForCaptcha } from "./ocr";

export interface AuthOptions {
  baseUrl?: string;
  school?: "fju" | "custom";
  password?: string;
}

async function promptBaseUrl(): Promise<string> {
  const resp = await prompts(
    {
      type: "text",
      name: "baseUrl",
      message: "Enter your school's TronClass Base URL (e.g. https://elearn2.fju.edu.tw)",
      validate: (v: string) => (/^https?:\/\//.test(v) ? true : "Must start with http:// or https://"),
    },
    {
      onCancel: () => { throw new Error("Input cancelled."); },
    },
  );
  return resp.baseUrl as string;
}

async function promptPassword(): Promise<string> {
  const resp = await prompts(
    {
      type: "password",
      name: "password",
      message: "Password",
      validate: (v: string) => (v ? true : "Password is required."),
    },
    {
      onCancel: () => { throw new Error("Input cancelled."); },
    },
  );
  return resp.password as string;
}

export async function runAuth(username: string, options: AuthOptions = {}): Promise<void> {
  const baseUrl = (options.baseUrl ?? (await promptBaseUrl())).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error("Base URL must start with http:// or https://");
  }
  const password = options.password ?? (await promptPassword());

  console.log(`Logging in to ${baseUrl}...`);
  const api = new TronClass(baseUrl);

  const result = await api.login({
    username,
    password,
    ocrFunction: promptUserForCaptcha,
  });

  if (!result.success) {
    throw new Error(`Authentication failed: ${result.message}`);
  }

  const sdkJar = (api as any).httpClient.jar;
  await saveCookies(sdkJar);

  let studentId = "";
  try {
    const res = await api.call("/user/index");
    const html = await res.text();
    const m = html.match(/<input[^>]*id=["']userId["'][^>]*value=["']([^"']*)["']/i);
    if (m) studentId = m[1];
  } catch {
    // best-effort; not fatal
  }

  await saveConfig({
    username,
    studentId,
    baseUrl,
    school: options.school ?? "custom",
  });

  console.log(`Authenticated as ${username}${studentId ? ` (ID: ${studentId})` : ""}. Session saved.`);
}
