/* Иконки: свои, линейные, 24×24, цвет — currentColor */
import { html } from './core.js';

const P = {
  home: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  food: '<path d="M12 7.6c-1.5-1.2-3.3-1.5-4.8-.9C4.9 7.6 3.9 10 4.5 13c.6 3 2.5 6.1 4.5 6.1 1 0 1.6-.6 3-.6s2 .6 3 .6c2 0 3.9-3.1 4.5-6.1.6-3-.4-5.4-2.7-6.3-1.5-.6-3.3-.3-4.8.9z"/><path d="M12 7.4c0-2 .9-3.4 2.6-4"/>',
  train: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  more: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9a5 5 0 0 1 7 0"/><path d="m12 9.5 1.2-1.6"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v3.5M16 3v3.5"/>',
  list: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4h6v2.2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M9 12h6M9 16h4"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.1 2.3-4.8 3.4-7.6.4 1.6 1.3 2.6 2.3 3 0-3 1.2-5.6 3.6-7.8-.2 2.6.6 4.4 1.8 6 1 1.3 1.9 2.7 1.9 4.6C19 18.2 16 21 12 21z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  right: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  left: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.4-2h4.8l1.4 2h1.7A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  barcode: '<path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12"/>',
  bolt: '<path d="M13 2.8 5.5 13.2h5.6L10.4 21.2 18.5 10.4h-5.7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5"/>',
  ruler: '<path d="m3.5 15.5 12-12 5 5-12 12z"/><path d="m7.5 11.5 2 2M10.5 8.5l2 2M13.5 5.5l2 2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5S9.7 5.8 12 3.5z"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7 1.4A3.3 3.3 0 0 0 7 18.5z"/>',
  save: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4.5 15.5v2a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-2"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h8.5M17 12v3M20 12v2"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
  close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  steps: '<path d="M8 4.5c1.8 0 2.8 1.8 2.8 4.2S9.7 13 8 13 5.2 11.1 5.2 8.7 6.2 4.5 8 4.5zM16 9.5c1.8 0 2.8 1.8 2.8 4.2S17.7 18 16 18s-2.8-1.9-2.8-4.3 1-4.2 2.8-4.2z"/><path d="M6.3 15.5h3.4M14.3 20h3.4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M9.5 3h5M18.5 7l1.3-1.3"/>',
  swap: '<path d="M7 7.5h11.5l-3-3M17 16.5H5.5l3 3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>'
};

export function Icon({ name, size, cls }) {
  const s = size ? 'width:' + size + 'px;height:' + size + 'px' : null;
  return html`<svg class=${'i ' + (cls || '')} style=${s} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: P[name] || '' }}></svg>`;
}

export const ICON_NAMES = Object.keys(P);
