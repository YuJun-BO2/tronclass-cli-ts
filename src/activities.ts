import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { initApi } from "./client";
import { unflattenFields, getNestedValue } from "./utils";

/**
 * Powered by Tronclass-API (SDK):
 * Copyright (c) 2026 Seven317 (MIT License)
 */

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
          if (activity.is_closed) row[field] = "已結束 (Closed)";
          else if (activity.is_in_progress) row[field] = "進行中 (In Progress)";
          else if (activity.is_started === false) row[field] = "未開放 (Not Opened)";
          else row[field] = "N/A";
        } else {
          const val = getNestedValue(activity, field);
          row[field] = val != null && val !== "" ? val : "N/A";
        }
      }
      return row;
    });

    console.table(tableData);
  } catch (error) {
    throw new Error(`Failed to fetch activities for course ${courseId}.`);
  }
}

// ── ANSI colors ───────────────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red  = (s: string) => `\x1b[31m${s}\x1b[0m`;
const grn  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const ylw  = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyn  = (s: string) => `\x1b[36m${s}\x1b[0m`;
const gry  = (s: string) => `\x1b[90m${s}\x1b[0m`;

// OSC 8 hyperlink — clickable in terminals that support it (iTerm2, GNOME Terminal, etc.)
function hyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

// ── Width helpers (ANSI + CJK aware) ─────────────────────────────────────────

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;]*m/g, "")           // CSI color codes
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, ""); // OSC 8 hyperlink markers
}

function dispWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0) ?? 0;
    const wide =
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2E80 && cp <= 0x303E) ||
      (cp >= 0x3040 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7AF) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6);
    w += wide ? 2 : 1;
  }
  return w;
}

function padEndV(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - dispWidth(s)));
}

