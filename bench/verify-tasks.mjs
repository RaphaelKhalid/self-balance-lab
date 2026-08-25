// Proves every benchmark task is solvable before any model is charged for it.
//
//   node bench/verify-tasks.mjs
//
// A benchmark whose tasks cannot be passed measures nothing — a model failing an
// impossible task is not a finding. So each task here carries a hand-built
// reference solution, and this script asserts the solver grades it as a PASS.
// It also prints the solved currents, which is how the pass bands in tasks.js
// were chosen in the first place. Costs nothing and needs no API key.
import { createWorkspace, runTool } from '../mcp/workspace.js';
import { TASKS } from './tasks.js';

/** Reference solutions: the build a competent human would produce. */
const SOLUTIONS = {
  'motor-spins': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'motor', id: 'motor1' }],
    ['connect', { from: 'bat1.+', to: 'motor1.A' }],
    ['connect', { from: 'bat1.-', to: 'motor1.B' }],
  ],

  // 220Ω puts the LED at ~23mA, comfortably under its 30mA limit. The library's
  // default 100Ω would give ~48mA — which is exactly the trap being tested.
  'led-lit-safely': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'resistor', id: 'res1' }],
    ['set_param', { id: 'res1', key: 'resistance', value: 220 }],
    ['place_component', { type: 'led', id: 'led1' }],
    ['connect', { from: 'bat1.+', to: 'res1.A' }],
    ['connect', { from: 'res1.B', to: 'led1.A' }],
    ['connect', { from: 'led1.K', to: 'bat1.-' }],
  ],

  'switch-controls-motor': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'switch', id: 'sw1' }],
    ['place_component', { type: 'motor', id: 'motor1' }],
    ['connect', { from: 'bat1.+', to: 'sw1.A' }],
    ['connect', { from: 'sw1.B', to: 'motor1.A' }],
    ['connect', { from: 'motor1.B', to: 'bat1.-' }],
    ['set_param', { id: 'sw1', key: 'closed', value: 1 }],
  ],

  // I = 7.4 / (0.4 + 2 + 12) ≈ 0.51 A — inside the 0.3–0.8 A band.
  'motor-speed-limited': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'potentiometer', id: 'pot1' }],
    ['set_param', { id: 'pot1', key: 'resistance', value: 12 }],
    ['place_component', { type: 'motor', id: 'motor1' }],
    ['connect', { from: 'bat1.+', to: 'pot1.A' }],
    ['connect', { from: 'pot1.B', to: 'motor1.A' }],
    ['connect', { from: 'motor1.B', to: 'bat1.-' }],
  ],

  'motor-reversed': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'motor', id: 'motor1' }],
    ['connect', { from: 'bat1.-', to: 'motor1.A' }],
    ['connect', { from: 'bat1.+', to: 'motor1.B' }],
  ],

  // A bare battery→motor loop pulls ~3 A through a 1 A fuse. 10Ω brings it to
  // ~0.6 A, so the fuse survives and the motor still turns.
  'fuse-survives': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'fuse', id: 'fuse1' }],
    ['place_component', { type: 'resistor', id: 'res1' }],
    ['set_param', { id: 'res1', key: 'resistance', value: 10 }],
    ['place_component', { type: 'motor', id: 'motor1' }],
    ['connect', { from: 'bat1.+', to: 'fuse1.A' }],
    ['connect', { from: 'fuse1.B', to: 'res1.A' }],
    ['connect', { from: 'res1.B', to: 'motor1.A' }],
    ['connect', { from: 'motor1.B', to: 'bat1.-' }],
  ],

  'two-leds-parallel': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'resistor', id: 'res1' }],
    ['set_param', { id: 'res1', key: 'resistance', value: 220 }],
    ['place_component', { type: 'resistor', id: 'res2' }],
    ['set_param', { id: 'res2', key: 'resistance', value: 220 }],
    ['place_component', { type: 'led', id: 'led1' }],
    ['place_component', { type: 'led', id: 'led2' }],
    ['connect', { from: 'bat1.+', to: 'res1.A' }],
    ['connect', { from: 'res1.B', to: 'led1.A' }],
    ['connect', { from: 'led1.K', to: 'bat1.-' }],
    ['connect', { from: 'bat1.+', to: 'res2.A' }],
    ['connect', { from: 'res2.B', to: 'led2.A' }],
    ['connect', { from: 'led2.K', to: 'bat1.-' }],
  ],

  'diode-conducts': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'diode', id: 'd1' }],
    ['place_component', { type: 'lamp', id: 'lamp1' }],
    ['connect', { from: 'bat1.+', to: 'd1.A' }],
    ['connect', { from: 'd1.K', to: 'lamp1.A' }],
    ['connect', { from: 'lamp1.B', to: 'bat1.-' }],
  ],

  'buzzer-safe': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'buzzer', id: 'buz1' }],
    ['connect', { from: 'bat1.+', to: 'buz1.+' }],
    ['connect', { from: 'buz1.-', to: 'bat1.-' }],
  ],

  'button-and-led': [
    ['place_component', { type: 'battery', id: 'bat1' }],
    ['place_component', { type: 'push_button', id: 'btn1' }],
    ['place_component', { type: 'resistor', id: 'res1' }],
    ['set_param', { id: 'res1', key: 'resistance', value: 220 }],
    ['place_component', { type: 'led', id: 'led1' }],
    ['connect', { from: 'bat1.+', to: 'btn1.A' }],
    ['connect', { from: 'btn1.B', to: 'res1.A' }],
    ['connect', { from: 'res1.B', to: 'led1.A' }],
    ['connect', { from: 'led1.K', to: 'bat1.-' }],
    ['set_param', { id: 'btn1', key: 'closed', value: 1 }],
  ],
};

let failures = 0;

for (const task of TASKS) {
  const steps = SOLUTIONS[task.id];
  if (!steps) {
    console.log(`  ${task.id.padEnd(24)} NO REFERENCE SOLUTION`);
    failures++;
    continue;
  }

  const ws = createWorkspace();
  const badStep = steps.find(([name, input]) => {
    const r = runTool(ws, name, input);
    return r.ok === false;
  });

  const api = ws.get();
  const solve = api.read_electrical();
  const passed = !badStep && Boolean(task.pass(solve));
  if (!passed) failures++;

  const currents = Object.fromEntries(
    Object.entries(solve.current || {}).map(([k, v]) => [k, Number(v.toFixed(4))]),
  );
  const errs = (solve.violations || []).filter(v => v.level === 'error').map(v => v.message);

  console.log(`  ${task.id.padEnd(24)} ${passed ? 'solvable' : 'UNSOLVABLE'}`);
  if (badStep) console.log(`      failed step: ${badStep[0]} ${JSON.stringify(badStep[1])}`);
  console.log(`      currents: ${JSON.stringify(currents)}`);
  if (errs.length) console.log(`      violations: ${errs.join('; ')}`);
}

console.log(`\n  ${TASKS.length - failures}/${TASKS.length} tasks have a working reference solution\n`);
process.exit(failures ? 1 : 0);
