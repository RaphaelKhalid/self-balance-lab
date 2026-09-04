// Product motion for the DOM shell. The Three.js worlds keep their own render
// loops; this module only choreographs interface state so it stays lightweight.
import { subscribe } from './state.js';

// Motion's official quick start documents direct ESM CDN loading. The version
// is pinned so a future package release cannot silently change production.
// Source: https://motion.dev/docs/quick-start
const MOTION_MODULE = 'https://cdn.jsdelivr.net/npm/motion@11.13.5/+esm';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export async function initProductMotion() {
  if (window.matchMedia?.(REDUCED_MOTION).matches) return;

  try {
    const { animate, stagger } = await import(MOTION_MODULE);
    const present = (selector) => [...document.querySelectorAll(selector)];

    animate('#topbar', { opacity: [0, 1] }, { duration: 0.18, ease: 'easeOut' });

    const frame = present('#left-panel, #right-panel, #workspace');
    animate(frame, { opacity: [0, 1] }, {
      duration: 0.2,
      delay: stagger(0.025),
      ease: 'easeOut',
    });

    const cards = present('#parts-tray .part-card');
    animate(cards, { opacity: [0, 1] }, {
      duration: 0.16,
      delay: stagger(0.012, { startDelay: 0.05 }),
      ease: 'easeOut',
    });

    const celebrate = () => animate('#workspace-hud',
      { opacity: [0.72, 1] }, { duration: 0.18, ease: 'easeOut' });
    window.addEventListener('bench:placed', celebrate);

    document.getElementById('examples-btn')?.addEventListener('click', () => {
      requestAnimationFrame(() => {
        if (!document.getElementById('examples-panel')?.classList.contains('hidden')) {
          animate('#examples-panel', { opacity: [0, 1] }, { duration: 0.16, ease: 'easeOut' });
        }
      });
    });

    document.getElementById('hephaestus-toggle')?.addEventListener('click', () => {
      requestAnimationFrame(() => {
        if (!document.getElementById('hephaestus')?.classList.contains('collapsed')) {
          animate('#hephaestus-panel', { opacity: [0, 1] }, { duration: 0.16, ease: 'easeOut' });
        }
      });
    });

    subscribe('mode', (mode) => {
      if (mode !== 'sim') return;
      requestAnimationFrame(() => animate('#sim-hud',
        { opacity: [0, 1] }, { duration: 0.18, ease: 'easeOut' }));
    });
  } catch {
    // Motion is enhancement-only. A blocked CDN must never stop the lab.
  }
}
