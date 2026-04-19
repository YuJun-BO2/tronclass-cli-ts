# TronClass CLI (TypeScript)

Welcome to the documentation for **TronClass CLI (TypeScript)**, a comprehensive command-line interface for the TronClass learning management system.

## Overview

This tool provides a powerful alternative to the TronClass web interface, allowing you to manage your courses, tasks, and materials directly from your terminal. It supports both a generic API login flow (compatible with any TronClass deployment) and an FJU-specific CAS flow with interactive CAPTCHA handling.

## Available Commands

Here is a quick overview of the available commands. Click on each command for more detailed documentation.

*   **[auth](./auth.md)**: Authenticate with TronClass (generic API or FJU CAS), check status, and manage your session.
*   **[courses](./courses.md)**: View your course list, filter by ongoing courses, and extract detailed course information.
*   **[todo](./todo.md)**: View your current to-do list and upcoming deadlines.
*   **[activities](./activities.md)**: View and download course materials and activities.
*   **[homework](./homework.md)**: View homework lists and submit files to assignments.

## Installation

The easiest way to get started is to install the package globally via npm:

```bash
npm install -g tronclass-cli
```

## Getting Started

Once installed, you can use the `tronclass` command directly from your terminal:

```bash
# Login (generic API flow, works with any TronClass deployment)
tronclass auth login <your_username>

# Login using FJU CAS flow (with CAPTCHA support)
tronclass auth login --fju <your_student_id>
```

### Development Setup

If you are running the tool locally from the source code, you can execute commands using `npm run dev --` followed by the command:

```bash
npm install
npm run dev -- auth login [--fju] <your_username>
```
