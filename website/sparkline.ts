/**
 * The weekly installs' trend, in the Weekly Downloads tile of a skill's page: the change over the
 * eight weeks, and a sparkline whose crosshair reads out any week. A table of the same values sits
 * under the tile (see trendTableHtml), so the tooltip never gates a value.
 */

import { percent, plural } from "./format.ts";

const W = 240;
const H = 56;
const PAD_X = 6;
const PAD_Y = 6;

const dayMonth = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** The last day of each weekly window, oldest first; the newest ends on the snapshot date. */
function weekEnds(snapshot: string, count: number): string[] {
  const end = Date.parse(`${snapshot}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    dayMonth.format(new Date(end - (count - 1 - i) * 7 * 86_400_000)),
  );
}

/** The plot starts at zero, so a steady skill reads as a flat line rather than as noise. */
function geometry(values: number[]) {
  const max = Math.max(...values, 1);
  return {
    x: (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / (values.length - 1),
    y: (v: number) => H - PAD_Y - (v / max) * (H - 2 * PAD_Y),
  };
}

/**
 * `from`: the fewest downloads of its first week for the change over the weeks to be told. From
 * a handful, it reads as an absurd +273,050%, which the skills list refuses for its Weekly Growth
 * (see growthOf in skills.ts): the tile then says "8 weeks" alone, as for a first week of none.
 * The page passes it, so that this file, which the browser runs too, doesn't take the data in.
 */
export function trendHtml(values: number[], snapshot: string, from: number): string {
  const weeks = weekEnds(snapshot, values.length);
  const { x, y } = geometry(values);
  const first = values[0];
  const last = values[values.length - 1];
  const change = first >= Math.max(from, 1) ? percent((last - first) / first) : null;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const spoken = values.map((v, i) => `week to ${weeks[i]}: ${v.toLocaleString("en")}`).join("; ");
  return `
    <div class="trend">
      <div class="spark" tabindex="0" role="group"
        aria-label="Weekly downloads, ${spoken}. Use the left and right arrow keys to read each week."
        data-values="${values.join(",")}" data-weeks="${weeks.join("|")}">
        <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <line class="spark-base" x1="${PAD_X}" x2="${W - PAD_X}" y1="${H - PAD_Y}" y2="${H - PAD_Y}" />
          <polyline class="spark-line" points="${points}" />
          <line class="spark-cross" y1="0" y2="${H}" x1="0" x2="0" visibility="hidden" />
          <circle class="spark-now" r="4" cx="${x(values.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" />
          <circle class="spark-hover" r="4" visibility="hidden" />
        </svg>
        <div class="spark-tip" aria-live="polite" hidden><strong></strong><span></span></div>
      </div>
      <div class="stat-delta">${change === null ? "8 weeks" : `${change} in 8 weeks`}</div>
    </div>`;
}

/** The trend's values as a table, under its tile. */
export function trendTableHtml(values: number[], snapshot: string): string {
  const weeks = weekEnds(snapshot, values.length);
  const rows = values
    .map((v, i) => `<tr><td>${weeks[i]}</td><td>${v.toLocaleString("en")}</td></tr>`)
    .join("");
  return `
    <details class="spark-table">
      <summary>Weekly values</summary>
      <table>
        <thead><tr><th scope="col">Week to</th><th scope="col">Downloads</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}

/** Wires the crosshair and tooltip of every trend's sparkline inside `root`. */
export function mountSparklines(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>(".spark:not([data-mounted])")) {
    el.dataset.mounted = "";
    const values = (el.dataset.values ?? "").split(",").map(Number);
    const weeks = (el.dataset.weeks ?? "").split("|");
    const svg = el.querySelector("svg");
    const cross = el.querySelector<SVGLineElement>(".spark-cross");
    const marker = el.querySelector<SVGCircleElement>(".spark-hover");
    const tip = el.querySelector<HTMLElement>(".spark-tip");
    const value = tip?.querySelector("strong");
    const week = tip?.querySelector("span");
    if (!svg || !cross || !marker || !tip || !value || !week || values.length < 2) continue;
    const { x, y } = geometry(values);
    let active = values.length - 1;

    const show = (i: number) => {
      active = Math.max(0, Math.min(values.length - 1, i));
      const cx = x(active).toFixed(1);
      cross.setAttribute("x1", cx);
      cross.setAttribute("x2", cx);
      cross.setAttribute("visibility", "visible");
      marker.setAttribute("cx", cx);
      marker.setAttribute("cy", y(values[active]).toFixed(1));
      marker.setAttribute("visibility", "visible");
      // Downloads, as its tile calls them, and as the sparkline's own label does.
      value.textContent = plural(values[active], "download");
      week.textContent = `week to ${weeks[active]}`;
      tip.hidden = false;
    };
    const hide = () => {
      cross.setAttribute("visibility", "hidden");
      marker.setAttribute("visibility", "hidden");
      tip.hidden = true;
    };

    // The crosshair snaps to the nearest week, so the pointer never has to land on the line. A
    // finger's too, from where it lands: a tap read out the last week wherever it was, as only
    // the focus it gave showed the tooltip. And along the line, which is the finger's to follow
    // sideways: see touch-action on .spark in style.css.
    const read = (event: PointerEvent) => {
      const box = svg.getBoundingClientRect();
      const px = ((event.clientX - box.left) / box.width) * W;
      show(Math.round(((px - PAD_X) / (W - 2 * PAD_X)) * (values.length - 1)));
    };
    el.addEventListener("pointermove", read);
    el.addEventListener("pointerdown", read);
    el.addEventListener("pointerleave", () => {
      if (document.activeElement !== el) hide();
    });
    el.addEventListener("focus", () => show(active));
    el.addEventListener("blur", hide);
    el.addEventListener("keydown", (event) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (step) show(active + step);
      else if (event.key === "Home") show(0);
      else if (event.key === "End") show(values.length - 1);
      else return;
      event.preventDefault();
    });
  }
}
