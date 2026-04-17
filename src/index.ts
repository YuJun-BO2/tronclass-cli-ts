#!/usr/bin/env node

import { runFjuAuth } from "./fjuAuth";

function printUsage(): void {
  console.log("Usage: tronclass auth -login <username>");
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const command = args[0];

  if (command !== "auth") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const username = parseUsername(args.slice(1));
  if (!username) {
    printUsage();
    process.exit(1);
  }

  try {
    await runFjuAuth(username);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Login failed: ${message}`);
    process.exit(1);
  }
}

void main();
