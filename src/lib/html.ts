import { bold, cyn, gry, hyperlink } from "./ui.js";

// ── Tokenizer ─────────────────────────────────────────────────────────────────

const VOID_TAGS = new Set([
  "area","base","br","col","embed","hr","img","input",
  "link","meta","param","source","track","wbr",
]);

type HtmlToken =
  | { kind: "text"; value: string }
  | { kind: "tag"; closing: boolean; tag: string; attrs: string };

function tokenize(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== "<") {
      let j = i;
      while (j < html.length && html[j] !== "<") j++;
      tokens.push({ kind: "text", value: html.slice(i, j) });
      i = j;
    } else {
      // scan to closing >, respecting quoted attribute values
      let j = i + 1;
      let inQuote: string | null = null;
      while (j < html.length) {
        const ch = html[j];
        if (inQuote) { if (ch === inQuote) inQuote = null; }
        else if (ch === '"' || ch === "'") { inQuote = ch; }
        else if (ch === ">") break;
        j++;
      }
      if (j >= html.length) { i++; continue; } // malformed — skip '<'

      const raw      = html.slice(i + 1, j).trim();
      const selfClose = raw.endsWith("/");
      const body     = selfClose ? raw.slice(0, -1).trim() : raw;
      const closing  = body.startsWith("/");
      const inner    = closing ? body.slice(1).trim() : body;
      const sp       = inner.search(/\s/);
      const tag      = (sp === -1 ? inner : inner.slice(0, sp)).toLowerCase();
      const attrs    = sp === -1 ? "" : inner.slice(sp + 1);

      tokens.push({ kind: "tag", closing, tag, attrs });
      // void / self-closing tags get an implicit close token so the render loop
      // doesn't need special-case logic for them
      if (!closing && (selfClose || VOID_TAGS.has(tag)))
        tokens.push({ kind: "tag", closing: true, tag, attrs: "" });

      i = j + 1;
    }
  }
  return tokens;
}

// ── Entity decoder ────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g,      (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

// ── Style stack ───────────────────────────────────────────────────────────────

type StyleEntry =
  | { kind: "bold" }
  | { kind: "italic" }
  | { kind: "link"; href: string };

function applyStyles(text: string, stack: StyleEntry[]): string {
  let s = text;
  // apply outermost style last so it wraps everything
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i];
    if (e.kind === "bold")   s = bold(s);
    if (e.kind === "italic") s = `\x1b[3m${s}\x1b[23m`;
    if (e.kind === "link")   s = hyperlink(e.href, cyn(s));
  }
  return s;
}

function popLast(stack: StyleEntry[], kind: StyleEntry["kind"]): void {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].kind === kind) { stack.splice(i, 1); return; }
  }
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export function renderHtml(html: string): string {
  const tokens  = tokenize(html);
  const parts: string[] = [];
  const styles: StyleEntry[] = [];
  let nlCount = 0;   // consecutive newlines already pushed
  let atStart = true;

  const pushNl = () => {
    if (nlCount < 2) { parts.push("\n"); nlCount++; atStart = true; }
  };

  const pushContent = (s: string) => {
    if (!s) return;
    nlCount = 0; atStart = false;
    parts.push(s);
  };

  for (const tok of tokens) {
    if (tok.kind === "text") {
      const text = decodeEntities(tok.value)
        .replace(/[\r\n]+/g, " ")
        .replace(/[ \t]+/g,  " ");
      if (text.trim()) pushContent(applyStyles(text, styles));
      continue;
    }

    const { closing, tag, attrs } = tok;

    if (!closing) {
      switch (tag) {
        case "br":
          pushNl(); break;

        case "hr":
          pushNl(); pushContent(gry("─".repeat(40))); pushNl(); break;

        case "p": case "div": case "section": case "article":
        case "blockquote": case "ul": case "ol": case "table":
          if (!atStart) pushNl(); break;

        case "li":
          if (!atStart) pushNl();
          pushContent("• "); break;

        case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
          if (!atStart) pushNl();
          styles.push({ kind: "bold" }); break;

        case "b": case "strong":
          styles.push({ kind: "bold" }); break;

        case "i": case "em":
          styles.push({ kind: "italic" }); break;

        case "a": {
          const m = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
          styles.push({ kind: "link", href: m?.[1] ?? "" }); break;
        }

        case "img": {
          const alt = attrs.match(/alt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
          const src = attrs.match(/src\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
          const label = alt && alt.toLowerCase() !== "image" ? alt : "圖片";
          if (src) pushContent(hyperlink(src, gry(`[${label}]`)));
          else if (alt) pushContent(gry(`[${label}]`));
          break;
        }
      }
    } else {
      switch (tag) {
        case "p": case "div": case "section": case "article":
        case "blockquote": case "ul": case "ol": case "li": case "table":
          if (!atStart) pushNl(); break;

        case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
          if (!atStart) pushNl();
          popLast(styles, "bold"); break;

        case "b": case "strong":
          popLast(styles, "bold"); break;

        case "i": case "em":
          popLast(styles, "italic"); break;

        case "a":
          popLast(styles, "link"); break;
      }
    }
  }

  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
