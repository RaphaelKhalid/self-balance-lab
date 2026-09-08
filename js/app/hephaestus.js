// Hephaestus executes model tool calls only through the shared document API.
// Templates stay separate from AI: an unavailable model is reported honestly.
import { runTool } from '../api/tools.js';
import { LIBRARY, baseType } from '../model/library.js';
import { track, EVENTS } from './analytics.js';

const ENDPOINT = '/api/hephaestus';
const MAX_STEPS = 8;
const FREE_DAILY = 25;
const USAGE_KEY = 'sbl-hephaestus-usage';

const EXAMPLE_PROMPTS = [
  'Build a desk fan with an on/off switch',
  'Make a little night light',
  'Add a speed control to my motor',
];

const SIMPLE_LABELS = {
  battery: 'battery', motor: 'motor', motor_fan: 'fan', led: 'LED',
  potentiometer: 'speed dial', photoresistor: 'light sensor', thermistor: 'temperature sensor',
};
const partLabel = type => SIMPLE_LABELS[type] || LIBRARY[type]?.label?.toLowerCase() || 'part';

// Receipts describe confirmed results, not model intentions. They never expose
// component IDs or raw tool arguments in the child's conversation.
export function describeToolResult(name, args = {}, result, doc = { components: [] }) {
  const components = doc.components || [];
  const component = id => components.find(c => c.id === id);
  const label = id => partLabel(component(id)?.type);
  const endpointLabel = endpoint => label(String(endpoint || '').split('.')[0]);
  if (name === 'read_electrical' && result?.current) {
    if (result.ok === false || result.violations?.length) return 'The circuit needs a fix.';
    const powered = Object.entries(result.current).some(([id, current]) =>
      baseType(component(id)?.type) !== 'battery' && Math.abs(current) > 0.000001);
    return powered ? 'Checked: power is flowing through your invention.' : 'Checked: no power is flowing yet.';
  }
  if (name === 'validate' && Array.isArray(result)) {
    return result.length ? 'Found a circuit issue to work on.' : 'Checked the connections: no problems detected.';
  }
  if (!result?.ok) {
    const failures = {
      place_component: 'That part could not be added.',
      move_component: 'That part could not be moved.',
      connect: 'That wire could not be connected.',
      disconnect: 'That wire could not be removed.',
      remove_component: 'That part could not be removed.',
      set_param: 'That setting could not be changed.',
      set_switch: 'That switch could not be changed.',
      set_name: 'The invention could not be renamed.',
      run_sim: 'The motor test could not start.',
    };
    return failures[name] || 'That step could not be completed.';
  }
  switch (name) {
    case 'place_component': return `Added the ${partLabel(args.type)}.`;
    case 'move_component': return `Arranged the ${label(args.id)} on the bench.`;
    case 'remove_component': return `Removed the ${label(args.id)}.`;
    case 'connect': return result.changed === false
      ? 'Those parts are already connected.'
      : `Connected the ${endpointLabel(args.from)} to the ${endpointLabel(args.to)}.`;
    case 'disconnect': return 'Removed a wire.';
    case 'set_name': return `Named your invention “${String(args.name).trim().slice(0, 80)}”.`;
    case 'set_switch': return `${args.closed ? 'Closed' : 'Opened'} the ${label(args.id)}.`;
    case 'set_param': {
      const setting = { voltsNominal: 'voltage', resistance: 'resistance', maxResistance: 'dial range', forwardVoltage: 'turn-on voltage', maxCurrent: 'current limit' }[args.key] || 'setting';
      return `Adjusted the ${label(args.id)}’s ${setting}.`;
    }
    case 'run_sim': return result.running === false ? 'The motor test is not running yet.' : 'Started the motor test.';
    case 'stop_sim': return 'Returned to the invention bench.';
    default: return 'Finished that step.';
  }
}

function builderError(message) {
  const error = new Error(message);
  error.soft = true;
  return error;
}

