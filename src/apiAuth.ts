import prompts from "prompts";
import { TronClass } from "tronclass-api";
import { saveConfig, saveCookies } from "./client";

export async function runApiAuth(username: string): Promise<void> {
  const { baseUrl } = await prompts({
    type: "text",
    name: "baseUrl",
    message: "Enter your school's TronClass Base URL (e.g. https://elearn2.fju.edu.tw)",
    validate: (val: string) => val.startsWith("http") ? true : "Must be a valid URL starting with http:// or https://"
  });

  if (!baseUrl) {
    throw new Error("Input cancelled.");
  }

  const { password } = await prompts({
    type: "password",
    name: "password",
    message: "Password",
    validate: (val: string) => val ? true : "Password is required"
  });

  if (!password) {
    throw new Error("Input cancelled.");
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
