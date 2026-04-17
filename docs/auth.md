# Auth Command

The `auth` command is used to authenticate your account with the FJU CAS (Central Authentication Service) system and establish a session with TronClass.

## Usage

```bash
tronclass auth -login <username>
```

*(If running locally via npm)*:
```bash
npm run dev -- auth -login <username>
```

## How it works

1.  **Session Restoration**: The command will first check if you have a valid, unexpired session saved locally (in `~/.tronclass-cli/cookies.json`). If you do, it will restore the session and you won't need to enter your password again.
2.  **Interactive Login**: If no valid session is found, it will prompt you for your password.
3.  **CAPTCHA Handling**: If the FJU login system requires a CAPTCHA, the CLI will automatically download the CAPTCHA image, attempt to open it using your system's default image viewer, and prompt you to enter the characters.
4.  **Session Saving**: Upon successful login, the session cookies are saved locally so subsequent commands (like `courses` or `todo`) can be used without re-authenticating.

## Examples

Login with a student ID:
```bash
tronclass auth -login 409123456
```
