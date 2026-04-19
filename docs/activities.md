# Activities Command

The `activities` command allows you to view and download course materials, modules, and resources (collectively known as activities in TronClass).

## Usage

```bash
tronclass activities <subcommand> [options]
```

### Aliases
You can use `a` instead of `activities`.

## Subcommands

### `list <course_id>`
List all activities available for a specific course, displayed as a formatted table.

```bash
tronclass activities list 123456
```

**Options:**
*   `--fields <field1>,<field2>...`: Customize fields. Default: `id,title,type,status,end_time`.

---

### `view <activity_id>`
View detailed information for a specific activity in a formatted layout, including metadata, description, and a numbered attachments table with clickable download links.

```bash
tronclass activities view 987654
```

The output includes:
- **Metadata table**: id, title, type, status (color-coded), deadline (color-coded by urgency)
- **Description**: HTML stripped and word-wrapped to terminal width
- **Attachments table**: filename (clickable OSC 8 hyperlink in supported terminals), `ref_id`, and file size, followed by the ready-to-run download command

**Options:**
*   `--fields <field1>,<field2>...`: Display specific fields as a key-value table instead of the default layout. Default: `id,title,type,data,deadline,uploads`.

---

### `download <reference_id> [output_file]`
Download a file associated with an activity. The `reference_id` is shown in the **Attachments** table of `activities view`.

```bash
# Save to ~/Downloads/<filename> (default)
tronclass activities download 12345

# Save to a specific path
tronclass activities download 12345 ./downloads/my_file.pdf
```

If `output_file` is omitted, the filename is taken from the server response and the file is saved to `~/Downloads/`.

**Options:**
*   `--preview`: Download the preview version of the file (if available) instead of the original.

---

## Workflow Example
1. List courses to find the `course_id`:
   ```bash
   tronclass courses list
   ```
2. List activities for that course to find the `activity_id`:
   ```bash
   tronclass activities list <course_id>
   ```
3. View the activity to see attachments and their `ref_id`:
   ```bash
   tronclass activities view <activity_id>
   ```
4. Download a file (saved to `~/Downloads/` by default):
   ```bash
   tronclass activities download <ref_id>
   ```
