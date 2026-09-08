import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EXAMPLES } from './examples.js';
import { baseType } from '../model/library.js';
import { state } from './state.js';
import { audio } from '../audio.js';

// This is a view over the document. Every experiment goes through the same API
// as a hand-wired build and the assistant; saved/shared circuits remain portable.
export function initInventionStudio({ api, examples, frameBench, hud }) {
  const workspace = document.getElementById('workspace');
  const heading = document.createElement('div');
  heading.id = 'invention-heading';
  heading.innerHTML = '<div class="studio-eyebrow"><span></span> THE INVENTION DESK</div><h1></h1><p>Small parts. Endless what-ifs.</p>';
  workspace.appendChild(heading);
  const tools = document.createElement('div');
  tools.id = 'bench-tools';
  tools.setAttribute('aria-label', 'Build tools');
  tools.innerHTML = '<button data-action="undo" aria-label="Undo" title="Undo"><i data-lucide="undo-2"></i></button><button data-action="redo" aria-label="Redo" title="Redo"><i data-lucide="redo-2"></i></button><span></span><button data-action="frame" aria-label="Center invention" title="Center invention"><i data-lucide="scan"></i></button>';
  workspace.appendChild(tools);
  tools.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (action === 'frame') frameBench();
    if (action === 'undo' || action === 'redo') api[action]();
  });
  const experiment = document.createElement('section');
  experiment.id = 'experiment';
  experiment.setAttribute('aria-label', 'Experiment controls');
  experiment.innerHTML = `<div class="experiment-top"><span class="live-dot"></span><b id="experiment-state">Make something happen</b><output id="experiment-current"></output></div>
    <div class="experiment-controls"><button id="experiment-switch" type="button" aria-label="Toggle invention power"><i data-lucide="power"></i><span>On</span></button>
    <label id="power-control"><span>POWER DIAL <output id="power-value"></output></span><input id="invention-power" type="range" min="0" max="100" value="90" aria-label="Invention power"></label></div>
    <p id="experiment-tip">Change something. See what happens.</p>`;
  workspace.appendChild(experiment);
  const slider = experiment.querySelector('input');
  const powerButton = experiment.querySelector('button');
  const current = experiment.querySelector('#experiment-current');
  function parts() {
    const doc = api.get_document();
    return { doc, knob: doc.components.find(c => baseType(c.type) === 'potentiometer'),
      sw: doc.components.find(c => baseType(c.type) === 'switch' || baseType(c.type) === 'push_button') };
  }
  slider.addEventListener('input', () => {
    const { knob } = parts();
    if (knob) api.set_param({ id: knob.id, key: 'resistance', value: 1 + (1 - Number(slider.value) / 100) * ((knob.params.maxResistance || 120) - 1) });
    refresh();
  });
  let heldButton = null;
  function releaseButton() {
    if (!heldButton) return;
    api.set_param_live({ id: heldButton, key: 'closed', value: false }); heldButton = null; refresh();
  }
  powerButton.addEventListener('pointerdown', (event) => {
    const { sw } = parts();
    if (!sw || baseType(sw.type) !== 'push_button') return;
    heldButton = sw.id;
    powerButton.setPointerCapture(event.pointerId);
    api.set_param_live({ id: sw.id, key: 'closed', value: true }); refresh();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) powerButton.addEventListener(type, releaseButton);
  powerButton.addEventListener('keydown', (event) => {
    if (![' ', 'Enter'].includes(event.key) || event.repeat) return;
    const { sw } = parts();
    if (sw && baseType(sw.type) === 'push_button') {
      event.preventDefault(); audio.resume(); heldButton = sw.id;
      api.set_param_live({ id: sw.id, key: 'closed', value: true }); refresh();
    }
  });
  powerButton.addEventListener('keyup', releaseButton);
  powerButton.addEventListener('blur', releaseButton);
  window.addEventListener('blur', releaseButton);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseButton(); });
  powerButton.addEventListener('click', () => {
    const { sw } = parts();
    if (sw && baseType(sw.type) === 'switch') {
      api.set_param({ id: sw.id, key: 'closed', value: !sw.params.closed }); refresh();
    }
  });
  document.querySelectorAll('[data-starter]').forEach(button => button.addEventListener('click', () => {
    const preset = EXAMPLES.find(e => e.id === button.dataset.starter);
    if (!preset) return;
    examples.load(preset);
    window.__mobile?.closeSheet?.();
    frameBench(); refresh();
  }));
  // Circuit details stay available without competing with the first experiment.
  const inspector = document.getElementById('inspector-block');
  const inspectorToggle = document.createElement('button');
  inspectorToggle.id = 'circuit-details-toggle';
  inspectorToggle.textContent = 'Look inside the circuit';
  inspectorToggle.setAttribute('aria-expanded', 'false');
  inspector?.prepend(inspectorToggle);
  inspectorToggle.addEventListener('click', () => {
    const open = inspector.classList.toggle('details-open');
    inspectorToggle.setAttribute('aria-expanded', String(open));
    inspectorToggle.textContent = open ? 'Hide circuit details' : 'Look inside the circuit';
  });
  function refresh() {
    const { doc, knob, sw } = parts();
    heading.querySelector('h1').textContent = doc.components.length ? doc.name || 'Your invention' : 'What will you invent?';
    const e = api.read_electrical();
    const amps = Math.max(0, ...Object.values(e.current || {}).map(Math.abs));
    const running = amps > 0.0001 && e.ok;
    experiment.dataset.live = String(running);
    experiment.querySelector('#experiment-state').textContent = !doc.components.length ? 'Your next idea starts here' : !e.ok ? 'Your circuit needs a fix' : running ? (state.mode === 'sim' ? 'Your invention is running' : 'Your circuit is alive') : 'Ready when you are';
    current.textContent = doc.components.length ? `${Math.round(amps * 1000)} mA` : '';
    experiment.querySelector('#power-control').hidden = !knob;
    powerButton.hidden = !sw;
    powerButton.setAttribute('aria-pressed', String(!!sw?.params.closed));
    powerButton.querySelector('span').textContent = sw?.type === 'push_button' ? 'Hold me' : sw?.params.closed ? 'On' : 'Off';
    if (knob && document.activeElement !== slider) slider.value = String(Math.round(100 * ((knob.params.maxResistance || 120) - knob.params.resistance) / ((knob.params.maxResistance || 120) - 1)));
    experiment.querySelector('#power-value').textContent = Number(slider.value) < 34 ? 'Low' : Number(slider.value) < 75 ? 'Medium' : 'High';
    experiment.querySelector('#experiment-tip').textContent = !e.ok ? 'Open circuit details to find out what needs changing.' : knob ? 'What happens when you turn the power down?' : sw?.type === 'push_button' ? 'Press and hold. Can you tap out a secret code?' : sw ? 'One tiny switch. You decide when it lights up.' : 'Add a part, connect its pins, and see what changes.';
    document.querySelectorAll('[data-starter]').forEach(b => b.classList.toggle('selected', EXAMPLES.find(e => e.id === b.dataset.starter)?.title === doc.name));
  }
  refresh();
  setInterval(refresh, 250);
  try { window.lucide?.createIcons(); } catch { /* optional icon CDN */ }
  hud.setStatus('Drag to explore · scroll to get closer');
}

export function addInventionMat(room) {
  const board = new THREE.Group();
  board.name = 'invention-mat';
  const desk = new THREE.Mesh(new RoundedBoxGeometry(90, 0.08, 48, 2, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x899c90, roughness: 1, envMapIntensity: 0.35 }));
  desk.position.set(0, -0.034, 0); desk.receiveShadow = true; board.add(desk);
  const base = new THREE.Mesh(new RoundedBoxGeometry(39, 0.2, 27, 3, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x204e4b, roughness: 0.86 }));
  base.position.set(0, -0.07, 0); base.receiveShadow = true; board.add(base);
  // Fine measurement grid is part of the working surface, in centimeters.
  const lines = [];
  for (let x = -18; x <= 18; x += 3) lines.push(x, 0.035, -12, x, 0.035, 12);
  for (let z = -12; z <= 12; z += 3) lines.push(-18, 0.035, z, 18, 0.035, z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  board.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x6b9390, transparent: true, opacity: 0.25 })));
  room.group.add(board);
}
