#!/usr/bin/env node

import { runFjuAuth } from "./fjuAuth";
import { runTodo } from "./todo";

function printUsage(): void {
  console.log("Usage:");
  console.log("  tronclass auth -login <username>    Login to TronClass (FJU)");
  console.log("  tronclass todo [--fields f1,f2...]  View your to-do list");
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
