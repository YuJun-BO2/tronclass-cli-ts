import prompts from "prompts";
import { TronClass } from "tronclass-api";
import { saveConfig, saveCookies } from "./client";

export interface ApiAuthOptions {
  baseUrl?: string;
  password?: string;
}

export async function runApiAuth(username: string, options: ApiAuthOptions = {}): Promise<void> {
  let baseUrl = options.baseUrl;
  if (!baseUrl) {
    const resp = await prompts({
      type: "text",
      name: "baseUrl",
      message: "Enter your school's TronClass Base URL (e.g. https://elearn2.fju.edu.tw)",
      validate: (val: string) => val.startsWith("http") ? true : "Must be a valid URL starting with http:// or https://",
    });
    baseUrl = resp.baseUrl as string | undefined;
    if (!baseUrl) {
      throw new Error("Input cancelled.");
    }
  }

  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error("--base-url must start with http:// or https://");
  }

  let password = options.password;
  if (!password) {
    const resp = await prompts({
      type: "password",
      name: "password",
      message: "Password",
      validate: (val: string) => val ? true : "Password is required",
    });
    password = resp.password as string | undefined;
    if (!password) {
      throw new Error("Input cancelled.");
    }
  }

  console.log(`Logging in via SDK to ${baseUrl}...`);
  const api = new TronClass(baseUrl);

  try {
    const response = await api.login({ username, password });

    if (!response.success) {
      throw new Error(`Authentication failed: ${response.message}`);
    }
  } catch (error: any) {
    throw new Error(`Authentication failed: ${error.message}`);
  }

  const sdkJar = (api as any).httpClient.jar;
  await saveCookies(sdkJar);

  // Try to extract student ID
  let studentId = "";
  try {
    const userIndexRes = await api.call("/user/index");
    const html = await userIndexRes.text();
    const match = html.match(/<input[^>]*id=["']userId["'][^>]*value=["']([^"']*)["']/i);
    if (match) {
      studentId = match[1];
    }
  } catch {
    // ignore
  }

  await saveConfig({
    username,
    studentId,
    baseUrl,
    school: "custom"
  });

  console.log(`Authenticated as ${username}${studentId ? ` (ID: ${studentId})` : ""}. Session saved using SDK flow.`);
}
