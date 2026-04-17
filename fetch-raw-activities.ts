import { loadCookies, createHttpClient, BASE_URL } from "./src/client";
import * as cheerio from "cheerio";

async function main() {
  const jar = await loadCookies();
  const { client } = await createHttpClient(jar);

  try {
    const userIndexRes = await client.get(`${BASE_URL}/user/index`);
    const $ = cheerio.load(userIndexRes.data);
    const userId = $("#userId").attr("value");
    
    if (!userId) {
      console.error("User ID not found.");
      process.exit(1);
    }

    // 先抓一門課程
    const coursesRes = await client.get(`${BASE_URL}/api/users/${userId}/courses`, {
      params: { page: 1, page_size: 1 },
      headers: { Accept: "application/json" },
    });

    const courseId = coursesRes.data.courses[0].id;
    console.log(`Checking activities for Course ID: ${courseId}`);

    const res = await client.get(`${BASE_URL}/api/courses/${courseId}/activities`, {
      headers: { Accept: "application/json" },
    });

    if (res.data.activities && res.data.activities.length > 0) {
      console.log(JSON.stringify(res.data.activities[0], null, 2));
    } else {
      console.log("No activities found for this course.");
    }
  } catch (error: any) {
    console.error("Failed:", error.message);
  }
}

main();
