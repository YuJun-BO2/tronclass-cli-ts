import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as mime from "mime-types";
import { BASE_URL, loadCookies, createHttpClient } from "./client";
import { unflattenFields, getNestedValue } from "./utils";
import prompts from "prompts";

/**
 * The homework listing and submitting logic are ported from the original Python implementation:
 * https://github.com/Howyoung/tronclass-cli
 * Copyright (c) 2020 Howyoung (MIT License)
 */

export async function runHomeworkList(
  courseId: string,
  fields: string[] = ["id", "title", "deadline", "submitted", "score"]
): Promise<void> {
  const jar = await loadCookies();
  const cookies = await jar.getCookies(BASE_URL);
  if (!cookies.some((cookie) => cookie.key === "session")) {
    throw new Error("Not authenticated. Please run 'tronclass auth -login <username>' first.");
  }

  const { client } = await createHttpClient(jar);
  const apiFields = unflattenFields(fields);
  let allHomework: any[] = [];
  let page = 1;
  const pageSize = 50;

  try {
    while (true) {
      const res = await client.get<{ homework_activities: any[]; pages: number }>(
        `${BASE_URL}/api/courses/${courseId}/homework-activities`,
        {
          params: {
            page,
            page_size: pageSize,
            ...(apiFields ? { fields: apiFields } : {}),
          },
          headers: { Accept: "application/json" },
        }
      );

      const data = res.data;
      if (data && Array.isArray(data.homework_activities)) {
        allHomework.push(...data.homework_activities);
      }

      if (!data || !data.pages || page >= data.pages) break;
      page++;
    }
  } catch (error) {
    throw new Error(`Failed to fetch homework for course ${courseId}.`);
  }

  if (allHomework.length === 0) {
    console.log("No homework.");
    return;
  }

  const tableData = allHomework.map((hw) => {
    const row: Record<string, any> = {};
    for (const field of fields) {
      const val = getNestedValue(hw, field);
      row[field] = val != null && val !== "" ? val : "N/A";
    }
    return row;
  });

  console.table(tableData);
}

async function uploadFile(client: any, filePath: string): Promise<number> {
  const stat = await fsPromises.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`${filePath} is not a file. Folders are not currently supported.`);
  }

  const fileName = path.basename(filePath);
  
  // 1. Create upload entry
  const uploadMetaRes = await client.post(`${BASE_URL}/api/uploads`, {
    name: fileName,
    size: stat.size,
    parent_type: null,
    parent_id: 0,
    is_scorm: false,
    is_wmpkg: false,
  });

  const uploadId = uploadMetaRes.data.id;
  const uploadUrl = uploadMetaRes.data.upload_url;

  if (!uploadId || !uploadUrl) {
    throw new Error("Failed to get upload URL from server.");
  }

  // 2. PUT the file to the upload URL
  const formData = new FormData();
  const fileBuffer = await fsPromises.readFile(filePath);
  const mimeType = mime.lookup(filePath) || "application/octet-stream";
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append("file", blob, fileName);

  console.log(`Uploading ${fileName}...`);
  await client.put(uploadUrl, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    }
  });

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

  const jar = await loadCookies();
  const { client } = await createHttpClient(jar);

  // Get activity details for confirmation prompt
  let activityTitle = activityId;
  try {
    const res = await client.get(`${BASE_URL}/api/activities/${activityId}`);
    if (res.data && res.data.title) {
      activityTitle = res.data.title;
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
    const uploadId = await uploadFile(client, filePath);
    uploadIds.push(uploadId);
  }

  // Submit the assignment
  try {
    await client.post(`${BASE_URL}/api/course/activities/${activityId}/submissions`, {
      comment: "",
      uploads: uploadIds,
      slides: [],
      is_draft: isDraft,
    });
    console.log(`Homework ${isDraft ? "saved as draft" : "submitted"} successfully!`);
  } catch (error) {
    throw new Error("Failed to submit homework to the server.");
  }
}
