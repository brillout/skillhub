/**
 * Tags: the search narrows the page to the tags whose name, label or meaning hold each of its
 * words, and to the facets and topic groups that have any, with their links atop the page. It reads
 * a search as the skills list's does (see search-terms.ts), and finds the tags that one finds.
 */

import "../../account-client.ts";
import { ready } from "../../ready.ts";
import { plain, sought, terms, type Term } from "../../search-terms.ts";

const input = document.getElementById("tag-q") as HTMLInputElement;
const none = document.getElementById("tag-none") as HTMLElement;
/** The page's own title, which it has while it shows every tag: see `search`. */
const pageTitle = document.title;

/**
 * Whether a table's row, or a cloud's tag, has each word: in its text, or in its tag's meaning. A
 * word has to start one of theirs, as in the skills list's search for tags: anywhere in a word,
 * "git" found flag:dual-use, by "legitimate", and "ui" a dozen tags, by "build" and "guidelines".
 */
const fits = (el: HTMLElement, words: Term[]) => {
  const text = plain(`${el.textContent} ${el.querySelector<HTMLElement>(".tag")?.title ?? ""}`);
  return words.every(({ start }) => start.test(text));
};

/** Hide what doesn't fit; whether anything in `els` is left. */
function show(els: Iterable<HTMLElement>, words: Term[]): boolean {
  let any = false;
  for (const el of els) {
    el.hidden = !fits(el, words);
    any ||= !el.hidden;
  }
  return any;
}

function search() {
  const words = terms(sought(input.value));
  let any = false;
  for (const section of document.querySelectorAll<HTMLElement>(".facet-doc")) {
    let inSection = show(section.querySelectorAll<HTMLElement>(".tag-table tbody tr"), words);
    for (const cloud of section.querySelectorAll<HTMLElement>(".cloud")) {
      const inCloud = show(cloud.querySelectorAll<HTMLElement>(".cloud-item"), words);
      cloud.hidden = !inCloud;
      // A topic group's name goes with its tags.
      const name = cloud.previousElementSibling;
      if (name instanceof HTMLElement && name.tagName === "H3") name.hidden = !inCloud;
      inSection ||= inCloud;
    }
    section.hidden = !inSection;
    // Its link atop the page would lead nowhere.
    document
      .querySelector<HTMLElement>(`.toc a[href="#${section.id}"]`)
      ?.toggleAttribute("hidden", !inSection);
    any ||= inSection;
  }
  none.hidden = any;
  none.textContent = any ? "" : `No tag matches “${input.value.trim()}”.`;
  // The title says what the page is narrowed to, as the skills list's does (see titleOf in
  // list.ts): a tab, a bookmark or the history couldn't tell /tags/?q=git from the whole page.
  const typed = input.value.trim();
  document.title = typed ? `“${typed}” · ${pageTitle}` : pageTitle;
}

/**
 * The search is kept in the page's address, /tags/?q=git, as the skills list keeps its own: a link
 * holds it, and the way back from a tag's list finds the page as it was left, narrowed. Left to
 * the browser, which is told not to complete the box, the box came back empty, with every tag, at
 * the place of the narrowed page.
 */
input.addEventListener("input", () => {
  search();
  const typed = input.value.trim();
  const address = typed ? `?q=${encodeURIComponent(typed)}` : location.pathname;
  history.replaceState(history.state, "", address + location.hash);
});
const asked = new URLSearchParams(location.search).get("q");
if (asked !== null) input.value = asked;
// Or what the browser put back by itself.
if (input.value) search();
// The tags were hidden until now, if the page's link has a search: see PENDING_SCRIPT in +Page.ts.
delete document.documentElement.dataset.pending;

// The way back within the page, from one of its facets' links, which each make an entry in the
// browser's history: to the search that entry's address has. Without this the address went back
// to ?q=git while the box and the tags stayed on what was typed since.
addEventListener("popstate", () => {
  const back = new URLSearchParams(location.search).get("q") ?? "";
  if (back === input.value.trim()) return;
  input.value = back;
  search();
});

ready();
