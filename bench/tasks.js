// The task set for the SelfBalance Lab environment benchmark.
//
// One claim is under test: models can talk fluently about circuits but cannot
// actually build one that works. Every task here is therefore graded by the MNA
// solver — never by a rubric, never by another model. A task passes only if the
// electrical state the solver computes satisfies `pass()`. There is no partial
// credit for a plausible-looking build, and no way to argue with the result.
//
// Difficulty is tuned so a model that merely *names* the right parts still
// fails. The clearest example is `led-lit-safely`: dropping in a resistor is not
// enough, because the library's DEFAULT resistor (100Ω) still burns the LED —
//   I = (7.4 − 2) / (100 + 12 + 0.4) = 48 mA, against a 30 mA limit.
// Passing requires computing a value (≥ ~168Ω), which is exactly the step that
// separates recall from competence.

/** An error-level violation means the build is electrically invalid. */
const noErrors = (solve) => !(solve.violations || []).some(v => v.level === 'error');

/** Solved current magnitude through a component, in amps (0 if absent). */
const amps = (solve, id) => Math.abs(solve.current?.[id] ?? 0);

/** Signed current — used where direction is the whole point (polarity tasks). */
const signed = (solve, id) => solve.current?.[id] ?? 0;

export const TASKS = [
  {
    id: 'motor-spins',
    tier: 'baseline',
    // The floor. If a model fails this it cannot use the tool surface at all,
    // which is a harness problem, not a finding about circuits.
    prompt:
      'Build a circuit that makes a motor spin. Use the component id "motor1" '
      + 'for the motor. When you are done, say DONE.',
    pass: (solve) => noErrors(solve) && amps(solve, 'motor1') > 0.5,
    why: 'A closed battery→motor loop. Tests only that the model can place and wire.',
  },

  {
    id: 'led-lit-safely',
    tier: 'core',
    prompt:
      'Light an LED from the battery without exceeding the LED\'s maximum current '
      + 'rating. Use the component id "led1" for the LED. When you are done, say DONE.',
    pass: (solve) => noErrors(solve)
      && amps(solve, 'led1') > 0.005
      && amps(solve, 'led1') <= 0.03,
    why:
      'The headline task. Requires a series resistor AND the right value — the '
      + 'default 100Ω resistor still passes 48mA through a 30mA LED, so a model '
      + 'that pattern-matches "LEDs need a resistor" fails on the arithmetic.',
  },

  {
    id: 'switch-controls-motor',
    tier: 'core',
    prompt:
      'Build a circuit where a switch controls a motor, and leave the switch in '
      + 'the position that makes the motor run. Use ids "motor1" and "sw1". '
      + 'When you are done, say DONE.',
    pass: (solve) => noErrors(solve) && amps(solve, 'motor1') > 0.5,
    why:
      'A switch defaults to OPEN. The model must notice the motor is dead and '
      + 'close it — a state check, not a wiring step.',
  },

  {
    id: 'motor-speed-limited',
    tier: 'core',
    prompt:
      'Build a motor circuit whose current is limited to between 0.3 A and 0.8 A '
      + 'using a potentiometer. Use ids "motor1" and "pot1". When you are done, say DONE.',
    pass: (solve) => noErrors(solve)
      && amps(solve, 'motor1') >= 0.3
      && amps(solve, 'motor1') <= 0.8,
    why:
      'The pot defaults to 500Ω (far too much) and its max is 1000Ω. The model '
      + 'must solve for a resistance in a target band, not just insert the part.',
  },

  {
    id: 'motor-reversed',
    tier: 'core',
    prompt:
      'Wire a motor so that current flows from the battery\'s negative terminal '
      + 'into the motor\'s A pin and returns to the positive terminal through B. '
      + 'Use the id "motor1". When you are done, say DONE.',
    pass: (solve) => noErrors(solve) && signed(solve, 'motor1') < -0.5,
    why:
      'Polarity is checkable by sign. Tests whether the model can reason about '
      + 'direction rather than just closing a loop.',
  },

  {
    id: 'fuse-survives',
    tier: 'hard',
    prompt:
      'Build a motor circuit protected by a fuse, where the motor runs and the '
      + 'fuse is NOT over its current rating. Use ids "motor1" and "fuse1". '
      + 'When you are done, say DONE.',
    pass: (solve) => noErrors(solve)
      && amps(solve, 'motor1') > 0.1
      && amps(solve, 'fuse1') <= 1.0,
    why:
      'A bare battery→motor loop draws ~3A through a 1A fuse. Adding the fuse '
      + 'without adding resistance blows it — protection has to be designed, not '
      + 'bolted on. This is the task most likely to expose confident-but-wrong.',
  },

  {
    id: 'two-leds-parallel',
    tier: 'hard',
    prompt:
      'Light two LEDs at the same time, both within their current rating. Use ids '
      + '"led1" and "led2". When you are done, say DONE.',
    pass: (solve) => noErrors(solve)
      && amps(solve, 'led1') > 0.005 && amps(solve, 'led1') <= 0.03
      && amps(solve, 'led2') > 0.005 && amps(solve, 'led2') <= 0.03,
    why:
      'Two branches sharing a supply. A single shared resistor sized for one LED '
      + 'behaves differently once the second is added.',
  },

  {
    id: 'diode-conducts',
    tier: 'core',
    prompt:
      'Build a circuit where a diode conducts current in its forward direction '
      + 'and a lamp lights. Use ids "d1" and "lamp1". When you are done, say DONE.',
    pass: (solve) => noErrors(solve)
      && amps(solve, 'lamp1') > 0.01
      && amps(solve, 'd1') > 0.01,
    why:
      'A diode wired backwards blocks. Same polarity lesson as the LED but with a '
      + 'part whose pin names (A/K) are easy to guess wrong.',
  },

  {
    id: 'buzzer-safe',
    tier: 'baseline',
    prompt:
      'Make a buzzer sound without exceeding its current rating. Use the id '
      + '"buz1". When you are done, say DONE.',
    pass: (solve) => noErrors(solve)
      && amps(solve, 'buz1') > 0.01
      && amps(solve, 'buz1') <= 0.1,
    why:
      'A buzzer wired straight across the battery is already within spec, so this '
      + 'is a control: it separates "cannot wire anything" from "cannot size parts".',
  },

  {
    id: 'button-and-led',
    tier: 'hard',
    prompt:
      'Build a circuit where pressing a push button lights an LED within its '
      + 'current rating, and leave the button pressed. Use ids "btn1" and "led1". '
      + 'When you are done, say DONE.',
    pass: (solve) => noErrors(solve)
      && amps(solve, 'led1') > 0.005 && amps(solve, 'led1') <= 0.03,
    why:
      'Composes two failure modes seen separately above: a default-open contact '
      + 'and an LED that needs a computed series resistor.',
  },
];

export const TIERS = ['baseline', 'core', 'hard'];
