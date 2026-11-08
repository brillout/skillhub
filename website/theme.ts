/**
 * Light or dark: the visitor's choice, kept in localStorage, or else their system's. The script
 * runs inline in every page's <head>, so that the page is drawn in its theme from the start. It
 * sets <html data-theme>, which style.css's dark tokens hang on; keeps the header's toggle's
 * aria-pressed; and handles the toggle's clicks. Without JavaScript, the site is light.
 *
 * A string, not a function to stringify: a bundler could add helpers to a function's body that
 * the inline script wouldn't have.
 */
export const themeScript = `(() => {
  const KEY = "skillhub:theme";
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  let choice = null;
  try { choice = localStorage.getItem(KEY); } catch {}
  const apply = () => {
    const dark = choice ? choice === "dark" : system.matches;
    root.dataset.theme = dark ? "dark" : "light";
    for (const b of document.querySelectorAll("[data-theme-toggle]"))
      b.setAttribute("aria-pressed", String(dark));
  };
  apply();
  system.addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("click", (event) => {
    const button = event.target.closest && event.target.closest("[data-theme-toggle]");
    if (!button) return;
    choice = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, choice); } catch {}
    // Only a click animates the icons, not the page's load: see .theme-toggle in style.css.
    button.dataset.toggled = "";
    apply();
  });
})();`;
