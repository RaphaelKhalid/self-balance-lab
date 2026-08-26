// @ts-check
// The ambient rain loop: opt-in, lazily fetched, and genuinely gapless.
import { test, expect } from '@playwright/test';

test('ambient rain is not downloaded until you ask for it, then it plays and loops', async ({ page }) => {
  const audioRequests = [];
  page.on('request', r => { if (/rain-loop\.mp3/.test(r.url())) audioRequests.push(r.url()); });

  await page.goto('/');
  await page.waitForFunction(() => !!window.__api, null, { timeout: 30_000 });
  await page.evaluate(() => {
    try { localStorage.setItem('sbl-seen', '1'); } catch { /* private mode */ }
    document.getElementById('overlay-start')?.click();
  });
  await page.waitForTimeout(1500);

  // the whole point of lazy loading: a visitor who never turns it on pays nothing
  expect(audioRequests).toHaveLength(0);

  await page.locator('#ambient-btn').click();
  await expect.poll(() => audioRequests.length, { timeout: 20_000 }).toBe(1);

  // it is really decoded and playing on a loop, not just fetched
  await expect.poll(() => page.evaluate(() => {
    const a = window.__lab?.audio || null;
    return a ? { on: a.ambientOn, looping: !!a.ambientSrc?.loop, secs: a.ambientBuf?.duration ?? 0 } : null;
  }), { timeout: 20_000 }).toEqual({ on: true, looping: true, secs: 60 });

  await expect(page.locator('#ambient-btn')).toHaveAttribute('aria-pressed', 'true');

  // and switching off stops it without re-fetching
  await page.locator('#ambient-btn').click();
  await expect.poll(() => page.evaluate(() => window.__lab.audio.ambientOn)).toBe(false);
  expect(audioRequests).toHaveLength(1);
});
