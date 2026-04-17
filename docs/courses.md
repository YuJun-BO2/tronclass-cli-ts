# Courses Command

The `courses` command allows you to view and filter your TronClass course list.

## Usage

```bash
tronclass courses list [options]
```

### Aliases
You can use short aliases for convenience:
*   `tronclass c list`
*   `tronclass c l`
*   `tronclass c ls`

*(If running locally via npm)*:
```bash
npm run dev -- courses list [options]
```

## Options

### `--all`
By default, the `courses list` command only shows **ongoing** courses (courses where the current date falls between the course's `start_date` and `end_date`). Use the `--all` flag to show all historical and future courses associated with your account.

```bash
tronclass courses list --all
```

### `--fields <field1>,<field2>,...`
Customize the columns displayed in the output table. The tool handles nested JSON fields automatically using dot notation. 

*   **Default fields**: `id,name,instructors.name`

**Example**: View course ID, name, credit, and department name.
```bash
tronclass courses list --fields id,name,credit,department.name
```

### `--raw`
Print the raw JSON response directly from the TronClass API instead of formatting it into a table. This is highly useful for discovering new fields that you can use with the `--fields` option.

```bash
tronclass courses list --raw
```

You can combine `--raw` with `--all` to dump the JSON data for all courses:
```bash
tronclass courses list --all --raw
```
