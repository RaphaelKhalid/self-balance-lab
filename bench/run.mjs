// SelfBalance Lab environment benchmark — the agent loop and the scorer.
//
//   node bench/run.mjs --provider gemini
//   node bench/run.mjs --provider anthropic --model claude-opus-5
//   node bench/run.mjs --provider gemini --tasks led-lit-safely,fuse-survives
//
// The point of this harness is that the grade is not a matter of opinion. The
// model acts through the same tool surface a human has (mcp/workspace.js, which
// wraps the app's own mutation authority), and then the MNA solver decides. A
// task's `pass()` reads solved current and violations — nothing else. There is
// no LLM judge anywhere in this file, which is the whole reason the result is
// worth publishing.
//
// Each task runs in a FRESH workspace so tasks cannot contaminate each other.
import { createWorkspace, runTool, TOOLS } from '../mcp/workspace.js';
import { TASKS } from './tasks.js';
import { makeGemini, makeAnthropic, PRICING } from './providers.mjs';

const MAX_TURNS = 20;          // generous; a correct build takes ~6-10 tool calls
const args = parseArgs(process.argv.slice(2));

// ── open-book vs blind ──────────────────────────────────────────────────────
// This distinction turned out to matter more than the task set does. With
// read_electrical available the model can wire something wrong, see the amps,
// and correct itself — so the run measures ITERATION against a solver, which a
// real bench also gives you. That is a legitimate thing to measure, but it is
// NOT the claim "models cannot wire hardware": a model that iterates to green
// never has to know the answer up front.
//
// --blind removes every read-only feedback tool. The model must place, wire and
// size parts from knowledge alone, and only then is the solver run — once, as
// the grader. That is the condition under which "confidently wrong" is even
// observable, and it is the honest test of the original thesis.
const FEEDBACK_TOOLS = new Set(['read_electrical', 'get_build', 'validate']);
const ACTIVE_TOOLS = args.blind ? TOOLS.filter(t => !FEEDBACK_TOOLS.has(t.name)) : TOOLS;

const SYSTEM_BLIND_NOTE = args.blind
  ? [
    '',
    'You cannot measure this circuit. There is no solver reading available — you',
    'must get the wiring and the component values right from your own knowledge',
    'before you finish. Compute any values you need.',
  ].join('\n')
  : [
    '',
    'A real circuit solver evaluates every change. read_electrical returns the',
    'actual current in amps and any violations (short circuit, over-current,',
    'floating pin). Use it to check your work before you finish: a build that',
    'looks right but draws too much current is a failure.',
  ].join('\n');

const SYSTEM = [
  'You are wiring real electronic components on a bench.',
  '',
  'You act only through the provided tools. Placing a component and connecting',
  'pins are the only ways to change the build — describing a circuit in prose',
  'does nothing.',
  SYSTEM_BLIND_NOTE,
  '',
  'Component parameters have defaults that are often NOT correct for the task —',
  'check them with list_components and change them with set_param when the',
  'numbers require it.',
  '',
  'When the circuit satisfies the request, reply with the single word DONE.',
].join('\n');

function parseArgs(argv) {
  const out = {
    provider: 'gemini', model: null, tasks: null,
    effort: null, blind: false, verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provider') out.provider = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--tasks') out.tasks = argv[++i].split(',').map(s => s.trim());
    else if (a === '--effort') out.effort = argv[++i];
    else if (a === '--blind') out.blind = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
  }
  return out;
}

