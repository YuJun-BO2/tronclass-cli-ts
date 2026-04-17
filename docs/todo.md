# Todo Command

The `todo` command allows you to quickly view your pending tasks, assignments, and upcoming deadlines on TronClass.

## Usage

```bash
tronclass todo [options]
```

### Aliases
You can use short aliases for convenience:
*   `tronclass t`
*   `tronclass td`

*(If running locally via npm)*:
```bash
npm run dev -- todo [options]
```

## Options

### `--fields <field1>,<field2>,...`
Customize the columns displayed in the output table. 

*   **Default fields**: `course_name,title,end_time`

**Example**: View the course ID, the task title, and the type of task.
```bash
tronclass todo --fields course_id,title,type
```
