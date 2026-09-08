// RUN adds motor dynamics to the invention already on the desk. It deliberately
// owns no Three.js objects: the document's real parts and wires stay visible in
// creator-assembly, and that view reads the angular speeds published here.
// Each fixed step couples the same DC solve to a Rapier revolute shaft:
// angular speed -> back-EMF -> current -> torque -> new angular speed.
import { loadRapier } from './rapier.js';
import { solveCircuit, motorTorque } from './circuit.js';
import { baseType } from '../model/library.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;
const AXLE = { x: 1, y: 0, z: 0 };
// Rapier cylinders point along Y; this rotates their inertia onto the X shaft.
const SHAFT_ROTATION = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };

export class CreatorSim {
  constructor() {
    this.world = null;
    this.motors = [];
    this.running = false;
    this.doc = null;
    this._onOmega = null;
    this._rapier = null;
    this._accumulator = 0;
    this._nextShaft = 0;
  }

  async build(doc) {
    this._rapier = await loadRapier();
    this._teardown();
    this.doc = doc;
    this.world = new this._rapier.World({ x: 0, y: -9.81, z: 0 });
    this._syncMotors(doc);
    return this.motors.length;
  }

  // Reconcile the live build without resetting shafts that are already running.
  // Inspector edits, assistant rewiring, and newly added motors all take effect
  // during the same test; removed motors cannot leave stale back-EMF behind.
  _syncMotors(doc) {
    const components = doc.components.filter(c => baseType(c.type) === 'motor');
    const wanted = new Set(components.map(c => c.id));
    for (const m of this.motors) {
      if (wanted.has(m.id)) continue;
      this.world.removeRigidBody(m.body);
      this.world.removeRigidBody(m.anchor);
    }
    this.motors = this.motors.filter(m => wanted.has(m.id));
    const byId = new Map(this.motors.map(m => [m.id, m]));

    for (const c of components) {
      const existing = byId.get(c.id);
      if (existing) { existing.params = c.params; continue; }
      const RAPIER = this._rapier;
      // Shafts occupy independent positions in the physics world. The assembly
      // view, not these bodies, owns where components appear on the desk.
      const x = this._nextShaft++ * 9;
      const anchor = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(x, 6, 0));
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 6, 0).setAngularDamping(0));
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.7, 3).setDensity(0.08).setRotation(SHAFT_ROTATION), body);
      const joint = RAPIER.JointData.revolute(
        { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, AXLE);
      this.world.createImpulseJoint(joint, anchor, body, true);
      this.motors.push({ id: c.id, params: c.params, body, anchor });
    }
  }

  omega(id) {
    return this.motors.find(m => m.id === id)?.body.angvel().x || 0;
  }

  telemetry() {
    const out = {};
    for (const m of this.motors) out[m.id] = { omega: m.body.angvel().x };
    return out;
  }

  start() { this.running = true; }
  hide() { this.running = false; }
  onOmega(cb) { this._onOmega = cb; }

  reset() {
    this._accumulator = 0;
    for (const m of this.motors) {
      m.body.resetTorques(true);
      m.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      m.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    }
    this._onOmega?.(this.telemetry());
  }

  step(dt, doc = this.doc) {
    if (!this.running || !this.world || !doc) return;
    this.doc = doc;
    this._syncMotors(doc);
    this._accumulator += Math.min(STEP * MAX_STEPS, Math.max(0, Number.isFinite(dt) ? dt : 0));

    while (this._accumulator >= STEP) {
      const stateOf = this.telemetry();
      const sol = solveCircuit(doc, stateOf);
      for (const m of this.motors) {
        const torque = motorTorque(m.id, sol, m.params, stateOf[m.id].omega);
        // Rapier retains applied forces until reset. Replace the previous
        // torque instead of accumulating it forever across frames.
        m.body.resetTorques(true);
        m.body.addTorque({ x: torque * 1e4, y: 0, z: 0 }, true);
      }
      this.world.step();
      this._accumulator -= STEP;
    }
    this._onOmega?.(this.telemetry());
  }

  _teardown() {
    this.running = false;
    this.motors = [];
    this._accumulator = 0;
    this._nextShaft = 0;
    this.world?.free();
    this.world = null;
  }
}
