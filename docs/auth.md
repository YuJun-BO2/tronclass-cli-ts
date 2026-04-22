# Auth Command

The `auth` command is used to authenticate your account with TronClass and manage your saved session.

## Usage

```bash
tronclass auth <subcommand> [options]
```

## Subcommands

### `login [--fju] [--password <p>] [--base-url <u>] <username>`

Authenticate with TronClass. Two login flows are supported:

**Generic API flow** (default — works with any TronClass deployment):
```bash
tronclass auth login <your_username>
```
You will be prompted for your school's TronClass base URL and your password. The CLI uses the TronClass API SDK to authenticate directly.

**FJU CAS flow** (for Fu Jen Catholic University):
```bash
tronclass auth login --fju <your_username>
```
Uses FJU's Central Authentication Service (CAS), with support for interactive CAPTCHA handling.

**Non-interactive login** (pass credentials via flags, no prompts):
```bash
# Generic flow
tronclass auth login --password 'my_password' --base-url https://elearn2.example.edu.tw <your_username>

# FJU CAS flow
tronclass auth login --fju --password 'my_password' <your_username>
```

If the FJU flow requires a CAPTCHA during a non-interactive login, the command saves a
pending-login state, prints a **captcha ID**, and exits successfully. Complete the
login by solving the CAPTCHA image and running:

```bash
tronclass auth captcha <id> <code>
```

Pending captchas are stored in `~/.tronclass-cli/pending-captcha/<id>.json` (mode `0600`)
and expire after 10 minutes.

*(If running locally via npm)*:
```bash
npm run dev -- auth login [--fju] <username>
```

#### How the FJU CAS flow works

1. **Session Restoration**: If a valid session already exists for the same username, it is restored automatically without re-entering credentials.
2. **Interactive Login**: If no valid session is found and no `--password` flag is passed, you will be prompted for your password.
3. **CAPTCHA Handling**:
   - *Interactive:* The CLI downloads the CAPTCHA image, opens it with your system's default image viewer, and prompts you for the characters.
   - *Non-interactive* (`--password` supplied): The CLI downloads the CAPTCHA image, prints the path and a unique **captcha ID**, and exits. Complete the login with `tronclass auth captcha <id> <code>`.
4. **Session Saving**: Upon successful login, session cookies and account info (username, student ID, base URL) are saved to `~/.tronclass-cli/` for use by subsequent commands.

---

### `captcha <id> <code>`

Complete a pending login that was paused on a CAPTCHA challenge. `<id>` is the value
printed by a previous `auth login` invocation; `<code>` is the CAPTCHA characters you
read from the saved image.

```bash
tronclass auth captcha abc123def456 3xyz
```

On success, the pending-captcha state file and saved CAPTCHA image are removed and the
session is saved normally. On failure (wrong code, expired state, etc.) the command
exits non-zero; re-run `auth login` to start over.

---

### `check`

Display detailed authentication status in a formatted table, including login time, expiry, and time remaining.

```bash
tronclass auth check
```

Example output:

```
┌────────────┬─────────────────────────────┐
│ Status     │ ● Valid                     │
│ User       │ 412242266                   │
│ Student ID │ 452378                      │
│ Base URL   │ https://elearn2.fju.edu.tw  │
│ School     │ fju                         │
│ Login Time │ 2026/4/21 03:12:05          │
│ Expires At │ 2026/4/22 03:12:06          │
│ Remaining  │ 14 小時 30 分鐘             │
└────────────┴─────────────────────────────┘
```

The **Remaining** field is color-coded: green (>24 h), yellow (<24 h), red (<1 h or expired). Sessions last 24 hours from login.

---

### `logout`

Clear the saved session cookies and configuration.

```bash
tronclass auth logout
```

---

## Examples

Login with FJU student ID (FJU CAS flow):
```bash
tronclass auth login --fju 409123456
```

Login with a generic TronClass account:
```bash
tronclass auth login myusername
```

Non-interactive login, FJU CAS:
```bash
tronclass auth login --fju --password 'secret' 409123456
# If output prints "Captcha ID: abc123def456", then:
tronclass auth captcha abc123def456 3xyz
```

Non-interactive login, generic:
```bash
tronclass auth login --password 'secret' --base-url https://elearn2.example.edu.tw myusername
```

Check current login status:
```bash
tronclass auth check
```

Log out and clear the session:
```bash
tronclass auth logout
```
