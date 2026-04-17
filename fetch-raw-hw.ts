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

    const coursesRes = await client.get(`${BASE_URL}/api/users/${userId}/courses`, {
      params: { page: 1, page_size: 1 },
      headers: { Accept: "application/json" },
    });

    const courseId = coursesRes.data.courses[0].id;
    console.log(`Checking homework for Course ID: ${courseId}`);

    const res = await client.get(`${BASE_URL}/api/courses/${courseId}/homework-activities`, {
      headers: { Accept: "application/json" },
    });

    if (res.data.homework_activities && res.data.homework_activities.length > 0) {
      console.log(JSON.stringify(res.data.homework_activities[0], null, 2));
    } else {
      console.log("No homework found for this course.");
    }
  } catch (error: any) {
    console.error("Failed:", error.message);
  }
}

main();
