import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
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
  const { api } = await initApi();

  let url: string;
  try {
    const previewStr = String(preview).toLowerCase();
    const res = await api.callJson<{ url: string }>(
      `/api/uploads/reference/document/${referenceId}/url?preview=${previewStr}`
    );
    url = res.url;
    if (!url) throw new Error("No URL returned from API.");
  } catch (error) {
    throw new Error(`Failed to fetch download URL for reference ${referenceId}.`);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    const totalSize = parseInt(response.headers.get("content-length") || "0", 10);

    const destDir = path.dirname(outputFile);
    await fsPromises.mkdir(destDir, { recursive: true });

    const writer = fs.createWriteStream(outputFile);
    
    console.log(`Downloading ${outputFile}...`);
    
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
