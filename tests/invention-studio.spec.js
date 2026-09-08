import { test, expect } from '@playwright/test';

async function studio(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__lab && document.getElementById('invention-power'), null, { timeout: 30000 });
  await page.locator('#overlay-start').evaluate(el => el.click());
}

test('starter fan responds to power and switch, and saves its real document', async ({ page }) => {
  await studio(page);
  await expect(page.locator('#invention-heading h1')).toHaveText('Pocket breeze');
  const amps = () => page.evaluate(() => Math.abs(window.__api.read_electrical().current.fan1));
  const initial = await amps();
  await page.locator('#invention-power').fill('15');
  await expect.poll(amps).toBeLessThan(initial / 2);
  await page.locator('#experiment-switch').click();
  await expect.poll(amps).toBeLessThan(0.0001);
  await expect(page.locator('#experiment-switch')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gyro-doc-v2') || '{}').components?.find(c => c.id === 'sw1')?.params.closed)).toBe(false);
  await page.reload();
  await page.waitForFunction(() => window.__lab, null, { timeout: 30000 });
  await expect(page.locator('#experiment-switch')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(amps).toBeLessThan(0.0001);
});

test('starter signal is momentary and light template works without an AI request', async ({ page }) => {
  let requests = 0;
  page.on('request', r => { if (r.url().includes('/api/hephaestus')) requests++; });
  await studio(page);
  await page.locator('[data-starter="button-buzzer"]').click();
  const amps = () => page.evaluate(() => Math.abs(window.__api.read_electrical().current.buz1));
  await expect.poll(amps).toBeLessThan(0.0001);
  await page.locator('#experiment-switch').focus();
  await page.keyboard.down('Space');
  await expect.poll(amps).toBeGreaterThan(0.01);
  await page.keyboard.up('Space');
  await expect.poll(amps).toBeLessThan(0.0001);
  await page.locator('[data-starter="switch-lamp"]').click();
  // Software WebGL can delay a browser poll while another context is rendering.
  await expect.poll(() => page.evaluate(() => Math.abs(window.__api.read_electrical().current.lamp1)), { timeout: 15_000 }).toBeGreaterThan(0.1);
  expect(requests).toBe(0);
});

test('phone starter choice returns to a usable full bench', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await studio(page);
  await page.evaluate(() => window.__mobile.openSheet('parts'));
  await page.locator('[data-starter="switch-lamp"]').click();
  await expect(page.locator('body')).not.toHaveClass(/sheet-open/);
  await expect(page.locator('#experiment-switch')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('API layout changes move settled models and undo restores the visible pose', async ({ page }) => {
  await studio(page);
  await page.waitForFunction(() => window.__lab.assemblyApi.debugPositions().fan1?.[1] < 1, null, { timeout: 30000 });
  await page.evaluate(() => window.__api.move_component({ id: 'fan1', pos: [13, 1, -2] }));
  await expect.poll(() => page.evaluate(() => window.__lab.assemblyApi.debugPositions().fan1[0])).toBeCloseTo(13, 1);
  await page.evaluate(() => window.__api.undo());
  await expect.poll(() => page.evaluate(() => window.__lab.assemblyApi.debugPositions().fan1[0])).toBeCloseTo(7, 1);
});