// Wrap plain text (no ANSI) at display-width boundary
function wrapByWidth(text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = "", curW = 0;
  for (const ch of text) {
    const cw = dispWidth(ch);
    if (curW + cw > maxW) { lines.push(cur); cur = ch; curW = cw; }
    else { cur += ch; curW += cw; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// ── Table renderers ───────────────────────────────────────────────────────────

// Two-column key/value table (like console.table on a plain object, but fixed-width)
function renderKVTable(data: Record<string, string>): void {
  const termW = Math.min(process.stdout.columns || 80, 120);
  const keys  = Object.keys(data);
  const keyW  = Math.max(...keys.map((k) => k.length), 7); // 7 = "(index)"
  const valW  = Math.max(20, termW - keyW - 7);            // 7 = border+padding

  const hr = (l: string, m: string, r: string) =>
    gry(`${l}${"─".repeat(keyW + 2)}${m}${"─".repeat(valW + 2)}${r}`);

  console.log(hr("┌", "┬", "┐"));
  console.log(`${gry("│")} ${padEndV(gry("(index)"), keyW)} ${gry("│")} ${padEndV(gry("Values"), valW)} ${gry("│")}`);
  console.log(hr("├", "┼", "┤"));

  for (const key of keys) {
    const rawVal = data[key] ?? "";
    const rawPlain = stripAnsi(rawVal);
    // Colored values are short — keep as-is (one line). Plain text gets wrapped.
    const wrapped = rawVal !== rawPlain ? [rawVal] : wrapByWidth(rawPlain, valW);
    for (let i = 0; i < wrapped.length; i++) {
      const k = padEndV(i === 0 ? gry(key) : "", keyW);
      const v = padEndV(wrapped[i], valW);
      console.log(`${gry("│")} ${k} ${gry("│")} ${v} ${gry("│")}`);
    }
  }

  console.log(hr("└", "┴", "┘"));
}

// Multi-column table for attachments
function renderAttachmentTable(
  rows: Record<string, string>[],
  colDefs: { key: string; label: string; width: number }[]
): void {
  const hr = (l: string, m: string, r: string) =>
    gry(l + colDefs.map((c) => "─".repeat(c.width + 2)).join(m) + r);

  const headerCells = colDefs.map((c) => padEndV(gry(c.label), c.width)).join(` ${gry("│")} `);
  console.log(hr("┌", "┬", "┐"));
  console.log(`${gry("│")} ${headerCells} ${gry("│")}`);
  console.log(hr("├", "┼", "┤"));

  for (const row of rows) {
    const cells = colDefs.map((c) => {
      const val = row[c.key] ?? "";
      const plain = stripAnsi(val);
      const truncated = dispWidth(plain) > c.width
        ? val.slice(0, c.width - 1) + "…"
        : val;
      return padEndV(truncated, c.width);
    });
    console.log(`${gry("│")} ${cells.join(` ${gry("│")} `)} ${gry("│")}`);
  }

  console.log(hr("└", "┴", "┘"));
}

// ── Data helpers ──────────────────────────────────────────────────────────────

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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function coloredStatus(activity: any): string {
  if (activity.is_closed)            return red("已結束 (Closed)");
  if (activity.is_in_progress)       return grn("進行中 (In Progress)");
  if (activity.is_started === false) return gry("未開放 (Not Opened)");
  return "N/A";
}

function coloredDeadline(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  try {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (isNaN(diff)) return dateStr;
    if (diff < 0)                     return red(dateStr);
    if (diff < 7 * 24 * 3600 * 1000) return ylw(dateStr);
    return dateStr;
  } catch {
    return dateStr;
  }
}

// ── runActivitiesView ─────────────────────────────────────────────────────────

export async function runActivitiesView(
  activityId: string,
  fields: string[] = ["id", "title", "type", "data", "deadline", "uploads"]
): Promise<void> {
  const { api } = await initApi();

  try {
    const activity = await api.callJson<any>(`/api/activities/${activityId}`);

    if (!activity) {
      console.log("Activity not found.");
      return;
    }

    const defaultFields = ["id", "title", "type", "data", "deadline", "uploads"];
    const isDefault =
      fields.length === defaultFields.length &&
      fields.every((f, i) => f === defaultFields[i]);

    if (isDefault) {
      // Description
      const data = activity.data;
      let description = "";
      if (typeof data === "string") {
        description = stripHtml(data);
      } else if (data && typeof data === "object") {
        const raw = data.description ?? data.content ?? data.body ?? data.text ?? "";
        if (raw) description = stripHtml(String(raw));
      }

      const tableData: Record<string, string> = {
        id:       String(activity.id ?? "N/A"),
        title:    bold(String(activity.title ?? "N/A")),
        type:     String(activity.type ?? "N/A"),
        status:   coloredStatus(activity),
        deadline: coloredDeadline(activity.deadline ?? activity.end_time),
      };
      if (description) tableData.description = description;

      renderKVTable(tableData);

      // Attachments
      const uploads: any[] = Array.isArray(activity.uploads) ? activity.uploads : [];
      if (uploads.length > 0) {
        console.log(`\n${bold("Attachments")} ${gry(`(${uploads.length} files)`)}`);
        console.log(gry("Click filename to open in browser, or use the download command below.\n"));

        // Fetch download URLs in parallel so filenames become clickable links
        const downloadUrls = await Promise.all(
          uploads.map(async (u: any) => {
            // Some activity types embed the URL directly on the upload object
            if (typeof u.url === "string" && u.url.startsWith("http")) return u.url;
            const refId = u.id ?? u.reference_id;
            if (!refId) return null;
            for (const ep of [
              `/api/uploads/reference/document/${refId}/url?preview=false`,
              `/api/uploads/${refId}/url`,
            ]) {
              try {
                const res = await api.callJson<{ url: string }>(ep);
                if (res?.url) return res.url as string;
              } catch { /* try next */ }
            }
            return null;
          })
        );

        const termW = Math.min(process.stdout.columns || 80, 120);
        const refW  = 8;
        const sizeW = 8;
        const idxW  = 3;
        // overhead: │ idx │ name │ ref_id │ size │ = 4 borders + 5 spaces*2 = 14
        const nameW = Math.max(20, termW - idxW - refW - sizeW - 14);

        const rows = uploads.map((u: any, i: number) => {
          const fname  = u.filename ?? u.name ?? u.original_filename ?? "unknown";
          const refId  = String(u.id ?? u.reference_id ?? "?");
          const size   = formatFileSize(u.file_size ?? u.size) || "N/A";
          const dlUrl  = downloadUrls[i];
          const nameDisplay = dlUrl
            ? hyperlink(dlUrl, cyn(fname))
            : cyn(fname);

          return { "#": String(i), name: nameDisplay, ref_id: refId, size };
        });

        renderAttachmentTable(rows, [
          { key: "#",      label: "#",      width: idxW  },
          { key: "name",   label: "name",   width: nameW },
          { key: "ref_id", label: "ref_id", width: refW  },
          { key: "size",   label: "size",   width: sizeW },
        ]);

        console.log(`\n${gry("Download:")} tronclass a download ${gry("<ref_id>")} ${gry("<output_file>")}`);
      }
    } else {
      // Custom --fields: key-value table with plain string values
      const tableData: Record<string, string> = {};
      for (const field of fields) {
        const val = getNestedValue(activity, field);
        tableData[field] = val != null ? String(val) : "N/A";
      }
      renderKVTable(tableData);
    }
  } catch (error) {
    throw new Error(`Failed to fetch activity ${activityId}.`);
  }
}

function filenameFromResponse(response: Response, referenceId: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const star = disposition.match(/filename\*\s*=\s*UTF-8''([^;\n]+)/i);
  if (star) return decodeURIComponent(star[1].trim());
  const plain = disposition.match(/filename\s*=\s*["']?([^"';\n]+)["']?/i);
  if (plain) return plain[1].trim();
  return `download_${referenceId}`;
}

export async function runActivitiesDownload(
  referenceId: string,
  outputFile: string | undefined,
  preview: boolean = false
): Promise<void> {
  const { api } = await initApi();

  const previewStr = String(preview).toLowerCase();
  let url = "";
  for (const ep of [
    `/api/uploads/reference/document/${referenceId}/url?preview=${previewStr}`,
    `/api/uploads/${referenceId}/url`,
  ]) {
    try {
      const res = await api.callJson<{ url: string }>(ep);
      if (res?.url) { url = res.url; break; }
    } catch { /* try next */ }
  }
  if (!url) {
    throw new Error(
      `Could not get download URL for reference ID ${referenceId}. ` +
      `Check that the ref_id is correct (find it under Attachments in "tronclass a view <activity_id>").`
    );
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    const resolvedOutput = outputFile ?? path.join(
      os.homedir(), "Downloads", filenameFromResponse(response, referenceId)
    );

    const totalSize = parseInt(response.headers.get("content-length") || "0", 10);

    const destDir = path.dirname(resolvedOutput);
    await fsPromises.mkdir(destDir, { recursive: true });

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
          if (totalSize > 0) {
            const percent = ((downloaded / totalSize) * 100).toFixed(2);
            process.stdout.write(`\rProgress: ${percent}% (${downloaded}/${totalSize} bytes)`);
          } else {
            process.stdout.write(`\rProgress: ${downloaded} bytes downloaded`);
          }
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
      writer.on("finish", () => {
        console.log("\nDownload complete!");
        resolve();
      });
      writer.on("error", (err) => {
        console.error("\nDownload failed:", err);
        reject(err);
      });
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download file from ${url}. (${msg})`);
  }
}
