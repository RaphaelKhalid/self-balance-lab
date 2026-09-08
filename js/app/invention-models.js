// A family of tangible, molded invention-kit parts. These are views only: the
// circuit document remains the authority for power, control positions and spin.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { partMat } from './part-materials.js';
import { makeFlatLabel } from '../labels.js';

export const KIT = {
  ivory: 0xe9eadf, ink: 0x263c43, teal: 0x178d79, coral: 0xeb5b32,
  gold: 0xd5aa57, steel: 0xb9c8cc, rubber: 0x253035,
};

export function kitMaterial(color, options = {}) {
  return partMat({ color, roughness: 0.32, metalness: 0.05, envMapIntensity: 0.8, ...options });
}

export function kitBox(parent, size, position, material, radius = 0.12) {
  const geometry = new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(n => n / 2)));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, top, bottom, height, position, material, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function ring(parent, radius, tube, position, material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 48), material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

export function kitLabel(parent, text, size, position, color = '#263c43') {
  const label = makeFlatLabel(text, size, { color });
  label.position.set(...position);
  parent.add(label);
  return label;
}

// Repeated hardware is one mesh per material, rather than a draw call per screw.
// Geometry is owned by its part so the assembly's disposal remains correct.
export function kitFasteners(parent, positions, radius = 0.105) {
  const heads = [], slots = [];
  for (const p of positions) {
    const head = new THREE.CylinderGeometry(radius, radius, 0.045, 12);
    head.translate(...p);
    heads.push(head);
    const slot = new THREE.BoxGeometry(radius * 1.25, 0.012, radius * 0.23);
    slot.translate(p[0], p[1] + 0.025, p[2]);
    slots.push(slot);
  }
  if (!heads.length) return;
  const headMesh = new THREE.Mesh(mergeGeometries(heads), kitMaterial(KIT.steel, { metalness: 0.8 }));
  const slotMesh = new THREE.Mesh(mergeGeometries(slots), kitMaterial(KIT.ink));
  parent.add(headMesh, slotMesh);
  for (const geometry of [...heads, ...slots]) geometry.dispose();
}

export function kitTerminal(parent, name, x, y, z, color = KIT.coral, labelSide = 1) {
  const socketMat = kitMaterial(color);
  cylinder(parent, 0.25, 0.28, 0.13, [x, y - 0.015, z], socketMat, 20);
  const pin = cylinder(parent, 0.125, 0.145, 0.24, [x, y + 0.13, z],
    kitMaterial(KIT.gold, { metalness: 0.8 }), 16);
  pin.userData.pinName = name;
  const label = kitLabel(parent, name, 0.23, [x, y + 0.005, z + 0.37 * labelSide]);
  pin.userData.labelMesh = label;
  pin.userData.labelPos = { x, y: y - 0.015, z, side: labelSide };
  parent.userData.pins.push({ name, obj: pin });
  return pin;
}

function kitGroup(type, label) {
  const group = new THREE.Group();
  group.userData = { type, label, pins: [] };
  return group;
}

function controlBase(group, width, depth, accent = KIT.teal) {
  kitBox(group, [width, 0.18, depth], [0, 0.12, 0], kitMaterial(KIT.rubber), 0.14);
  kitBox(group, [width, 0.65, depth], [0, 0.51, 0], kitMaterial(KIT.ivory), 0.17);
  kitBox(group, [width - 0.1, 0.07, depth - 0.1], [0, 0.63, 0], kitMaterial(accent), 0.12);
  kitFasteners(group, [[-width / 2 + 0.25, 0.845, -depth / 2 + 0.24],
    [width / 2 - 0.25, 0.845, depth / 2 - 0.24]], 0.075);
}

export function makeSwitchKit() {
  const group = kitGroup('switch', 'Click switch');
  controlBase(group, 3.5, 2.5);
  kitBox(group, [1.95, 0.15, 1.35], [0, 0.9, -0.08], kitMaterial(KIT.ink), 0.18);
  const lever = kitBox(group, [1.55, 0.4, 1.02], [0, 1.1, -0.08], kitMaterial(KIT.teal), 0.13);
  lever.userData.role = 'sw-lever';
  lever.rotation.z = 0.4;
  kitBox(lever, [0.09, 0.015, 0.5], [-0.39, 0.202, 0], kitMaterial(KIT.ivory), 0.008);
  const off = ring(lever, 0.12, 0.018, [0.4, 0.205, 0], kitMaterial(KIT.ivory));
  off.rotation.x = -Math.PI / 2;
  const ind = cylinder(group, 0.095, 0.095, 0.03, [1.32, 0.855, -0.82],
    kitMaterial(0x79c8aa, { emissive: 0x000000, emissiveIntensity: 1 }), 16);
  ind.userData.role = 'sw-ind';
  kitTerminal(group, 'A', -1.25, 0.86, 0.65, KIT.coral);
  kitTerminal(group, 'B', 1.25, 0.86, 0.65, KIT.ink);
  kitLabel(group, 'CLICK', 0.2, [0, 0.847, 0.97]);
  return group;
}

