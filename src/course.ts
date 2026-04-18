import { BASE_URL, loadCookies, createHttpClient } from "./client";
import { unflattenFields, getNestedValue } from "./utils";

/**
 * The optimized API endpoint discovery and query logic are inspired by the Tronclass-API project.
 * Copyright (c) 2026 Seven317 (MIT License)
 */
export async function runCourseList(
  fields: string[] = ["id", "name", "instructors.name"],
  all: boolean = false,
  raw: boolean = false
): Promise<void> {
  const jar = await loadCookies();
  const cookies = await jar.getCookies(BASE_URL);
  const hasSessionCookie = cookies.some((cookie) => cookie.key === "session");

  if (!hasSessionCookie) {
    throw new Error("Not authenticated. Please run 'tronclass auth login <username>' first.");
  }

  const { client } = await createHttpClient(jar);

  const apiFields = raw ? "" : unflattenFields([...new Set([...fields, "start_date", "end_date"])]);
  const conditions = all ? {} : { status: "ongoing" };

  let allCourses: any[] = [];

  try {
    const params: Record<string, any> = {};
    if (Object.keys(conditions).length > 0) {
      params.conditions = JSON.stringify(conditions);
    }
    if (apiFields) {
      params.fields = apiFields;
    }

    const res = await client.get<{ courses: any[] }>(`${BASE_URL}/api/my-courses`, {
      params,
      headers: {
        Accept: "application/json",
      },
    });

    const data = res.data;
    if (data && Array.isArray(data.courses)) {
      allCourses = data.courses;
    }
  } catch (error) {
    throw new Error("Failed to fetch courses from API.");
  }

  if (allCourses.length === 0) {
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
