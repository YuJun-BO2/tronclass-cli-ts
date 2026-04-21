import { initApi } from "./lib/client";
import { getNestedValue, apiError } from "./lib/utils";
import { autoRenderTable } from "./lib/ui";

const LABELS: Record<string, string> = {
  id:          "ID",
  course_name: "Course",
  title:       "Title",
  end_time:    "Due",
};

/**
 * Powered by Tronclass-API (SDK):
 * Copyright (c) 2026 Seven317 (MIT License)
 */
export async function runTodo(fields: string[] = ["id", "course_name", "title", "end_time"]): Promise<void> {
  const { api } = await initApi();

  try {
    // Call the robust, type-safe API from the SDK
    const todos = await api.todos.getTodos();

    if (!Array.isArray(todos) || todos.length === 0) {
      console.log("Your to-do list is empty.");
      return;
    }

    const tableData = todos.map((todo) => {
      const row: Record<string, string> = {};
      for (const field of fields) {
        const val = getNestedValue(todo, field);
        row[field] = val != null && val !== "" ? String(val) : "N/A";
      }
      return row;
    });

    autoRenderTable(tableData, fields, fields.map(f => LABELS[f] ?? f));
  } catch (error) {
    throw apiError("Failed to fetch to-do list", error);
  }
}