export function makePowerKnob() {
  const group = kitGroup('potentiometer', 'Power dial');
  controlBase(group, 3.2, 3.15);
  cylinder(group, 1.1, 1.15, 0.09, [0, 0.88, -0.14], kitMaterial(KIT.ink));
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const angle = -Math.PI * 0.75 + i / 10 * Math.PI * 1.5;
    const tick = new THREE.BoxGeometry(0.04, 0.015, i % 5 === 0 ? 0.2 : 0.1);
    tick.translate(0, 0, 1.23);
    tick.rotateY(angle);
    tick.translate(0, 0.847, -0.14);
    ticks.push(tick);
  }
  group.add(new THREE.Mesh(mergeGeometries(ticks), kitMaterial(KIT.ink)));
  ticks.forEach(g => g.dispose());
  const knob = cylinder(group, 0.88, 0.97, 0.78, [0, 1.28, -0.14], kitMaterial(KIT.teal), 48);
  knob.userData.role = 'pot-knob';
  cylinder(knob, 0.73, 0.76, 0.06, [0, 0.42, 0], kitMaterial(KIT.ivory), 40);
  kitBox(knob, [0.11, 0.025, 0.56], [0, 0.458, 0.47], kitMaterial(KIT.coral), 0.015);
  const grip = [];
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI / 12;
    const rib = new THREE.BoxGeometry(0.038, 0.49, 0.045);
    rib.translate(0, 0, 0.928);
    rib.rotateY(angle);
    grip.push(rib);
  }
  knob.add(new THREE.Mesh(mergeGeometries(grip), kitMaterial(0x39998e)));
  grip.forEach(g => g.dispose());
  kitTerminal(group, 'A', -1.12, 0.86, 1.09, KIT.coral);
  kitTerminal(group, 'B', 1.12, 0.86, 1.09, KIT.ink);
  kitLabel(group, 'DIAL', 0.19, [0, 0.847, 1.3]);
  return group;
}

export function makeLedKit() {
  const group = kitGroup('led', 'Signal light');
  controlBase(group, 2.8, 2.25, KIT.coral);
  cylinder(group, 0.76, 0.84, 0.18, [0, 0.94, -0.12], kitMaterial(KIT.ink), 32);
  cylinder(group, 0.69, 0.71, 0.28, [0, 1.16, -0.12], kitMaterial(KIT.coral), 32);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.68, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    kitMaterial(0xf78269, { emissive: 0xff4528, emissiveIntensity: 0,
      transparent: true, opacity: 0.88, roughness: 0.16, finish: 'clean' }));
  lens.position.set(0, 1.3, -0.12);
  lens.userData.role = 'led-lens';
  lens.castShadow = true;
  group.add(lens);
  // Visible emitter and molded lip make the lens read as a real optical part.
  cylinder(group, 0.23, 0.29, 0.22, [0, 1.43, -0.12], kitMaterial(0xffe7c9, { metalness: 0.3 }), 20);
  const lip = ring(group, 0.692, 0.045, [0, 1.3, -0.12], kitMaterial(0xe96349));
  lip.rotation.x = -Math.PI / 2;
  kitTerminal(group, 'A', -0.96, 0.86, 0.59, KIT.coral);
  kitTerminal(group, 'K', 0.96, 0.86, 0.59, KIT.ink);
  kitLabel(group, 'GLOW', 0.19, [0, 0.846, 0.88]);
  return group;
}

