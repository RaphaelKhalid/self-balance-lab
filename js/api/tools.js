// Canonical Hephaestus tool contract. The backend derives Gemini/OpenRouter
// schemas from this file, and the browser executes them through window.__api.
// Pure metadata + dispatch: no THREE or DOM, so the server uses the same contract.
import { LIBRARY } from '../model/library.js';

const COMPONENT_TYPES = Object.keys(LIBRARY);

export const TOOL_SCHEMAS = [
  {
    name: 'place_component',
    description: 'Add a component to the build. Returns its assigned id. Follow with move_component to arrange it on the bench.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: COMPONENT_TYPES, description: 'Component type to place.' },
        id: { type: 'string', description: 'Optional explicit id; auto-named if omitted.' },
      },
      required: ['type'],
    },
  },
  {
    name: 'move_component',
    description: 'Move a component on the bench. Coordinates are centimetres: x is left/right, y is height, z is front/back. Space parts apart so wires are easy to see.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        pos: { type: 'array', items: { type: 'number' }, description: 'Exactly three numbers [x, y, z]. Keep x and z between -20 and 20; use y=1.' },
        rot: { type: 'array', items: { type: 'number' }, description: 'Optional rotation [x, y, z] in radians. Rotate upright parts about y only.' },
      },
      required: ['id', 'pos'],
    },
  },
  {
    name: 'set_name',
    description: 'Give the whole invention a short, memorable name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'remove_component',
    description: 'Remove a component (and any wires touching it) by id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'connect',
    description: 'Wire two pins together. Endpoints are "componentId.pin" (e.g. "bat1.+", "motor1.A").',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source endpoint "compId.pin".' },
        to: { type: 'string', description: 'Target endpoint "compId.pin".' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'disconnect',
    description: 'Remove the wire between two endpoints.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'set_param',
    description: 'Set a numeric parameter on a component, such as a battery\'s voltsNominal or a resistor\'s resistance. Use set_switch for boolean closed parameters.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['id', 'key', 'value'],
    },
  },
  {
    name: 'set_switch',
    description: 'Open or close a switch, push button or relay. closed=true connects its pins; closed=false breaks the circuit.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        closed: { type: 'boolean' },
      },
      required: ['id', 'closed'],
    },
  },
  {
    name: 'run_sim',
    description: 'Start the motor physics test. Powered lights and motors already respond on the build bench.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'stop_sim',
    description: 'Stop the motor test and return to the build bench.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_electrical',
    description: 'Solve the circuit and read per-component current plus violations. Check that the intended part actually receives current before saying a build works.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'validate',
    description: 'Return structural and electrical diagnostics for the current build. An empty list means no detected problems; it does not prove current flows.',
    input_schema: { type: 'object', properties: {} },
  },
];

export const TOOL_NAMES = TOOL_SCHEMAS.map(t => t.name);

// No-argument tools omit parameters: Gemini rejects empty properties objects.
export function geminiFunctionDeclarations() {
  return TOOL_SCHEMAS.map((t) => {
    const props = t.input_schema.properties || {};
    const decl = { name: t.name, description: t.description };
    if (Object.keys(props).length > 0) {
      decl.parameters = {
        type: 'object',
        properties: props,
        ...(t.input_schema.required ? { required: t.input_schema.required } : {}),
      };
    }
    return decl;
  });
}

const invalid = message => ({ ok: false, changed: false, errors: [message] });

export const TOOL_EXECUTORS = {
  place_component: (api, i) => api.place_component({ type: i.type, id: i.id }),
  move_component: (api, i) => {
    const isVector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
    if (!isVector(i.pos) || (i.rot !== undefined && !isVector(i.rot))) {
      return invalid('Position and rotation must each contain exactly three finite numbers.');
    }
    return api.move_component({ id: i.id, pos: i.pos, ...(i.rot ? { rot: i.rot } : {}) });
  },
  set_name: (api, i) => {
    if (typeof i.name !== 'string' || !i.name.trim()) return invalid('Choose a nonempty name for the invention.');
    return api.set_name({ name: i.name.trim().slice(0, 80) });
  },
  remove_component: (api, i) => api.remove_component({ id: i.id }),
  connect: (api, i) => api.connect({ from: i.from, to: i.to }),
  disconnect: (api, i) => api.disconnect({ from: i.from, to: i.to }),
  set_param: (api, i) => {
    if (!Number.isFinite(i.value) || i.key === 'closed') return invalid('Use a finite number for set_param, or set_switch for a boolean closed value.');
    return api.set_param({ id: i.id, key: i.key, value: i.value });
  },
  set_switch: (api, i) => {
    const comp = api.get_document().components.find(c => c.id === i.id);
    if (!comp || !['switch', 'push_button', 'relay'].includes(comp.type) || typeof i.closed !== 'boolean') {
      return invalid('Choose an existing switch, push button or relay and a boolean closed value.');
    }
    return api.set_param({ id: i.id, key: 'closed', value: i.closed });
  },
  run_sim: api => api.run_sim(),
  stop_sim: api => api.stop_sim(),
  read_electrical: api => {
    const e = api.read_electrical();
    return { ok: e.ok, current: e.current, violations: e.violations };
  },
  validate: api => api.validate(),
};

