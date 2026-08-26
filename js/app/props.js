// Interactive bench props — physical inputs you can move around the 3D bench to
// drive a sensor. A candle (heat) changes a nearby thermistor's resistance; a
// lamp (light) changes a nearby photoresistor's. So "bring the candle up to the
// thermistor" literally makes/breaks the circuit, live, off the same MNA solve.
//
// Props auto-appear only while a matching sensor is on the bench and hide
// otherwise. They drive resistance through api.set_param_live (a transient write
// that does NOT spam the undo history or trigger full re-renders every frame).
//
// Isolation: our pointer handlers run in the CAPTURE phase so we can claim a drag
// on a prop before creator-assembly's bubble-phase part-drag/orbit handlers see
// it; when we don't hit a prop we do nothing and the normal handlers run.
import * as THREE from 'three';

// Which sensor a *draggable* prop influences. The photoresistor is deliberately
// NOT here any more: light now comes from the room's own desk lamp, which you
// click to switch on and off (js/app/bench-room.js). A real lamp in the room
// beats a second floating one, and it makes the light→resistance→current chain
// a physical act — reach over, click the lamp, watch the current change.
const PROP_FOR = { thermistor: 'heat' };
const LIT_R = 8;          // photoresistor resistance with the lamp ON (Ω)
const RANGE = 9;          // horizontal influence radius (world units / cm)
const HOT_R = 8;          // resistance at full proximity (Ω) — circuit "on"
const DRAG_Y = 3.2;       // hover height while dragging (above the bench)

