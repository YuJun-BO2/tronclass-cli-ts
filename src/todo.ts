import { BASE_URL, loadCookies, createHttpClient } from "./client";

/**
 * The API endpoint discovery and default fields logic are inspired by the original Python implementation:
 * https://github.com/Howyoung/tronclass-cli
 * Copyright (c) 2020 Howyoung (MIT License)
 */
export async function runTodo(fields: string[] = ["course_name", "title", "end_time"]): Promise<void> {
  const jar = await loadCookies();
  const cookies = await jar.getCookies(BASE_URL);
  const hasSessionCookie = cookies.some((cookie) => cookie.key === "session");

  if (!hasSessionCookie) {
    throw new Error("Not authenticated. Please run 'tronclass auth -login <username>' first.");
  }

  const { client } = await createHttpClient(jar);

  try {
    const response = await client.get<{ todo_list: any[] }>(`${BASE_URL}/api/todos`, {
      headers: {
        Accept: "application/json",
      },
    });

    const todos = response.data?.todo_list;

    if (!Array.isArray(todos) || todos.length === 0) {
      console.log("Your to-do list is empty.");
      return;
    }

    // A simple way to display tabular data in the console
    const tableData = todos.map((todo) => {
      const row: Record<string, any> = {};
      for (const field of fields) {
        row[field] = todo[field] ?? "N/A";
      }
      return row;
    });

    console.table(tableData);
  } catch (error) {
    throw new Error("Failed to fetch to-do list. Your session might be expired.");
  }
}
