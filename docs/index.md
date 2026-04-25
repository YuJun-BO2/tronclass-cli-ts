# TronClass CLI (TypeScript)

Welcome to the documentation for **TronClass CLI (TypeScript)**, a comprehensive command-line interface for the TronClass learning management system.

## Overview

This tool provides a powerful alternative to the TronClass web interface, allowing you to manage your courses, tasks, and materials directly from your terminal. It supports any TronClass deployment through a single unified login flow, and offers a `--fju` shortcut that presets the base URL for Fu Jen Catholic University users.

## Available Commands

Here is a quick overview of the available commands. Click on each command for more detailed documentation.

*   **[auth](./auth.md)**: Authenticate with TronClass, check status, and manage your session. Handles CAPTCHA interactively; supports a deferred-CAPTCHA flow for automated FJU logins.
*   **[courses](./courses.md)**: View your course list, filter by ongoing courses, and extract detailed course information.
*   **[todo](./todo.md)**: View your current to-do list and upcoming deadlines.
*   **[activities](./activities.md)**: View and download course materials and activities.
*   **[homework](./homework.md)**: List homework, view a single assignment's prompt and your own submission/draft contents, and submit files.
*   **[announcements](./announcements.md)**: Browse school-wide and course-specific announcements with terminal HTML rendering.

## Installation

The easiest way to get started is to install the package globally via npm:

```bash
npm install -g tronclass-cli
```

## Getting Started

Once installed, you can use the `tronclass` command directly from your terminal:

```bash
# Login (prompts for base URL, password, and CAPTCHA if required)
tronclass auth login <your_username>

# FJU shortcut: presets the base URL
tronclass auth login --fju <your_student_id>
```

### Development Setup

If you are running the tool locally from the source code, you can execute commands using `npm run dev --` followed by the command:

```bash
npm install
npm run dev -- auth login [--fju] <your_username>
```
