import { esc, number } from "../../format.ts";
import { skillsLink } from "../../list.ts";
import {
  FACET_ORDER,
  data,
  facetById,
  facetOf,
  includedBy,
  tagChip,
  tagLabel,
  tagOf,
  tagsOf,
} from "../../skills.ts";
import type { Facet } from "../../../data/types.ts";

/**
 * How many of a facet's tags a skill has, as a sentence of its own after the facet's question:
 * "What area is it for? One or more per skill."
 */
const COUNTS: Record<Facet["count"], string> = {
  one: "One per skill.",
  "one or more": "One or more per skill.",
  "at most one": "At most one per skill.",
  "one to five": "One to five per skill.",
  any: "Any number per skill.",
};

/**
 * Inline, right after the search box, so that it runs before the tags show, as the skills list's
 * does for its own (see PENDING_SCRIPT in ../../list.ts). The page is pre-rendered whole, and its
 * script comes last: a link with a search, /tags/?q=git, showed every tag under an empty box until
 * the script narrowed them, for half a second on a slow connection. It puts the link's search in
 * the box and marks <html data-pending>, which hides the tags (see style.css) until +client.ts has
 * narrowed them.
 */
const PENDING_SCRIPT = `(() => {
  const q = new URLSearchParams(location.search).get("q");
  if (!q) return;
  document.getElementById("tag-q").value = q;
  document.documentElement.dataset.pending = "";
})();`;

/**
 * A facet's values as its table lists them: a parent's right under it, in the order it includes
 * them, which is the order of its own Includes line and of the skills list's tags (see tagSection
 * in ../../list.ts). In the data's order, Category's rows came in another order than the line just
 * over them.
 */
function rowsOf(f: Facet): NonNullable<Facet["values"]> {
  const values = f.values ?? [];
  const byId = new Map(values.map((v) => [v.id, v]));
  const included = new Set(values.flatMap((v) => v.includes ?? []));
  // In the order they're placed, each once.
  const rows = new Set<(typeof values)[number]>();
  const place = (v: (typeof values)[number]) => {
    if (rows.has(v)) return;
    rows.add(v);
    for (const id of v.includes ?? []) {
      const child = byId.get(id);
      if (child) place(child);
    }
  };
  // One a parent includes comes with it; and should two include each other, they still come.
  for (const v of values) if (!included.has(v.id)) place(v);
  for (const v of values) place(v);
  return [...rows];
}

export default function Page(): string {
  const n = new Map<string, number>();
  for (const s of data.skills) for (const t of tagsOf(s)) n.set(t, (n.get(t) ?? 0) + 1);
  // To the list of its skills; a tag none has, such as a flag nothing calls for today, is its
  // chip alone: its link led to "0 skills" and a column of facets saying None.
  const tagLink = (t: string) => {
    const chip = tagChip(t, skillsLink({ tags: [t] }));
    return n.get(t)
      ? chip
      : chip
          .replace(/^<a /, "<span ")
          .replace(/ href="[^"]*"/, "")
          .replace(/<\/a>$/, "</span>");
  };
  // A tag of a cloud, with its count: what the tag search shows or hides.
  const cloudItem = (t: string) =>
    `<span class="cloud-item">${tagLink(t)}<span class="n">${number(n.get(t) ?? 0)}</span></span>`;
  const sections = FACET_ORDER.map((id) => facetById.get(id))
    .filter((f): f is Facet => Boolean(f))
    .map((f) => {
      let body: string;
      if (f.id === "topic")
        body = (f.groups ?? [])
          .map(
            (g) =>
              `<h3>${esc(g.name)}</h3><p class="cloud">${g.values.map(cloudItem).join(" ")}</p>`,
          )
          .join("");
      // A facet that lists no values takes any: stack, the one open vocabulary (see Facet in
      // data/types.ts). Its tags are the ones the skills have, most used first, as in the skills
      // list.
      else if (!f.values)
        body = `<p class="cloud">${[...n.keys()]
          .filter((t) => facetOf(t) === f.id)
          .sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0) || a.localeCompare(b))
          .map(cloudItem)
          .join(" ")}</p>`;
      else
        body = `<table class="tag-table"><thead><tr><th scope="col">Tag</th><th scope="col">Skills</th><th scope="col">Meaning</th></tr></thead><tbody>${rowsOf(
          f,
        )
          .map((v) => {
            const t = tagOf(f, v.id);
            const includes = includedBy(t);
            return `<tr><td>${tagLink(t)}</td><td class="num">${number(n.get(t) ?? 0)}</td><td>${tagLabel(t) ? `<strong>${esc(tagLabel(t) ?? "")}.</strong> ` : ""}${esc(v.description ?? "")}${
              includes.length
                ? `<div class="tags includes">Includes ${includes.map(tagLink).join("")}</div>`
                : ""
            }</td></tr>`;
          })
          .join("")}</tbody></table>`;
      return `<section class="facet-doc" id="facet-${f.id}"><h2>${esc(f.name)} <code>${f.prefix === false ? "no prefix" : `${f.id}:`}</code></h2><p class="question">${esc(f.question)} <span class="muted">${COUNTS[f.count]}</span></p>${body}</section>`;
    })
    .join("");
  return `
    <div class="page">
      <h1>Tags</h1>
      <div class="tag-search">
        <label for="tag-q" class="sr-only">Search tags</label>
        <input id="tag-q" type="search" placeholder="Search tags" autocomplete="off" spellcheck="false" aria-controls="tag-sections" />
      </div>
      <script>${PENDING_SCRIPT}</script>
      <nav class="toc" aria-label="Facets">${FACET_ORDER.map((id) => `<a href="#facet-${id}">${esc(facetById.get(id)?.name ?? id)}</a>`).join("")}</nav>
      <p id="tag-none" class="muted tag-none" role="status" hidden></p>
      <div id="tag-sections">${sections}</div>
    </div>`;
}
