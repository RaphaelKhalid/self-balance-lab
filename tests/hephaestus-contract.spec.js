// Pure contract checks plus a mocked browser check; no live AI key required.
import { test, expect } from '@playwright/test';
import { createApi } from '../js/api/index.js';
import { geminiFunctionDeclarations, runTool } from '../js/api/tools.js';
import { describeToolResult } from '../js/app/hephaestus.js';

test('assistant switch changes control actual current and remain undoable', async () => {
  const api = createApi();
  api.place_component({ type: 'battery', id: 'power' });
  api.place_component({ type: 'motor', id: 'output' });
  api.place_component({ type: 'switch', id: 'control' });
  api.connect({ from: 'power.+', to: 'control.A' });
  api.connect({ from: 'control.B', to: 'output.A' });
  api.connect({ from: 'output.B', to: 'power.-' });
  expect(Math.abs(api.read_electrical().current.output)).toBeLessThan(0.000001);
  expect(await runTool(api, 'set_switch', { id: 'control', closed: true })).toMatchObject({ ok: true });
  expect(api.read_electrical().current.output).toBeGreaterThan(1);
  api.undo();
  expect(Math.abs(api.read_electrical().current.output)).toBeLessThan(0.000001);
  const before = api.get_document();
  expect(await runTool(api, 'set_switch', { id: 'output', closed: true })).toMatchObject({ ok: false });
  expect(await runTool(api, 'set_switch', { id: 'control', closed: 'false' })).toMatchObject({ ok: false });
  expect(api.get_document()).toEqual(before);
});

test('assistant moves preserve other transforms and reject malformed coordinates', async () => {
  const api = createApi();
  api.place_component({ type: 'battery', id: 'power', transform: { pos: [0, 1, 0], rot: [0, 0.5, 0] } });
  expect(await runTool(api, 'move_component', { id: 'power', pos: [-8, 1, 4] })).toMatchObject({ ok: true });
  expect(api.get_document().components[0].transform).toEqual({ pos: [-8, 1, 4], rot: [0, 0.5, 0] });
  const before = api.get_document();
  expect(await runTool(api, 'move_component', { id: 'power', pos: [1, 2] })).toMatchObject({ ok: false });
  expect(await runTool(api, 'move_component', { id: 'power', pos: [1, Infinity, 2] })).toMatchObject({ ok: false });
  expect(api.get_document()).toEqual(before);
  expect(await runTool(api, 'set_name', { name: '  Breeze Machine  ' })).toMatchObject({ ok: true });
  expect(api.get_document().name).toBe('Breeze Machine');
});

test('the boolean switch contract is separate from numeric parameters', async () => {
  const declarations = geminiFunctionDeclarations();
  expect(declarations.find(tool => tool.name === 'set_switch').parameters.properties.closed.type).toBe('boolean');
  expect(declarations.find(tool => tool.name === 'set_param').parameters.properties.value.type).toBe('number');
  const api = createApi();
  api.place_component({ type: 'switch', id: 'control' });
  expect(await runTool(api, 'set_param', { id: 'control', key: 'closed', value: 1 })).toMatchObject({ ok: false });
  expect(api.get_document().components[0].params.closed).toBe(false);
});

test('receipts distinguish failed wiring and an unpowered circuit from success', () => {
  const doc = { components: [{ id: 'internal-battery-239', type: 'battery' }, { id: 'internal-motor-901', type: 'motor' }] };
  const args = { from: 'internal-battery-239.+', to: 'internal-motor-901.A' };
  expect(describeToolResult('connect', args, { ok: true, changed: true }, doc)).toBe('Connected the battery to the motor.');
  expect(describeToolResult('connect', args, { ok: false, errors: ['Unknown endpoint internal-motor-901.A'] }, doc)).toBe('That wire could not be connected.');
  expect(describeToolResult('read_electrical', {}, { ok: true, current: { 'internal-motor-901': 0 }, violations: [] }, doc)).toContain('no power is flowing');
  expect(describeToolResult('read_electrical', {}, { ok: true, current: { 'internal-motor-901': 0.5 }, violations: [] }, doc)).toContain('power is flowing through');
});

test('an asynchronous tool failure is returned to the model for repair', async () => {
  const api = { run_sim: async () => { throw new Error('Physics could not start'); } };
  expect(await runTool(api, 'run_sim', {})).toMatchObject({ ok: false, errors: ['Physics could not start'] });
});

test('unavailable AI offers real templates without charging quota or claiming a build', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__lab?.hephaestus, null, { timeout: 20_000 });
  await page.evaluate(() => {
    localStorage.removeItem('sbl-hephaestus-usage');
    document.getElementById('overlay-start')?.click();
  });
  const before = await page.evaluate(() => window.__api.get_document());
  await page.route('**/api/hephaestus', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.evaluate(() => window.__lab.hephaestus.send('make a fan'));
  await expect(page.locator('#hephaestus-log')).toContainText('isn’t connected');
  await expect(page.locator('#hephaestus-log')).toContainText('Idea shelf');
  await expect(page.locator('#hephaestus-log .hp-tool')).toHaveCount(0);
  await expect(page.locator('#hephaestus-input')).toBeEnabled();
  expect(await page.evaluate(() => window.__api.get_document())).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('sbl-hephaestus-usage'))).toBeNull();

  await page.unroute('**/api/hephaestus');
  let request;
  await page.route('**/api/hephaestus', route => {
    request = route.request().postDataJSON();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: { role: 'model', parts: [{ text: 'Ready to build.' }] } }) });
  });
  await page.evaluate(() => window.__lab.hephaestus.send('try again'));
  expect(request.contents).toEqual([{ role: 'user', parts: [{ text: 'try again' }] }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sbl-hephaestus-usage')).count)).toBe(1);
});
