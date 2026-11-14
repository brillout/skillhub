import { esc } from "./format.ts";
import { clearNotice, notice, say } from "./notice.ts";

/**
 * A button that copies `text`, such as an install command. It says Copied for a moment after.
 * `about` is the id of what says which command it copies, where a page has several: a bundle's
 * page had up to six buttons that all read out as "Copy".
 */
export const copyButton = (text: string, about?: string) =>
  `<button type="button" class="copy" data-copy="${esc(text)}"${about ? ` aria-describedby="${about}"` : ""}><span>Copy</span><span>Copied</span></button>`;

/** Wires every copy button: `[data-copied]` shows Copied instead of Copy, see style.css. */
export function mountCopyButtons() {
  const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-copy]");
    if (!button?.dataset.copy) return;
    const copy = navigator.clipboard
      ? navigator.clipboard.writeText(button.dataset.copy)
      : Promise.reject(new Error("Clipboard unavailable"));
    copy.then(
      () => {
        clearNotice("copy");
        button.dataset.copied = "";
        // The button shows it for a moment, in place of its name: that isn't read out.
        say("Copied to your clipboard.");
        clearTimeout(timers.get(button));
        timers.set(
          button,
          setTimeout(() => delete button.dataset.copied, 1500),
        );
      },
      () => notice("Couldn't copy. Select the command and copy it manually.", "copy"),
    );
  });
}
