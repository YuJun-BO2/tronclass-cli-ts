#!/usr/bin/env node

import { runFjuAuth } from "./fjuAuth";
import { runApiAuth } from "./apiAuth";
import { runTodo } from "./todo";
import { runCourseList } from "./course";
import { runActivitiesList, runActivitiesView, runActivitiesDownload } from "./activities";
import { runHomeworkList, runHomeworkSubmit } from "./homework";
import { loadConfig, clearAuth, loadCookies } from "./client";

function printUsage(): void {
  console.log("Usage:");
  console.log("  tronclass auth login [--fju] <username>       Login to TronClass");
  console.log("  tronclass auth check                          Check current authentication status");
  console.log("  tronclass auth logout                         Clear saved session");
  console.log("  tronclass todo [--fields f1,f2...]            View your to-do list");
  console.log("  tronclass courses list [options]              View your course list");
  console.log("  tronclass activities list <course_id>         List activities of a course");
  console.log("  tronclass activities view <activity_id>       View details of an activity");
  console.log("  tronclass activities download <ref_id> <out>  Download a file from an activity");
  console.log("  tronclass homework list <course_id>           List homework for a course");
  console.log("  tronclass homework submit <act_id> <files...> Submit files for homework");
  console.log("    Options:");
  console.log("      --fields f1,f2...   Specify fields to display (for courses, todo, activities, homework)");
  console.log("      --all               Show all courses instead of only ongoing ones (for courses)");
  console.log("      --raw               Print the raw JSON response from the API (for courses)");
  console.log("      --preview           Download preview instead of original file (for activities download)");
  console.log("      --draft             Submit homework as a draft (for homework submit)");
  console.log("      --fju               Use FJU-specific login flow handling interactive captchas");
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
      const subCommand = args[1];

      if (subCommand === "login") {
        const isFju = hasFlag(args, "--fju");
        const positionalArgs = args.slice(2).filter(arg => !arg.startsWith("-"));
        const username = positionalArgs[0];

        if (!username) {
          console.error("Missing or invalid username.");
          printUsage();
          process.exit(1);
        }

        if (isFju) {
          await runFjuAuth(username);
        } else {
          await runApiAuth(username);
        }
      } else if (subCommand === "check") {
        const config = await loadConfig();
        const jar = await loadCookies();
        const cookies = await jar.getCookies(config.baseUrl);

        if (cookies.length > 0 && config.username) {
          console.log(`Authenticated as: ${config.username}`);
          if (config.studentId) console.log(`Student ID: ${config.studentId}`);
          console.log(`Base URL: ${config.baseUrl}`);
          console.log(`School Config: ${config.school || "custom"}`);
          console.log("Session cookies are present.");
        } else {
          console.log("Not authenticated.");
        }
      } else if (subCommand === "logout") {
        await clearAuth();
        console.log("Session cleared.");
      } else {
        console.error(`Unknown auth sub-command: ${subCommand}`);
        printUsage();
        process.exit(1);
      }

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
        const courseId = cmdArgs.filter(arg => !arg.startsWith("-"))[0];
        if (!courseId) {
          console.error("Missing course_id.");
          printUsage();
          process.exit(1);
        }
        const fields = parseFields(cmdArgs);
        await runActivitiesList(courseId, fields);

      } else if (subCommand === "view" || subCommand === "v") {
        const activityId = cmdArgs.filter(arg => !arg.startsWith("-"))[0];
        if (!activityId) {
          console.error("Missing activity_id.");
          printUsage();
          process.exit(1);
        }
        const fields = parseFields(cmdArgs);
        await runActivitiesView(activityId, fields);

      } else if (subCommand === "download" || subCommand === "d" || subCommand === "dl") {
        const positionalArgs = cmdArgs.filter(arg => !arg.startsWith("-") && arg !== "--preview");
        const refId = positionalArgs[0];
        const outFile = positionalArgs[1]; // optional — defaults to ~/Downloads/<filename>
        if (!refId) {
          console.error("Missing ref_id.");
          printUsage();
          process.exit(1);
        }
        const preview = hasFlag(cmdArgs, "--preview");
        await runActivitiesDownload(refId, outFile, preview);

      } else {
        console.error(`Unknown activities sub-command: ${subCommand}`);
        printUsage();
        process.exit(1);
      }

    } else if (command === "homework" || command === "h" || command === "hw") {
      const subCommand = args[1];
      const cmdArgs = args.slice(2);

      if (subCommand === "list" || subCommand === "l" || subCommand === "ls") {
        const courseId = cmdArgs.filter(arg => !arg.startsWith("-"))[0];
        if (!courseId) {
          console.error("Missing course_id.");
          printUsage();
          process.exit(1);
        }
        const fields = parseFields(cmdArgs);
        await runHomeworkList(courseId, fields);

      } else if (subCommand === "submit" || subCommand === "s") {
        const positionalArgs = cmdArgs.filter(arg => !arg.startsWith("-") && arg !== "--draft");
        const activityId = positionalArgs[0];
        if (!activityId) {
          console.error("Missing activity_id.");
          printUsage();
          process.exit(1);
        }
        const files = positionalArgs.slice(1);
        const isDraft = hasFlag(cmdArgs, "--draft");
        await runHomeworkSubmit(activityId, files, isDraft);

      } else {
        console.error(`Unknown homework sub-command: ${subCommand}`);
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
