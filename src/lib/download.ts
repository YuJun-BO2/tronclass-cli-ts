import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { initApi } from "./client";

export async function resolveUploadUrl(
  api: any,
  refId: string | number,
  preview = false
): Promise<string | null> {
  const previewStr = String(preview).toLowerCase();
  for (const ep of [
    `/api/uploads/reference/document/${refId}/url?preview=${previewStr}`,
    `/api/uploads/${refId}/url`,
  ]) {
    try {
      const res = await (api.callJson(ep) as Promise<{ url: string }>);
      if (res?.url) return res.url as string;
    } catch { /* try next */ }
  }
  return null;
}

export async function fetchUploadUrl(api: any, upload: any): Promise<string | null> {
  if (typeof upload.url === "string" && upload.url.startsWith("http")) return upload.url;
  const refId = upload.id ?? upload.reference_id;
  return refId != null ? resolveUploadUrl(api, refId) : null;
}

function filenameFromResponse(response: Response, referenceId: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const star  = disposition.match(/filename\*\s*=\s*UTF-8''([^;\n]+)/i);
  if (star)  return decodeURIComponent(star[1].trim());
  const plain = disposition.match(/filename\s*=\s*["']?([^"';\n]+)["']?/i);
  if (plain) {
    const raw = plain[1].trim();
    // Server sends raw UTF-8 bytes in a Latin-1 header field; re-decode them.
    if (/[^\x00-\x7F]/.test(raw)) {
      const redecoded = Buffer.from(raw, "latin1").toString("utf8");
      if (!redecoded.includes("�")) return redecoded;
    }
    return raw;
  }
  return `download_${referenceId}`;
}

export async function runDownload(
  referenceId: string,
  outputFile: string | undefined,
  preview: boolean = false
): Promise<void> {
  const { api } = await initApi();

  const url = await resolveUploadUrl(api, referenceId, preview);
  if (!url) {
    throw new Error(
      `Could not get download URL for reference ID ${referenceId}. ` +
      `Check that the ref_id is correct (find it under Attachments in the view command).`
    );
  }

  let response: Response;
  try {
    response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download file. (${msg})`);
  }

  const resolvedOutput = outputFile ?? path.join(
    os.homedir(), "Downloads", filenameFromResponse(response, referenceId)
  );
  const totalSize = parseInt(response.headers.get("content-length") || "0", 10);

  await fsPromises.mkdir(path.dirname(resolvedOutput), { recursive: true });
  const writer = fs.createWriteStream(resolvedOutput);

  console.log(`Downloading ${resolvedOutput}...`);

  let downloaded = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        downloaded += value.length;
        writer.write(value);
        const progress = totalSize > 0
          ? `${((downloaded / totalSize) * 100).toFixed(2)}% (${downloaded}/${totalSize} bytes)`
          : `${downloaded} bytes downloaded`;
        process.stdout.write(`\rProgress: ${progress}`);
      }
    }
    writer.end();
  } else {
    const arrayBuffer = await response.arrayBuffer();
    writer.write(Buffer.from(arrayBuffer));
    writer.end();
    process.stdout.write(`\rProgress: ${arrayBuffer.byteLength} bytes downloaded`);
  }

  return new Promise((resolve, reject) => {
    writer.on("finish", () => { console.log("\nDownload complete!"); resolve(); });
    writer.on("error",  (err) => { console.error("\nDownload failed:", err); reject(err); });
  });
}