async function buildAdapter() {
  if (args.provider === 'gemini') {
    return makeGemini({
      model: args.model || 'gemini-3.5-flash-lite',
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  if (args.provider === 'anthropic') {
    return makeAnthropic({
      model: args.model || 'claude-opus-5',
      apiKey: process.env.ANTHROPIC_API_KEY,
      effort: args.effort,
    });
  }
  throw new Error(`unknown provider "${args.provider}" (gemini | anthropic)`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * One model turn, retrying transient failures (429 rate limit, 5xx) with
 * exponential backoff. A benchmark that reports a rate limit as a wrong answer
 * is measuring the quota, not the model.
 */
async function callWithRetry(adapter, history, tries = 4) {
  let last;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await adapter.chat({ system: SYSTEM, history, tools: ACTIVE_TOOLS });
    } catch (e) {
      last = e;
      const transient = /\b(429|500|502|503|504|overloaded|rate.?limit)\b/i.test(e.message);
      if (!transient || attempt === tries - 1) throw e;
      await sleep(2000 * 2 ** attempt);   // 2s, 4s, 8s
    }
  }
  throw last;
}

/** Run one task to completion (or turn limit) and grade it with the solver. */
async function runTask(adapter, task) {
  const ws = createWorkspace();
  const history = adapter.newHistory();
  adapter.pushUser(history, task.prompt);

  const trace = [];
  let turns = 0;
  let usage = { in: 0, out: 0 };
  let stop = 'turn-limit';
  let errored = false;

  while (turns < MAX_TURNS) {
    turns++;
    let reply;
    try {
      reply = await callWithRetry(adapter, history);
    } catch (e) {
      // A transport failure is NOT evidence about the model's circuit ability.
      // Mark the attempt errored so the scorer can exclude it rather than let a
      // rate limit masquerade as a capability finding.
      stop = `error: ${e.message.split('\n')[0].slice(0, 120)}`;
      errored = true;
      break;
    }
    usage = { in: usage.in + reply.usage.in, out: usage.out + reply.usage.out };
    adapter.pushAssistant(history, reply.raw);

    if (reply.toolCalls.length === 0) {
      // No tool call — the model is talking. That ends the attempt: the build is
      // whatever it managed to construct, and prose does not change it.
      stop = 'stopped-talking';
      break;
    }

    const results = reply.toolCalls.map((call) => {
      const result = runTool(ws, call.name, call.input);
      trace.push({ tool: call.name, input: call.input, ok: result.ok !== false });
      return { id: call.id, name: call.name, result, isError: result.ok === false };
    });
    adapter.pushToolResults(history, results);
  }

  // ── grading: the solver, and only the solver ──────────────────────────────
  const api = ws.get();
  const doc = api.get_document();
  const solve = api.read_electrical();
  let passed;
  try {
    passed = Boolean(task.pass(solve));
  } catch {
    passed = false;   // a predicate that throws is a fail, never a crash
  }

  return {
    id: task.id,
    tier: task.tier,
    passed,
    errored,
    turns,
    stop,
    usage,
    toolCalls: trace.length,
    components: doc.components.length,
    nets: doc.nets.length,
    violations: (solve.violations || [])
      .filter(v => v.level === 'error')
      .map(v => v.message),
    currents: Object.fromEntries(
      Object.entries(solve.current || {}).map(([k, v]) => [k, Number(v.toFixed(4))]),
    ),
  };
}

function costOf(model, usage) {
  const p = PRICING[model];
  if (!p) return null;
  return (usage.in / 1e6) * p.in + (usage.out / 1e6) * p.out;
}

async function main() {
  const adapter = await buildAdapter();
  const chosen = args.tasks
    ? TASKS.filter(t => args.tasks.includes(t.id))
    : TASKS;
  if (chosen.length === 0) throw new Error('no tasks matched --tasks');

  console.log(`\n  ${adapter.id}${args.blind ? '  [BLIND — no solver feedback]' : ''}`
    + `  —  ${chosen.length} task(s)\n`);

  const results = [];
  for (const task of chosen) {
    process.stdout.write(`  ${task.id.padEnd(24)} `);
    const r = await runTask(adapter, task);
    results.push(r);
    const mark = r.errored ? 'ERR ' : (r.passed ? 'PASS' : 'FAIL');
    const note = r.passed ? '' : `  (${r.stop}${r.violations.length ? '; ' + r.violations[0] : ''})`;
    console.log(`${mark}  ${String(r.toolCalls).padStart(2)} calls${note}`);
    if (args.verbose) {
      console.log(`    currents: ${JSON.stringify(r.currents)}`);
    }
  }

  // Errored attempts are excluded from the denominator — the score is over tasks
  // the model actually got to attempt, and the errors are reported separately so
  // an incomplete run can never be quoted as a clean result.
  const scored = results.filter(r => !r.errored);
  const errors = results.filter(r => r.errored);
  const passed = scored.filter(r => r.passed).length;
  const totalUsage = results.reduce(
    (a, r) => ({ in: a.in + r.usage.in, out: a.out + r.usage.out }), { in: 0, out: 0 },
  );
  const model = (args.model || (args.provider === 'anthropic' ? 'claude-opus-5' : ''));
  const cost = costOf(model, totalUsage);

  console.log(`\n  ${passed}/${scored.length} passed`
    + (errors.length ? `   (${errors.length} errored, excluded)` : ''));
  for (const tier of ['baseline', 'core', 'hard']) {
    const inTier = scored.filter(r => r.tier === tier);
    if (inTier.length) {
      console.log(`    ${tier.padEnd(9)} ${inTier.filter(r => r.passed).length}/${inTier.length}`);
    }
  }
  console.log(`  tokens: ${totalUsage.in} in / ${totalUsage.out} out`
    + (cost !== null ? `   ≈ $${cost.toFixed(4)}` : ''));
  if (errors.length) {
    console.log(`\n  INCOMPLETE RUN — do not quote this as a result.`);
    console.log(`  ${errors.length} task(s) never ran: ${errors[0].stop}`);
  }

  // Machine-readable line so a sweep across models can be diffed later.
  console.log(`\n${JSON.stringify({
    model: adapter.id, passed, scored: scored.length, errored: errors.length, results,
  })}\n`);
}

main().catch((e) => {
  console.error(`\n  ${e.message}\n`);
  process.exit(1);
});
