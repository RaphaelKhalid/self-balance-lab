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

## Results (2026-08-24)

`deepseek/deepseek-v4-flash` via OpenRouter — cheap, explicitly **not** a
frontier model.

| condition | score | cost |
|---|---|---|
| open-book, 1 run | **9/10** | $0.008 |
| **blind, 3 runs per task** | **27/29** | $0.021 |

Blind, per task — the only one that is not solid is the fuse:

```
motor-spins            3/3     switch-controls-motor  3/3
led-lit-safely         3/3     motor-speed-limited    3/3
motor-reversed         3/3     two-leds-parallel      2/2
diode-conducts         3/3     buzzer-safe            3/3
button-and-led         3/3     fuse-survives          1/3   VARIES
```

(One `two-leds-parallel` attempt died on a network error and is excluded rather
than counted as a failure.)

`gemini-3.5-flash-lite` scored 6/6 open-book on the tasks that ran before its
free-tier quota ran out.

### What this means

The premise this harness was built to test — *"frontier models write clean PID
controllers but cannot wire a motor driver"* — **is not supported.**

The result is stronger than "one model got lucky". It holds under the *harder*
condition: blind, with no solver to iterate against, a cheap non-frontier model
built correct circuits from knowledge alone on 27 of 29 attempts, including
every trap. It sized an LED resistor correctly, closed a default-open switch,
solved a potentiometer for a target current band, and got diode polarity right,
without ever measuring anything.

**The one real signal is `fuse-survives` at 1/3.** That is the task where a
protective part has to be *sized* rather than bolted on. It is also the only
task in the set that gestures at protection design — and protection is precisely
what this simulator represents worst (see below). So the honest reading is not
"models are weak at protection"; it is "the one place we saw weakness is the one
place our physics is thinnest, and we cannot yet tell those apart."

### The ceiling is the simulator, not the task list

`js/sim/circuit.js` is a **DC operating-point solver**: no inductance, no
capacitor dynamics, no transient or AC analysis, a piecewise-linear diode, and
no transistors. The failure modes that make real motor-driver wiring hard —
inductive kick, inrush, PWM ripple, H-bridge shoot-through, thermal runaway —
**cannot be represented**, so no task here can pose them.

That means a 90% pass rate is evidence about *these* tasks under *this* physics,
and not yet evidence about model capability at hardware. Whether deeper physics
would produce a discriminating benchmark is an open question, scoped in
`docs/research/OVERNIGHT-PLAN.md`.

### Caveats

- One model at depth; a frontier sweep has not been run.
- Three samples per task. Enough to catch the fuse task flipping, not enough for
  a confidence interval.
- Grading is exact but *narrow*: `pass()` checks solved current and violations.
  A build could satisfy the band via a topology no engineer would choose.
