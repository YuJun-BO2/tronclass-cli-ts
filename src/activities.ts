import { initApi } from "./lib/client";
import { getNestedValue, apiError } from "./lib/utils";
import { bold, red, grn, ylw, cyn, gry, hyperlink, renderKVTable, autoRenderTable, renderContentBox } from "./lib/ui";
import { renderHtml } from "./lib/html";
import { fetchUploadUrl } from "./lib/download";

const LABELS: Record<string, string> = {
  id:       "ID",
  title:    "Title",
  type:     "Type",
  status:   "Status",
  end_time: "Due",
};

/**
 * Powered by Tronclass-API (SDK):
 * Copyright (c) 2026 Seven317 (MIT License)
 */

// ── Domain helpers ────────────────────────────────────────────────────────────

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

function extractContent(activity: any): string {
  const data = activity.data;
  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    return String(data.description ?? data.content ?? data.body ?? data.text ?? "");
  }
  return "";
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
      const row: Record<string, string> = {};
      for (const field of fields) {
        if (field === "status") {
          if (activity.is_closed)                 row[field] = "已結束 (Closed)";
          else if (activity.is_in_progress)        row[field] = "進行中 (In Progress)";
          else if (activity.is_started === false)  row[field] = "未開放 (Not Opened)";
          else                                     row[field] = "N/A";
        } else {
          const val = getNestedValue(activity, field);
          row[field] = val != null && val !== "" ? String(val) : "N/A";
        }
      }
      return row;
    });

    autoRenderTable(tableData, fields, fields.map(f => LABELS[f] ?? f));
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

  renderKVTable({
    "ID":       String(activity.id ?? "N/A"),
    "Title":    bold(String(activity.title ?? "N/A")),
    "Type":     String(activity.type ?? "N/A"),
    "Status":   coloredStatus(activity),
    "Deadline": coloredDeadline(activity.deadline ?? activity.end_time),
  });

  const content = extractContent(activity);
  if (content) {
    console.log();
    renderContentBox(renderHtml(content));
  }

  const uploads: any[] = Array.isArray(activity.uploads) ? activity.uploads : [];
  if (uploads.length) {
    console.log();
    console.log(bold("Attachments") + gry(` (${uploads.length} files)`));
    const downloadUrls = await Promise.all(uploads.map((u) => fetchUploadUrl(api, u)));
    uploads.forEach((u, i) => {
      const refId = u.id ?? u.reference_id ?? i;
      const name = u.filename ?? u.name ?? u.original_filename ?? "unknown";
      const dlUrl = downloadUrls[i];
      const display = dlUrl ? hyperlink(dlUrl, cyn(name)) : name;
      console.log(`  ${gry(String(refId))}  ${display}`);
    });
  }
}
