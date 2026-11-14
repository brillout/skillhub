/** Formatting and links shared by every page. */

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A shell command, escaped, that wraps only between its words, or inside one after a slash or an
 * @: a browser would otherwise break a line after a hyphen, such as inside --skill. After an @, so
 * that a plugin's `name@marketplace` too long for a phone's line shows whole: it was cut off at
 * its box's edge, which scrolled. What reads together stays together where a line has room for it
 * (see .install code in style.css):
 * - a command of several joined by &&, with what joins it to the one before: `codex plugin
 *   marketplace add a/b && codex plugin add b@a` broke inside its second command, which now starts
 *   a line, its && first. Not last on the line before: a command too long for a line wraps inside,
 *   and its && was left on a line of its own, as was the `bash` a long `curl` is piped to;
 * - a flag and what it's set to, `--skill grill-me`: a bundle's command names a skill per flag,
 *   and its lines ended on a flag, with the skill on the next.
 */
export function commandHtml(command: string): string {
  // Not after what starts a word, as in /plugin or @scope/name, nor between the slashes of ://.
  const word = (w: string) =>
    w
      .split(/(?<=.\/)(?!\/)|(?<=[\p{L}\p{N}]@)/u)
      .map((part) => `<span class="word">${esc(part)}</span>`)
      .join("<wbr>");
  const joins = (w: string) => /^(&&|\|\|?|;)$/.test(w);
  // The commands, each with what joins it to the one before.
  const commands: string[][] = [[]];
  for (const w of command.split(" ")) {
    if (joins(w)) commands.push([]);
    commands[commands.length - 1].push(w);
  }
  const html = commands
    .filter((words) => words.length)
    .map((words) => {
      const out: string[] = [];
      for (let i = 0; i < words.length; i++) {
        const next = words[i + 1];
        // What a flag is set to: not the next flag, what joins two commands, or a URL, which is
        // long enough to need the lines of its own.
        const set =
          words[i].startsWith("-") &&
          next &&
          !next.startsWith("-") &&
          !joins(next) &&
          !next.includes("://");
        out.push(
          set ? `<span class="pair">${word(words[i])} ${word(next)}</span>` : word(words[i]),
        );
        if (set) i++;
      }
      return out.join(" ");
    });
  // The first starts the first line, so it's whole wherever it fits, as it is: left to wrap as
  // text, one too long for a line shares its last line with the next, if that one fits there.
  return html.map((c, i) => (i ? `<span class="cmd">${c}</span>` : c)).join(" ");
}

/** 3.5M, 907K, 54.5K, 812 */
export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e5) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
const longDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
export const date = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));
/**
 * A TLDR's glance item, shown after its label and a colon ("Use it when: You want…."): with a full
 * stop, unless it ends in its own "?" or "!". See the review-skills skill. Its own also when a
 * quote or a bracket closes after it: one that ends on what someone says, `"how do I do X?"`, read
 * `X?".`, and `"…plan is required."` ended in two full stops with a quote between them. And a
 * repo's description, which GitHub's own often leaves without one: one in sixteen had none here,
 * above the others' full stops.
 */
export const glanceEnd = (text: string) => (/[.!?…]["”’')\]]*$/.test(text) ? text : `${text}.`);

/**
 * What an agent wrote about a skill, its TLDR, description or note, escaped, as the pages show it:
 * what it put between two backticks, a command, a flag or a file, is code, in the code's own
 * letters (see code.said in style.css). Shown as written, the backticks stood in the sentence,
 * "adding `-o` to save a file", as on a page that failed to render its Markdown. Nothing else of
 * Markdown is read: these are sentences, not documents.
 */
export const textHtml = (text: string) =>
  esc(text).replace(/`([^`\n]+)`/g, `<code class="said">$1</code>`);

/** The same without the backticks, for where there's no code to set apart: a page's description. */
export const plainText = (text: string) => text.replace(/`([^`\n]+)`/g, "$1");
/** The day `n` days before a day, both YYYY-MM-DD. */
export const daysBefore = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
/**
 * A number with its thousands apart: 1,190. From one formatter for all of them: `toLocaleString`
 * makes one of its own at every call, which takes some twenty times as long, and the skills list
 * writes ten numbers a row this way, in its tooltips: ten thousand for the whole list.
 */
const grouped = new Intl.NumberFormat("en");
export const number = (n: number) => grouped.format(n);
export const plural = (n: number, word: string) => `${number(n)} ${word}${n === 1 ? "" : "s"}`;
/**
 * A change as a percentage with its sign, such as +180% or −12%, from its ratio, 1.8 or −0.12: a
 * minus sign rather than a hyphen, and no sign on what rounds to 0%.
 */
export function percent(ratio: number): string {
  const p = Math.round(ratio * 100);
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${number(Math.abs(p))}%`;
}
/**
 * How long before `asOf` a day was, both YYYY-MM-DD, as a number and one word, rounded down: 3 days,
 * 5 weeks (from 2 to 8), 9 months, 1.5 years (a decimal under 5 years), 7 years.
 */
export function age(day: string, asOf: string): string {
  const days = Math.max(0, Math.round((Date.parse(asOf) - Date.parse(day)) / 86_400_000));
  const years = days / 365.25;
  if (days < 14) return plural(days, "day");
  if (days < 61) return plural(Math.floor(days / 7), "week");
  if (years < 1) return plural(Math.floor(years * 12), "month");
  return plural(years < 5 ? Math.floor(years * 10) / 10 : Math.floor(years), "year");
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
/** The viewer's own day, as for what they did: unlike `date`, not UTC's. */
const ownDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
const UNITS: [unit: Intl.RelativeTimeFormatUnit, ms: number, below: number][] = [
  ["minute", 60_000, 60],
  ["hour", 3_600_000, 24],
  ["day", 86_400_000, 7],
  ["week", 604_800_000, 5],
  ["month", 2_629_800_000, 12],
  ["year", 31_557_600_000, Infinity],
];

/**
 * When something was done, a time in milliseconds, for a person: "just now", "5 minutes ago",
 * "3 hours ago"; from a day on, with its date, "yesterday (Nov 12, 2026)", "3 weeks ago (Oct 23,
 * 2026)".
 */
export function ago(at: number, now = Date.now()): string {
  const ms = Math.max(0, now - at);
  if (ms < 60_000) return "just now";
  const [unit, size] = UNITS.find(([, size, below]) => ms < size * below) as (typeof UNITS)[number];
  // Days are the calendar's, the viewer's, as the date beside them is: by hours alone, 33 of them
  // rounded to one day, "yesterday (Nov 12, 2026)", on Nov 14.
  const midnight = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const n =
    unit === "day"
      ? Math.round((midnight(now) - midnight(at)) / 86_400_000)
      : Math.round(ms / size);
  const words = relative.format(-Math.max(1, n), unit);
  return ms < 86_400_000 ? words : `${words} (${ownDate.format(at)})`;
}

/** A path on this site, under the base it's served from (`/` at https://skillhub.build). */
export const href = (path = "") => `${import.meta.env.BASE_URL}${path}`;
