import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as mime from "mime-types";
import { TronClass } from "tronclass-api";
import { initApi } from "./lib/client";
import { unflattenFields, getNestedValue, apiError } from "./lib/utils";
import { autoRenderTable } from "./lib/ui";

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
