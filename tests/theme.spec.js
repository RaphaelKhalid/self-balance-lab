// @ts-check
// The 3D rig must follow the theme, and must not trample the bench room doing it.
//
// The CSS shell had a full light token set for months while js/scene.js ignored
// data-theme entirely, so "light mode" was a cream UI wrapped around a fixed
// dark studio. These cover both halves of fixing that.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__api, null, { timeout: 30_000 });
  await page.evaluate(() => {
    try { localStorage.setItem('sbl-seen', '1'); } catch { /* private mode */ }
    document.getElementById('overlay-start')?.click();
  });
}

const setTheme = (page, t) => page.evaluate(
  (v) => document.documentElement.setAttribute('data-theme', v), t);

test('switching the theme retints the 3D scene, warm on light', async ({ page }) => {
  await boot(page);

  await setTheme(page, 'dark');
  await expect.poll(() => page.evaluate(
    () => '#' + window.__view.scene.background.getHexString())).toMatch(/^#[0-9a-f]{6}$/);
  const dark = await page.evaluate(() => ({
    bg: '#' + window.__view.scene.background.getHexString(),
    exposure: window.__view.renderer.toneMappingExposure,
  }));

  await setTheme(page, 'light');
  await expect.poll(() => page.evaluate(
    () => '#' + window.__view.scene.background.getHexString())).not.toBe(dark.bg);
  const light = await page.evaluate(() => '#' + window.__view.scene.background.getHexString());

  const [r, g, b] = [1, 3, 5].map(i => parseInt(light.slice(i, i + 2), 16));
  expect(r).toBeGreaterThan(220);        // it is bright
  expect(r).toBeGreaterThan(b);          // and WARM — cream, not a cool white
  expect(g).toBeGreaterThan(b);
});

test('theming does not overwrite the bench room’s HDRI environment', async ({ page }) => {
  // Regression: setTheme() used to re-bake its studio env map unconditionally,
  // which replaced the Poly Haven HDRI that bench-room.js installs. The IBL is
  // what makes the room read — losing it blew out the counter and killed the
  // shadows. It must only ever replace an env map it created itself.
  await boot(page);
  // wait for the room to finish installing its own environment
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => window.__view.scene.environment?.uuid || null);

  await setTheme(page, 'light');
  await page.waitForTimeout(500);
  await setTheme(page, 'dark');
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => window.__view.scene.environment?.uuid || null);
  expect(after).toBe(before);
});
