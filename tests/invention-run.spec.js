// @ts-check
// RUN must test the invention the child made, with live circuit feedback.
import { test, expect } from '@playwright/test';

async function openBench(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__lab?.assemblyApi, null, { timeout: 30_000 });
  await page.evaluate(() => {
    document.getElementById('overlay-start')?.click();
    window.__api.loadDocument({ v: 2, robotId: 'self-balancer', name: 'My invention',
      components: [], nets: [], code: null, sim: { gravity: -9.81, seed: 42 }, meta: { revision: 0 } });
  });
}

test('RUN keeps a non-motor invention and its wires visible on the desk', async ({ page }) => {
  await openBench(page);
  const before = await page.evaluate(() => {
    const api = window.__api;
    api.place_component({ type: 'battery', id: 'power', transform: { pos: [-10, 2, 0], rot: [0, 0, 0] } });
    api.place_component({ type: 'resistor', id: 'limit', params: { resistance: 220 }, transform: { pos: [0, 2, 0], rot: [0, 0, 0] } });
    api.place_component({ type: 'led', id: 'beacon', transform: { pos: [10, 2, 0], rot: [0, 0, 0] } });
    api.connect({ from: 'power.+', to: 'limit.A' });
    api.connect({ from: 'limit.B', to: 'beacon.A' });
    api.connect({ from: 'beacon.K', to: 'power.-' });
    const group = window.__lab.assemblyApi.group;
    return { doc: api.get_document(), children: group.children.map(c => c.uuid) };
  });
  const result = await page.evaluate(() => window.__api.run_sim());
  expect(result.ok).toBe(true);
  expect(result.running).toBe(true);
  const after = await page.evaluate(() => {
    const group = window.__lab.assemblyApi.group;
    let lit = false;
    group.traverse(o => {
      if (o.userData?.role === 'led-lens' && o.material?.emissiveIntensity > 0) lit = true;
    });
    return { visible: group.visible, children: group.children.map(c => c.uuid),
      doc: window.__api.get_document(), current: window.__api.read_electrical().current.beacon, lit };
  });
  expect(after.visible).toBe(true);
  expect(after.children).toEqual(before.children);
  expect(after.doc).toEqual(before.doc);
  expect(after.current).toBeGreaterThan(0.01);
  expect(after.lit).toBe(true);
  const stopped = await page.evaluate(() => window.__api.stop_sim());
  expect(stopped.running).toBe(false);
});

test('a running motor follows edits to the live circuit and removes stale telemetry', async ({ page }) => {
  await openBench(page);
  await page.evaluate(async () => {
    const api = window.__api;
    api.place_component({ type: 'battery', id: 'power' });
    api.place_component({ type: 'motor', id: 'drive' });
    api.connect({ from: 'power.+', to: 'drive.A' });
    api.connect({ from: 'power.-', to: 'drive.B' });
    await api.run_sim();
  });
  await page.waitForFunction(() => window.__api.read_telemetry().omega?.drive > 0.2, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const api = window.__api;
    api.disconnect({ from: 'power.+', to: 'drive.A' });
    api.disconnect({ from: 'power.-', to: 'drive.B' });
    api.connect({ from: 'power.+', to: 'drive.B' });
    api.connect({ from: 'power.-', to: 'drive.A' });
  });
  await page.waitForFunction(() => window.__api.read_telemetry().omega?.drive < -0.2, null, { timeout: 20_000 });
  await page.evaluate(() => window.__api.remove_component({ id: 'drive' }));
  await page.waitForFunction(() => !('drive' in (window.__api.read_telemetry().omega || {})), null, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__lab.assemblyApi.group.visible)).toBe(true);
});

test('motor dynamics stay bounded and replace applied torque on every step', async ({ page }) => {
  await openBench(page);
  const readings = await page.evaluate(async () => {
    const { CreatorSim } = await import('/js/sim/creator-sim.js');
    const { defaultParams } = await import('/js/model/library.js');
    const doc = { v: 2, components: [
      { id: 'power', type: 'battery', params: defaultParams('battery') },
      { id: 'drive', type: 'motor', params: defaultParams('motor') },
    ], nets: [
      { id: 'plus', endpoints: ['power.+', 'drive.A'], edges: [['power.+', 'drive.A']] },
      { id: 'minus', endpoints: ['power.-', 'drive.B'], edges: [['power.-', 'drive.B']] },
    ] };
    const sim = new CreatorSim();
    await sim.build(doc);
    sim.start();
    for (let i = 0; i < 600; i++) sim.step(1 / 60, doc);
    const powered = sim.omega('drive');
    // Removing the source voltage electrically brakes the shaft through the
    // closed loop. Persisting the old torque would keep accelerating it.
    doc.components[0].params.voltsNominal = 0;
    for (let i = 0; i < 600; i++) sim.step(1 / 60, doc);
    const stopped = sim.omega('drive');
    doc.components[0].params.voltsNominal = 7.4;
    doc.nets = [
      { id: 'plus', endpoints: ['power.+', 'drive.B'], edges: [['power.+', 'drive.B']] },
      { id: 'minus', endpoints: ['power.-', 'drive.A'], edges: [['power.-', 'drive.A']] },
    ];
    for (let i = 0; i < 600; i++) sim.step(1 / 60, doc);
    const reversed = sim.omega('drive');
    sim._teardown();
    return { powered, stopped, reversed };
  });
  expect(readings.powered).toBeGreaterThan(1);
  expect(readings.powered).toBeLessThan(7.4 / 0.05);
  expect(Math.abs(readings.stopped)).toBeLessThan(readings.powered * 0.8);
  expect(readings.reversed).toBeLessThan(-1);
});
