import * as cheerio from "cheerio";
import { BASE_URL, loadCookies, createHttpClient } from "./client";
import { unflattenFields, getNestedValue } from "./utils";

export async function runCourseList(
  fields: string[] = ["id", "name", "instructors.name"],
  all: boolean = false,
  raw: boolean = false
): Promise<void> {
  const jar = await loadCookies();
  const cookies = await jar.getCookies(BASE_URL);
  const hasSessionCookie = cookies.some((cookie) => cookie.key === "session");

  if (!hasSessionCookie) {
    throw new Error("Not authenticated. Please run 'tronclass auth -login <username>' first.");
  }

  const { client } = await createHttpClient(jar);

  let userId: string;
  try {
    const userIndexRes = await client.get<string>(`${BASE_URL}/user/index`);
    const $ = cheerio.load(userIndexRes.data);
    userId = $("#userId").attr("value") || "";
    if (!userId) {
      throw new Error("Could not find userId in /user/index page.");
    }
  } catch (error) {
    throw new Error("Failed to fetch user ID. Your session might be expired.");
  }

  let allCourses: any[] = [];
  let page = 1;
  const pageSize = 50;
  // If raw or filtering by ongoing (!all), we need start_date and end_date.
  const apiFields = raw ? "" : unflattenFields([...new Set([...fields, "start_date", "end_date"])]);

  try {
    while (true) {
      const res = await client.get<{ courses: any[]; pages: number }>(`${BASE_URL}/api/users/${userId}/courses`, {
        params: {
          page,
          page_size: pageSize,
          ...(apiFields ? { fields: apiFields } : {}),
        },
        headers: {
          Accept: "application/json",
        },
      });

      const data = res.data;
      if (data && Array.isArray(data.courses)) {
        allCourses.push(...data.courses);
      }

      if (!data || !data.pages || page >= data.pages) {
        break;
      }
      page++;
    }
  } catch (error) {
    throw new Error("Failed to fetch courses from API.");
  }

  if (!all) {
    const now = new Date();
    allCourses = allCourses.filter((course) => {
      if (!course.start_date || !course.end_date) return false;
      const start = new Date(course.start_date);
      const end = new Date(course.end_date);
      return now >= start && now <= end;
    });
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
