# selfbalance-env — a circuit-building benchmark with a physics oracle

An eval environment where a model builds a real circuit and a **Modified Nodal
Analysis solver** decides whether it works. No rubric, no LLM judge, no partial
credit for a plausible-looking schematic.

The model acts through `mcp/workspace.js` — the same tool surface the app's own
assistant uses, wrapping the same mutation authority a human's clicks go through.
It cannot invent a component or a connection that a person couldn't make. Then
`js/sim/circuit.js` solves the circuit and the task's `pass()` reads solved
current and violations. That is the entire grade.

## Why this shape

The stated top quality criterion for RL environments is robustness against
reward hacking — "high reward must mean the task was actually solved, not
hacked." A physics oracle is about as far from a hackable grader as you can get:
MNA is exact linear algebra, so there is no solver artifact to farm, and unlike
a robotics sim there is no sim-to-real gap to argue about. A circuit that solves
correctly is correct.

## Running

```bash
node bench/verify-tasks.mjs                      # free: proves every task is solvable
node bench/run.mjs --provider gemini             # needs GEMINI_API_KEY
node bench/run.mjs --provider anthropic --model claude-opus-5
node bench/run.mjs --provider gemini --blind     # the honest test — see below
node bench/run.mjs --provider gemini --tasks led-lit-safely,fuse-survives -v
```

`--provider anthropic` needs `npm i @anthropic-ai/sdk`. Gemini runs over raw
fetch, so it needs no extra dependency.

## Open-book vs `--blind`

This distinction matters more than the task list does.

By default `read_electrical` is available, so a model can wire something wrong,
see the amps, and fix it. That measures **iteration against a solver** — a real
capability, and what a human at a bench also gets. It is *not* a test of whether
the model knows any electronics, because iterating to green never requires
knowing the answer up front.

`--blind` removes `read_electrical`, `get_build` and `validate`. The model must
place, wire and size everything from knowledge, and the solver runs once, as the
grader. Only under `--blind` is "confidently wrong" observable at all.

## Task design

Ten tasks over three tiers. Difficulty is tuned so that naming the right parts
is not enough — the model has to compute values. The clearest case is
`led-lit-safely`: the library's **default** 100Ω resistor still passes 48 mA
through a 30 mA LED, and the solver raises *no violation* at that level, so a
model that pattern-matches "LEDs need a resistor" gets a build that looks fine
and is wrong.

`verify-tasks.mjs` carries a hand-built reference solution for every task and
asserts the solver grades it PASS — a benchmark whose tasks can't be passed
measures nothing. The traps were separately checked to confirm the naive build
fails:

| naive build | solver says |
|---|---|
| LED straight across battery | 0.44 A — shorted |
| LED + **default** 100Ω resistor | 48 mA (limit 30 mA), **no violation raised** |
| switch wired but left at default | 0 A — defaults open |
| fuse added, no series resistance | 3.1 A through a 1 A fuse |
| potentiometer left at default 500Ω | 15 mA — motor won't turn |
| diode wired backwards | 0 A |

## First results (2026-08-24)

**`gemini-3.5-flash-lite`, open-book: 6/6 on the tasks that ran** (4 errored on
free-tier quota and are excluded, not counted as failures).

**Same model, `--blind`, 3 tasks: 2/3.** Only `fuse-survives` failed.

### What this means

The premise this harness was built to test — *"frontier models write clean PID
controllers but cannot wire a motor driver"* — **is not supported by the first
data.** A small, cheap, non-frontier model solved every task it attempted,
including the ones built as traps, and still passed most of them blind.

That is a useful result, and it was cheap to get. It says the interesting
finding is not "models can't do this." If anything survives, it is narrower:
something like *models can iterate to a working circuit but are weaker at
designing protection* (the single blind failure was the fuse task, where the
protective part has to be sized rather than bolted on). That is a much smaller
claim and would need many more tasks at that difficulty, plus several models,
before it was worth publishing.

### Caveats on the above

- One model, one run, no repeats. Nothing here is statistically meaningful.
- 4 of 10 open-book tasks never ran (quota). The runner prints
  `INCOMPLETE RUN — do not quote this as a result` when that happens.
- The blind run covered only 3 tasks.
- The task ceiling is low. A harder tier (multi-branch, current budgets,
  H-bridge-shaped topologies) would be needed to find where models actually
  break, and it is an open question whether they break at all before the tasks
  stop resembling anything a learner would build.
