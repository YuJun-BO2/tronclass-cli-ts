# Auth Command

The `auth` command is used to authenticate your account with TronClass and manage your saved session.

## Usage

```bash
tronclass auth <subcommand> [options]
```

## Subcommands

### `login [--fju] [--password <p>] [--base-url <u>] <username>`

Authenticate with TronClass. Logins go through the TronClass API SDK, which
automatically handles the school's CAS / Keycloak flow and CAPTCHA
requirements.

**Interactive login** — default, for human users:

```bash
# Prompts for base URL, password, and CAPTCHA (if required)
tronclass auth login <your_username>

# FJU students: --fju presets the base URL so you only get prompted for
# password and CAPTCHA
tronclass auth login --fju <your_username>
```

When the school's login page requires a CAPTCHA, the CLI downloads the
image, opens it with your system's default image viewer, and prompts you
to type the code.

**Non-interactive login** — for scripts / automation:

```bash
# Generic: supply base URL and password up front
tronclass auth login --password 'my_password' --base-url https://elearn.example.edu.tw <your_username>

# FJU: --fju implies the FJU base URL
tronclass auth login --fju --password 'my_password' <your_username>
```

Because CAPTCHAs can't be solved without a human in the loop, the FJU
non-interactive flow **defers the CAPTCHA step**:

1. The CLI parses the login form, downloads the CAPTCHA image, saves the
   pending-login state (username, password, form tokens, cookies), and
   opens the image with your default viewer.
2. It prints a **captcha ID** and exits successfully (exit code 0).
3. You (or a supervising user) read the code from the image and complete
   the login with `tronclass auth captcha <id> <code>`.

Pending-login state is stored in `~/.tronclass-cli/pending-captcha/<id>.json`
(mode `0600`) and expires after 10 minutes.

> The non-interactive deferred-CAPTCHA flow is implemented only for
> `--fju`. If you use `--password` with `--base-url` against a school that
> requires a CAPTCHA, the login will fail — run the interactive form
> instead.

**Flags:**

| Flag | Description |
|---|---|
| `--fju` | Preset the base URL to `https://elearn2.fju.edu.tw` (skip the base-URL prompt). |
| `--password <p>` | Supply the password non-interactively. Required for deferred CAPTCHA flow. |
| `--base-url <u>` | Supply the base URL non-interactively. Mutually exclusive with `--fju`. |

*(If running locally via npm)*:
```bash
npm run dev -- auth login [--fju] <username>
```

#### Behavior summary

1. **Interactive** — prompts fill in whatever wasn't passed on the command
   line (base URL, password, CAPTCHA). Powered by the
   [Tronclass-API](https://github.com/seven-317/Tronclass-API) SDK, so
   both traditional CAS and Keycloak flows are supported.
2. **Session saving** — on success, session cookies and account info
   (username, student ID, base URL, school tag) are saved to
   `~/.tronclass-cli/` for reuse by subsequent commands.
3. **FJU deferred-CAPTCHA** — only when `--fju --password` is used. The
   CLI stores the login in `pending-captcha/<id>.json`, prints the
   captcha ID, and exits 0. `auth captcha <id> <code>` finishes it.

---

### `captcha <id> <code>`

Complete a pending FJU login that was paused on a CAPTCHA challenge.
`<id>` is the value printed by the previous `auth login --fju --password`
invocation; `<code>` is the CAPTCHA characters you read from the saved
image.

```bash
tronclass auth captcha abc123def456 3xyz
```

On success, the pending-login state file and the saved CAPTCHA image are
removed and the session is saved normally. On failure (wrong code,
expired state, etc.) the command exits non-zero; re-run `auth login` to
start over.

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

Login as an FJU student (interactive, prompt for password + CAPTCHA):
```bash
tronclass auth login --fju 409123456
```

Login to a custom TronClass deployment (interactive, prompt for base URL + password):
```bash
tronclass auth login myusername
```

Non-interactive FJU login (deferred CAPTCHA):
```bash
tronclass auth login --fju --password 'secret' 409123456
# ... the CLI opens the captcha image and prints:
#   Captcha ID: abc123def456
#   To complete login, run:
#     tronclass auth captcha abc123def456 <code>
tronclass auth captcha abc123def456 3xyz
```

Non-interactive generic login (no CAPTCHA required):
```bash
tronclass auth login --password 'secret' --base-url https://elearn.example.edu.tw myusername
```

Check current login status:
```bash
tronclass auth check
```

Log out and clear the session:
```bash
tronclass auth logout
```
