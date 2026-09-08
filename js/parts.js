// Invention-kit power and motion modules. Units are centimetres; all pins and
// moving rotor references retain the creator bench's public geometry contract.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT, kitMaterial, kitBox, kitFasteners, kitTerminal, kitLabel } from './app/invention-models.js';

function cylinder(group, radius, length, position, material, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

// The wheel's local Y stays its axle, so the assembly's electrical-current
// animation can rotate the whole rotor with one reference, including the hub.
export function makeMotor(side = 1) {
  const group = new THREE.Group();
  group.userData = { type: side < 0 ? 'motorL' : 'motorR', label: 'DC Gear Motor', pins: [] };
  const ivory = kitMaterial(KIT.ivory);
  const teal = kitMaterial(KIT.teal);
  const steel = kitMaterial(KIT.steel, { metalness: 0.8 });
  const ink = kitMaterial(KIT.ink);
  const rubber = kitMaterial(KIT.rubber, { roughness: 0.83, finish: 'rough' });

  kitBox(group, [3.15, 0.3, 4.8], [-0.2 * side, 0.18, 0.9], rubber, 0.18);
  kitBox(group, [2.6, 1.32, 3.45], [0, 0.98, 0.45], ivory, 0.22);
  kitBox(group, [2.55, 2.0, 3.45], [0, 2.62, 0.45], teal, 0.24);
  // A fine contrasting seam and end cover define a two-piece molded gearbox.
  kitBox(group, [2.61, 0.065, 3.48], [0, 2.32, 0.45], ink, 0.1);
  kitBox(group, [2.39, 0.16, 3.23], [0, 3.63, 0.45], ivory, 0.14);
  kitFasteners(group, [[-0.94, 3.72, -0.85], [0.94, 3.72, -0.85],
    [-0.94, 3.72, 1.72], [0.94, 3.72, 1.72]], 0.11);

  const can = cylinder(group, 0.98, 2.35, [0, 2.72, 3.18], steel, 40);
  can.rotation.x = Math.PI / 2;
  const rear = cylinder(group, 0.97, 0.27, [0, 2.72, 4.4], ink, 32);
  rear.rotation.x = Math.PI / 2;
  const collar = cylinder(group, 1.03, 0.2, [0, 2.72, 2.13], ink, 32);
  collar.rotation.x = Math.PI / 2;
  const vents = [];
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5;
    const slot = new THREE.BoxGeometry(0.13, 0.025, 0.48);
    slot.translate(0, 0.98, 0);
    slot.rotateZ(angle);
    slot.translate(0, 2.72, 3.71);
    vents.push(slot);
  }
  group.add(new THREE.Mesh(mergeGeometries(vents), ink));
  vents.forEach(g => g.dispose());
  const shaft = cylinder(group, 0.19, 1.43, [side * 1.78, 3.0, -0.46], steel, 16);
  shaft.rotation.z = Math.PI / 2;

  const rotor = new THREE.Group();
  rotor.position.set(side * 2.67, 3.0, -0.46);
  rotor.rotation.z = Math.PI / 2;
  group.add(rotor);
  // Rounded sidewalls catch a broad rim highlight; a shallow tread reads as
  // grippy rubber without dozens of separate meshes or a downloaded texture.
  const profile = [[1.79, -0.68], [2.49, -0.68], [2.8, -0.56], [2.98, -0.32],
    [3.0, 0.32], [2.8, 0.56], [2.49, 0.68], [1.79, 0.68], [1.79, -0.68]];
  const tire = new THREE.Mesh(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), 48), rubber);
  tire.castShadow = true;
  rotor.add(tire);
  const tread = [];
  for (let i = 0; i < 36; i++) {
    const block = new THREE.BoxGeometry(0.16, 0.85, 0.06);
    block.rotateZ(i % 2 ? 0.17 : -0.17);
    block.translate(0, 0, 2.99);
    block.rotateY(i * Math.PI / 18);
    tread.push(block);
  }
  rotor.add(new THREE.Mesh(mergeGeometries(tread), rubber));
  tread.forEach(g => g.dispose());
  cylinder(rotor, 1.81, 1.26, [0, 0, 0], ink, 40);
  cylinder(rotor, 0.62, 1.48, [0, 0, 0], kitMaterial(KIT.coral), 32);
  const spokes = [];
  for (const face of [-0.68, 0.68]) {
    for (let i = 0; i < 5; i++) {
      const geometry = new THREE.BoxGeometry(0.32, 0.12, 1.27);
      geometry.translate(0, face, 1.02);
      geometry.rotateY(i * Math.PI * 2 / 5);
      spokes.push(geometry);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.67, 0.1, 8, 40), ivory);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = face;
    rotor.add(rim);
    cylinder(rotor, 0.29, 0.05, [0, face * 1.15, 0], steel, 6);
  }
  rotor.add(new THREE.Mesh(mergeGeometries(spokes), ivory));
  spokes.forEach(g => g.dispose());
  group.userData.wheelMeshes = [rotor];

  kitTerminal(group, 'M+', -0.59, 3.75, 1.05, KIT.coral, -1);
  kitTerminal(group, 'M-', 0.59, 3.75, 1.05, KIT.ink, -1);
  kitLabel(group, 'MOTION', 0.26, [0, 3.72, -0.23]);
  kitLabel(group, '02 / DRIVE', 0.15, [0, 3.72, 0.2], '#648079');
  return group;
}

