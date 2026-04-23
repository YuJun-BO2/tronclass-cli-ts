#!/usr/bin/env node

import { runFjuAuthNonInteractive, resumeFjuAuthWithCaptcha } from "./lib/fjuAuth";
import { runAuth } from "./lib/auth";
import { DEFAULT_BASE_URL } from "./lib/client";
import { runTodo } from "./todo";
import { runCourseList } from "./course";
import { runActivitiesList, runActivitiesView } from "./activities";
import { runDownload } from "./lib/download";
import { runHomeworkList, runHomeworkSubmit } from "./homework";
import { runAnnouncementsList, runAnnouncementsView } from "./announcements";
import { loadConfig, clearAuth, loadCookies, getSessionInfo } from "./lib/client";
import { bold, red, grn, ylw, gry, renderKVTable } from "./lib/ui";

function printUsage(): void {
  console.log("Usage:");
  console.log("  tronclass auth login [--fju] [--password <p>] [--base-url <u>] <username>");
  console.log("                                                Login to TronClass");
  console.log("  tronclass auth login --fju --non-interactive <username>");
  console.log("                                                Start FJU login, defer captcha for later resume");
  console.log("  tronclass auth captcha --password <p> <id> <code>");
  console.log("                                                Complete a deferred FJU login");
  console.log("  tronclass auth check                          Check current authentication status");
  console.log("  tronclass auth logout                         Clear saved session");
  console.log("  tronclass todo [--fields f1,f2...]            View your to-do list");
  console.log("  tronclass courses list [options]              View your course list");
  console.log("  tronclass activities list <course_id>         List activities of a course");
  console.log("  tronclass activities view <activity_id>       View details of an activity");
  console.log("  tronclass activities download <ref_id> <out>  Download a file from an activity");
  console.log("  tronclass homework list <course_id>           List homework for a course");
  console.log("  tronclass homework submit <act_id> <files...> Submit files for homework");
  console.log("  tronclass ann list [course_id]                List announcements");
  console.log("  tronclass ann view <ann_id> [course_id]       View an announcement");
  console.log("  tronclass ann download <ref_id> [out]         Download an announcement attachment");
  console.log("    Options:");
  console.log("      --fields f1,f2...   Specify fields to display (for courses, todo, activities, homework)");
  console.log("      --all               Show all courses instead of only ongoing ones (for courses)");
  console.log("      --raw               Print the raw JSON response from the API (for courses)");
  console.log("      --preview           Download preview instead of original file (for activities download)");
  console.log("      --draft             Submit homework as a draft (for homework submit)");
  console.log("      --fju               Preset FJU base URL (skip base URL prompt)");
  console.log("      --non-interactive   Defer FJU captcha to a separate 'auth captcha' step (for agents)");
  console.log("      --password <p>      Supply password non-interactively (for auth login / auth captcha)");
  console.log("      --base-url <u>      Supply TronClass base URL non-interactively (for auth login)");
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

function parseFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (value === undefined) {
    throw new Error(`Option ${flag} requires a value.`);
  }
  return value;
}

