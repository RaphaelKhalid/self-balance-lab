// Phone shell — the ≤820px layout.
//
// On a desktop the app is a three-column cockpit: tray | bench | run panel. On a
// phone that same grid stacked into three short rows and the bench — the whole
// product — ended up a ~130px letterbox between two panels, with the controls
// legend, the coach card, the Hephaestus pill and the round canvas buttons all
// piled on top of it. Nothing about that is fixable with a couple of width
// tweaks, so phones get a different shell:
//
//   • the bench is full-bleed — it owns the screen, always
//   • the tray / connections+inspector become a bottom SHEET, one tab at a time
//   • RUN moves into a fixed bottom bar, next to the sheet tabs
//   • the canvas' round buttons (help / sound / rain / share) move into the top bar
//
// It is a *layout* module: it moves existing nodes and toggles classes, and
// never duplicates a control (a moved node keeps its listeners, so RUN is still
// the same #upload-btn main.js wired). Everything reverts on the way back to a
// wide viewport, so a rotated tablet or a resized desktop window is fine.
import { subscribe } from './state.js';

const PHONE_MQ = '(max-width: 820px)';
const TABS = [
  { id: 'parts', label: 'Parts', icon: 'boxes' },
  { id: 'circuit', label: 'Circuit', icon: 'activity' },
  { id: 'hephaestus', label: 'Hephaestus', icon: 'sparkles' },
];

