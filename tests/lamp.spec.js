// @ts-check
// The desk lamp is a switch, and a photoresistor reads it.
//
// This is the chain the whole product is about, made physical: flick a real
// lamp in the room → a sensor's resistance changes → the solver recomputes →
// current through the motor changes. Nothing is faked at any step.
import { test, expect } from '@playwright/test';

test('switching the desk lamp changes the current through a photoresistor circuit', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__api, null, { timeout: 30_000 });
  await page.evaluate(() => {
    try { localStorage.setItem('sbl-seen', '1'); } catch { /* private mode */ }
    document.getElementById('overlay-start')?.click();
    const api = window.__api;
    api.loadDocument({
      v: 2, robotId: 'self-balancer', name: 't', components: [], nets: [],
      code: null, sim: { gravity: -9.81, seed: 42 }, meta: { revision: 0 },
    });
    api.place_component({ type: 'battery', id: 'bat1' });
    api.place_component({ type: 'photoresistor', id: 'ldr1' });
    api.place_component({ type: 'motor', id: 'motor1' });
    api.connect({ from: 'bat1.+', to: 'ldr1.A' });
    api.connect({ from: 'ldr1.B', to: 'motor1.A' });
    api.connect({ from: 'motor1.B', to: 'bat1.-' });
  });

  const amps = () => page.evaluate(
    () => Math.abs(window.__api.read_electrical().current?.motor1 ?? 0));

  // the room lamp is on by default, so the sensor is lit and current flows
  await expect.poll(amps, { timeout: 15_000 }).toBeGreaterThan(0.2);

  // flick it off — the photoresistor goes dark and the motor starves
  await page.evaluate(() => window.__benchRoom.lamp.setOn(false));
  await expect.poll(amps, { timeout: 15_000 }).toBeLessThan(0.01);

  // and back on
  await page.evaluate(() => window.__benchRoom.lamp.setOn(true));
  await expect.poll(amps, { timeout: 15_000 }).toBeGreaterThan(0.2);
});

test('the lamp light itself actually goes out, not just the sensor reading', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__benchRoom, null, { timeout: 30_000 });
  const glow = () => page.evaluate(() => window.__benchRoom.lamp.glow.intensity);
  expect(await glow()).toBeGreaterThan(0);
  await page.evaluate(() => window.__benchRoom.lamp.setOn(false));
  expect(await glow()).toBe(0);
  await page.evaluate(() => window.__benchRoom.lamp.setOn(true));
  expect(await glow()).toBeGreaterThan(0);
});