function filterPositional(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valueFlags.includes(a)) {
      i++; // skip value
      continue;
    }
    if (a.startsWith("-")) continue;
    out.push(a);
  }
  return out;
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
        const loginArgs = args.slice(2);
        const isFju = hasFlag(loginArgs, "--fju");
        const isNonInteractive = hasFlag(loginArgs, "--non-interactive");
        const password = parseFlagValue(loginArgs, "--password");
        const baseUrlFlag = parseFlagValue(loginArgs, "--base-url");
        const positionalArgs = filterPositional(loginArgs, ["--password", "--base-url"]);
        const username = positionalArgs[0];

        if (!username) {
          console.error("Missing or invalid username.");
          printUsage();
          process.exit(1);
        }

        if (isFju && baseUrlFlag) {
          console.error("--base-url is not supported with --fju (FJU preset uses a fixed base URL).");
          process.exit(1);
        }

        if (isNonInteractive && !isFju) {
          console.error("--non-interactive is only supported with --fju (deferred-captcha flow).");
          process.exit(1);
        }

        if (isNonInteractive && password) {
          console.error("--non-interactive defers the password to 'auth captcha'. Omit --password here.");
          process.exit(1);
        }

        // --fju + --non-interactive: defers captcha to a separate 'auth captcha'
        // step. Needed because the SDK's api.login() can't pause at captcha for
        // agent/skill callers. Password is supplied later, not stored on disk.
        if (isNonInteractive) {
          await runFjuAuthNonInteractive(username);
        } else {
          // Everything else (interactive FJU, custom school, password-supplied
          // but captcha-solved interactively) goes through the SDK.
          await runAuth(username, {
            baseUrl: isFju ? DEFAULT_BASE_URL : baseUrlFlag,
            school: isFju ? "fju" : "custom",
            password,
          });
        }
      } else if (subCommand === "captcha") {
        const captchaArgs = args.slice(2);
        const password = parseFlagValue(captchaArgs, "--password");
        const positional = filterPositional(captchaArgs, ["--password"]);
        const id = positional[0];
        const code = positional[1];
        if (!id || !code) {
          console.error("Usage: tronclass auth captcha --password <p> <id> <code>");
          process.exit(1);
        }
        if (!password) {
          console.error("Missing --password. The pending captcha state does not store passwords; supply it again at resume time.");
          process.exit(1);
        }
        await resumeFjuAuthWithCaptcha(id, code, password);
      } else if (subCommand === "check") {
        const config = await loadConfig();
        const jar = await loadCookies();
        const cookies = await jar.getCookies(config.baseUrl);

        if (cookies.length === 0 || !config.username) {
          console.log("Not authenticated.");
        } else {
          const { loginTime, expiresAt } = await getSessionInfo(config.baseUrl);
          const now = Date.now();
          const remainingMs = expiresAt ? expiresAt.getTime() - now : null;
          const isValid = remainingMs !== null && remainingMs > 0;

          function formatDate(d: Date | null): string {
            if (!d) return gry("unknown");
            return d.toLocaleString("zh-TW", { hour12: false });
          }

          function formatRemaining(ms: number | null): string {
            if (ms === null) return gry("unknown");
            if (ms <= 0) return red("已過期 (Expired)");
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const text = h > 0 ? `${h} 小時 ${m} 分鐘` : `${m} 分鐘`;
            if (ms < 3600000) return red(text);
            if (ms < 86400000) return ylw(text);
            return grn(text);
          }

          const statusText = isValid ? grn("● Valid") : red("● Expired");

          renderKVTable({
            "Status":     statusText,
            "User":       bold(config.username),
            "Student ID": config.studentId ?? gry("unknown"),
            "Base URL":   config.baseUrl,
            "School":     config.school ?? "custom",
            "Login Time": formatDate(loginTime),
            "Expires At": formatDate(expiresAt),
            "Remaining":  formatRemaining(remainingMs),
          });
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
        await runDownload(refId, outFile, preview);

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

    } else if (command === "announcements" || command === "ann") {
      const subCommand = args[1];
      const cmdArgs = args.slice(2);

      if (subCommand === "list" || subCommand === "l" || subCommand === "ls") {
        const courseId = cmdArgs.filter(a => !a.startsWith("-"))[0];
        await runAnnouncementsList(courseId);

      } else if (subCommand === "view" || subCommand === "v") {
        const positional = cmdArgs.filter(a => !a.startsWith("-"));
        const annId = positional[0];
        const courseId = positional[1];
        if (!annId) {
          console.error("Missing ann_id.");
          printUsage();
          process.exit(1);
        }
        await runAnnouncementsView(annId, courseId);

      } else if (subCommand === "download" || subCommand === "d" || subCommand === "dl") {
        const positional = cmdArgs.filter(a => !a.startsWith("-"));
        const refId = positional[0];
        const outFile = positional[1];
        if (!refId) {
          console.error("Missing ref_id.");
          printUsage();
          process.exit(1);
        }
        await runDownload(refId, outFile);

      } else {
        console.error(`Unknown announcements sub-command: ${subCommand}`);
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
