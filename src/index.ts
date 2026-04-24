#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { runFjuAuthNonInteractive, resumeFjuAuthWithCaptcha } from "./lib/fjuAuth";
import { runAuth } from "./lib/auth";
import { DEFAULT_BASE_URL } from "./lib/client";
import { runTodo } from "./todo";
import { runCourseList } from "./course";
import { runActivitiesList, runActivitiesView } from "./activities";
import { runDownload } from "./lib/download";
import { runHomeworkList, runHomeworkSubmit } from "./homework";
import { runAnnouncementsList, runAnnouncementsView } from "./announcements";
import { loadConfig, clearAuth, loadCookies, getSessionInfo, initApi } from "./lib/client";
import { bold, red, grn, ylw, gry, renderKVTable } from "./lib/ui";

const CLI_PACKAGE_NAME = "tronclass-cli";

function printUsage(): void {
  console.log("Usage:");
  console.log("  tronclass -v, --version                      Show CLI version");
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

function getCliVersion(): string {
  const starts = [
    process.argv[1] ? path.dirname(process.argv[1]) : "",
    __dirname,
  ].filter(Boolean);

  const visitedPkgPaths = new Set<string>();

  for (const start of starts) {
    let dir = start;
    while (true) {
      const pkgPath = path.join(dir, "package.json");
      if (!visitedPkgPaths.has(pkgPath)) {
        visitedPkgPaths.add(pkgPath);
        try {
          const raw = fs.readFileSync(pkgPath, "utf-8");
          const pkg = JSON.parse(raw) as { name?: unknown; version?: unknown };
          if (pkg.name === CLI_PACKAGE_NAME && typeof pkg.version === "string" && pkg.version) {
            return pkg.version;
          }
        } catch {
          // continue searching parent directories
        }
      }

      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return "unknown";
}

function printVersion(): void {
  console.log(`${CLI_PACKAGE_NAME} ${getCliVersion()}`);
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

  if (args.length === 1 && (args[0] === "-v" || args[0] === "--version")) {
    printVersion();
    process.exit(0);
  }

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
          const { loginTime } = await getSessionInfo(config.baseUrl);

          // Liveness probe: hit an authenticated JSON endpoint and read the
          // status. Cookie-value parsing was unreliable (the embedded
          // timestamp's semantics are not specified and the server treats
          // sessions with sliding TTL anyway), so the only authoritative
          // signal is what the server returns right now.
          const { api } = await initApi();

          let statusText: string;
          let probeDetail = "";
          try {
            // `api.call()` is typed as `Promise<Response>`, so `res.url` is a
            // `string` populated by fetch with the final post-redirect URL
            // (fetch-cookie follows redirects manually and forwards `.url`).
            // If the server expires the session it typically 302s to
            // /cas/login or /login?..., which fetch resolves to a 200 HTML
            // page — `res.redirected` + the URL pattern catch that case.
            const res = await api.call("/api/todos");
            const finalUrl = res.url;
            const redirectedToLogin =
              res.redirected &&
              (finalUrl.includes("/cas/login") || finalUrl.includes("/login?"));
            if (res.status === 401 || res.status === 403 || redirectedToLogin) {
              statusText = red("● Expired");
              probeDetail = redirectedToLogin
                ? `redirected to ${finalUrl}`
                : `HTTP ${res.status}`;
            } else if (res.status >= 200 && res.status < 300) {
              statusText = grn("● Valid");
            } else {
              statusText = ylw("● Unknown");
              probeDetail = `HTTP ${res.status}`;
            }
          } catch (err: any) {
            statusText = ylw("● Unknown");
            probeDetail = err?.message ?? "request failed";
          }

          function formatDate(d: Date | null): string {
            if (!d) return gry("unknown");
            return d.toLocaleString("zh-TW", { hour12: false });
          }

          const row: Record<string, string> = {
            "Status":     statusText,
            "User":       bold(config.username),
            "Student ID": config.studentId ?? gry("unknown"),
            "Base URL":   config.baseUrl,
            "School":     config.school ?? "custom",
            "Login Time": formatDate(loginTime),
          };
          if (probeDetail) row["Probe"] = gry(probeDetail);
          renderKVTable(row);
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
