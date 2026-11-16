/**
 * A skill's or a bundle's numbers on its page, a tile each: its icon, as in the skills list's rows,
 * the number, where it stands among the catalog's in words and as the chart the rows show (see
 * standingOf in list.ts), and where it comes from. The Weekly Downloads tile also shows the 8
 * weeks' trend.
 */

import { esc } from "./format.ts";
import { PROPS, crowdDefsHtml, standingOf, type Prop } from "./list.ts";
import { GROWTH_BASE_MIN, data } from "./skills.ts";
import { trendHtml, trendTableHtml } from "./sparkline.ts";

type Entry = Parameters<typeof standingOf>[1];

export interface Tile {
  p: Prop;
  label: string;
  /** Where the number comes from, after the label, as HTML: such as "on skills.sh". */
  from: string;
  shown: string;
  /** The weekly downloads whose trend the tile shows, for Weekly Downloads, and their growth. */
  trend?: number[] | null;
  growth?: number | null;
}

/**
 * The tiles, in their order; a tile whose number is unknown is left out, and so is the whole
 * section when none is known.
 */
export function statTilesHtml(e: Entry, tiles: Tile[]): string {
  const html = tiles.flatMap(({ p, label, from, shown, trend, growth = null }) => {
    const standing = standingOf(p, e);
    if (!standing) return [];
    // Where it comes from, and its exact place: on its words and chart, not over the trend's own tip.
    const title = esc(`${PROPS[p].title(e)}. ${standing.place}`);
    return `
      <figure class="stat">
        <figcaption class="stat-label">${PROPS[p].icon}<span><span class="stat-name">${label}</span> <span class="muted">${from}</span></span></figcaption>
        <div class="stat-head"><div class="stat-value">${shown}</div>${trend ? trendHtml(trend, data.asOf.installs, GROWTH_BASE_MIN, growth) : ""}</div>
        <div title="${title}">
          <p class="stat-standing">${standing.words}</p>
          ${standing.chart}
        </div>
        ${trend ? trendTableHtml(trend, data.asOf.installs) : ""}
      </figure>`;
  });
  if (!html.length) return "";
  return `
    <section class="stat-tiles" aria-label="Its numbers">${html.join("")}</section>
    ${crowdDefsHtml()}`;
}