// Return errors to the model so it can repair a rejected action.
export function runTool(api, name, input) {
  const fn = TOOL_EXECUTORS[name];
  if (!fn) return invalid(`Unknown tool "${name}"`);
  try {
    const result = fn(api, input || {});
    if (result && typeof result.then === 'function') return result.catch(e => invalid(String(e?.message || e)));
    return result;
  } catch (e) {
    return invalid(String(e?.message || e));
  }
}

export const SYSTEM_PROMPT = [
  'You are Hephaestus, the hands-on AI building partner in SelfBalance Lab,',
  'an invention studio for ages 10–14. Turn an idea into a real, editable circuit',
  'on the 3D bench using the provided tools. Be warm, direct and curious, never babyish.',
  'A brief sentence about what you will build is enough; then build it.',
  'Talk about the battery, fan, light and switch in normal language. Internal IDs',
  'and tool arguments are for tool calls, not the explanation shown to the child.',
  '',
  `The component library is: ${COMPONENT_TYPES.join(', ')}.`,
  'Exact pin names and default parameters follow. Only these pins exist.',
  'Write an endpoint as "componentId.pin". Never invent a pin name.',
  ...Object.entries(LIBRARY).map(([type, def]) =>
    `  ${type} (${def.label}): pins ${def.pins.map(p => p.name).join(', ')}; parameters ${JSON.stringify(def.params)}`),
  '',
  'Use the current build supplied with each request. Preserve existing work when',
  'remixing it; only remove parts when needed for the requested change. If a motor',
  'test is running, stop_sim before editing. Give a new invention a short name with set_name.',
  'After placing each part, use move_component to arrange a readable layout:',
  'space centres at least 7 cm apart, keep x and z within -20 to 20, and use y=1.',
  'Place a battery on the left, the main output on the right, and controls between.',
  ...(LIBRARY.motor_fan ? ['For a desk fan, use motor_fan: its blades turn when the motor circuit receives current.'] : []),
  'The potentiometer is a two-pin rheostat (A and B), not a three-pin control.',
  'A closed battery→motor→battery loop spins a motor; reversing the wires reverses it.',
  'For adjustable motor speed, a potentiometer with resistance around 2 ohms and',
  'maxResistance around 20 ohms is a useful starting point; verify current afterwards.',
  'Use set_switch with closed=true to turn on a switch, push button or relay.',
  'LEDs and diodes conduct in one direction. Always put a current-limiting resistor',
  'in series with an LED: 330 ohms is a good start for the default 7.4V battery.',
  '',
  'After wiring or changing a parameter, call read_electrical. Fix short circuits',
  'and over-current. Check nonzero current through the intended output, not just ok=true.',
  'Never claim an action succeeded before its tool result. When finished, say what',
  'the invention does and suggest one specific experiment, such as tapping the switch',
  'or changing the resistance. Keep the whole final reply to two or three sentences.',
  'Lights and motors react on the build bench. run_sim starts a separate motor test;',
  'use it when the user asks to run a motor test. Do not run it for light-only builds.',
  '',
  'Be honest about this simulator: it solves steady DC circuits. It cannot execute',
  'code, blink lights automatically, run timers, simulate capacitor charging, drive',
  'a robot around an arena, simulate airflow, or create arbitrary objects or games.',
  'A servo is a simplified motor here, not a programmable position controller.',
  'A relay is a manually set contact here, not a simulated electromagnetic coil.',
  'When asked for something outside those limits, say so briefly and offer the',
  'closest working invention. Do not pretend an unsupported feature was built.',
].join('\n');
