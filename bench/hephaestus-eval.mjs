// Evaluate HEPHAESTUS specifically — the assistant real users talk to.
//
//   node bench/hephaestus-eval.mjs                 # all tasks
//   node bench/hephaestus-eval.mjs --tasks led-lit-safely -v
//
// bench/run.mjs measures the MCP tool surface. That is NOT what ships in the
// browser. Hephaestus drives js/api/tools.js, which is a different contract:
// nine tools instead of eleven, it includes run_sim/stop_sim, and — the part
// that matters — it has **no list_components and no get_build**. So the model
// cannot look up pin names and cannot read back what it has built. Everything it
// knows about pins has to come from the system prompt and the tool schemas.
//
// This runs the exact agent loop the client runs (functionCall → runTool →
// functionResponse) against the same SYSTEM_PROMPT, and grades the result with
// the solver. Failures are bucketed, because "it scored 6/10" is far less useful
// than "it invented pin names on four of them".
import { createApi } from '../js/api/index.js';
import { emptyDoc } from '../js/model/doc.js';
import { geminiFunctionDeclarations, runTool, SYSTEM_PROMPT, TOOL_NAMES } from '../js/api/tools.js';
import { TASKS } from './tasks.js';

const MAX_TURNS = 16;
const MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash';
const KEY = process.env.OPENROUTER_API_KEY;
const URL = 'https://openrouter.ai/api/v1/chat/completions';

const args = process.argv.slice(2);
const only = args.includes('--tasks') ? args[args.indexOf('--tasks') + 1].split(',') : null;
const verbose = args.includes('-v') || args.includes('--verbose');
const repeat = args.includes('--repeat') ? Math.max(1, parseInt(args[args.indexOf('--repeat') + 1], 10) || 1) : 1;

if (!KEY) {
  console.error('\n  OPENROUTER_API_KEY is not set\n');
  process.exit(1);
}

const openAITools = geminiFunctionDeclarations().map(d => ({
  type: 'function',
  function: {
    name: d.name,
    description: d.description,
    parameters: d.parameters || { type: 'object', properties: {} },
  },
}));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function chat(messages, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, messages, tools: openAITools, tool_choice: 'auto',
          temperature: 0.2, max_tokens: 1024, usage: { include: true },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || 'upstream error');
      return data;
    } catch (e) {
      last = e;
      if (i === tries - 1) throw e;
      await sleep(1500 * 2 ** i);
    }
  }
  throw last;
}

/** Why a tool call failed, in buckets worth acting on. */
function classify(name, input, result) {
  if (!TOOL_NAMES.includes(name)) return 'invented-a-tool';
  const err = (result.errors || []).join(' ').toLowerCase();
  if (/unknown endpoint|unknown pin|no pin|invalid endpoint|bad endpoint/.test(err)) return 'wrong-pin-name';
  if (/unknown component|unknown type|not in library/.test(err)) return 'wrong-component-type';
  if (/already exists|duplicate/.test(err)) return 'duplicate-id';
  if (/no such component|unknown id/.test(err)) return 'referenced-missing-component';
  return err ? 'other-rejected' : 'ok';
}

async function runTask(task) {
  const api = createApi({ doc: emptyDoc('creator', 'eval') });
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: task.prompt },
  ];
  const failures = [];
  let calls = 0, turns = 0, cost = 0, stop = 'turn-limit';

  while (turns < MAX_TURNS) {
    turns++;
    let data;
    try { data = await chat(messages); } catch (e) { stop = `error: ${e.message.slice(0, 80)}`; break; }
    cost += data.usage?.cost || 0;
    const msg = data.choices?.[0]?.message;
    if (!msg) { stop = 'no-message'; break; }
    messages.push(msg);

    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) { stop = 'stopped-talking'; break; }

    for (const c of toolCalls) {
      calls++;
      const name = c.function?.name;
      let input;
      try { input = JSON.parse(c.function?.arguments || '{}'); } catch { input = {}; }
      // run_sim/stop_sim exist in this contract but need a browser; the client
      // resolves them for real. Here they are acknowledged, not executed.
      const result = /^(run|stop)_sim$/.test(name)
        ? { ok: true, note: 'sim not available in this harness' }
        : runTool(api, name, input);
      const bucket = classify(name, input, result);
      if (bucket !== 'ok') failures.push({ bucket, name, input, errors: result.errors });
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }

  const solve = api.read_electrical();
  let passed;
  try { passed = Boolean(task.pass(solve)); } catch { passed = false; }
  return { id: task.id, tier: task.tier, passed, stop, calls, cost, failures, solve };
}

const chosen = only ? TASKS.filter(t => only.includes(t.id)) : TASKS;
console.log(`\n  HEPHAESTUS contract — ${MODEL}`);
console.log(`  ${geminiFunctionDeclarations().length} tools, no list_components / get_build\n`);

const all = [];
for (const task of chosen) {
  process.stdout.write(`  ${task.id.padEnd(24)} `);
  const runs = [];
  for (let i = 0; i < repeat; i++) runs.push(await runTask(task));
  all.push(...runs);
  const wins = runs.filter(r => r.passed).length;
  const note = runs.flatMap(r => r.failures.map(f => f.bucket));
  const uniq = [...new Set(note)];
  console.log(`${wins}/${runs.length}  ${String(runs[0].calls).padStart(2)} calls` +
    (uniq.length ? `   ← ${uniq.join(', ')}` : ''));
  if (verbose) {
    for (const f of runs[0].failures.slice(0, 4)) {
      console.log(`      ${f.bucket}: ${f.name}(${JSON.stringify(f.input)}) → ${(f.errors || []).join('; ')}`);
    }
  }
}

const passed = all.filter(r => r.passed).length;
const cost = all.reduce((a, r) => a + r.cost, 0);
const buckets = {};
for (const r of all) for (const f of r.failures) buckets[f.bucket] = (buckets[f.bucket] || 0) + 1;

console.log(`\n  ${passed}/${all.length} passed   ≈ $${cost.toFixed(4)}`);
if (Object.keys(buckets).length) {
  console.log('\n  tool-call failures by cause:');
  for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(3)}  ${k}`);
  }
}
console.log();