export function makeLampKit() {
  const group = kitGroup('lamp', 'Little light');
  controlBase(group, 3.4, 2.8, KIT.coral);
  cylinder(group, 0.76, 0.99, 0.43, [0, 1.02, -0.15], kitMaterial(KIT.ivory));
  cylinder(group, 0.53, 0.57, 0.67, [0, 1.47, -0.15], kitMaterial(KIT.gold, { metalness: 0.8 }));
  const threadGeometries = [];
  for (let i = 0; i < 4; i++) {
    const thread = new THREE.TorusGeometry(0.55, 0.045, 6, 32);
    thread.rotateX(Math.PI / 2);
    thread.translate(0, 1.22 + i * 0.145, -0.15);
    threadGeometries.push(thread);
  }
  group.add(new THREE.Mesh(mergeGeometries(threadGeometries), kitMaterial(KIT.steel, { metalness: 0.8 })));
  threadGeometries.forEach(g => g.dispose());
  // A lathed envelope has the familiar bulb shoulder and narrowing glass neck.
  const profile = [[0.42, 0], [0.45, 0.28], [0.68, 0.55], [0.97, 0.92],
    [1.08, 1.29], [0.98, 1.67], [0.72, 1.95], [0.38, 2.11], [0, 2.16]];
  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), 36),
    kitMaterial(0xffedd0, { transparent: true, opacity: 0.24, roughness: 0.12,
      side: THREE.DoubleSide, depthWrite: false, finish: 'clean' }));
  glass.position.set(0, 1.68, -0.15);
  group.add(glass);
  const filamentMat = kitMaterial(0xf6b953, { emissive: 0xffae37, emissiveIntensity: 0, finish: 'clean' });
  const fil = new THREE.Group();
  const filament = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.052, 8, 30, Math.PI * 1.75), filamentMat);
  filament.position.set(0, 2.89, -0.15);
  filament.rotation.z = -Math.PI * 0.375;
  filament.userData.role = 'lamp-fil';
  fil.add(filament);
  group.add(fil);
  for (const x of [-0.25, 0.25]) cylinder(group, 0.025, 0.025, 1.1,
    [x, 2.21, -0.15], kitMaterial(KIT.steel, { metalness: 0.8 }), 6);
  kitTerminal(group, 'A', -1.15, 0.86, 0.88, KIT.coral);
  kitTerminal(group, 'B', 1.15, 0.86, 0.88, KIT.ink);
  kitLabel(group, 'LIGHT', 0.2, [0, 0.846, 1.13]);
  return group;
}

