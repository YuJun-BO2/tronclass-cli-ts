import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { BASE_URL, loadCookies, createHttpClient } from "./client";
import { unflattenFields, getNestedValue } from "./utils";

/**
 * The activities commands logic are ported from the original Python implementation:
 * https://github.com/Howyoung/tronclass-cli
 * Copyright (c) 2020 Howyoung (MIT License)
 */

export async function runActivitiesList(
  courseId: string,
  fields: string[] = ["id", "title", "type", "status", "end_time"]
): Promise<void> {
  const jar = await loadCookies();
  const cookies = await jar.getCookies(BASE_URL);
  const hasSessionCookie = cookies.some((cookie) => cookie.key === "session");

  if (!hasSessionCookie) {
    throw new Error("Not authenticated. Please run 'tronclass auth login <username>' first.");
  }

  const { client } = await createHttpClient(jar);
  
  const apiFieldsSet = new Set(fields);
  if (fields.includes("status")) {
    apiFieldsSet.add("is_closed");
    apiFieldsSet.add("is_in_progress");
    apiFieldsSet.add("is_started");
  }
  // remove custom status field from api fields
  apiFieldsSet.delete("status");
  const apiFields = unflattenFields(Array.from(apiFieldsSet));

  try {
    const res = await client.get<{ activities: any[] }>(`${BASE_URL}/api/courses/${courseId}/activities`, {
      params: apiFields ? { fields: apiFields } : {},
      headers: { Accept: "application/json" },
    });

    const activities = res.data?.activities;
    if (!Array.isArray(activities) || activities.length === 0) {
      console.log("No activities.");
      return;
    }

    const tableData = activities.map((activity) => {
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

export async function runActivitiesView(
  activityId: string,
  fields: string[] = ["id", "title", "type", "data", "deadline", "uploads"]
): Promise<void> {
  const jar = await loadCookies();
  const { client } = await createHttpClient(jar);

  try {
    const res = await client.get(`${BASE_URL}/api/activities/${activityId}`, {
      headers: { Accept: "application/json" },
    });

    const activity = res.data;
    if (!activity) {
      console.log("Activity not found.");
      return;
    }

    const filtered: Record<string, any> = {};
    for (const field of fields) {
      filtered[field] = getNestedValue(activity, field);
    }

    console.log(JSON.stringify(filtered, null, 2));
  } catch (error) {
    throw new Error(`Failed to fetch activity ${activityId}.`);
  }
}

export async function runActivitiesDownload(
  referenceId: string,
  outputFile: string,
  preview: boolean = false
): Promise<void> {
  const jar = await loadCookies();
  const { client } = await createHttpClient(jar);

  let url: string;
  try {
    const res = await client.get<{ url: string }>(`${BASE_URL}/api/uploads/reference/document/${referenceId}/url`, {
      params: { preview: String(preview).toLowerCase() },
      headers: { Accept: "application/json" },
    });
    url = res.data.url;
    if (!url) throw new Error("No URL returned from API.");
  } catch (error) {
    throw new Error(`Failed to fetch download URL for reference ${referenceId}.`);
  }

  try {
    const response = await client.get(url, { responseType: "stream" });
    const totalSize = parseInt(response.headers["content-length"] || "0", 10);

    const destDir = path.dirname(outputFile);
    await fsPromises.mkdir(destDir, { recursive: true });

    const writer = fs.createWriteStream(outputFile);
    
    console.log(`Downloading ${outputFile}...`);
    
    let downloaded = 0;
    response.data.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      if (totalSize > 0) {
        const percent = ((downloaded / totalSize) * 100).toFixed(2);
        process.stdout.write(`\rProgress: ${percent}% (${downloaded}/${totalSize} bytes)`);
      } else {
        process.stdout.write(`\rProgress: ${downloaded} bytes downloaded`);
      }
    });

    response.data.pipe(writer);

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
    throw new Error(`Failed to download file from ${url}.`);
  }
}
