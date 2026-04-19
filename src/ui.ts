// ── ANSI colors (no external deps) ───────────────────────────────────────────

export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const red  = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const grn  = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const ylw  = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const cyn  = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const gry  = (s: string) => `\x1b[90m${s}\x1b[0m`;

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
    const wide =
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2E80 && cp <= 0x303E) ||
      (cp >= 0x3040 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7AF) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6);
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

// Two-column key/value table — fixed-width, wraps long plain-text values
export function renderKVTable(data: Record<string, string>): void {
  const termW = Math.min(process.stdout.columns || 80, 120);
  const keys  = Object.keys(data);
  const keyW  = Math.max(...keys.map((k) => k.length), 7); // min "(index)".length
  const valW  = Math.max(20, termW - keyW - 7);            // 7 = │ + spaces + │ + spaces + │

  const hr = (l: string, m: string, r: string) =>
    gry(`${l}${"─".repeat(keyW + 2)}${m}${"─".repeat(valW + 2)}${r}`);

  console.log(hr("┌", "┬", "┐"));
  console.log(`${gry("│")} ${padEndV(gry("(index)"), keyW)} ${gry("│")} ${padEndV(gry("Values"), valW)} ${gry("│")}`);
  console.log(hr("├", "┼", "┤"));

  for (const key of keys) {
    const rawVal   = data[key] ?? "";
    const rawPlain = stripAnsi(rawVal);
    // Colored values are short — keep as-is. Plain text gets wrapped.
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

// Multi-column table — truncates cells that exceed column width
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
      const cell  = dispWidth(plain) > c.width ? val.slice(0, c.width - 1) + "…" : val;
      return padEndV(cell, c.width);
    });
    console.log(`${gry("│")} ${cells.join(` ${gry("│")} `)} ${gry("│")}`);
  }

  console.log(hr("└", "┴", "┘"));
}
