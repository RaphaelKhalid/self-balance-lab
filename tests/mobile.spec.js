// @ts-check
// Phone shell: the ≤820px layout (js/app/mobile.js) and the touch gestures that
// stand in for the mouse verbs (right-click to remove, R to rotate).
//
// The regression these guard against is specific: on a 390px screen the app used
// to stack tray | bench | run panel into three short rows, leaving the 3D bench
// — the product — about 130px tall, with RUN below the fold.
import { test, expect } from '@playwright/test';

const PHONE = { width: 390, height: 664 };

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

async function openApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__api, null, { timeout: 30_000 });
  await page.evaluate(() => {
    try { localStorage.setItem('sbl-seen', '1'); } catch { /* private mode */ }
    document.getElementById('overlay-start')?.click();
    document.getElementById('coach-dismiss')?.click();
    // These are layout + gesture tests, not first-run tests: start from a bare
    // bench so a tap or a long press is measured against parts the test placed,
    // not against whatever the cold open seeded.
    window.__api.loadDocument({ v: 2, robotId: 'self-balancer', name: 't', components: [], nets: [],
      code: null, sim: { gravity: -9.81, seed: 42 }, meta: { revision: 0 } });
  });
  await page.waitForTimeout(400);
}

// A part dropped on the bench falls under real Rapier gravity, so it is still
// moving for a while after place_component returns. CLAUDE.md is explicit that
// headless WebGL runs slower than real time and tests must poll rather than use
// fixed waits — a fixed 900ms was a coin flip on a loaded CI runner, and when it
// lost, screenPointOf aimed at where the part *had been*, the gesture landed on
// empty bench, and the test failed for reasons that had nothing to do with the
// gesture. Poll until the body actually stops moving instead.
async function waitUntilSettled(page, id) {
  let last = null;
  await expect.poll(async () => {
    const p = await page.evaluate(
      (cid) => window.__lab.assemblyApi.debugPositions()[cid], id);
    if (!p) return false;
    const still = last
      && Math.abs(p[0] - last[0]) < 1e-3
      && Math.abs(p[1] - last[1]) < 1e-3
      && Math.abs(p[2] - last[2]) < 1e-3;
    last = p;
    return Boolean(still);
  }, { timeout: 20_000, intervals: [100] }).toBe(true);
}

// screen-space centre of a placed part, from its live (physics-driven) mesh
async function screenPointOf(page, id) {
  return page.evaluate((compId) => {
    const { camera } = window.__view;
    const p = window.__lab.assemblyApi.debugPositions()[compId];
    const v = { x: p[0], y: p[1] + 1, z: p[2] };
    const mul = (m, a) => ({
      x: m[0] * a.x + m[4] * a.y + m[8] * a.z + m[12],
      y: m[1] * a.x + m[5] * a.y + m[9] * a.z + m[13],
      z: m[2] * a.x + m[6] * a.y + m[10] * a.z + m[14],
    });
    const view = camera.matrixWorldInverse.elements, proj = camera.projectionMatrix.elements;
    const eye = mul(view, v);
    const clip = mul(proj, eye);
    const w = proj[3] * eye.x + proj[7] * eye.y + proj[11] * eye.z + proj[15];
    const r = document.getElementById('three-canvas').getBoundingClientRect();
    return { x: r.left + (clip.x / w + 1) / 2 * r.width, y: r.top + (1 - clip.y / w) / 2 * r.height };
  }, id);
}

test('the bench gets the screen: full-bleed canvas, RUN in a fixed bar, no page scroll', async ({ page }) => {
  await openApp(page);
  const m = await page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); return el && el.getBoundingClientRect(); };
    const canvas = box('#three-canvas'), bar = box('#mobile-bar'), run = box('#upload-btn');
    return {
      isPhone: document.body.classList.contains('is-phone'),
      canvasH: canvas.height, viewH: window.innerHeight,
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      runInBar: !!document.querySelector('#mobile-bar #upload-btn'),
      runVisible: run.bottom <= window.innerHeight + 1 && run.width > 0,
      barBottom: Math.round(bar.bottom),
    };
  });
  expect(m.isPhone).toBe(true);
  // the bench, not the panels, owns the viewport
  expect(m.canvasH / m.viewH).toBeGreaterThan(0.6);
  expect(m.scrollW).toBe(m.clientW);          // nothing overflows sideways
  expect(m.runInBar).toBe(true);
  expect(m.runVisible).toBe(true);            // RUN is never below the fold
  expect(m.barBottom).toBeLessThanOrEqual(PHONE.height + 1);
});

