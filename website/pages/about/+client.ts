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

// Hover and focus can outlive a dismissal. Keep that row's explanation closed until the
// visitor enters it again or explicitly asks to open it, without taking the keyboard's place.
for (const row of document.querySelectorAll(".breakdown tr")) {
  for (const event of ["pointerenter", "focusin"])
    row.addEventListener(event, () => row.classList.remove("tip-dismissed"));
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
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeTips();
  for (const row of document.querySelectorAll(".breakdown tr:is(:hover, :focus-within)"))
    row.classList.add("tip-dismissed");
});

ready();
