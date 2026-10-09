import { TextureLoader } from 'three';

/**
 * Cisco-style node icons. Each one is a solid badge in the node's severity
 * colour with a white symbol on top, so health still reads at a glance:
 *
 *   router   circle with four arrows pointing out (core and distribution
 *            share it; tier is shown by size)
 *   switch   flat rounded box with ⇄ arrows
 *   building dark disc with a thick health ring around a building glyph
 *
 * The same SVG strings feed the 3D sprites (via a texture cache) and the
 * legend (as <img> data URIs), so the two can never drift apart.
 */

const HIGHLIGHT = '#ffffff';

// Arrow pointing up from the centre, rotated into the four directions.
const ROUTER_ARROW =
  '<path d="M64 52 V24 M52 36 L64 22 L76 36" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>';

function routerSvg(color, highlighted) {
  const arrows = [0, 90, 180, 270]
    .map((deg) => `<g transform="rotate(${deg} 64 64)">${ROUTER_ARROW}</g>`)
    .join('');
  return `
    <circle cx="64" cy="64" r="58" fill="${color}" stroke="${highlighted ? HIGHLIGHT : '#0b0f16'}" stroke-width="${highlighted ? 8 : 4}"/>
    ${arrows}`;
}

function switchSvg(color, highlighted) {
  return `
    <rect x="6" y="30" width="116" height="68" rx="14" fill="${color}" stroke="${highlighted ? HIGHLIGHT : '#0b0f16'}" stroke-width="${highlighted ? 8 : 4}"/>
    <g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M30 52 H96 M84 41 L97 52 L84 63"/>
      <path d="M98 76 H32 M44 65 L31 76 L44 87"/>
    </g>`;
}

function buildingSvg(color, highlighted) {
  return `
    <circle cx="64" cy="64" r="56" fill="#111827" stroke="${color}" stroke-width="12"/>
    ${highlighted ? `<circle cx="64" cy="64" r="62" fill="none" stroke="${HIGHLIGHT}" stroke-width="4"/>` : ''}
    <g fill="#fff">
      <rect x="42" y="34" width="44" height="62" rx="3"/>
    </g>
    <g fill="#111827">
      <rect x="49" y="42" width="8" height="8"/><rect x="60" y="42" width="8" height="8"/><rect x="71" y="42" width="8" height="8"/>
      <rect x="49" y="55" width="8" height="8"/><rect x="60" y="55" width="8" height="8"/><rect x="71" y="55" width="8" height="8"/>
      <rect x="49" y="68" width="8" height="8"/><rect x="60" y="68" width="8" height="8"/><rect x="71" y="68" width="8" height="8"/>
      <rect x="58" y="82" width="12" height="14"/>
    </g>`;
}

const BUILDERS = { router: routerSvg, switch: switchSvg, building: buildingSvg };

/** Which icon a graph node gets. Anything that isn't a router or building is drawn as a switch. */
export function iconKindFor(node) {
  if (node?.data?.kind === 'building') return 'building';
  if (node?.data?.deviceType === 'router') return 'router';
  return 'switch';
}

export function iconSvg(kind, color, highlighted = false) {
  const body = (BUILDERS[kind] || switchSvg)(color, highlighted);
  // Explicit width/height so the browser rasterises at a crisp size.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 128 128">${body}</svg>`;
}

export function iconDataUri(kind, color, highlighted = false) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(kind, color, highlighted))}`;
}

// A view shows a few hundred nodes but only a handful of distinct
// (shape, colour, highlight) combinations, so textures are shared.
const textureCache = new Map();
const loader = new TextureLoader();

export function iconTexture(kind, color, highlighted = false) {
  const key = `${kind}|${color}|${highlighted ? 1 : 0}`;
  let tex = textureCache.get(key);
  if (!tex) {
    tex = loader.load(iconDataUri(kind, color, highlighted));
    textureCache.set(key, tex);
  }
  return tex;
}
