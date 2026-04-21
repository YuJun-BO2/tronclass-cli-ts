# Announcements Command

The `ann` (or `announcements`) command lets you browse school-wide and course-specific announcements. Content is rendered directly in the terminal with basic formatting (bold, hyperlinks, images).

## Usage

```bash
tronclass ann <subcommand> [options]
```

## Subcommands

### `list [course_id]`

List announcements. Without a `course_id`, shows school-wide bulletins (up to 30). With a `course_id`, shows announcements for that specific course.

```bash
# School-wide announcements
tronclass ann list

# Course-specific announcements
tronclass ann list <course_id>
```

Output is a table with `id`, `title`, `author`, and `date`. Long titles are truncated with `…`.

### `view <ann_id> [course_id]`

Display the full content of an announcement, with HTML rendered in the terminal.

```bash
# View a school-wide announcement
tronclass ann view <ann_id>

# View a course announcement (course_id required for course announcements)
tronclass ann view <ann_id> <course_id>
```

The view shows a metadata table (title, author, date) followed by the rendered body. Supported HTML elements:

| Element | Rendering |
|---------|-----------|
| `<b>`, `<strong>` | Bold text |
| `<i>`, `<em>` | Italic text |
| `<a href="...">` | Clickable hyperlink (OSC 8, supported in most modern terminals) |
| `<img>` | `[圖片]` placeholder, clickable if a `src` URL is present |
| `<ul>` / `<li>` | Bullet list with `•` |
| `<h1>`–`<h6>` | Bold heading |
| `<hr>` | Horizontal rule |

Attachments (uploaded files) are listed at the bottom if present.

## Aliases

`ann` and `announcements` are interchangeable. Subcommand aliases: `l`/`ls` for `list`, `v` for `view`.

## Examples

```bash
# List school-wide announcements
tronclass ann list

# List announcements for course 384102
tronclass ann list 384102

# View school-wide announcement #225
tronclass ann view 225

# View announcement #1251018 in course 384102
tronclass ann view 1251018 384102
```