test('the parts tray is a sheet that opens and closes from the bar', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#left-panel')).not.toBeVisible();
  await page.tap('#mobile-bar .m-tab[data-sheet="parts"]');
  await expect(page.locator('#parts-tray .part-card[data-type="battery"]')).toBeVisible();

  // the circuit tab swaps groups inside the same sheet
  await page.tap('#mobile-bar .m-tab[data-sheet="circuit"]');
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#parts-tray')).not.toBeVisible();

  // tapping the open tab again puts the whole screen back on the bench
  await page.tap('#mobile-bar .m-tab[data-sheet="circuit"]');
  await expect(page.locator('#left-panel')).not.toBeVisible();
});

test('tapping a part card places it on the bench and gets the sheet out of the way', async ({ page }) => {
  await openApp(page);
  await page.tap('#mobile-bar .m-tab[data-sheet="parts"]');
  await page.tap('#parts-tray .part-card[data-type="battery"]');
  await page.waitForFunction(() => window.__api.get_document().components.length === 1, null, { timeout: 10_000 });

  const placed = await page.evaluate(() => {
    const c = window.__api.get_document().components[0];
    return { type: c.type, pos: c.transform.pos, sheetOpen: document.body.classList.contains('sheet-open') };
  });
  expect(placed.type).toBe('battery');
  expect(placed.sheetOpen).toBe(false);
  // on the bench, not off in the room behind it (the bench walls sit at ±26)
  expect(Math.abs(placed.pos[0])).toBeLessThan(26);
  expect(Math.abs(placed.pos[2])).toBeLessThan(26);
});

test('a long press removes a part — the touch stand-in for right-click', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__api.place_component({ type: 'battery', id: 'bat1', transform: { pos: [4, 1, 2], rot: [0, 0, 0] } }));
  await waitUntilSettled(page, 'bat1');
  const pt = await screenPointOf(page, 'bat1');

  await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('three-canvas');
    const opts = { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
  }, pt);
  await page.waitForTimeout(700);           // longer than the 500ms press
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', bubbles: true }));
  }, pt);

  await expect.poll(() => page.evaluate(() => window.__api.get_document().components.length)).toBe(0);
});

test('a double tap rotates a part — the touch stand-in for the R key', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__api.place_component({ type: 'battery', id: 'bat1', transform: { pos: [4, 1, 2], rot: [0, 0, 0] } }));
  await waitUntilSettled(page, 'bat1');
  const pt = await screenPointOf(page, 'bat1');
  const yawBefore = await page.evaluate(() => window.__api.get_document().components[0].transform.rot[1]);

  // Both taps go out in one synchronous burst: the gap is measured when the
  // click handler runs, and a software-WebGL frame can stall the main thread for
  // most of a second — long enough to look like two separate taps.
  await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('three-canvas');
    const opts = { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true };
    const tap = () => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
      window.dispatchEvent(new PointerEvent('pointerup', opts));
      canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    };
    tap(); tap();
  }, pt);

  const yawAfter = await page.evaluate(() => window.__api.get_document().components[0].transform.rot[1]);
  expect(yawAfter).not.toBe(yawBefore);
});

test.describe('desktop is untouched', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('a wide viewport keeps the three-column cockpit', async ({ page }) => {
    await openApp(page);
    const m = await page.evaluate(() => ({
      isPhone: document.body.classList.contains('is-phone'),
      bar: !!document.querySelector('#mobile-bar')?.checkVisibility?.(),
      runInPanel: !!document.querySelector('#right-panel #upload-btn'),
      trayVisible: !!document.querySelector('#parts-tray')?.checkVisibility?.(),
    }));
    expect(m).toEqual({ isPhone: false, bar: false, runInPanel: true, trayVisible: true });
  });
});
