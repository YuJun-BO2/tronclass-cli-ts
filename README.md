# tronclass-cli-ts

A minimal TypeScript CLI focused on FJU authentication only.

## Usage

auth -login <username>

No provider argument is required.

## Local run

1. npm install
2. npm run build
3. npm exec -- auth -login <username>

Note: `-login` starts with `-`, so npm may parse it as npm options unless you put `--` before the command arguments.

During login, the CLI will:
- prompt for password
- detect captcha when required
- download and try to open captcha image automatically
- prompt for captcha input
