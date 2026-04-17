#!/usr/bin/env node

import { runFjuAuth } from "./fjuAuth";
import { runTodo } from "./todo";
import { runCourseList } from "./course";
import { runActivitiesList, runActivitiesView, runActivitiesDownload } from "./activities";

function printUsage(): void {
  console.log("Usage:");
  console.log("  tronclass auth -login <username>              Login to TronClass (FJU)");
  console.log("  tronclass todo [--fields f1,f2...]            View your to-do list");
  console.log("  tronclass courses list [options]              View your course list");
  console.log("  tronclass activities list <course_id>         List activities of a course");
  console.log("  tronclass activities view <activity_id>       View details of an activity");
  console.log("  tronclass activities download <ref_id> <out>  Download a file from an activity");
  console.log("    Options:");
  console.log("      --fields f1,f2...   Specify fields to display (for courses, todo, activities)");
  console.log("      --all               Show all courses instead of only ongoing ones (for courses)");
  console.log("      --raw               Print the raw JSON response from the API (for courses)");
  console.log("      --preview           Download preview instead of original file (for activities download)");
}

function parseUsername(args: string[]): string | null {
  const loginFlagIndex = args.findIndex((arg) => arg === "-login" || arg === "--login");
  if (loginFlagIndex === -1) {
    return null;
  }

  const username = args[loginFlagIndex + 1];
  if (!username || username.startsWith("-")) {
    return null;
  }

  return username;
}

function parseFields(args: string[]): string[] | undefined {
  const fieldsFlagIndex = args.findIndex((arg) => arg === "--fields");
  if (fieldsFlagIndex === -1) {
    return undefined; // use default
  }

  const fieldsVal = args[fieldsFlagIndex + 1];
  if (!fieldsVal || fieldsVal.startsWith("-")) {
    return undefined;
  }

  return fieldsVal.split(",").map(f => f.trim());
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const command = args[0];

  try {
    if (command === "auth") {
      const username = parseUsername(args.slice(1));
      if (!username) {
        console.error("Missing or invalid username.");
        printUsage();
        process.exit(1);
      }
      await runFjuAuth(username);

    } else if (command === "todo" || command === "t" || command === "td") {
      const fields = parseFields(args.slice(1));
      await runTodo(fields);

    } else if (command === "courses" || command === "c") {
      const subCommand = args[1];
      if (subCommand === "list" || subCommand === "l" || subCommand === "ls") {
        const cmdArgs = args.slice(2);
        const fields = parseFields(cmdArgs);
        const all = hasFlag(cmdArgs, "--all");
        const raw = hasFlag(cmdArgs, "--raw");
        await runCourseList(fields, all, raw);
      } else {
        console.error(`Unknown courses sub-command: ${subCommand}`);
        printUsage();
        process.exit(1);
      }

    } else if (command === "activities" || command === "a") {
      const subCommand = args[1];
      const cmdArgs = args.slice(2);
      
      if (subCommand === "list" || subCommand === "l" || subCommand === "ls") {
        const courseId = cmdArgs[0];
        if (!courseId || courseId.startsWith("-")) {
          console.error("Missing course_id.");
          printUsage();
          process.exit(1);
        }
        const fields = parseFields(cmdArgs.slice(1));
        await runActivitiesList(courseId, fields);

      } else if (subCommand === "view" || subCommand === "v") {
        const activityId = cmdArgs[0];
        if (!activityId || activityId.startsWith("-")) {
          console.error("Missing activity_id.");
          printUsage();
          process.exit(1);
        }
        const fields = parseFields(cmdArgs.slice(1));
        await runActivitiesView(activityId, fields);

      } else if (subCommand === "download" || subCommand === "d" || subCommand === "dl") {
        const refId = cmdArgs[0];
        const outFile = cmdArgs[1];
        if (!refId || !outFile || refId.startsWith("-") || outFile.startsWith("-")) {
          console.error("Missing ref_id or output file.");
          printUsage();
          process.exit(1);
        }
        const preview = hasFlag(cmdArgs.slice(2), "--preview");
        await runActivitiesDownload(refId, outFile, preview);

      } else {
        console.error(`Unknown activities sub-command: ${subCommand}`);
        printUsage();
        process.exit(1);
      }

    } else {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

void main();
