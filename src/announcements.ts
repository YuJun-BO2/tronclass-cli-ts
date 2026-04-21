import { initApi } from "./lib/client";
import { apiError } from "./lib/utils";
import { bold, gry, renderKVTable, renderTable, dispWidth } from "./lib/ui";
import { renderHtml } from "./lib/html";

const DATE_COL_W = 20;
const AUTHOR_COL_W = 12;

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { hour12: false });
}

function titleColWidth(): number {
  const termW = Math.min(process.stdout.columns || 80, 140);
  // id(6) + author(AUTHOR_COL_W) + date(DATE_COL_W) + separators(4*3+4*2) = ~50
  return Math.max(20, termW - 6 - AUTHOR_COL_W - DATE_COL_W - 20);
}

export async function runAnnouncementsList(courseId?: string): Promise<void> {
  const { api } = await initApi();

  let items: any[];
  try {
    items = courseId
      ? await api.announcements.getCourseAnnouncements(Number(courseId))
      : await api.announcements.getAnnouncements(1, 30);
  } catch (error) {
    throw apiError(
      courseId ? `Failed to fetch announcements for course ${courseId}` : "Failed to fetch announcements",
      error,
    );
  }

  if (!items.length) {
    console.log("No announcements.");
    return;
  }

  const titleW = titleColWidth();
  renderTable(
    items.map((a) => ({
      id:     String(a.id),
      title:  a.title ?? "—",
      author: a.created_by?.name ?? "—",
      date:   formatDate(a.created_at),
    })),
    [
      { key: "id",     label: "ID",     width: 10 },
      { key: "title",  label: "Title",  width: titleW },
      { key: "author", label: "Author", width: AUTHOR_COL_W },
      { key: "date",   label: "Date",   width: DATE_COL_W },
    ],
  );
}

export async function runAnnouncementsView(annId: string, courseId?: string): Promise<void> {
  const { api } = await initApi();

  let ann: any | undefined;
  try {
    if (courseId) {
      const items = await api.announcements.getCourseAnnouncements(Number(courseId));
      ann = items.find((a: any) => String(a.id) === annId);
    } else {
      // search through pages until found
      for (let page = 1; page <= 5; page++) {
        const items = await api.announcements.getAnnouncements(page, 30);
        ann = items.find((a: any) => String(a.id) === annId);
        if (ann || items.length === 0) break;
      }
    }
  } catch (error) {
    throw apiError(`Failed to fetch announcement ${annId}`, error);
  }

  if (!ann) {
    console.log(`Announcement ${annId} not found.`);
    return;
  }

  renderKVTable({
    "Title":  bold(ann.title ?? "—"),
    "Author": ann.created_by?.name ?? "—",
    "Date":   formatDate(ann.created_at),
    ...(ann.updated_at && ann.updated_at !== ann.created_at
      ? { "Updated": formatDate(ann.updated_at) }
      : {}),
  });

  if (ann.content) {
    console.log();
    console.log(renderHtml(ann.content));
  }

  const uploads: any[] = Array.isArray(ann.uploads) ? ann.uploads : [];
  if (uploads.length) {
    console.log();
    console.log(bold(`Attachments`) + gry(` (${uploads.length} files)`));
    uploads.forEach((u, i) => {
      const name = u.filename ?? u.name ?? u.original_filename ?? "unknown";
      console.log(`  ${gry(String(i))}  ${name}`);
    });
  }
}
