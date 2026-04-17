# TronClass CLI (TypeScript)

Welcome to the documentation for **TronClass CLI (TypeScript)**, a command-line interface designed specifically for interacting with the FJU TronClass system.

## Overview

This tool allows you to authenticate with FJU's CAS system, save your session, and interact with TronClass APIs directly from your terminal.

## Available Commands

Here is a quick overview of the available commands. Click on each command for more detailed documentation.

*   **[auth](./auth.md)**: Authenticate with the FJU CAS system and save your session.
*   **[courses](./courses.md)**: View your course list, filter by ongoing courses, and extract detailed course information.
*   **[todo](./todo.md)**: View your current to-do list and upcoming deadlines.
*   **[activities](./activities.md)**: View and download course materials and activities.

## Getting Started (Development)

If you are running the tool locally from the source code, you can execute commands using `npm run dev --` followed by the command:

```bash
npm install
npm run dev -- auth -login <your_student_id>
```

If the package is installed globally (e.g., via `npm link` or `npm install -g`), you can use the `tronclass` command directly:

```bash
tronclass auth -login <your_student_id>
```
