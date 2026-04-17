import axios, { AxiosInstance } from "axios";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CookieJar } from "tough-cookie";

export const BASE_URL = "https://elearn2.fju.edu.tw";

const CONFIG_DIR = path.join(os.homedir(), ".tronclass-cli");
const COOKIE_FILE = path.join(CONFIG_DIR, "cookies.json");

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

export interface HttpClient {
  client: AxiosInstance;
  jar: CookieJar;
}

export async function createHttpClient(jar: CookieJar): Promise<HttpClient> {
  const { wrapper } = await import("axios-cookiejar-support");

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
