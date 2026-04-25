import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as mime from "mime-types";
import { TronClass } from "tronclass-api";
import { initApi, getCurrentUserId } from "./lib/client";
import { unflattenFields, getNestedValue, apiError } from "./lib/utils";
import {
  autoRenderTable,
  bold,
  red,
  grn,
  ylw,
  cyn,
  gry,
  hyperlink,
  renderKVTable,
  renderContentBox,
} from "./lib/ui";
import { renderHtml } from "./lib/html";
import { fetchUploadUrl } from "./lib/download";

const LABELS: Record<string, string> = {
  id:       "ID",
  title:    "Title",
  deadline: "Deadline",
  status:   "Status",
  score:    "Score",
};
import prompts from "prompts";

/**
 * Powered by Tronclass-API (SDK):
 * Copyright (c) 2026 Seven317 (MIT License)
 */

export async function runHomeworkList(
  courseId: string,
  fields: string[] = ["id", "title", "deadline", "status", "score"]
): Promise<void> {
  const { api } = await initApi();

  try {
    const allHomework = await api.assignments.getHomeworkActivities(Number(courseId));

    if (!allHomework || allHomework.length === 0) {
      console.log("No homework.");
      return;
    }

    const tableData = allHomework.map((hw: any) => {
      const row: Record<string, string> = {};
      for (const field of fields) {
        if (field === "status") {
          if (hw.submitted)       row[field] = "已繳交 (Submitted)";
          else if (!hw.is_closed) row[field] = "待繳交 (To Submit)";
          else                    row[field] = "未繳 (Overdue)";
        } else {
          const val = getNestedValue(hw, field);
          row[field] = val != null && val !== "" ? String(val) : "N/A";
        }
      }
      return row;
    });

    autoRenderTable(tableData, fields, fields.map(f => LABELS[f] ?? f));
  } catch (error) {
    throw apiError(`Failed to fetch homework for course ${courseId}`, error);
  }
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("zh-TW", { hour12: false });
}

function coloredDeadline(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (isNaN(diff))                  return String(dateStr);
  if (diff < 0)                     return red(String(dateStr));
  if (diff < 7 * 24 * 3600 * 1000)  return ylw(String(dateStr));
  return String(dateStr);
}

function extractHomeworkContent(activity: any): string {
  const top = activity.description ?? activity.content;
  if (top) return String(top);
  const data = activity.data;
  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    return String(data.description ?? data.content ?? data.body ?? data.text ?? "");
  }
  return "";
}

function renderAttachments(
  api: TronClass,
  uploads: any[],
  heading: string,
): Promise<void> {
  return (async () => {
    if (!uploads.length) return;
    console.log();
    console.log(bold(heading) + gry(` (${uploads.length} files)`));
    const urls = await Promise.all(uploads.map((u) => fetchUploadUrl(api, u)));
    uploads.forEach((u, i) => {
      const refId = u.id ?? u.reference_id ?? i;
      const name = u.filename ?? u.name ?? u.original_filename ?? "unknown";
      const dlUrl = urls[i];
      const display = dlUrl ? hyperlink(dlUrl, cyn(name)) : name;
      console.log(`  ${gry(String(refId))}  ${display}`);
    });
  })();
}

