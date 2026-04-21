// ── ANSI colors (no external deps) ───────────────────────────────────────────

export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const red  = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const grn  = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const ylw  = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const cyn  = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const gry  = (s: string) => `\x1b[37m${s}\x1b[0m`;

// OSC 8 hyperlink — clickable in iTerm2, GNOME Terminal, Windows Terminal, etc.
export function hyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

// ── Width helpers (ANSI + CJK aware) ─────────────────────────────────────────

export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;]*m/g, "")           // CSI color codes
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, ""); // OSC 8 hyperlink markers
}

export function dispWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0) ?? 0;
    // Zero-width: ZWJ and variation selectors
    if (cp === 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F)) continue;
    const wide =
      // CJK
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2E80 && cp <= 0x303E) ||
      (cp >= 0x3040 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7AF) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||
      // Misc symbols, dingbats (⛔ ✨ etc.)
      (cp >= 0x2600 && cp <= 0x27BF) ||
      // Emoji (😎 etc.)
      (cp >= 0x1F000 && cp <= 0x1FAFF);
    w += wide ? 2 : 1;
  }
  return w;
}

export function padEndV(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - dispWidth(s)));
}

export function wrapByWidth(text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = "", curW = 0;
  for (const ch of text) {
    const cw = dispWidth(ch);
    if (curW + cw > maxW) { lines.push(cur); cur = ch; curW = cw; }
    else { cur += ch; curW += cw; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// ── Table renderers ───────────────────────────────────────────────────────────

export function renderKVTable(data: Record<string, string>): void {
  const termW = Math.min(process.stdout.columns || 80, 120);
  const keys  = Object.keys(data);
  const keyW  = Math.max(...keys.map((k) => dispWidth(k)), 7);
  const valW  = Math.max(20, termW - keyW - 7);

  const hr = (l: string, m: string, r: string) =>
    gry(`${l}${"─".repeat(keyW + 2)}${m}${"─".repeat(valW + 2)}${r}`);

  console.log(hr("┌", "┬", "┐"));

  for (const key of keys) {
    const rawVal   = data[key] ?? "";
    const rawPlain = stripAnsi(rawVal);
    const lines = rawVal !== rawPlain ? [rawVal] : wrapByWidth(rawPlain, valW);
    for (let i = 0; i < lines.length; i++) {
      const k = padEndV(i === 0 ? gry(key) : "", keyW);
      console.log(`${gry("│")} ${k} ${gry("│")} ${padEndV(lines[i], valW)} ${gry("│")}`);
    }
  }

  console.log(hr("└", "┴", "┘"));
}

export interface ColDef {
  key: string;
  label: string;
  width: number;
}

// Converts a raw field name to a human-readable column label.
// "end_time" → "End Time", "instructors.name" → "Instructors", "id" → "ID"
export function humanizeField(field: string): string {
  const part   = field.split(".")[0];
  const spaced = part.replace(/_/g, " ");
  const titled = spaced.replace(/\b\w/g, c => c.toUpperCase());
  if (titled === "Id") return "ID";
  return titled;
}

// Auto-sizes columns from content, fits to terminal width, then renders.
// labels defaults to fields when omitted.
export function autoRenderTable(
  rows: Record<string, string>[],
  fields: string[],
  labels: string[] = fields,
): void {
  if (!rows.length) return;

  const termW   = Math.min(process.stdout.columns || 80, 160);
  const overhead = 1 + fields.length * 3; // │ + (space val space │) per col

  // Natural width: max(header, widest cell), capped at 40
  const widths = fields.map((f, i) => {
    const hW = dispWidth(labels[i] ?? f);
    const cW = rows.reduce((m, r) => Math.max(m, dispWidth(stripAnsi(String(r[f] ?? "")))), 0);
    return Math.min(Math.max(hW, cW), 40);
  });

  // Shrink the widest column one unit at a time until it fits
  let total = overhead + widths.reduce((a, b) => a + b, 0);
  while (total > termW) {
    const max = Math.max(...widths);
    if (max <= 4) break;
    widths[widths.lastIndexOf(max)]--;
    total--;
  }

  renderTable(rows, fields.map((f, i) => ({ key: f, label: labels[i] ?? f, width: widths[i] })));
}

function truncByWidth(s: string, maxW: number): string {
  let w = 0;
  let out = "";
  for (const ch of s) {
    const cw = dispWidth(ch);
    if (w + cw > maxW - 1) return out + "…";
    out += ch;
    w += cw;
  }
  return s;
}

export function renderTable(rows: Record<string, string>[], cols: ColDef[]): void {
  const hr = (l: string, m: string, r: string) =>
    gry(l + cols.map((c) => "─".repeat(c.width + 2)).join(m) + r);

  console.log(hr("┌", "┬", "┐"));
  console.log(`${gry("│")} ${cols.map((c) => padEndV(gry(c.label), c.width)).join(` ${gry("│")} `)} ${gry("│")}`);
  console.log(hr("├", "┼", "┤"));

  for (const row of rows) {
    const cells = cols.map((c) => {
      const val   = row[c.key] ?? "";
      const plain = stripAnsi(val);
      const cell  = dispWidth(plain) > c.width ? truncByWidth(plain, c.width) : val;
      return padEndV(cell, c.width);
    });
    console.log(`${gry("│")} ${cells.join(` ${gry("│")} `)} ${gry("│")}`);
  }

  console.log(hr("└", "┴", "┘"));
}
