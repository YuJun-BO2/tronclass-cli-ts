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
List all activities available for a specific course.

```bash
tronclass activities list 123456
```

**Options:**
*   `--fields <field1>,<field2>...`: Customize fields. Default: `id,title,type,status,end_time`.

### `view <activity_id>`
View detailed metadata for a specific activity (e.g., finding the `reference_id` to download a file). This outputs raw JSON data of the activity.

```bash
tronclass activities view 987654
```

**Options:**
*   `--fields <field1>,<field2>...`: Customize fields. Default: `id,title,type,data,deadline,uploads`.

### `download <reference_id> <output_file>`
Download a file associated with an activity. You typically find the `reference_id` by using the `view` subcommand and looking inside the `uploads` array.

```bash
tronclass activities download 12345 ./downloads/my_file.pdf
```

**Options:**
*   `--preview`: Download the preview version of the file (if available) instead of the original.

## Workflow Example
1. List courses to find the `course_id`:
   ```bash
   tronclass courses list
   ```
2. List activities for that course to find the `activity_id`:
   ```bash
   tronclass activities list <course_id>
   ```
3. View the activity details to find the `reference_id` in the `uploads` section:
   ```bash
   tronclass activities view <activity_id>
   ```
4. Download the file using the `reference_id`:
   ```bash
   tronclass activities download <reference_id> ./course_material.pdf
   ```
