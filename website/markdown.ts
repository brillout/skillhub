/** Render a skill's SKILL.md for its page. Raw HTML in it shows as text and never runs. */

import MarkdownIt from "markdown-it";

/** Where a relative link or image in the SKILL.md points, or null to drop it. */
export type Rebase = ((url: string, image: boolean) => string) | null;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Before the id of each of the SKILL.md's headings, so that none is an id of the page around it,
 * such as `tldr`: a link inside the SKILL.md to `#usage` points to `#md-usage`.
 */
const ANCHOR = "md-";

/**
 * A heading's anchor as GitHub makes it, which is what a SKILL.md's table of contents links to:
 * lowercase, without punctuation, and a hyphen for each space.
 */
const slug = (heading: string) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");

/**
 * A SKILL.md without its HTML comments, which GitHub and every markdown viewer hide: with HTML off,
 * they showed as text, and a document opened on "<!-- AUTO-GENERATED from SKILL.md.tmpl: do not
 * edit directly -->". Not the ones in code, fenced or `inline`, which are shown on purpose; nor one
 * that never ends, which is no comment. A line that held nothing else goes with its comment.
 */
function withoutComments(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: [mark: string, length: number] | null = null;
  /** Inside a comment that began on a line before. */
  let open = false;
  lines.forEach((line, n) => {
    if (!open) {
      const mark = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        const [char, length] = fence;
        if (mark && mark[1][0] === char && mark[1].length >= length && !mark[2].trim())
          fence = null;
        out.push(line);
        return;
      }
      // A fence of backticks has none after it, on its line: that would be code within a line.
      if (mark && !(mark[1][0] === "`" && mark[2].includes("`"))) {
        fence = [mark[1][0], mark[1].length];
        out.push(line);
        return;
      }
    }
    let kept = "";
    // The line's code spans, at the odd places, stay as they are.
    line.split(/(`+[^`]*`+)/).forEach((part, i) => {
      if (i % 2 && !open) {
        kept += part;
        return;
      }
      let rest = part;
      while (rest) {
        if (open) {
          const end = rest.indexOf("-->");
          if (end < 0) return;
          open = false;
          rest = rest.slice(end + 3);
        } else {
          const start = rest.indexOf("<!--");
          const ends =
            start >= 0 &&
            (rest.includes("-->", start + 4) || lines.slice(n + 1).some((l) => l.includes("-->")));
          if (!ends) {
            kept += rest;
            return;
          }
          kept += rest.slice(0, start);
          rest = rest.slice(start + 4);
          open = true;
        }
      }
    });
    if (kept.trim() || !line.trim()) out.push(kept);
  });
  return out.join("\n");
}

/** A task of a list, `- [ ] to do` or `- [x] done`, as GitHub writes it: its box, and what it says. */
const TASK = /^\[([ xX])\]\s+/;

/** The `name` in a SKILL.md's frontmatter, unquoted, or null when it has none. */
export function nameInSkillMd(text: string): string | null {
  const frontmatter = FRONTMATTER.exec(text)?.[1] ?? "";
  return /^name:[ \t]*(["']?)(.+?)\1[ \t\r]*$/m.exec(frontmatter)?.[2] ?? null;
}

export function renderSkillMd(
  text: string,
  rebase: Rebase,
): { frontmatter: string | null; html: string } {
  const md = new MarkdownIt({ html: false, linkify: true });
  md.core.ruler.push("skill_md", (state) => {
    // The headings' anchors first: the links to them can come before, as in a table of contents.
    const anchors = new Set<string>();
    const repeats = new Map<string, number>();
    state.tokens.forEach((token, i) => {
      if (token.type !== "heading_open") return;
      // The page has its own h1 and h2: the SKILL.md's headings sit below them.
      token.tag = `h${Math.min(6, Number(token.tag.slice(1)) + 2)}`;
      const words = (state.tokens[i + 1]?.children ?? [])
        .filter((child) => child.type === "text" || child.type === "code_inline")
        .map((child) => child.content);
      const base = slug(words.join(""));
      if (!base) return;
      // A repeated heading gets a number, as on GitHub: `usage`, `usage-1`, `usage-2`.
      let anchor = base;
      while (anchors.has(anchor)) {
        const n = (repeats.get(base) ?? 0) + 1;
        repeats.set(base, n);
        anchor = `${base}-${n}`;
      }
      anchors.add(anchor);
      token.attrSet("id", ANCHOR + anchor);
    });
    // A task list's items get a checkbox for their "[ ]", as on GitHub, in place of the bullet:
    // they showed as a bullet, then the brackets. It can't be ticked: it's the SKILL.md's.
    state.tokens.forEach((token, i) => {
      const inline = state.tokens[i + 2];
      const text = inline?.children?.[0];
      const task =
        token.type === "list_item_open" && text?.type === "text" && TASK.exec(text.content);
      if (!task || state.tokens[i + 1].type !== "paragraph_open") return;
      text.content = text.content.slice(task[0].length);
      const box = new state.Token("html_inline", "", 0);
      // No space after it: its margin is the gap (see li.task in style.css), and with both its
      // first line started 4px right of the lines under it.
      box.content = `<input type="checkbox" disabled${task[1] === " " ? "" : " checked"} />`;
      inline.children?.unshift(box);
      token.attrJoin("class", "task");
    });
    for (const token of state.tokens) {
      if (token.type === "heading_close")
        token.tag = `h${Math.min(6, Number(token.tag.slice(1)) + 2)}`;
      const children = token.children ?? [];
      children.forEach((child, i) => {
        const attr = child.type === "link_open" ? "href" : child.type === "image" ? "src" : null;
        const url = attr ? child.attrGet(attr) : null;
        if (!attr || typeof url !== "string" || !url || ABSOLUTE.test(url)) return;
        // A link to a heading of the SKILL.md itself, whatever its case, as on GitHub.
        const anchor = url.startsWith("#") ? anchorOf(url) : null;
        if (anchor !== null && anchors.has(anchor)) child.attrSet(attr, `#${ANCHOR}${anchor}`);
        else if (anchor === null && rebase) child.attrSet(attr, rebase(url, attr === "src"));
        else if (attr === "src")
          child.attrs = (child.attrs ?? []).filter(([name]) => name !== attr);
        // A link that would lead nowhere, such as to a heading the SKILL.md doesn't have, is
        // left as its words.
        else
          for (const end of [child, children.slice(i).find((c) => c.type === "link_close")]) {
            if (!end) continue;
            end.tag = "span";
            end.attrs = null;
          }
      });
    }
  });
  const m = FRONTMATTER.exec(text);
  const body = withoutComments(m ? text.slice(m[0].length) : text);
  return { frontmatter: m ? m[1] : null, html: md.render(body) };
}

/** The anchor a link such as `#Getting-Started` points to: `getting-started`. */
function anchorOf(url: string): string {
  try {
    return decodeURIComponent(url.slice(1)).toLowerCase();
  } catch {
    // Not a valid escape, such as `#100%`: taken as written.
    return url.slice(1).toLowerCase();
  }
}
