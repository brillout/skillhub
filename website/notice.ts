/**
 * Escape closes the notice, before anything else it would close, a row's preview or an explanation:
 * its × is the page's last stop for Tab, a few thousand presses from a row of the skills list.
 * Listened for from the first notice on, in the browser: pages that render on the server import
 * this file too.
 */
let listening = false;
function closeOnEscape() {
  if (listening) return;
  listening = true;
  document.addEventListener(
    "keydown",
    (event) => {
      const box = document.getElementById("action-notice");
      if (event.key !== "Escape" || !box) return;
      event.stopPropagation();
      box.querySelector("button")?.click();
    },
    true,
  );
}

/** Persistent feedback for an action that didn't complete; dismissible by mouse or keyboard. */
export function notice(message: string, action: string) {
  closeOnEscape();
  document.getElementById("action-notice")?.remove();
  const box = document.createElement("div");
  box.id = "action-notice";
  box.className = "action-notice";
  box.dataset.action = action;
  box.setAttribute("role", "status");
  const text = document.createElement("span");
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "Dismiss notification");
  dismiss.textContent = "×";
  const focused = document.activeElement as HTMLElement | null;
  dismiss.addEventListener("click", () => {
    box.remove();
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  });
  box.append(text, dismiss);
  document.body.append(box);
  // Populate the live region after it exists, so assistive technology announces the message.
  requestAnimationFrame(() => {
    text.textContent = message;
  });
}

/**
 * Says a message to assistive technology alone, such as that a command was copied: for what the
 * page only shows for a moment, in a place that isn't read out.
 */
export function say(message: string) {
  const said =
    document.getElementById("said") ??
    document.body.appendChild(
      Object.assign(document.createElement("div"), { id: "said", className: "sr-only" }),
    );
  said.setAttribute("role", "status");
  // Emptied, then filled once that's taken: the same words a second time are read out again.
  said.textContent = "";
  requestAnimationFrame(() => {
    said.textContent = message;
  });
}

/** A successful retry makes its earlier error obsolete. */
export function clearNotice(action: string) {
  const box = document.getElementById("action-notice");
  if (box?.dataset.action === action) box.remove();
}