export function initHephaestus({ api, onFlash, getTier, onUpgrade } = {}) {
  const form = document.getElementById('hephaestus-form');
  const input = document.getElementById('hephaestus-input');
  const log = document.getElementById('hephaestus-log');
  if (!form || !input || !log) return { send: async () => {} };
  const submit = form.querySelector('[type="submit"]');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-label', 'Conversation with Hephaestus');

  const contents = [];
  let busy = false;

  function bubble(who, text) {
    const el = document.createElement('div');
    el.className = `hp-msg hp-${who}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function toolNote(name, args, result, doc) {
    const el = document.createElement('div');
    const failed = Array.isArray(result) ? result.length > 0 : !result?.ok;
    el.className = `hp-tool${failed ? ' hp-tool-error' : ''}`;
    el.textContent = `${failed ? '↳' : '✓'} ${describeToolResult(name, args, result, doc)}`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function showThinking() {
    const el = document.createElement('div');
    el.className = 'hp-thinking';
    el.setAttribute('aria-label', 'Hephaestus is thinking');
    el.innerHTML = '<span class="hp-dot"></span><span class="hp-dot"></span><span class="hp-dot"></span>';
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return { remove() { el.remove(); } };
  }

  function renderChips() {
    const wrap = document.createElement('div');
    wrap.className = 'hp-chips';
    for (const prompt of EXAMPLE_PROMPTS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'hp-chip';
      chip.textContent = prompt;
      chip.addEventListener('click', () => { send(prompt); });
      wrap.appendChild(chip);
    }
    log.appendChild(wrap);
    return wrap;
  }
  const chips = renderChips();

  function today() { return new Date().toISOString().slice(0, 10); }
  function usage() {
    try {
      const value = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
      if (value && value.date === today()) return value;
    } catch {}
    return { date: today(), count: 0 };
  }
  function bumpUsage() {
    const value = usage(); value.count += 1;
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(value)); } catch {}
  }
  function overQuota() {
    const tier = (getTier && getTier()) || 'free';
    return tier === 'free' && usage().count >= FREE_DAILY;
  }

  async function turn() {
    const controller = new window.AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents, document: api.get_document() }),
        signal: controller.signal,
      });
    } catch (error) {
      throw builderError(error.name === 'AbortError'
        ? 'The AI builder took too long to reply. Your invention is still here. Try again, or open the Idea shelf for a ready-to-remix build.'
        : 'I couldn’t reach the AI builder. Your invention is still here. Open the Idea shelf for a ready-to-remix build, or try again.');
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      if ([404, 405, 503].includes(res.status)) {
        throw builderError('The AI builder isn’t connected in this version. Open the Idea shelf for a ready-to-remix invention, or build with parts from the tray.');
      }
      if (res.status === 429) throw builderError('The AI builder is busy right now. Try again in a moment, or pick an invention from the Idea shelf.');
      throw builderError('The AI builder couldn’t finish that request. Your bench is still yours to explore. Try again, or open the Idea shelf.');
    }
    const reply = await res.json().catch(() => null);
    if (!Array.isArray(reply?.content?.parts) || !reply.content.parts.length) {
      throw builderError('The AI builder sent an incomplete reply. Please try again; your invention is still on the bench.');
    }
    return reply;
  }

  // Keep entire tool exchanges together when making room for a new request.
  // Eight model steps add at most sixteen turns; leaving twenty here stays
  // below the backend's forty-turn cap without splitting tool call/result pairs.
  function trimHistory() {
    while (contents.length > 20) {
      const nextRequest = contents.findIndex((entry, index) => index > 0 &&
        entry.role === 'user' && entry.parts.some(part => typeof part.text === 'string'));
      if (nextRequest < 0) { contents.length = 0; break; }
      contents.splice(0, nextRequest);
    }
  }

  async function send(text) {
    if (busy || !text.trim()) return;
    if (overQuota()) {
      bubble('err', `Daily free limit reached — you’ve used your ${FREE_DAILY} AI messages for today. Your bench and the Idea shelf are still yours to explore. Come back tomorrow for more AI builds.`);
      onUpgrade?.();
      return;
    }
    busy = true;
    input.disabled = true;
    if (submit) submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    chips.remove();
    bubble('user', text);
    trimHistory();
    const historyStart = contents.length;
    contents.push({ role: 'user', parts: [{ text }] });
    let receivedReply = false;
    track(EVENTS.HEPHAESTUS_MSG, { turn: contents.length });

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const thinking = showThinking();
        let reply;
        try { reply = await turn(); } finally { thinking.remove(); }
        if (!receivedReply) { bumpUsage(); receivedReply = true; }
        const parts = reply.content.parts;
        contents.push(reply.content);
        for (const part of parts) {
          if (part.text?.trim()) bubble('bot', part.text.trim());
        }
        const calls = parts.filter(part => part.functionCall);
        if (calls.length === 0) {
          if (!parts.some(part => part.text?.trim())) bubble('err', 'The AI builder had no reply that time. Try asking again.');
          break;
        }
        const responseParts = [];
        for (const part of calls) {
          const { name, args } = part.functionCall;
          const before = api.get_document();
          const result = await runTool(api, name, args || {});
          toolNote(name, args || {}, result, before);
          track(EVENTS.HEPHAESTUS_TOOL, { tool: name, ok: Array.isArray(result) ? result.length === 0 : !!result?.ok });
          responseParts.push({ functionResponse: { name, response: wrap(result) } });
        }
        contents.push({ role: 'user', parts: responseParts });
        if (step === MAX_STEPS - 1) bubble('bot', 'I’ve paused after several steps. The changes are on your bench. Ask me to continue when you’re ready.');
      }
    } catch (error) {
      if (!receivedReply) contents.splice(historyStart);
      const message = error.soft ? error.message : 'I couldn’t finish that build. You can keep exploring the bench, or ask me to try again.';
      bubble('err', message);
      if (!error.soft) onFlash?.(message, 'bad');
    } finally {
      busy = false;
      input.disabled = false;
      if (submit) submit.disabled = false;
      form.setAttribute('aria-busy', 'false');
      input.focus();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value;
    input.value = '';
    send(text);
  });

  return { send };
}

// Gemini requires functionResponse.response to be an object.
function wrap(result) {
  return (result && typeof result === 'object' && !Array.isArray(result)) ? result : { result };
}
