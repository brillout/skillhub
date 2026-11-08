/**
 * Tags: the search narrows the page to the tags whose name, label or meaning hold each of its
 * words, and to the facets and topic groups that have any.
 */

import "../../account-client.ts";

const input = document.getElementById("tag-q") as HTMLInputElement;
const none = document.getElementById("tag-none") as HTMLElement;

/** Whether a table's row, or a cloud's tag, holds each word: its text, and its tag's meaning. */
const fits = (el: HTMLElement, words: string[]) => {
  const text = `${el.textContent} ${el.querySelector<HTMLElement>(".tag")?.title ?? ""}`;
  return words.every((w) => text.toLowerCase().includes(w));
};

/** Hide what doesn't fit; whether anything in `els` is left. */
function show(els: Iterable<HTMLElement>, words: string[]): boolean {
  let any = false;
  for (const el of els) {
    el.hidden = !fits(el, words);
    any ||= !el.hidden;
  }
  return any;
}

function search() {
  const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
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
    any ||= inSection;
  }
  none.hidden = any;
  none.textContent = any ? "" : `No tag matches “${input.value.trim()}”.`;
}

input.addEventListener("input", search);
// The browser may restore what was typed, such as after going back.
if (input.value) search();
