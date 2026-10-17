// Generates extension/theme.css — single source of truth for colors, icons,
// and component classes. Palette is derived from DeepSeek's brand blue.
// Run: npm run theme
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "extension", "theme.css");

const TOKENS = `:root {
  /* DeepSeek-anchored palette */
  --ds-blue: #4d6bfe;
  --ds-blue-hover: #6b83ff;
  --ds-blue-soft: rgba(77, 107, 254, 0.14);
  --ds-violet: #8b7cf6;

  --ds-inset: #17171a;
  --ds-base: #1e1e22;
  --ds-elev: #26262c;
  --ds-hover: #30303a;
  --ds-border: #3a3a46;

  --ds-fg: #ececf1;
  --ds-fg-muted: #9a9aa8;

  --ds-success: #4ade80;
  --ds-danger: #f87171;
  --ds-warn: #fbbf24;

  /* semantic aliases used by components */
  --ds-bg-inset: var(--ds-inset);
  --ds-bg-base: var(--ds-base);
  --ds-bg-elev: var(--ds-elev);
  --ds-bg-hover: var(--ds-hover);
  --ds-accent: var(--ds-blue);
  --ds-brand: var(--ds-violet);
  --ds-warning: var(--ds-warn);

  --ds-shadow-md: rgba(0, 0, 0, 0.45);
  --ds-shadow-lg: rgba(0, 0, 0, 0.6);

  /* soft, rounded geometry */
  --ds-radius: 14px;
  --ds-radius-sm: 10px;
  --ds-radius-pill: 999px;
  --ds-font: ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, Arial, sans-serif;
  --ds-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
`;

// Rounded, consistent stroke icons.
const ICONS = {
  check: "M20 6L9 17l-5-5",
  close: "M18 6L6 18M6 6l12 12",
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  sparkles:
    "M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z",
  clock: "M12 7v5l3 2",
  alert: "M12 8v4M12 16h.01",
  search: "M20 20l-3.5-3.5",
  flame: "M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1 0 1-2 1-8z",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z M14 3v5h5",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z",
  brain:
    "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 18h2V4z M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 18h-2V4z",
  help: "M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17h.01",
  tool: "M14.5 6.5a3.5 3.5 0 1 0 4.9 4.9l-1.6-1.6 1.5-1.5-3.2-3.2-1.5 1.5-1.6-1.6z M12.9 9.1L4 18",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3",
  bug: "M9 6l1.5 2M15 6l-1.5 2M4 11h3M17 11h3M5 17l2.5-1.5M19 17l-2.5-1.5M12 8v10",
  pen: "M4 20l4-1 10-10-3-3L5 16l-1 4z M14 6l3 3",
  clipboard: "M9 4a3 3 0 0 1 6 0M9 11h6M9 15h6",
  build: "M14 5l5 5-2 2-5-5 2-2z M12 8L4 16v4h4l8-8",
  globe: "M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z",
  rocket:
    "M12 3c3 2 5 5 5 9l-3 3H10l-3-3c0-4 2-7 5-9z M10 15l-2 5 4-2M14 15l2 5-4-2",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11z",
  server: "M4 6h16v5H4zM4 13h16v5H4zM7 8.5h.01M7 15.5h.01",
};

const CIRCLES = {
  clock: [12, 12, 9], alert: [12, 12, 9], help: [12, 12, 9],
  search: [11, 11, 7], bug: [12, 13, 5], globe: [12, 12, 9],
};
const RECTS = { clipboard: [6, 4, 12, 17, 2] };

function buildSvg(name) {
  const parts = [];
  const r = RECTS[name];
  if (r) parts.push(`<rect x='${r[0]}' y='${r[1]}' width='${r[2]}' height='${r[3]}' rx='${r[4]}'/>`);
  const c = CIRCLES[name];
  if (c) parts.push(`<circle cx='${c[0]}' cy='${c[1]}' r='${c[2]}'/>`);
  if (ICONS[name]) parts.push(`<path d='${ICONS[name]}'/>`);
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.25' stroke-linecap='round' stroke-linejoin='round'>${parts.join("")}</svg>`;
}

function toUrl(svg) {
  const enc = svg
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ");
  return `url("data:image/svg+xml,${enc}")`;
}

const ICON_BASE = `/* SVG icon system — markup: <span class="ds-ic" data-ic="check"></span> */
.ds-ic {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
  background-color: currentColor;
  -webkit-mask: var(--ds-icon) center / contain no-repeat;
          mask: var(--ds-icon) center / contain no-repeat;
  vertical-align: -0.125em;
}
`;

