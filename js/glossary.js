// Plain-language glossary for every component and every pin.
// Keyed so the UI can explain "what is IN2?" on hover.
//   COMPONENTS[compType]        -> { title, blurb, unit }
//   PINS[`${compType}.${pin}`]  -> { title, role, kind }   kind: power|ground|data
// `kind` is used to color the tooltip accent and matches wiring.js semantics.

export const COMPONENTS = {
  motor: {
    title: 'DC Motor',
    blurb: 'Turns current into rotation. It also pushes back as it spins up (back-EMF), so the faster it turns the less current it draws — which is why a stalled motor draws the most.',
    unit: 'Motors',
  },
  resistor: {
    title: 'Resistor',
    blurb: 'Limits how much current can flow. The single most common use: putting one in series with an LED so the LED gets the few milliamps it wants instead of the amp the battery would happily supply.',
    unit: 'Fundamentals',
  },
  switch: {
    title: 'Switch',
    blurb: 'Breaks or completes the loop. Open, no current flows anywhere in that branch — a circuit needs a complete path back to the battery to do anything at all.',
    unit: 'Fundamentals',
  },
  potentiometer: {
    title: 'Potentiometer',
    blurb: 'A resistor whose value you can turn. Scroll its knob to change resistance, and watch the current — and anything it powers — change with it.',
    unit: 'Fundamentals',
  },
  led: {
    title: 'LED',
    blurb: 'A diode that emits light. It only conducts one way round, needs about 2V across it before it lights at all, and burns out above roughly 30mA — so it almost always needs a resistor in series.',
    unit: 'Fundamentals',
  },
  battery: {
    title: '7.4V LiPo (2S)',
    blurb: 'The power source. Feeds ~7.4V to the motor driver and to the Arduino’s VIN. Every ground in the circuit ties back here.',
    unit: 'Unit 1 · Electronics Basics',
  },
  push_button: {
    title: 'Push Button',
    blurb: 'A momentary switch — it only closes the circuit while you hold it down. Click the button in 3D to press it.',
    unit: 'Unit 1 · Electronics Basics',
  },
  lamp: {
    title: 'Incandescent Lamp',
    blurb: 'A filament bulb. It’s just a resistor that glows: the more current flows, the brighter it shines. Draw too much and it burns out.',
    unit: 'Unit 1 · Electronics Basics',
  },
  buzzer: {
    title: 'Piezo Buzzer',
    blurb: 'Makes a tone when current passes through it. Polarised — the + and − terminals matter.',
    unit: 'Unit 1 · Electronics Basics',
  },
  diode: {
    title: 'Diode',
    blurb: 'A one-way valve for current: it conducts from anode (A) to cathode (K) once past ~0.7V, and blocks the other way. The striped band marks the cathode.',
    unit: 'Unit 1 · Electronics Basics',
  },
  photoresistor: {
    title: 'Photoresistor (LDR)',
    blurb: 'A light-dependent resistor: its resistance drops as light rises. Model the light level by editing its resistance in the Inspector.',
    unit: 'Unit 5 · Sensors',
  },
  thermistor: {
    title: 'Thermistor',
    blurb: 'A temperature-dependent resistor. Its resistance changes with heat — a simple way to sense temperature. Tune its resistance in the Inspector.',
    unit: 'Unit 5 · Sensors',
  },
  fuse: {
    title: 'Fuse',
    blurb: 'A deliberate weak link. It passes current freely until the load exceeds its rating, then “blows” to protect the rest of the circuit.',
    unit: 'Unit 1 · Electronics Basics',
  },
  capacitor: {
    title: 'Capacitor',
    blurb: 'Stores charge on two plates. Under steady DC it behaves as an open circuit (blocks current) once charged — so in this DC solver it passes almost nothing.',
    unit: 'Unit 1 · Electronics Basics',
  },
  servo: {
    title: 'Servo Motor',
    blurb: 'A geared motor with a signal line (SIG) that commands a target angle. Powered from + / −; behaves like a small motor in the circuit.',
    unit: 'Unit 3 · Motors & Drivers',
  },
  relay: {
    title: 'Relay',
    blurb: 'An electrically-controlled switch. When energised it connects COM to NO (normally-open), letting a small signal switch a bigger load.',
    unit: 'Unit 3 · Motors & Drivers',
  },
};

