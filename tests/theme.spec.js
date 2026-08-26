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
  // Warm, and deliberately NOT near-white. The first two attempts at this theme
  // were too bright — the second sat at 0.81 luminance, brighter than any colour
  // in the painting the palette is sampled from, whose lightest tone is 0.44.
  // The band below keeps it a light theme while forbidding a return to glare.
  expect(r).toBeGreaterThan(g);          // warm: red leads
  expect(g).toBeGreaterThan(b);          // ...through green, down to blue
  expect(r).toBeGreaterThan(150);        // still a LIGHT theme, not a dark one
  expect(r).toBeLessThan(225);           // but not the near-white it used to be
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

test('a first-time visitor gets cream, and a saved choice still wins', async ({ page }) => {
  // Cream is the identity, so it must not be opt-in. It is set on <html> rather
  // than applied by topbar.js, which also removes the flash of dark that used to
  // happen while the module graph resolved.
  await page.goto('/');
  await page.waitForFunction(() => !!window.__api, null, { timeout: 30_000 });
  expect(await page.evaluate(
    () => document.documentElement.getAttribute('data-theme'))).toBe('light');

  // the 3D booted warm too, not just the DOM shell
  const bg = await page.evaluate(() => '#' + window.__view.scene.background.getHexString());
  const [r, b] = [1, 5].map(i => parseInt(bg.slice(i, i + 2), 16));
  expect(r).toBeGreaterThan(b);

  // someone who has actively chosen dark keeps dark
  await page.evaluate(() => { try { localStorage.setItem('sbl-theme', 'dark'); } catch { /* ignore */ } });
  await page.reload();
  await page.waitForFunction(() => !!window.__api, null, { timeout: 30_000 });
  expect(await page.evaluate(
    () => document.documentElement.getAttribute('data-theme'))).toBe('dark');
});

test('the Inspector lives in the right panel on desktop', async ({ page }) => {
  // The left column used to stack tray + connections + inspector, each with its
  // own scrollbar, while the right panel held a hint and one button.
  await page.goto('/');
  await page.waitForFunction(() => !!window.__api, null, { timeout: 30_000 });
  expect(await page.evaluate(
    () => !!document.querySelector('#right-panel #inspector-block'))).toBe(true);
  expect(await page.evaluate(
    () => !!document.querySelector('#left-panel #inspector-block'))).toBe(false);
});
