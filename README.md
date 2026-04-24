# TronClass CLI (TypeScript)

A modern, fast, and cross-platform command-line interface for the TronClass learning management system.

## Features

- **Unified Authentication**: One login flow for any TronClass deployment, powered by the Tronclass-API SDK (traditional CAS and Keycloak both supported). FJU users get a `--fju` shortcut that presets the base URL. Automation can use `--fju --non-interactive` to defer the CAPTCHA step to a separate `auth captcha` call — the password is supplied only at resume time and never stored on disk. `auth check` reports current session validity by probing an authenticated TronClass API endpoint.
- **Session Persistence**: Saves your login state securely at `~/.tronclass-cli/cookies.json`, so you stay logged in across sessions.
- **Course Management**: List your ongoing or historical courses with customizable fields and filtering.
- **To-Do List**: Quick access to your pending tasks, assignments, and upcoming deadlines.
- **Course Activities**: Browse course modules, view detailed activity metadata, and download course materials.
- **Homework Submission**: Submit multiple files to assignments directly from your terminal with support for draft mode.
- **Announcements**: Browse school-wide and course-specific announcements with HTML rendered directly in the terminal — bold, hyperlinks, images, and lists all supported.
- **Developer Friendly**: Built with TypeScript for type safety and easy maintainability.

## Installation

### Via NPM (Recommended)

Install the CLI globally on your system:
```bash
npm install -g tronclass-cli
```

### From Source

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Link the command to your system (optional):
   ```bash
   npm link
   ```

## Usage

Once installed, use the `tronclass` command from anywhere:

```bash
# Login (prompts for base URL, password, and CAPTCHA if required)
tronclass auth login <your_username>

# FJU shortcut: preset the base URL, so you're only prompted for password + CAPTCHA
tronclass auth login --fju <your_username>

# Check current authentication status
tronclass auth check

# Clear saved session
tronclass auth logout

# List ongoing courses
tronclass courses list

# View upcoming tasks and deadlines
tronclass todo

# List materials for a specific course
tronclass activities list <course_id>

# Download course material
tronclass activities download <ref_id> <output_path>

# List school-wide announcements
tronclass ann list

# List announcements for a specific course
tronclass ann list <course_id>

# View full announcement content (HTML rendered in terminal)
tronclass ann view <ann_id> [course_id]
```

For more detailed usage, please refer to the [Documentation](./docs/index.md).

## Future Goals

- Support for more universities beyond FJU.
- Grades and exam score viewing.
- Attendance / roll call submission.
- Interactive course browsing mode.
- Integration with local file systems for automatic course material syncing.

## Acknowledgments

This project is built on top of the powerful [Tronclass-API](https://github.com/seven-317/Tronclass-API) SDK, which provides robust API interactions, type safety, rate limiting, and authentication handling. 

* Powered by Tronclass-API: Copyright (c) 2026 Seven317 (MIT License)

*(Note: Earlier versions of this CLI were inspired by the original Python implementation of the `tronclass-cli` created by Howyoung. We retain deep appreciation for their pioneering work on API endpoints and data structure logic.)*

## License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for details.
