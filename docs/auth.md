# Auth Command

The `auth` command is used to authenticate your account with TronClass and manage your saved session.

## Usage

```bash
tronclass auth <subcommand> [options]
```

## Subcommands

### `login <username>`

Supported forms:

```bash
# Interactive or password-supplied login
tronclass auth login [--fju] [--password <p>] [--base-url <u>] <username>

# Deferred-CAPTCHA flow (FJU only)
tronclass auth login --fju --non-interactive <username>
```

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

**Non-interactive login (no CAPTCHA)** — for scripts / automation against
deployments that don't serve a CAPTCHA:

```bash
tronclass auth login --password 'my_password' --base-url https://elearn.example.edu.tw <your_username>
```

**Non-interactive FJU login (deferred CAPTCHA)** — for agents / scripts
targeting FJU, where the login page always serves a CAPTCHA that a human
needs to solve:

```bash
# Step 1: parse the form, download the captcha image, save pending state.
# Exits 0 and prints a captcha ID. No password is stored on disk.
tronclass auth login --fju --non-interactive <your_username>

# Step 2: supply the password and the captcha code to complete the login.
tronclass auth captcha --password '<password>' <captcha_id> <code>
```

The pending-login state is stored at
`~/.tronclass-cli/pending-captcha/<id>.json` (mode `0600`) and expires
after 10 minutes. The password is **never** persisted — it is supplied
only at resume time and used exactly once.

**Flags:**

| Flag | Description |
|---|---|
| `--fju` | Preset the base URL to `https://elearn2.fju.edu.tw` (skip the base-URL prompt). |
| `--non-interactive` | Defer the CAPTCHA step so the password can be supplied at resume time. Requires `--fju`, and cannot be combined with `--password` on `auth login`. |
| `--password <p>` | Supply the password non-interactively for regular login. In deferred-CAPTCHA flow, use it with `auth captcha` (not with `auth login --non-interactive`). |
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
3. **Deferred-CAPTCHA (FJU only)** — triggered by `--fju --non-interactive`.
   The form is parsed and the captcha image is downloaded, but the
   password is not requested. A captcha ID is printed; the caller passes
   the password and the solved code to `auth captcha`.

---

### `captcha --password <p> <id> <code>`

Complete a pending FJU login that was paused on a CAPTCHA challenge.
`<id>` is the value printed by the previous
`auth login --fju --non-interactive` invocation; `<code>` is the CAPTCHA
characters you read from the saved image; `<p>` is the user's password
(not stored from the previous step).

```bash
tronclass auth captcha --password 'my_password' abc123def456 3xyz
```

On success, the pending-login state file and the saved CAPTCHA image are
removed and the session is saved normally. On failure (wrong code,
expired state, etc.) the pending state is also cleared (the CAS
`execution` token is single-use) and the error message instructs you to
re-run `auth login`.

---

### `check`

Display authentication status in a formatted table. Validity is determined by
making a live request to an authenticated TronClass API endpoint and inspecting
the response: `200` is treated as **Valid**, `401`/`403` (or a redirect to the
CAS login page) as **Expired**, and anything else as **Unknown**.

The cookie value's embedded timestamp is **not** used to estimate an expiry —
its semantics are not specified by the upstream SDK or server, and TronClass
appears to use a server-side sliding TTL that any client-side estimate cannot
see. **Login Time** comes from the cookie's creation time and is informational
only.

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
└────────────┴─────────────────────────────┘
```

When the probe cannot reach the server (e.g. no network) or the response is
neither a success nor an explicit auth failure, the **Status** field shows
`● Unknown` and a `Probe` row is added with a short reason (HTTP code or error
message).

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

Non-interactive FJU login (deferred CAPTCHA — for agents):
```bash
tronclass auth login --fju --non-interactive 409123456
# ... the CLI opens the captcha image and prints:
#   Captcha ID: abc123def456
#   To complete login, run:
#     tronclass auth captcha --password <password> abc123def456 <code>
tronclass auth captcha --password 'secret' abc123def456 3xyz
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
