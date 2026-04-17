# Homework Command

The `homework` command allows you to view the list of homework for a specific course and submit your files.

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

### `submit <activity_id> <files...>`
Submit one or more files for a specific homework assignment.

```bash
tronclass homework submit 987654 ./my_essay.pdf ./code.zip
```

**Options:**
*   `--draft`: Submit the assignment as a draft, allowing you to edit or replace it later on the TronClass web interface.

## Workflow Example
1. Find your `course_id` by listing courses:
   ```bash
   tronclass courses list
   ```
2. Find the homework `activity_id` for that course:
   ```bash
   tronclass homework list <course_id>
   ```
3. Submit your files to that activity ID:
   ```bash
   tronclass homework submit <activity_id> ./homework.pdf
   ```
