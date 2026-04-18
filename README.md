# TronClass CLI (TypeScript)

A modern, fast, and cross-platform command-line interface for the TronClass learning management system.

## Features

- **Robust Authentication**: Seamlessly handles FJU CAS login, including automatic session restoration and interactive CAPTCHA detection.
- **Session Persistence**: Saves your login state securely at `~/.tronclass-cli/cookies.json`, so you stay logged in across sessions.
- **Course Management**: List your ongoing or historical courses with customizable fields and filtering.
- **To-Do List**: Quick access to your pending tasks, assignments, and upcoming deadlines.
- **Course Activities**: Browse course modules, view detailed activity metadata, and download course materials.
- **Homework Submission**: Submit multiple files to assignments directly from your terminal with support for draft mode.
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
# Login to your account
tronclass auth login <your_username>

# List ongoing courses
tronclass courses list

# View upcoming tasks and deadlines
tronclass todo

# List materials for a specific course
tronclass activities list <course_id>

# Download course material
tronclass activities download <ref_id> <output_path>
```

For more detailed usage, please refer to the [Documentation](./docs/index.md).

## Future Goals

- Support for more universities beyond FJU.
- Interactive course browsing mode.
- Notification system for new assignments or announcements.
- Integration with local file systems for automatic course material syncing.

## Acknowledgments

This project is heavily inspired by the original Python implementation of the [tronclass-cli](https://github.com/Howyoung/tronclass-cli) created by Howyoung. The API interaction patterns, command structures, and data flattening logic (such as `unflattenFields`) were ported from their work. 

* Copyright (c) 2020 Howyoung (MIT License)

Recent optimizations for API endpoint discovery (e.g., fetching courses) were inspired by the [Tronclass-API](https://github.com/Seven317/Tronclass-API) project.

* Copyright (c) 2026 Seven317 (MIT License)

## License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for details.