export function makeFanKit() {
  const group = kitGroup('motor', 'Breeze machine');
  kitBox(group, [5.5, 0.24, 4.15], [0, 0.15, 0], kitMaterial(KIT.rubber), 0.23);
  kitBox(group, [5.5, 0.65, 4.15], [0, 0.58, 0], kitMaterial(KIT.ivory), 0.3);
  kitBox(group, [5.4, 0.08, 4.05], [0, 0.45, 0], kitMaterial(KIT.teal), 0.2);
  kitBox(group, [1.4, 2.15, 1.03], [0, 1.83, -0.57], kitMaterial(KIT.teal), 0.26);
  kitBox(group, [0.75, 1.3, 0.065], [0, 1.88, -0.021], kitMaterial(KIT.ivory), 0.06);
  const centerY = 5.62;
  const head = new THREE.Group();
  head.position.set(0, centerY, -0.45);
  // Head local Y is the motor axle. The whole head tilts back a few degrees.
  head.rotation.x = Math.PI / 2 - 0.1;
  group.add(head);
  // A deep molded shroud, with a rounded shoulder and a contrasting front lip,
  // gives the fan a substantial silhouette even at the full-bench camera size.
  const shroudProfile = [[2.67, -0.48], [2.93, -0.48], [3.08, -0.3],
    [3.12, 0.24], [3.04, 0.44], [2.76, 0.46], [2.67, 0.35], [2.67, -0.48]];
  const shroud = new THREE.Mesh(new THREE.LatheGeometry(
    shroudProfile.map(p => new THREE.Vector2(...p)), 64), kitMaterial(KIT.teal));
  shroud.castShadow = true;
  head.add(shroud);
  const rearRim = ring(head, 2.91, 0.055, [0, -0.49, 0], kitMaterial(KIT.ink));
  rearRim.rotation.x = Math.PI / 2;
  const frontRim = ring(head, 2.86, 0.105, [0, 0.47, 0], kitMaterial(KIT.ivory));
  frontRim.rotation.x = Math.PI / 2;
  cylinder(head, 0.75, 0.63, 1.35, [0, -0.67, 0], kitMaterial(KIT.ivory), 36);
  cylinder(head, 0.66, 0.66, 0.16, [0, -1.37, 0], kitMaterial(KIT.ink), 32);

  const rotor = new THREE.Group();
  rotor.position.y = 0.025;
  head.add(rotor);
  // Broad swept blades with a real rounded edge; all three are merged together.
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.22, 0.28);
  bladeShape.bezierCurveTo(0.98, 0.24, 2.05, 0.65, 2.47, 1.1);
  bladeShape.bezierCurveTo(2.9, 1.67, 1.98, 2.28, 1.4, 2.16);
  bladeShape.bezierCurveTo(0.75, 2.02, 0.6, 1.1, 0.22, 0.28);
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.08, bevelEnabled: true, bevelSegments: 2,
      steps: 1, bevelSize: 0.06, bevelThickness: 0.04, curveSegments: 14,
    });
    geometry.scale(0.84, 0.84, 1);
    geometry.rotateX(Math.PI / 2);
    geometry.rotateY(i * Math.PI * 2 / 3);
    blades.push(geometry);
  }
  const bladeMesh = new THREE.Mesh(mergeGeometries(blades), kitMaterial(KIT.coral, { roughness: 0.25 }));
  bladeMesh.castShadow = true;
  rotor.add(bladeMesh);
  blades.forEach(g => g.dispose());
  cylinder(rotor, 0.65, 0.72, 0.4, [0, 0.12, 0], kitMaterial(KIT.coral), 40);
  cylinder(rotor, 0.32, 0.42, 0.12, [0, 0.37, 0], kitMaterial(KIT.ivory), 32);
  kitBox(rotor, [0.13, 0.016, 0.25], [0, 0.437, 0.25], kitMaterial(KIT.ink), 0.014);
  group.userData.wheelMeshes = [rotor];

  // The open grille keeps the moving blades readable; batched into one draw.
  const grille = [];
  for (const radius of [1.15, 1.98, 2.68]) {
    const geometry = new THREE.TorusGeometry(radius, 0.024, 5, 48);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0.57, 0);
    grille.push(geometry);
  }
  for (let i = 0; i < 12; i++) {
    const geometry = new THREE.BoxGeometry(0.038, 0.035, 2.29);
    geometry.translate(0, 0.57, 1.64);
    geometry.rotateY(i * Math.PI / 6);
    grille.push(geometry);
  }
  head.add(new THREE.Mesh(mergeGeometries(grille), kitMaterial(KIT.steel, { metalness: 0.8 })));
  grille.forEach(g => g.dispose());
  cylinder(head, 0.52, 0.55, 0.13, [0, 0.57, 0], kitMaterial(KIT.ivory), 40);
  cylinder(head, 0.38, 0.38, 0.018, [0, 0.644, 0], kitMaterial(KIT.teal), 32);
  kitLabel(head, 'B', 0.38, [0, 0.655, 0], '#f0f0e4');
  // Slender rear motor vents and side hinge caps complete the product assembly.
  const vents = [];
  for (let i = 0; i < 12; i++) {
    const slot = new THREE.BoxGeometry(0.06, 0.37, 0.016);
    slot.translate(0, -0.89, 0.69);
    slot.rotateY(i * Math.PI / 6);
    vents.push(slot);
  }
  head.add(new THREE.Mesh(mergeGeometries(vents), kitMaterial(KIT.ink)));
  vents.forEach(g => g.dispose());
  for (const side of [-1, 1]) {
    const hinge = cylinder(group, 0.24, 0.24, 0.14,
      [side * 0.72, 2.62, -0.45], kitMaterial(KIT.steel, { metalness: 0.8 }), 16);
    hinge.rotation.z = Math.PI / 2;
  }
  kitFasteners(group, [[-2.31, 0.911, -1.62], [2.31, 0.911, -1.62]], 0.12);
  kitTerminal(group, 'A', -1.94, 0.925, 0.84, KIT.coral);
  kitTerminal(group, 'B', 1.94, 0.925, 0.84, KIT.ink);
  kitLabel(group, 'B R E E Z E', 0.29, [0, 0.911, 1.31]);
  kitLabel(group, '01 / AIR LAB', 0.14, [0, 0.912, 1.73], '#648079');
  // Keep scale inside the factory: the outer group remains the document's
  // transform, while pins and rotor retain their live scene-object references.
  const model = kitGroup('motor', 'Breeze machine');
  group.scale.setScalar(1.45);
  model.add(group);
  model.userData.pins = group.userData.pins;
  model.userData.wheelMeshes = group.userData.wheelMeshes;
  return model;
}
