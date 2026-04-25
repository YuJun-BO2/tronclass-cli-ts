# Homework Command

The `homework` command lets you list, inspect, and submit homework — including reading the prompt, downloading teacher attachments, and reviewing your own past submissions or saved drafts directly from the terminal.

## Usage

```bash
tronclass homework <subcommand> [options]
```

### Aliases
You can use `h` or `hw` instead of `homework`.

## Subcommands

### `list <course_id>`
List all homework assignments for a specific course.

```bash
tronclass homework list 123456
```

**Options:**
*   `--fields <field1>,<field2>...`: Customize fields to display. Default: `id,title,deadline,status,score`.

---

### `view <activity_id>`
View a single homework's full details and your own submission/draft state. Aliased as `v`.

```bash
tronclass homework view 987654
tronclass hw v 987654          # alias form
```

The output includes:
- **Metadata table**: id, title, type, status (`已繳交` / `草稿` / `未繳` / `待繳交`, color-coded), deadline (color-coded by urgency), and score if graded
- **Description**: the assignment prompt, with HTML rendered inline (bold, lists, hyperlinks)
- **Attachments**: teacher-provided files with `ref_id` and clickable OSC 8 download hyperlinks — feed the `ref_id` to `tronclass activities download` to save locally
- **My Submission**: state (`已繳交` / `草稿` / `(尚未繳交也未儲存草稿)`), submission time, score and instructor feedback if available, your own comment, and the files you uploaded with their download URLs. Displayed as `Submitted Files` for finalized submissions and `Draft Files` for saved drafts

**Options:**
*   `--raw`: Print the raw JSON payloads from each underlying endpoint (activity body, homework list match, submission list, and the resolved `user_id`). Useful for debugging on tenants where the rendered output looks wrong.

---

### `submit <activity_id> <files...>`
Submit one or more files for a specific homework assignment.

```bash
tronclass homework submit 987654 ./my_essay.pdf ./code.zip
```

**Options:**
*   `--draft`: Submit the assignment as a draft, allowing you to edit or replace it later. Use `homework view` to inspect what's in the draft.

## Workflow Example
1. Find your `course_id` by listing courses:
   ```bash
   tronclass courses list
   ```
2. Find the homework `activity_id` for that course:
   ```bash
   tronclass homework list <course_id>
   ```
3. Read the prompt and any teacher attachments before starting:
   ```bash
   tronclass homework view <activity_id>
   ```
4. Save a draft first so you can iterate:
   ```bash
   tronclass homework submit <activity_id> ./homework.pdf --draft
   ```
5. Verify what you saved:
   ```bash
   tronclass homework view <activity_id>
   ```
6. When you're ready, submit for real (without `--draft`):
   ```bash
   tronclass homework submit <activity_id> ./homework.pdf
   ```