export function makeBattery() {
  const group = new THREE.Group();
  group.userData = { type: 'battery', label: '7.4V Power Pack', pins: [] };
  const ivory = kitMaterial(KIT.ivory);
  const ink = kitMaterial(KIT.ink);
  const teal = kitMaterial(KIT.teal);
  // Preserve the original 7 x 3.5 cm footprint and approximately 2 cm height.
  kitBox(group, [7, 0.22, 3.5], [0, 0.13, 0], kitMaterial(KIT.rubber, { roughness: 0.8, finish: 'rough' }), 0.18);
  kitBox(group, [7, 1.5, 3.5], [0, 0.94, 0], ivory, 0.28);
  kitBox(group, [7.02, 0.06, 3.51], [0, 0.61, 0], ink, 0.08);
  kitBox(group, [4.35, 0.06, 2.8], [-0.9, 1.701, 0], ink, 0.18);
  kitBox(group, [0.53, 1.67, 3.52], [-3.07, 0.97, 0], teal, 0.18);
  kitBox(group, [0.53, 1.67, 3.52], [3.07, 0.97, 0], teal, 0.18);
  kitLabel(group, 'POWER', 0.54, [-1.06, 1.744, -0.51], '#f2eee4');
  kitLabel(group, '7.4V / RECHARGEABLE', 0.19, [-0.89, 1.744, 0.21], '#95bab4');
  kitLabel(group, 'INVENTION KIT', 0.18, [-1.28, 1.744, 0.85], '#f2eee4');
  // Recessed charge window and three mint status segments are printed hardware,
  // not a claim that a time-varying battery discharge model is being simulated.
  kitBox(group, [0.82, 0.04, 1.55], [2.2, 1.71, 0.45], ink, 0.12);
  for (let i = 0; i < 3; i++) kitBox(group, [0.46, 0.025, 0.21], [2.2, 1.742, 0.06 + i * 0.4],
    teal, 0.04);
  kitFasteners(group, [[-2.54, 1.7, -1.43], [-2.54, 1.7, 1.43],
    [2.53, 1.7, -1.43], [2.53, 1.7, 1.43]], 0.09);
  kitTerminal(group, '+', -1, 1.99, -1.2, KIT.coral, -1);
  kitTerminal(group, '-', 1, 1.99, -1.2, KIT.ink, -1);
  // Short molded terminal risers join the sockets to the lid.
  kitBox(group, [0.65, 0.3, 0.64], [-1, 1.84, -1.2], ivory, 0.1);
  kitBox(group, [0.65, 0.3, 0.64], [1, 1.84, -1.2], ivory, 0.1);
  return group;
}