const iconRules = Object.keys(ICONS)
  .map((n) => `.ds-ic[data-ic="${n}"] { --ds-icon: ${toUrl(buildSvg(n))}; }`)
  .join("\n");

// Component classes — all presentation lives here, not in JS strings.
const COMPONENTS = `
/* ---- Badge bar ---- */
.ds-badge-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  font-family: var(--ds-font); font-size: 11px; color: var(--ds-fg-muted);
  margin-bottom: 8px; user-select: none; width: 100%; max-width: 800px;
  margin-left: auto; margin-right: auto;
}
.ds-pills { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ds-pill {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--ds-bg-base); border: 1px solid var(--ds-bg-hover);
  color: var(--ds-fg); padding: 5px 12px; border-radius: var(--ds-radius-pill);
  cursor: pointer; font-weight: 500; transition: border-color .15s, background .15s;
}
.ds-pill:hover { border-color: var(--ds-accent); background: var(--ds-bg-hover); }
.ds-pill.is-all {
  background: var(--ds-blue-soft); color: var(--ds-accent);
  border-color: var(--ds-accent); font-weight: 700;
}
.ds-pill .ds-count { color: var(--ds-fg-muted); font-size: 10px; }
.ds-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--ds-success); box-shadow: 0 0 6px var(--ds-success);
}

/* ---- Running-task chip ---- */
.ds-task {
  display: none; align-items: center; gap: 8px;
  background: var(--ds-bg-elev); border: 1px solid var(--ds-accent);
  color: var(--ds-accent); padding: 5px 12px;
  border-radius: var(--ds-radius-pill); font-weight: 600; font-size: 11px;
}
.ds-task.is-on { display: inline-flex; }
.ds-task .ds-pulse {
  width: 7px; height: 7px; border-radius: 50%; background: var(--ds-accent);
  box-shadow: 0 0 6px var(--ds-accent); animation: ds-pulse 1s infinite alternate;
}
@keyframes ds-pulse { from { opacity: .4; } to { opacity: 1; } }

/* ---- Auto-run toggle ---- */
.ds-auto {
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  color: var(--ds-accent); font-size: 11px; background: var(--ds-bg-inset);
  border: 1px solid var(--ds-bg-hover); padding: 5px 12px;
  border-radius: var(--ds-radius-pill); margin-left: auto;
}
.ds-auto input { cursor: pointer; accent-color: var(--ds-accent); }

/* ---- Action card ---- */
.ds-card {
  margin: 12px 0 16px; background: var(--ds-bg-elev);
  border: 2px solid var(--ds-accent); border-radius: var(--ds-radius);
  padding: 16px; font-family: var(--ds-font); font-size: 13px;
  color: var(--ds-fg); box-shadow: 0 8px 28px var(--ds-shadow-md);
  display: block; position: relative;
}
.ds-card.is-danger { border-color: var(--ds-danger); }
.ds-card.is-historical { border-color: var(--ds-border); }
.ds-card-head {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 700; margin-bottom: 10px;
}
.ds-card-head .ds-title { display: flex; align-items: center; gap: 8px; }
.ds-card-code {
  background: var(--ds-bg-inset); padding: 4px 10px;
  border-radius: var(--ds-radius-sm); color: var(--ds-success);
  font-family: var(--ds-mono); font-size: 12px;
}
.ds-card-label { font-size: 11px; color: var(--ds-fg-muted); margin-bottom: 6px; }
.ds-card-pre, .ds-card-ed {
  width: 100%; box-sizing: border-box;
  background: var(--ds-bg-inset); color: var(--ds-fg);
  border: 1px solid var(--ds-border); border-radius: var(--ds-radius-sm);
  padding: 10px; font-family: var(--ds-mono); font-size: 12px;
  margin-bottom: 12px;
}
.ds-card-ed { height: 78px; }
.ds-card-pre { max-height: 90px; overflow: auto; margin-bottom: 4px; }
.ds-card-controls { display: flex; gap: 10px; align-items: center; }
.ds-btn {
  display: inline-flex; align-items: center; gap: 6px; border: none;
  padding: 9px 18px; border-radius: var(--ds-radius-pill);
  font-weight: 700; font-size: 12px; cursor: pointer; font-family: var(--ds-font);
  transition: transform .1s, filter .15s;
}
.ds-btn:hover { filter: brightness(1.1); }
.ds-btn:active { transform: scale(.97); }
.ds-btn-ok { background: var(--ds-success); color: var(--ds-bg-inset); }
.ds-btn-no { background: var(--ds-danger); color: var(--ds-bg-inset); }
.ds-btn-xs { padding: 3px 10px; font-size: 10px; }
.ds-btn-sm { padding: 4px 12px; font-size: 11px; }
.ds-mb0 { margin-bottom: 0 !important; }
.ds-pad0 { padding: 0 !important; }
.ds-btn-raw {
  background: var(--ds-bg-hover); color: var(--ds-fg-muted);
  padding: 4px 10px; font-size: 10px; border-radius: var(--ds-radius-sm);
}
.ds-note { display: flex; align-items: center; gap: 6px; padding: 4px; font-size: 12px; }
.ds-note-muted { color: var(--ds-fg-muted); font-style: italic; }
.ds-note-success { color: var(--ds-success); }
.ds-note-accent { color: var(--ds-accent); }
.ds-note-danger { color: var(--ds-danger); }

/* ---- Popup helpers ---- */
.ds-tot { color: var(--ds-success); font-size: 11px; }
.ds-token-row { display: flex; gap: 6px; margin-bottom: 10px; }
.ds-token-row #token-in { margin-bottom: 0; }
.ds-token-btn { flex: 0 0 auto; padding: 6px 10px; }
.ds-sk-list { margin-top: 10px; }
.ds-msg { padding: 8px; }
.ds-msg-muted { color: var(--ds-fg-muted); }
.ds-msg-accent { color: var(--ds-accent); }
.ds-msg-danger { color: var(--ds-danger); }
.ds-srv-meta {
  font-size: 10px; color: var(--ds-fg-muted); margin-left: 14px;
}
.ds-srv-check { cursor: pointer; width: 16px; height: 16px; }
.ds-flag-custom { color: var(--ds-success); font-size: 9px; }
.ds-flag-builtin { color: var(--ds-fg-muted); font-size: 9px; }
.ds-row-tight { margin-top: 6px; }

/* ---- Grill-Me interview card ---- */
.ds-grill { border-color: var(--ds-warn) !important; }
.ds-grill-hist {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 700; color: var(--ds-fg-muted);
}
.ds-grill-hist .ds-title { display: flex; align-items: center; gap: 8px; }
.ds-grill-count { color: var(--ds-warn); font-size: 12px; }
.ds-grill-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px; border-bottom: 1px solid var(--ds-bg-hover);
  padding-bottom: 8px;
}
.ds-grill-title {
  font-weight: 700; color: var(--ds-warn); font-size: 14px;
  display: flex; align-items: center; gap: 6px;
}
.ds-grill-badge {
  background: var(--ds-warn); color: var(--ds-bg-inset);
  padding: 2px 9px; border-radius: var(--ds-radius-pill);
  font-size: 10px; font-weight: 700;
}
.ds-grill-q { margin-bottom: 14px; }
.ds-grill-q:not(:last-child) {
  border-bottom: 1px solid var(--ds-bg-hover); padding-bottom: 12px;
}
.ds-grill-q-title {
  font-size: 14px; font-weight: 600; color: var(--ds-fg);
  margin-bottom: 10px; line-height: 1.4;
}
.ds-grill-multi {
  color: var(--ds-accent); font-size: 11px; font-weight: 400; margin-left: 6px;
}
.ds-grill-options { display: flex; flex-direction: column; gap: 8px; }
.ds-grill-opt {
  background: var(--ds-bg-inset); border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-sm); padding: 10px 12px; cursor: pointer;
  transition: border-color .15s, background .15s, transform .1s;
  display: flex; align-items: flex-start; gap: 10px;
}
.ds-grill-opt:hover { border-color: var(--ds-warn); }
.ds-grill-opt.is-selected {
  border-color: var(--ds-warn); background: var(--ds-bg-elev);
}
.ds-grill-opt input { margin-top: 3px; cursor: pointer; accent-color: var(--ds-warn); }
.ds-grill-opt-body { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.ds-grill-opt-label { color: var(--ds-warn); font-size: 13px; }
.ds-grill-opt-desc { color: var(--ds-fg-muted); font-size: 11px; line-height: 1.35; }
.ds-grill-custom {
  display: flex; flex-direction: column; gap: 8px;
  border-top: 1px solid var(--ds-bg-hover); padding-top: 10px; margin-top: 10px;
}
.ds-grill-custom-input {
  flex: 1; background: var(--ds-bg-inset); border: 1px solid var(--ds-border);
  color: var(--ds-fg); padding: 9px 12px; border-radius: var(--ds-radius-sm);
  font-size: 12px; outline: none; font-family: var(--ds-font);
}
.ds-grill-custom-input:focus { border-color: var(--ds-warn); }
.ds-grill-submit-row { display: flex; justify-content: flex-end; gap: 8px; }
.ds-grill-submit {
  background: var(--ds-warn); color: var(--ds-bg-inset); border: none;
  padding: 9px 20px; border-radius: var(--ds-radius-pill); font-weight: 700;
  font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  transition: filter .15s, transform .1s;
}
.ds-grill-submit:hover { filter: brightness(1.08); }
.ds-grill-submit:active { transform: scale(.97); }
.ds-grill-answered { color: var(--ds-success); font-weight: 700; padding: 6px; display: flex; align-items: center; gap: 6px; }

/* ---- Floating menus ---- */
.ds-menu {
  position: fixed !important; overflow-y: auto !important;
  background: var(--ds-bg-base) !important; border: 1px solid var(--ds-border) !important;
  border-radius: var(--ds-radius) !important;
  box-shadow: 0 14px 40px var(--ds-shadow-lg) !important;
  z-index: 2147483647 !important; padding: 6px !important;
  font-family: var(--ds-font) !important; color: var(--ds-fg) !important;
  box-sizing: border-box !important; min-width: 220px !important;
  max-height: 320px !important;
}
.ds-menu-sep { margin: 4px 6px; border-top: 1px solid var(--ds-bg-hover); }
.ds-menu.is-skills { padding: 8px !important; max-height: 380px !important; }
.ds-menu-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; border-radius: var(--ds-radius-sm); cursor: pointer;
  font-size: 12px; transition: background .14s;
}
.ds-menu-item:hover, .ds-menu-item.is-active { background: var(--ds-bg-hover); }
.ds-menu-item-main { display: flex; align-items: center; gap: 6px; }
.ds-menu-label { color: var(--ds-accent); font-weight: 700; }
.ds-menu-desc { font-size: 10px; color: var(--ds-fg-muted); }
.ds-menu-count {
  background: var(--ds-bg-hover); color: var(--ds-success);
  padding: 1px 8px; border-radius: var(--ds-radius-pill);
  font-size: 10px; font-weight: 700;
}
.ds-skill-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px 8px; font-size: 11px; font-weight: 700;
  color: var(--ds-brand); border-bottom: 1px solid var(--ds-bg-hover);
  margin-bottom: 4px; text-transform: uppercase; letter-spacing: .5px;
}
.ds-skill-head .ds-menu-desc { font-size: 10px; }
.ds-skill-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 9px 10px; border-radius: var(--ds-radius-sm); cursor: pointer;
  font-size: 13px; transition: background .12s;
}
.ds-skill-item:hover, .ds-skill-item.is-active { background: var(--ds-bg-hover); }
.ds-skill-title { display: flex; align-items: center; gap: 8px; }
.ds-skill-title b { color: var(--ds-accent); font-size: 13px; }
.ds-skill-flag {
  background: var(--ds-warning); color: var(--ds-bg-inset);
  padding: 1px 6px; border-radius: var(--ds-radius-sm);
  font-size: 9px; font-weight: 700;
}
.ds-skill-desc {
  font-size: 11px; color: var(--ds-fg-muted); padding-left: 24px; line-height: 1.35;
}

/* ---- File row (autocomplete) ---- */
.ds-file-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; border-radius: var(--ds-radius-sm);
  cursor: pointer; transition: background .12s; gap: 8px;
}
.ds-file-row:hover { background: var(--ds-bg-hover); }
.ds-file-meta { display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
.ds-file-name {
  color: var(--ds-success); font-weight: 600; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  display: inline-flex; align-items: center; gap: 5px;
}
.ds-file-path {
  font-size: 10px; color: var(--ds-fg-muted); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.ds-file-size { color: var(--ds-fg-muted); font-size: 9px; white-space: nowrap; }

/* ---- Menu polish ---- */
#deepseek-mcp-autocomplete, #deepseek-mcp-skill-menu {
  font-family: var(--ds-font) !important;
  border-radius: var(--ds-radius) !important;
}
`;

const content = [
  "/* AUTO-GENERATED by scripts/gen-theme.mjs — do not edit by hand. */",
  TOKENS,
  ICON_BASE,
  iconRules,
  COMPONENTS,
  "",
].join("\n");

writeFileSync(out, content);
console.log(`wrote ${out} (${content.length} bytes, ${Object.keys(ICONS).length} icons)`);
