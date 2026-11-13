/**
 * The icons that stand for the numbers in the skills list's rows, on the filters' pills and in the
 * Sort by menu: see PROPS in list.ts. The two download numbers and the growth share an icon, with a word under it.
 * Each is drawn once per page, in iconDefsHtml, which crowdDefsHtml adds; a row only refers to it,
 * as the list repeats them in its every row.
 */

const THUMB =
  "M4.8 7.2 7.36 2.88a1.24 1.24 0 0 1 2.28.88L9.12 6.4h3.24a1.28 1.28 0 0 1 1.24 1.6l-1.16 4.64a1.28 1.28 0 0 1-1.24.96H4.8M4.8 7.2h-2a.4.4 0 0 0-.4.4v5.6a.4.4 0 0 0 .4.4h2M4.8 7.2v6.4";

const SHAPES = {
  /** A chick hatching, for its age: its head out of the shell's bottom half. */
  chick: `<path d="M2 8.75 4 10.75 6 8.75 8 10.75 10 8.75 12 10.75 14 8.75v.75a6 5.25 0 0 1-12 0Z" /><circle cx="7.25" cy="5.25" r="3" /><path d="M10.25 4.25 13.25 5.25 10.25 6.25Z" fill="currentColor" /><circle cx="7.9" cy="4.6" r=".85" fill="currentColor" stroke="none" />`,
  star: `<path d="m8 1.9 1.85 3.9 4.25.55-3.1 2.95.8 4.2L8 11.45 4.2 13.5l.8-4.2-3.1-2.95 4.25-.55Z" />`,
  download: `<path d="M8 2v8M4.75 6.75 8 10l3.25-3.25M2.25 11v1.5c0 .7.55 1.25 1.25 1.25h9c.7 0 1.25-.55 1.25-1.25V11" />`,
  /** For the Sort by menu: Best match, and the option it's set to. */
  search: `<circle cx="7" cy="7" r="4.75" /><path d="m10.5 10.5 3.75 3.75" />`,
  /** For the Sort by menu: Recently saved, the bookmark of the Save buttons and the Saved switch. */
  bookmark: `<path d="M4.5 2.25h7a.5.5 0 0 1 .5.5v11L8 10.9l-4 2.85v-11a.5.5 0 0 1 .5-.5Z" />`,
  check: `<path d="m3.25 8.5 3 3 6.5-7" />`,
  /**
   * For the Sort by menu: Recent, while Show's thumbs show only what you gave one. The thumbs of
   * the rows and of Show (--thumb in style.css), on this grid; the down one turned over.
   */
  "thumb-up": `<path d="${THUMB}" />`,
  "thumb-down": `<path d="${THUMB}" transform="rotate(180 8 8)" />`,
};

// Their size and stroke are in the CSS's .prop-icon, which the shapes inherit through <use>.
const icon = (name: keyof typeof SHAPES) =>
  `<svg class="prop-icon" aria-hidden="true"><use href="#icon-${name}" /></svg>`;

export const CHICK = icon("chick");
export const STAR = icon("star");
export const DOWNLOAD = icon("download");
export const SEARCH = icon("search");
export const SAVED = icon("bookmark");
export const CHECK = icon("check");
export const THUMB_ICONS = { up: icon("thumb-up"), down: icon("thumb-down") };

/** The icons' shapes, for a page's <defs>. */
export const iconDefsHtml = () =>
  Object.entries(SHAPES)
    .map(([name, body]) => `<symbol id="icon-${name}" viewBox="0 0 16 16">${body}</symbol>`)
    .join("");