export function initProps({ scene, camera, canvas, controls, api, hud, benchRoom }) {
  const raycaster = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_Y);
  const hitPt = new THREE.Vector3();

  const root = new THREE.Group();
  root.name = 'benchProps';
  scene.add(root);

  const props = { heat: makeCandle() };
  for (const k in props) { props[k].visible = false; root.add(props[k]); }

  let grabbed = null;      // the prop group currently being dragged
  let hintedFor = null;    // avoid re-flashing the same hint

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ptr, camera);
  }

  // capture-phase grab: only claims the event if the ray hits a visible prop.
  /**
   * A click on the desk lamp toggles it. Runs in the same capture phase as the
   * prop drag so it claims the click before creator-assembly's orbit handler,
   * and returns false when the lamp was not hit so everything else still works.
   */
  function tryLampClick(e) {
    const targets = benchRoom?.lamp?.hitTargets?.() || [];
    if (!targets.length) return false;
    setPointer(e);
    raycaster.setFromCamera(ptr, camera);
    if (!raycaster.intersectObjects(targets, true).length) return false;
    const on = benchRoom.lamp.toggle();
    hud?.setStatus?.(on
      ? 'Desk lamp on — a photoresistor on the bench sees the light'
      : 'Desk lamp off — a photoresistor now reads dark');
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  function onDown(e) {
    if (tryLampClick(e)) return;
    setPointer(e);
    const vis = Object.values(props).filter(p => p.visible);
    const hit = raycaster.intersectObjects(vis, true)[0];
    if (!hit) return;                       // not a prop → let normal handlers run
    let g = hit.object; while (g && !g.userData.prop) g = g.parent;
    if (!g) return;
    grabbed = g;
    controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    e.stopImmediatePropagation();           // block part-drag / orbit
    e.preventDefault();
  }
  function onMove(e) {
    if (!grabbed) return;
    setPointer(e);
    if (raycaster.ray.intersectPlane(dragPlane, hitPt)) {
      grabbed.position.set(hitPt.x, DRAG_Y, hitPt.z);
    }
    e.stopImmediatePropagation();
  }
  function onUp(e) {
    if (!grabbed) return;
    grabbed = null;
    controls.enabled = true;
    canvas.style.cursor = '';
    e.stopImmediatePropagation?.();
  }
  canvas.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);

  let t = 0;

  // Called every frame from creator-assembly's animate(). `sensors` is a list of
  // { id, type, mesh } for every thermistor / photoresistor currently placed.
  function tick(sensors, dt = 0.016) {
    t += dt;
    const need = { heat: false };
    for (const s of sensors) { const k = PROP_FOR[s.type]; if (k) need[k] = true; }

    for (const kind of ['heat']) {
      const prop = props[kind];
      const want = need[kind];
      if (want && !prop.visible) {
        // first appearance: park it a little off from the first matching sensor
        const s = sensors.find(x => PROP_FOR[x.type] === kind);
        const p = s ? s.mesh.position : new THREE.Vector3();
        prop.position.set(p.x + 7, DRAG_Y, p.z + 7);
        prop.visible = true;
        if (hintedFor !== kind) {
          hud?.setStatus?.('Drag the 🔥 candle up to the thermistor to heat it — watch the circuit react');
          hintedFor = kind;
        }
      } else if (!want && prop.visible) {
        prop.visible = false;
        if (hintedFor === kind) hintedFor = null;
      }
    }

    // flame / bulb flicker
    if (props.heat.visible) {
      const f = 0.75 + Math.sin(t * 22) * 0.12 + Math.sin(t * 7.3) * 0.08;
      props.heat.userData.flame.scale.setScalar(f);
      props.heat.userData.flameMat.emissiveIntensity = 1.6 * f;
    }

    // Photoresistors read the room's desk lamp: switched on, the sensor is lit
    // and its resistance collapses; switched off, it sits at its dark value.
    // Binary rather than a proximity ramp because the lamp is a fixture — you
    // flick it, you do not carry it around.
    const lampOn = benchRoom?.lamp?.on !== false;
    for (const s of sensors) {
      if (s.type === 'photoresistor') {
        const doc = api.get_document();
        const comp = doc.components.find(c => c.id === s.id);
        const darkR = comp?.params?.maxResistance || 200000;
        api.set_param_live?.({ id: s.id, key: 'resistance', value: lampOn ? LIT_R : darkR });
        continue;
      }
      const kind = PROP_FOR[s.type];
      const prop = props[kind];
      if (!prop || !prop.visible) continue;
      const dx = prop.position.x - s.mesh.position.x;
      const dz = prop.position.z - s.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const near = Math.max(0, 1 - dist / RANGE);        // 0 far … 1 touching
      // cold/dark resistance is the sensor's own maxResistance; hot/lit → HOT_R
      const doc = api.get_document();
      const comp = doc.components.find(c => c.id === s.id);
      const coldR = comp?.params?.maxResistance || comp?.params?.resistance || 5000;
      const R = coldR * (1 - near) + HOT_R * near;
      api.set_param_live?.({ id: s.id, key: 'resistance', value: Math.round(R) });
    }
  }

  function dispose() {
    canvas.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    scene.remove(root);
  }

  return { tick, dispose, root };
}

// ── procedural prop meshes (instrument-look, emissive so they catch bloom) ──
function makeCandle() {
  const g = new THREE.Group();
  g.userData.prop = 'heat';
  const wax = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.0, 3.4, 20),
    new THREE.MeshStandardMaterial({ color: 0xf3ede0, roughness: 0.6 }));
  wax.position.y = -1.0;
  const holder = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.7, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0x9a6a2f, metalness: 0.8, roughness: 0.35 }));
  holder.position.y = -2.8;
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffb14a, emissive: 0xff7b1a, emissiveIntensity: 1.6, roughness: 0.4 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.5, 14), flameMat);
  flame.position.y = 1.5;
  const glow = new THREE.PointLight(0xff8a2a, 0.8, 14, 2);
  glow.position.y = 1.6;
  g.add(wax, holder, flame, glow);
  g.userData.flame = flame;
  g.userData.flameMat = flameMat;
  return g;
}

// makeLamp() lived here. The floating light prop was retired when the room's
// own desk lamp became the switchable light source — see js/app/bench-room.js.
