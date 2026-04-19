import { initApi } from "./client";
import { getNestedValue } from "./utils";

/**
 * Powered by Tronclass-API (SDK):
 * Copyright (c) 2026 Seven317 (MIT License)
 */
export async function runTodo(fields: string[] = ["course_name", "title", "end_time"]): Promise<void> {
  const { api } = await initApi();

  try {
    // Call the robust, type-safe API from the SDK
    const todos = await api.todos.getTodos();

    if (!Array.isArray(todos) || todos.length === 0) {
      console.log("Your to-do list is empty.");
      return;
    }

    const tableData = todos.map((todo) => {
      const row: Record<string, any> = {};
      for (const field of fields) {
        const val = getNestedValue(todo, field);
        row[field] = val != null && val !== "" ? val : "N/A";
      }
      return row;
    });

    console.table(tableData);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch to-do list. Your session might be expired. (${msg})`);
  }
}