// pin roles. `kind` drives the tooltip accent color.
export const PINS = {
  // ── the parts every first circuit uses ──
  'motor.A': { title: 'Motor terminal A', role: 'One side of the motor coil. Current in here, out of B, spins it one way; swap them and it spins the other way.', kind: 'power' },
  'motor.B': { title: 'Motor terminal B', role: 'The other side of the coil — the return path back to the battery.', kind: 'power' },
  'resistor.A': { title: 'Resistor leg A', role: 'Resistors have no polarity: either leg can face the supply.', kind: 'power' },
  'resistor.B': { title: 'Resistor leg B', role: 'The other leg. Same as A — orientation does not matter.', kind: 'power' },
  'switch.A': { title: 'Switch terminal A', role: 'One side of the contact. Closed, A and B are joined; open, the loop is broken.', kind: 'power' },
  'switch.B': { title: 'Switch terminal B', role: 'The other side of the contact.', kind: 'power' },
  'potentiometer.A': { title: 'Potentiometer end A', role: 'One end of the resistive track. The knob sets how much of it is in the circuit.', kind: 'power' },
  'potentiometer.B': { title: 'Potentiometer end B', role: 'The other end of the track.', kind: 'power' },
  'led.A': { title: 'Anode (+)', role: 'The positive leg — this side must face the battery’s + terminal or the LED stays dark.', kind: 'power' },
  'led.K': { title: 'Cathode (−)', role: 'The negative leg, back towards the battery’s − terminal. Reverse it and no current flows at all.', kind: 'ground' },




  // ── motors ──

  // ── battery ──
  'battery.+': { title: 'Positive terminal (+7.4V)', role: 'Feeds the motor driver’s 12V input and the Arduino’s VIN.', kind: 'power' },
  'battery.-': { title: 'Negative terminal (0V)', role: 'The circuit’s ground reference — everything returns here.', kind: 'ground' },

  // ── new bench components ──
  'push_button.A': { title: 'Button terminal A', role: 'One side of the momentary contact. Closed only while pressed.', kind: 'data' },
  'push_button.B': { title: 'Button terminal B', role: 'The other side of the momentary contact.', kind: 'data' },
  'lamp.A': { title: 'Lamp terminal', role: 'One end of the filament. Current through it makes the bulb glow.', kind: 'power' },
  'lamp.B': { title: 'Lamp terminal', role: 'The return end of the filament.', kind: 'power' },
  'buzzer.+': { title: 'Buzzer + terminal', role: 'Positive supply into the buzzer.', kind: 'power' },
  'buzzer.-': { title: 'Buzzer − terminal', role: 'Return to ground.', kind: 'ground' },
  'diode.A': { title: 'Anode (A)', role: 'Current enters here. Conducts toward the cathode once above ~0.7V.', kind: 'power' },
  'diode.K': { title: 'Cathode (K)', role: 'Current exits here (marked by the band). Blocks flow the other way.', kind: 'power' },
  'photoresistor.A': { title: 'LDR terminal A', role: 'One side of the light-dependent resistor.', kind: 'data' },
  'photoresistor.B': { title: 'LDR terminal B', role: 'The other side of the light-dependent resistor.', kind: 'data' },
  'thermistor.A': { title: 'Thermistor terminal A', role: 'One side of the temperature-dependent resistor.', kind: 'data' },
  'thermistor.B': { title: 'Thermistor terminal B', role: 'The other side of the temperature-dependent resistor.', kind: 'data' },
  'fuse.A': { title: 'Fuse terminal A', role: 'Current in. Passes freely until the rated limit is exceeded.', kind: 'data' },
  'fuse.B': { title: 'Fuse terminal B', role: 'Current out to the protected circuit.', kind: 'data' },
  'capacitor.A': { title: 'Capacitor + plate', role: 'Positive plate. Blocks steady DC once charged.', kind: 'power' },
  'capacitor.B': { title: 'Capacitor − plate', role: 'Negative plate.', kind: 'power' },
  'servo.+': { title: 'Servo + (power)', role: 'Motor supply into the servo.', kind: 'power' },
  'servo.-': { title: 'Servo − (ground)', role: 'Return to ground.', kind: 'ground' },
  'servo.SIG': { title: 'Servo signal (SIG)', role: 'The control line that commands the target angle.', kind: 'data' },
  'relay.COM': { title: 'Relay COM (common)', role: 'The common pole that switches over to NO when the relay energises.', kind: 'data' },
  'relay.NO': { title: 'Relay NO (normally open)', role: 'Connected to COM only while the relay is on.', kind: 'data' },
};

// The rover reuses the base components under instanced namespaces (two drivers
// l298nF/l298nR, four motors motorFL/FR/RL/RR). Map an instanced compType back
// to the base entry so its pins/tooltips resolve without duplicating the data.
function baseType(t) {
  if (t === 'l298nF' || t === 'l298nR') return 'l298n';
  if (t === 'motorFL' || t === 'motorRL') return 'motorL';
  if (t === 'motorFR' || t === 'motorRR') return 'motorR';
  return t;
}

// Re-key an "compType.pin" id onto its base component (e.g. l298nF.IN1 → l298n.IN1).
function baseId(id) {
  const dot = id.indexOf('.');
  if (dot < 0) return id;
  return baseType(id.slice(0, dot)) + id.slice(dot);
}

export function pinInfo(id) { return PINS[id] || PINS[baseId(id)] || null; }
export function compInfo(type) { return COMPONENTS[type] || COMPONENTS[baseType(type)] || null; }
