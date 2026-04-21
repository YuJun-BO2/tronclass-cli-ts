import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { initApi } from "./client";
import { getNestedValue, apiError } from "./utils";
import { bold, red, grn, ylw, cyn, gry, hyperlink, renderKVTable, renderTable } from "./ui";

/**
 * Powered by Tronclass-API (SDK):
 * Copyright (c) 2026 Seven317 (MIT License)
 */

// ── Domain helpers ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1_048_576)   return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

function coloredStatus(activity: any): string {
  if (activity.is_closed)            return red("已結束 (Closed)");
  if (activity.is_in_progress)       return grn("進行中 (In Progress)");
  if (activity.is_started === false) return gry("未開放 (Not Opened)");
  return "N/A";
}

function coloredDeadline(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (isNaN(diff))                    return dateStr;
  if (diff < 0)                       return red(dateStr);
  if (diff < 7 * 24 * 3600 * 1000)   return ylw(dateStr);
  return dateStr;
}

function extractDescription(activity: any): string {
  const data = activity.data;
  if (!data) return "";
  if (typeof data === "string") return stripHtml(data);
  if (typeof data === "object") {
    const raw = data.description ?? data.content ?? data.body ?? data.text ?? "";
    return raw ? stripHtml(String(raw)) : "";
  }
  return "";
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
      if (!redecoded.includes("\uFFFD")) return redecoded;
    }
    return raw;
  }
  return `download_${referenceId}`;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function resolveUploadUrl(
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

async function fetchUploadUrl(api: any, upload: any): Promise<string | null> {
  if (typeof upload.url === "string" && upload.url.startsWith("http")) return upload.url;
  const refId = upload.id ?? upload.reference_id;
  return refId != null ? resolveUploadUrl(api, refId) : null;
}

// ── View builder helpers ──────────────────────────────────────────────────────

function buildViewTableData(activity: any, description: string): Record<string, string> {
  const data: Record<string, string> = {
    id:       String(activity.id ?? "N/A"),
    title:    bold(String(activity.title ?? "N/A")),
    type:     String(activity.type ?? "N/A"),
    status:   coloredStatus(activity),
    deadline: coloredDeadline(activity.deadline ?? activity.end_time),
  };
  if (description) data.description = description;
  return data;
}

function buildAttachmentRows(
  uploads: any[],
  downloadUrls: (string | null)[],
  nameW: number
): Record<string, string>[] {
  return uploads.map((u, i) => {
    const fname = u.filename ?? u.name ?? u.original_filename ?? "unknown";
    const dlUrl = downloadUrls[i];
    return {
      "#":      String(i),
      name:     dlUrl ? hyperlink(dlUrl, cyn(fname)) : cyn(fname),
      ref_id:   String(u.id ?? u.reference_id ?? "?"),
      size:     formatFileSize(u.file_size ?? u.size) || "N/A",
    };
  });
}

// ── Exported commands ─────────────────────────────────────────────────────────

export async function runActivitiesList(
  courseId: string,
  fields: string[] = ["id", "title", "type", "status", "end_time"]
): Promise<void> {
  const { api } = await initApi();

  try {
    const activities = await api.materials.getCourseMaterials(Number(courseId));

    if (!Array.isArray(activities) || activities.length === 0) {
      console.log("No activities.");
      return;
    }

    const tableData = activities.map((activity: any) => {
      const row: Record<string, any> = {};
      for (const field of fields) {
        if (field === "status") {
          if (activity.is_closed)            row[field] = "已結束 (Closed)";
          else if (activity.is_in_progress)  row[field] = "進行中 (In Progress)";
          else if (activity.is_started === false) row[field] = "未開放 (Not Opened)";
          else                               row[field] = "N/A";
        } else {
          const val = getNestedValue(activity, field);
          row[field] = val != null && val !== "" ? val : "N/A";
        }
      }
      return row;
    });

    console.table(tableData);
  } catch (error) {
    throw apiError(`Failed to fetch activities for course ${courseId}`, error);
  }
}

export async function runActivitiesView(
  activityId: string,
  fields: string[] = ["id", "title", "type", "data", "deadline", "uploads"]
): Promise<void> {
  const { api } = await initApi();

  let activity: any;
  try {
    activity = await api.callJson<any>(`/api/activities/${activityId}`);
  } catch (error) {
    throw apiError(`Failed to fetch activity ${activityId}`, error);
  }

  if (!activity) {
    console.log("Activity not found.");
    return;
  }

  const DEFAULT_FIELDS = ["id", "title", "type", "data", "deadline", "uploads"];
  const isDefault = fields.length === DEFAULT_FIELDS.length &&
                    fields.every((f, i) => f === DEFAULT_FIELDS[i]);

  if (!isDefault) {
    const tableData: Record<string, string> = {};
    for (const field of fields) {
      const val = getNestedValue(activity, field);
      tableData[field] = val != null ? String(val) : "N/A";
    }
    renderKVTable(tableData);
    return;
  }

  renderKVTable(buildViewTableData(activity, extractDescription(activity)));

  const uploads: any[] = Array.isArray(activity.uploads) ? activity.uploads : [];
  if (uploads.length === 0) return;

  console.log(`\n${bold("Attachments")} ${gry(`(${uploads.length} files)`)}`);
  console.log(gry("Click filename to open in browser, or use the download command below.\n"));

  const downloadUrls = await Promise.all(uploads.map((u) => fetchUploadUrl(api, u)));

  const termW = Math.min(process.stdout.columns || 80, 120);
  const idxW = 3, refW = 8, sizeW = 8;
  const nameW = Math.max(20, termW - idxW - refW - sizeW - 14);

  renderTable(buildAttachmentRows(uploads, downloadUrls, nameW), [
    { key: "#",      label: "#",      width: idxW  },
    { key: "name",   label: "name",   width: nameW },
    { key: "ref_id", label: "ref_id", width: refW  },
    { key: "size",   label: "size",   width: sizeW },
  ]);

  console.log(`\n${gry("Download:")} tronclass a download ${gry("<ref_id>")} ${gry("[output_file]")}`);
}

export async function runActivitiesDownload(
  referenceId: string,
  outputFile: string | undefined,
  preview: boolean = false
): Promise<void> {
  const { api } = await initApi();

  const url = await resolveUploadUrl(api, referenceId, preview);
  if (!url) {
    throw new Error(
      `Could not get download URL for reference ID ${referenceId}. ` +
      `Check that the ref_id is correct (find it under Attachments in "tronclass a view <activity_id>").`
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