export function initMobileUI({ onLayoutChange } = {}) {
  // onLayoutChange(reason) — 'enter' | 'leave' | 'sheet' | 'mode'. Only enter/leave
  // change the canvas' size; the caller re-frames the bench on those alone, so
  // opening a sheet never yanks the camera back from wherever you orbited it.
  const mq = window.matchMedia(PHONE_MQ);
  const body = document.body;
  const root = document.documentElement;
  let bar = null;          // the fixed bottom bar (built once, reused)
  let open = null;         // id of the open sheet, or null
  let homes = null;        // original parents/next-siblings, for tearing down

  // ── viewport height ──────────────────────────────────────────
  // 100dvh is right on modern browsers; --app-h is the fallback for the ones
  // that only have 100vh (which on iOS is the *large* viewport, i.e. the bottom
  // of the page hides under Safari's toolbar — which is exactly where RUN sits).
  function syncViewport() {
    const h = window.visualViewport?.height || window.innerHeight;
    root.style.setProperty('--app-h', `${Math.round(h)}px`);
  }
  syncViewport();
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', () => setTimeout(() => { syncViewport(); onLayoutChange?.('enter'); }, 160));

  // ── one-time DOM shaping ─────────────────────────────────────
  // The left panel holds two unrelated things — the parts tray and the
  // connections + inspector readout. On a phone they're separate tabs, so wrap
  // each run of children in a group the CSS can show one at a time. Ids are
  // untouched, so every other module still finds its nodes.
  // On desktop the Inspector lives in #right-panel (see index.html). A phone
  // hides that panel entirely — its RUN button is moved to the bottom bar — so
  // the Inspector has to be carried across, or the phone loses the readout that
  // actually explains the circuit. It rides in the Circuit tab beside
  // CONNECTIONS, which is where it used to live before the desktop rebalance.
  // Moving the node keeps its listeners and its id, so inspector.js never knows.
  function borrowInspector() {
    const block = document.getElementById('inspector-block');
    const left = document.getElementById('left-panel');
    if (!block || !left) return;
    // On the FIRST enter the groups do not exist yet, so it lands in the panel
    // and groupLeftPanel() sweeps it into the circuit group. On a re-enter the
    // groups already exist and are never rebuilt, so it has to be put straight
    // into the circuit group or it would sit outside every tab and never show.
    const target = left.querySelector('[data-mgroup="circuit"]') || left;
    if (block.parentElement !== target) target.appendChild(block);
  }

  function returnInspector() {
    const block = document.getElementById('inspector-block');
    const right = document.getElementById('right-panel');
    if (block && right && block.parentElement !== right) right.appendChild(block);
  }

  function groupLeftPanel() {
    const left = document.getElementById('left-panel');
    if (!left || left.querySelector('[data-mgroup]')) return;
    const kids = [...left.children];
    const splitAt = kids.findIndex(el =>
      el.classList.contains('panel-header') && /connections/i.test(el.textContent || ''));
    if (splitAt < 1) return;
    const parts = document.createElement('div');
    parts.className = 'm-group';
    parts.dataset.mgroup = 'parts';
    const circuit = document.createElement('div');
    circuit.className = 'm-group';
    circuit.dataset.mgroup = 'circuit';
    left.append(parts, circuit);
    kids.slice(0, splitAt).forEach(el => parts.appendChild(el));
    kids.slice(splitAt).forEach(el => circuit.appendChild(el));
  }

  function buildBar() {
    if (bar) return bar;
    bar = document.createElement('nav');
    bar.id = 'mobile-bar';
    bar.setAttribute('aria-label', 'Workspace panels');
    bar.innerHTML = TABS.map(t => `
      <button type="button" class="m-tab" data-sheet="${t.id}" aria-expanded="false">
        <i data-lucide="${t.icon}"></i><span>${t.label}</span>
      </button>`).join('');
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.m-tab');
      if (!btn) return;
      toggleSheet(btn.dataset.sheet);
    });
    document.body.appendChild(bar);
    return bar;
  }

  // A sheet needs a grab handle: it's the affordance that says "this closes",
  // and on a phone a swipe down is the gesture people reach for first.
  function addHandle(el, sheetId) {
    if (!el || el.querySelector(':scope > .m-handle')) return;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'm-handle';
    handle.setAttribute('aria-label', 'Close panel');
    el.prepend(handle);
    let startY = null;
    handle.addEventListener('pointerdown', (e) => { startY = e.clientY; handle.setPointerCapture?.(e.pointerId); });
    handle.addEventListener('pointerup', (e) => {
      const dy = startY == null ? 0 : e.clientY - startY;
      startY = null;
      // a tap or a downward swipe closes; an upward flick re-opens (the sheet
      // is already open, so that only matters mid-drag)
      if (dy > -14) closeSheet(); else openSheet(sheetId);
    });
  }

  // ── sheets ───────────────────────────────────────────────────
  function openSheet(id) {
    open = id;
    body.dataset.sheet = id;
    body.classList.add('sheet-open');
    // Hephaestus is its own panel, not part of the left rail
    document.getElementById('hephaestus')?.classList.toggle('collapsed', id !== 'hephaestus');
    if (id === 'hephaestus') document.getElementById('hephaestus-input')?.focus({ preventScroll: true });
    syncTabs();
    onLayoutChange?.('sheet');
  }
  function closeSheet() {
    open = null;
    delete body.dataset.sheet;
    body.classList.remove('sheet-open');
    document.getElementById('hephaestus')?.classList.add('collapsed');
    document.activeElement?.blur?.();
    syncTabs();
    onLayoutChange?.('sheet');
  }
  function toggleSheet(id) { (open === id ? closeSheet : openSheet)(id); }
  function syncTabs() {
    if (!bar) return;
    for (const btn of bar.querySelectorAll('.m-tab')) {
      const on = btn.dataset.sheet === open;
      btn.classList.toggle('is-open', on);
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
  }

  // ── enter / leave the phone layout ───────────────────────────
  function enter() {
    if (body.classList.contains('is-phone')) return;
    borrowInspector();   // must run BEFORE grouping so it lands in the circuit group
    groupLeftPanel();
    buildBar();
    const upload = document.getElementById('upload-btn');
    const canvasBtns = ['ambient-btn', 'share-btn', 'sound-btn', 'help-btn'].map(id => document.getElementById(id));
    const actions = document.querySelector('.tb-actions');
    // remember where everything came from so leave() can put it back
    homes = [upload, ...canvasBtns].filter(Boolean)
      .map(el => ({ el, parent: el.parentNode, next: el.nextSibling }));
    if (upload) bar.appendChild(upload);                  // RUN sits in the bar
    if (actions) canvasBtns.forEach(el => el && actions.prepend(el));
    addHandle(document.getElementById('left-panel'), 'parts');
    addHandle(document.getElementById('hephaestus-panel'), 'hephaestus');
    body.classList.add('is-phone');
    // the markup's opening line names a tray that is a sheet here
    const status = document.getElementById('hud-status');
    if (status && /from the tray/i.test(status.textContent)) {
      status.textContent = 'Open Parts below and drag a part onto the bench';
    }
    closeSheet();
    try { window.lucide?.createIcons(); } catch { /* icons are best-effort */ }
    onLayoutChange?.('enter');
  }
  function leave() {
    if (!body.classList.contains('is-phone')) return;
    body.classList.remove('is-phone');
    closeSheet();
    for (const { el, parent, next } of homes || []) parent?.insertBefore(el, next);
    homes = null;
    returnInspector();   // hand it back to #right-panel for the desktop layout
    onLayoutChange?.('leave');
  }

  const apply = () => (mq.matches ? enter() : leave());
  mq.addEventListener?.('change', apply);
  apply();

  // RUN takes the screen: collapse the sheet on the way into the sim, and let
  // the sim card (Reset / Bench) own the bottom edge instead of the tab bar.
  subscribe('mode', (mode) => {
    body.classList.toggle('mode-sim', mode === 'sim');
    if (mode === 'sim') closeSheet();
    onLayoutChange?.('mode');
  });

  // Dropping a part is the moment the bench matters — get out of its way.
  window.addEventListener('bench:placed', () => { if (open === 'parts') closeSheet(); });

  return { isPhone: () => body.classList.contains('is-phone'), openSheet, closeSheet };
}
