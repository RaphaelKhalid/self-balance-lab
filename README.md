# SelfBalance Lab

A browser electronics bench where the circuit is **actually solved**, not drawn.

Drag components onto a bench, wire them pin to pin, and a real DC circuit solver
(Modified Nodal Analysis) works out the current in every branch — lighting LEDs
in proportion to it, spinning motors from it, and flagging your shorts. Then hit
**RUN** to drive the wired motor in a Rapier physics simulation.

Zero build step. Static files and ES modules, all dependencies from CDN.

**Live:** https://selfbalance-lab.vercel.app/

## Why it's different

Most browser circuit tools either draw a schematic or simulate a microcontroller.
This one computes the electricity, and that has a consequence worth stating
plainly: **you cannot bluff it.**

Put an LED straight across a 7.4 V battery and the solver reports 0.44 A and
raises a short. Add the default 100 Ω resistor and it still passes 48 mA through
a part rated for 30 — no violation, no warning, just a number that is wrong. You
have to size the resistor. Physics decides, not a rubric and not a language model.

The same property makes the build **agent-safe**: an assistant can only make the
moves a human can, and the solver checks every one of them.

## Try it

```bash
npx serve .          # or: python -m http.server 8000
```

Needs WebGL and WebAssembly. Open the printed URL.

- **Drag** a part from the tray onto the bench (parts fall and stack — real gravity)
- **Click a pin, then another** to wire them
- **Right-click** a wire or part to delete it · **R** rotates · **drag** to move
- **Scroll a potentiometer knob** to change resistance and watch the current follow
- **Drag the 💡 desk lamp** over a photoresistor, or the 🔥 candle over a thermistor
- **RUN** drops the solved motor current into a physics sim

There's an example gallery (LED torch, motor dimmer, relay-switched motor,
light- and heat-sensing circuits) and **Hephaestus**, a natural-language
assistant that builds and wires circuits through the same API you do.

## What's in here

| Path | What it is |
|---|---|
| `js/sim/circuit.js` | The MNA solver. Pure maths — no THREE, no DOM |
| `js/model/` | `RobotDoc v2` document + the 16-component library |
| `js/api/index.js` | `window.__api` — the single mutation authority |
| `js/app/` | The 3D bench, inspector, assistant, phone shell |
| `mcp/` | MCP server exposing the solver + document to other agents |
| `bench/` | A circuit benchmark for LLMs, graded by the solver |
| `tests/` | Playwright suite |

The solver and document layer import into Node unchanged, which is why `mcp/`
and `bench/` can run the *identical* solver server-side rather than a second
implementation that drifts.

## Benchmark

`bench/` runs a language model through the same tool surface a human uses and
grades the result with the solver — no rubric, no LLM judge.

```bash
npm run bench:verify                     # free: proves every task is solvable
npm run bench -- --provider openrouter   # needs OPENROUTER_API_KEY
```

First result: `deepseek/deepseek-v4-flash` scored 27/29 blind (no solver
feedback) for about two cents. See `bench/README.md` — including why that is a
result *against* the hypothesis it was built to test.

## Development

```bash
npm test          # Playwright, headless, software WebGL
npm run test:mcp  # the solver + tool layer, no browser
npm run lint
```

Headless WebGL runs slower than real time, so tests poll state rather than using
fixed waits. The one debug/authority hook is `window.__api`.

## History

This was a fixed self-balancing-robot curriculum. In the mid-2026 pivot that was
**deliberately deleted** — the lessons, the guided flow, the CodeMirror firmware
editor, the PID loop, the robot registry — and replaced with an open creator
sandbox built on one mutation API and a real solver.

So there is no balancing robot, no PID and no IMU here, and that is a decision
rather than an omission. `CLAUDE.md` has the full architecture.