export async function runHomeworkView(
  activityId: string,
  opts: { raw?: boolean } = {},
): Promise<void> {
  const { api, config } = await initApi();

  let activity: any;
  try {
    activity = await api.callJson<any>(`/api/activities/${activityId}`);
  } catch (error) {
    throw apiError(`Failed to fetch homework ${activityId}`, error);
  }

  if (!activity) {
    console.log(`Homework ${activityId} not found.`);
    return;
  }

  // The generic /api/activities/{id} endpoint does not include `submitted` or
  // the user's submission history. Resolve the richer data via the SDK's
  // getHomeworkActivities list and find the matching row — this is the path
  // `hw ls` already uses, and every entry carries the authoritative `submitted`
  // flag.
  //
  // SDK's getHomeworkDetail (/api/courses/{cid}/homework-activities/{aid}) is a
  // theoretically richer source on some tenants but 404s reliably on FJU
  // (tracked upstream as seven-317/Tronclass-API#1). Skipped in normal mode
  // to avoid a guaranteed-failing round-trip; still fetched in --raw mode for
  // diagnostics on tenants where it might work.
  const courseId =
    activity.course_id ?? activity.courseId ?? activity.course?.id ?? null;

  let hwDetail: any = null;
  let hwDetailError: string | null = null;
  let hwListMatch: any = null;
  let hwListError: string | null = null;

  if (courseId != null) {
    if (opts.raw) {
      try {
        hwDetail = await api.assignments.getHomeworkDetail(Number(courseId), Number(activityId));
      } catch (err) {
        hwDetailError = err instanceof Error ? err.message : String(err);
      }
    }

    try {
      const list = await api.assignments.getHomeworkActivities(Number(courseId));
      hwListMatch = list.find((h: any) => String(h.id) === String(activityId)) ?? null;
    } catch (err) {
      hwListError = err instanceof Error ? err.message : String(err);
    }
  }

  // Submission content endpoint (FJU elearn2):
  // /api/activities/{aid}/students/{user_id}/submission_list
  // → { list: [ { id, is_draft, is_latest_version, submitted_at, uploads,
  //              comment, instructor_comment, score, final_score, ... } ] }
  const userId = await getCurrentUserId(api, config);
  let submissionList: any[] = [];
  let submissionListError: string | null = null;
  if (userId != null) {
    try {
      const res = await api.callJson<any>(
        `/api/activities/${activityId}/students/${userId}/submission_list`,
      );
      if (Array.isArray(res?.list)) submissionList = res.list;
      else if (Array.isArray(res)) submissionList = res;
    } catch (err) {
      submissionListError = err instanceof Error ? err.message : String(err);
    }
  } else {
    submissionListError = "could not resolve current user_id (/api/profile failed)";
  }

  if (opts.raw) {
    console.log(JSON.stringify({
      activity,
      hwDetail,
      hwDetailError,
      hwListMatch,
      hwListError,
      userId,
      submissionList,
      submissionListError,
    }, null, 2));
    return;
  }

  // Merge metadata: prefer hwListMatch (has authoritative `submitted`), then activity.
  const src: any = { ...activity, ...(hwListMatch ?? {}) };

  // Prefer the latest version of the submission; fall back to most recent timestamp.
  let submissions: any[] = submissionList.length
    ? submissionList
    : Array.isArray(hwListMatch?.submissions)
      ? hwListMatch.submissions
      : Array.isArray(activity.submissions)
        ? activity.submissions
        : [];

  // Filter: if any entry is marked as latest, only consider those.
  const latestVersions = submissions.filter((s: any) => s.is_latest_version === true);
  if (latestVersions.length) submissions = latestVersions;

  // Pick the most recent attempt (server order is not guaranteed).
  const sorted = [...submissions].sort((a: any, b: any) => {
    const ta = new Date(a.submit_at ?? a.submitted_at ?? a.created_at ?? 0).getTime();
    const tb = new Date(b.submit_at ?? b.submitted_at ?? b.created_at ?? 0).getTime();
    return tb - ta;
  });
  const latest = sorted[0];
  const latestIsDraft = latest?.is_draft === true;
  const latestIsSubmitted = latest != null && !latestIsDraft;
  // `user_submit_count > 0` on the activity endpoint is the final safety net:
  // when neither hwDetail, hwListMatch, nor the submissions sub-resource yield
  // data, the activity body still reports that the user has submitted at
  // least once. `hw ls` would have shown "已繳交" in that case too.
  const userSubmitCount = Number(src.user_submit_count ?? 0);
  const isSubmitted =
    src.submitted === true || latestIsSubmitted || (userSubmitCount > 0 && !latestIsDraft);

  let statusText: string;
  if (isSubmitted)             statusText = grn("已繳交 (Submitted)");
  else if (latestIsDraft)      statusText = ylw("草稿 (Draft)");
  else if (src.is_closed)      statusText = red("未繳 (Overdue)");
  else                         statusText = "待繳交 (To Submit)";

  const mainInfo: Record<string, string> = {
    "ID":       String(src.id ?? activityId),
    "Title":    bold(String(src.title ?? "N/A")),
    "Type":     String(src.type ?? "homework"),
    "Status":   statusText,
    "Deadline": coloredDeadline(src.deadline ?? src.end_time ?? src.due_at),
  };

  const actScore = src.score ?? latest?.score;
  if (actScore != null && actScore !== "") {
    const max = src.total_score ?? src.max_score;
    mainInfo["Score"] = max != null ? `${actScore} / ${max}` : String(actScore);
  }

  renderKVTable(mainInfo);

  const desc = extractHomeworkContent(src);
  if (desc) {
    console.log();
    console.log(bold("Description"));
    renderContentBox(renderHtml(desc));
  }

  const attachments: any[] = Array.isArray(src.uploads)
    ? src.uploads
    : Array.isArray(src.attachments)
      ? src.attachments
      : [];
  await renderAttachments(api, attachments, "Attachments");

  // ── Submission / Draft section ───────────────────────────────────────────
  console.log();
  if (!latest) {
    console.log(bold("My Submission") + gry("  (尚未繳交也未儲存草稿)"));
    return;
  }

  const subLabel = latestIsDraft ? ylw("草稿 (Draft)") : grn("已繳交 (Submitted)");
  const subTime = latest.submitted_at ?? latest.submit_at ?? latest.created_at ?? latest.updated_at;

  console.log(bold("My Submission"));
  const subInfo: Record<string, string> = {
    "State": subLabel,
    "Time":  formatDate(subTime),
  };
  const subScore = latest.final_score ?? latest.score;
  if (subScore != null) {
    const maxScore = src.total_score ?? src.max_score;
    subInfo["Score"] = maxScore != null ? `${subScore} / ${maxScore}` : String(subScore);
  }
  const teacherComment = latest.instructor_comment ?? latest.feedback;
  if (teacherComment) subInfo["Feedback"] = String(teacherComment);
  renderKVTable(subInfo);

  const myComment = latest.comment ?? latest.content;
  if (myComment) {
    console.log();
    console.log(bold("My Comment"));
    renderContentBox(renderHtml(String(myComment)));
  }

  const subUploads: any[] = Array.isArray(latest.uploads)
    ? latest.uploads
    : Array.isArray(latest.attachments)
      ? latest.attachments
      : [];
  await renderAttachments(api, subUploads, latestIsDraft ? "Draft Files" : "Submitted Files");
}

