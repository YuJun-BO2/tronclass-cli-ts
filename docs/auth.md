# Auth Command

The `auth` command is used to authenticate your account with TronClass and manage your saved session.

## Usage

```bash
tronclass auth <subcommand> [options]
```

## Subcommands

### `login [--fju] <username>`

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

*(If running locally via npm)*:
```bash
npm run dev -- auth login [--fju] <username>
```

#### How the FJU CAS flow works

1. **Session Restoration**: If a valid session already exists for the same username, it is restored automatically without re-entering credentials.
2. **Interactive Login**: If no valid session is found, you will be prompted for your password.
3. **CAPTCHA Handling**: If the FJU login system requires a CAPTCHA, the CLI will automatically download the image, attempt to open it with your system's default image viewer, and prompt you to enter the characters.
4. **Session Saving**: Upon successful login, session cookies and account info (username, student ID, base URL) are saved to `~/.tronclass-cli/` for use by subsequent commands.

---

### `check`

Display the current authentication status, including the logged-in username, student ID, base URL, and whether session cookies are present.

```bash
tronclass auth check
```

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

Check current login status:
```bash
tronclass auth check
```

Log out and clear the session:
```bash
tronclass auth logout
```
