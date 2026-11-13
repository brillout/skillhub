/** Persistent feedback for an action that didn't complete; dismissible by mouse or keyboard. */
export function notice(message: string, action: string) {
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

/** A successful retry makes its earlier error obsolete. */
export function clearNotice(action: string) {
  const box = document.getElementById("action-notice");
  if (box?.dataset.action === action) box.remove();
}
