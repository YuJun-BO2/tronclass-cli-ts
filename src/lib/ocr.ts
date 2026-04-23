import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import prompts from "prompts";

// spawn() never throws synchronously for ENOENT, so existence must be checked first.
function resolveCommand(cmd: string): string | null {
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of dirs) {
    const full = path.join(dir, cmd);
    if (existsSync(full)) return full;
  }
  return null;
}

export function openFile(filePath: string): boolean {
  const tryOpen = (cmd: string, args: string[]): boolean => {
    const resolved = resolveCommand(cmd);
    if (!resolved) return false;
    try {
      const child = spawn(resolved, args, { detached: true, stdio: "ignore" });
      child.on("error", () => {});
      child.unref();
      return true;
    } catch {
      return false;
    }
  };

  if (process.platform === "win32") {
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
  return (
    tryOpen("xdg-open", [filePath]) ||
    tryOpen("display",  [filePath]) ||
    tryOpen("eog",      [filePath]) ||
    tryOpen("feh",      [filePath])
  );
}

export async function saveCaptchaDataUrl(dataUrl: string): Promise<string> {
  // Accept any `data:<mediatype>;base64,<data>` — mediatype may include params (; charset=...).
  const match = dataUrl.match(/^data:(.*?);base64,([\s\S]+)$/);
  if (!match) {
    const preview = dataUrl.length > 80 ? dataUrl.slice(0, 80) + "..." : dataUrl;
    throw new Error(`Invalid captcha data URL. Got: ${preview}`);
  }
  const [, contentType, b64] = match;
  const ext = contentType.includes("png") ? "png" : "jpg";
  const filePath = path.join(os.tmpdir(), `tronclass-cli-captcha-${Date.now()}.${ext}`);
  await fs.writeFile(filePath, Buffer.from(b64, "base64"));
  return filePath;
}

// SDK's `ocrFunction` adapter: save the captcha image to a temp file,
// open it in an external viewer, and prompt the user for the code.
export async function promptUserForCaptcha(dataUrl: string): Promise<string> {
  const filePath = await saveCaptchaDataUrl(dataUrl);
  if (openFile(filePath)) {
    console.log(`Captcha image opened: ${filePath}`);
  } else {
    console.log(`Captcha image saved to: ${filePath}`);
    console.log(`No image viewer found. View the file manually, or run: base64 ${filePath}`);
  }
  const response = await prompts(
    {
      type: "text",
      name: "captcha",
      message: "Captcha",
      validate: (v: string) => (v ? true : "Captcha is required."),
    },
    {
      onCancel: () => { throw new Error("Input cancelled."); },
    },
  );
  return response.captcha as string;
}
