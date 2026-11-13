/**
 * About: the breakdown's [i] tooltips. Hover and focus show a row's tooltip with CSS alone, but a
 * button doesn't take focus when clicked in Safari, and a finger doesn't hover, so a click or a tap
 * pins it open with `.open` on the row. A click elsewhere, or Escape, closes it.
 */

import "../../account-client.ts";
import { ready } from "../../ready.ts";

const closeTips = (except?: Element | null) => {
  for (const row of document.querySelectorAll(".breakdown tr.open"))
    if (row !== except) row.classList.remove("open");
};

/**
 * Right of the table, where the window has the room (see .tip-text in style.css), an explanation
 * hangs down from its row: one of a row near the window's bottom was cut by it, half of its words
 * in a laptop's window, and scrolling to read them put another row under the pointer. It's lifted
 * by as much as it would pass the bottom, --lift, while its arrow stays on its row.
 */
const beside = matchMedia("(min-width: 1024px)");
function lift(row: Element) {
  const tip = row.querySelector<HTMLElement>(".tip-text");
  if (!tip) return;
  tip.style.removeProperty("--lift");
  const box = tip.getBoundingClientRect();
  // Not when it isn't shown, nor under its row, where the page scrolls on to it.
  if (!beside.matches || !box.height) return;
  const over = box.bottom + 8 - document.documentElement.clientHeight;
  // No further than leaves its arrow, 11px down it, on its straight edge, over its round corner.
  if (over > 0) tip.style.setProperty("--lift", `${Math.min(over, box.height - 27)}px`);
}
/** Every row whose explanation may show: the pointer's, the keyboard's and a pinned one. */
const liftShown = () => {
  for (const row of document.querySelectorAll(".breakdown tr:is(:hover, :focus-within, .open)"))
    lift(row);
};
// The window's bottom is elsewhere on the table once the page scrolls, or the window is resized.
let lifting = false;
for (const event of ["scroll", "resize"])
  addEventListener(
    event,
    () => {
      if (lifting) return;
      lifting = true;
      requestAnimationFrame(() => {
        lifting = false;
        liftShown();
      });
    },
    { passive: true },
  );

// Hover and focus can outlive a dismissal. Keep that row's explanation closed until the
// visitor enters it again or explicitly asks to open it, without taking the keyboard's place.
for (const row of document.querySelectorAll(".breakdown tr")) {
  for (const event of ["pointerenter", "focusin"])
    row.addEventListener(event, () => {
      row.classList.remove("tip-dismissed");
      lift(row);
    });
}

/**
 * Where the pointer is a finger, which doesn't hover: a tap anywhere on a row opens its tooltip,
 * as a pointer on the row does elsewhere, and a tap on the tooltip closes it.
 */
const finger = matchMedia("(hover: none)");

document.addEventListener("click", (event) => {
  const target = event.target as Element;
  const button = target.closest<HTMLElement>(".tip-i");
  const row = (button ?? (finger.matches ? target : null))?.closest(".breakdown tr") ?? null;
  closeTips(row);
  if (row) row.classList.toggle("tip-dismissed", !row.classList.toggle("open"));
  // The one this pinned, and the one that's back in sight now that another is closed.
  liftShown();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeTips();
  for (const row of document.querySelectorAll(".breakdown tr:is(:hover, :focus-within)"))
    row.classList.add("tip-dismissed");
});

ready();