async function uploadFile(api: TronClass, filePath: string): Promise<number> {
  const stat = await fsPromises.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`${filePath} is not a file. Folders are not currently supported.`);
  }

  const fileName = path.basename(filePath);
  
  // 1. Create upload entry
  const uploadMetaResponse = await api.call(`/api/uploads`, {
    method: "POST",
    body: JSON.stringify({
      name: fileName,
      size: stat.size,
      parent_type: null,
      parent_id: 0,
      is_scorm: false,
      is_wmpkg: false,
      source: "",
      is_marked_attachment: false,
      embed_material_type: ""
    }),
    headers: {
      "Content-Type": "application/json;charset=utf-8"
    }
  });
  const uploadMetaRes = await uploadMetaResponse.json() as { id: number, upload_url: string };

  const uploadId = uploadMetaRes.id;
  const uploadUrl = uploadMetaRes.upload_url;

  if (!uploadId || !uploadUrl) {
    throw new Error("Failed to get upload URL from server.");
  }

  // 2. PUT the file to the upload URL
  const fileBuffer = await fsPromises.readFile(filePath);
  const mimeType = mime.lookup(filePath) || "application/octet-stream";
  
  const boundary = "----geckoformboundary" + Date.now().toString(16);
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileBuffer, footer]);

  console.log(`Uploading ${fileName}...`);
  
  const uploadResponse = await (api as any).httpClient.request(uploadUrl, {
    method: "PUT",
    body: body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": body.length.toString()
    }
  });

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text().catch(() => "");
    throw new Error(`Failed to upload ${fileName}. Server returned ${uploadResponse.status} - ${errorBody}`);
  }

  return uploadId;
}

export async function runHomeworkSubmit(
  activityId: string,
  filePaths: string[],
  isDraft: boolean = false
): Promise<void> {
  if (filePaths.length === 0) {
    throw new Error("No files provided for submission.");
  }

  const { api } = await initApi();

  // Get activity details for confirmation prompt
  let activityTitle = activityId;
  try {
    const res = await api.callJson<any>(`/api/activities/${activityId}`);
    if (res && res.title) {
      activityTitle = res.title;
    }
  } catch (error) {
    // Ignore activity fetch error, proceed with submission
  }

  const { confirm } = await prompts({
    type: "confirm",
    name: "confirm",
    message: `Submit file(s) [${filePaths.join(", ")}] for homework "${activityTitle}"?`,
    initial: true,
  });

  if (!confirm) {
    console.log("Submission cancelled.");
    return;
  }

  const uploadIds: number[] = [];
  for (const filePath of filePaths) {
    const uploadId = await uploadFile(api, filePath);
    uploadIds.push(uploadId);
  }

  // Submit the assignment
  try {
    await api.call(`/api/course/activities/${activityId}/submissions`, {
      method: "POST",
      body: JSON.stringify({
        comment: "",
        uploads: uploadIds,
        slides: [],
        is_draft: isDraft,
      }),
      headers: {
        "Content-Type": "application/json"
      }
    });
    console.log(`Homework ${isDraft ? "saved as draft" : "submitted"} successfully!`);
  } catch (error) {
    throw new Error("Failed to submit homework to the server.");
  }
}
