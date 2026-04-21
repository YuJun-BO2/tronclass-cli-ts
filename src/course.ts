import { initApi } from "./client";
import { unflattenFields, getNestedValue, apiError } from "./utils";

/**
 * The optimized API endpoint discovery and query logic are inspired by the Tronclass-API project.
 * Copyright (c) 2026 Seven317 (MIT License)
 */
export async function runCourseList(
  fields: string[] = ["id", "name", "instructors.name"],
  all: boolean = false,
  raw: boolean = false
): Promise<void> {
  const { api } = await initApi();

  const apiFields = raw ? "" : unflattenFields([...new Set([...fields, "start_date", "end_date"])]);
  const conditions = all ? {} : { status: "ongoing" };

  let allCourses: any[] = [];

  try {
    allCourses = await api.courses.getMyCourses(conditions);
  } catch (error) {
    throw apiError("Failed to fetch courses", error);
  }

  if (!allCourses || allCourses.length === 0) {
    console.log("No courses found.");
    return;
  }

  if (raw) {
    console.log(JSON.stringify(allCourses, null, 2));
    return;
  }

  const tableData = allCourses.map((course) => {
    const row: Record<string, any> = {};
    for (const field of fields) {
      const val = getNestedValue(course, field);
      row[field] = val != null && val !== "" ? val : "N/A";
    }
    return row;
  });

  console.table(tableData);
}
