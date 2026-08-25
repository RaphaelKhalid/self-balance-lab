# Overnight research plan — simulator fidelity, SOTA stacks, and whether it matters

**Status:** plan only. Nothing here has been executed.
**Written:** 2026-08-24, after the benchmark pilot in `bench/`.

---

## 0. Why this research, framed honestly

The pilot result matters for how this plan is scoped. `deepseek/deepseek-v4-flash`
— cheap, not frontier — scored **9/10 open-book** on `bench/`, and the one failure
passed on a rerun. The premise that motivated an eval-environment company
("models can't wire hardware") is **not holding up at the current task
difficulty**.

Two readings, and the research has to serve both rather than assume one:

- **The tasks are too easy / the simulator is too shallow.** Ten parts, DC only,
  no dynamics. Real hardware failure modes — inrush, inductive kick, PWM ripple,
  thermal runaway, H-bridge shoot-through — are *not representable* in the
  current solver, so the benchmark cannot pose them. Deeper physics might be
  exactly what makes the tasks hard enough to discriminate.
- **Models are simply good at this**, and no amount of fidelity produces an
  interesting finding.

Stream H exists to tell these apart before anyone spends six weeks.

Independently: better fidelity makes the *product* better regardless of the eval
thesis. A bench where an inductive motor kicks back and kills an unprotected
transistor teaches something the current one cannot.

## 1. What we have (baseline the research must start from)

Read these first — the survey is worthless if it doesn't map onto the real code.

| File | What it is | Hard limits |
|---|---|---|
| `js/sim/circuit.js` | MNA solver, ground = node 0 | **DC operating point only.** No transient, no AC, no small-signal |
| ↳ element set | `R`, `V` (+series R via internal node), `D` piecewise-linear | No `L`, no `C` dynamics (capacitor is inert), no BJT/MOSFET, no dependent sources |
| ↳ nonlinearity | LED/diode resolved by assemble → flip inconsistent diodes → re-solve | Not Newton–Raphson. No convergence aids (gmin/source stepping), no `.model` cards |
| `js/model/library.js` | 16 component types | Lumped ideal params only; no tolerance, no temperature, no datasheet curves |
| `js/sim/creator-sim.js` | Rapier motor bench, torque from solved current | One-way coupling; no mechanical→electrical feedback beyond `Ke·ω` |
| `mcp/workspace.js` | Headless tool surface | Already the clean seam any new solver must keep |

**Constraint that governs every recommendation:** the solver is pure JS, no THREE,
no DOM, and runs in-browser *and* in Node. Any proposal that requires a native
binary, WASM over 5 MB, or a GPU breaks the zero-install product. Proposals that
break it must say so explicitly and justify it.

## 2. Streams

Each stream produces one file in `docs/research/`. Every stream ends with a
**"so what for SelfBalance Lab"** section — a survey with no recommendation is a
failed stream.

### A. Circuit simulation theory and algorithms → `A-solver-theory.md`
- MNA beyond DC: companion models for L and C, trapezoidal vs Gear integration,
  timestep control, charge conservation.
- Newton–Raphson for nonlinear devices; convergence failures and the standard
  aids (gmin stepping, source stepping, homotopy, limiting/damping).
- Sparse matrix methods (KLU, Markowitz ordering) and whether they matter at
  our scale (tens of nodes, not thousands).
- Analysis types worth having: `.op`, `.tran`, `.dc` sweep, `.ac`. Which unlock
  *teachable phenomena* vs which are academic here.
- Anchors: Nilsson & Riedel (circuits fundamentals); Sedra & Smith and Horowitz
  & Hill (practical device behaviour); Najm, *Circuit Simulation*; Vlach &
  Singhal, *Computer Methods for Circuit Analysis and Design*; the ngspice manual's
  algorithms chapters.
- **Deliverable:** the minimum change set to get `.tran` with L and C into a pure-JS
  solver, with an estimate in engineer-days and a statement of what breaks.

### B. Device models → `B-device-models.md`
- Diode: Shockley equation vs our piecewise-linear approximation — what the PWL
  model gets *wrong* that a learner would notice.
- BJT (Ebers–Moll, Gummel–Poon) and MOSFET (levels, EKV, BSIM) — how much is
  needed for a transistor that behaves believably as a switch and as an amplifier.
- Verilog-A / OpenVAF / ADMS as the standard route to compiled device models,
  and whether any of it is reachable from JS/WASM.
- Motor as a circuit element: R–L–back-EMF, stall current, inrush, PWM + inductance.
- **Deliverable:** ranked list of devices to add, each with the phenomenon it
  unlocks and implementation cost.

### C. Electromechanical coupling → `C-coupling.md`
- Two-way coupling: mechanical load → current draw → torque, and stall.
- H-bridge, shoot-through, flyback diodes, motor drivers (why a bare transistor
  dies on an inductive load) — this is the "can't wire a motor driver" claim's
  actual home, and the current solver cannot express it.
- Co-simulation timestep coupling between the circuit solver and Rapier: stability,
  stiffness, who steps whom.
- **Deliverable:** what it takes to make "wire a motor driver correctly, or the
  transistor dies" a *representable, gradeable* task.

### D. SPICE-lineage and modern circuit stacks → `D-stacks-circuit.md`
- ngspice, Xyce (parallel, Sandia), LTspice, Qucs-S, PySpice, KiCad integration.
- WASM builds of any of the above — does a browser-runnable SPICE exist, at what
  size and speed?
- Differentiable / JAX-based circuit simulation, and whether a differentiable
  oracle would be *more* valuable to an RL lab than a pass/fail one.
- **Deliverable:** build-vs-adopt call. Explicitly answer: should the JS solver be
  extended, or replaced by a WASM SPICE with the JS one kept as fallback?

### E. Physics engines → `E-stacks-physics.md`
- MuJoCo / MJX, Isaac Lab (+ Newton), Genesis, Brax, Drake, PhysX 5, Bullet, Rapier.
- Determinism and reproducibility per engine — **already known:** stock Rapier is
  not cross-platform deterministic; the `-deterministic` build is, with a
  performance cost. Confirm the equivalent for the others.
- Which are actually used for *evaluation* (not training), e.g. Isaac Lab-Arena.
- **Deliverable:** stay-on-Rapier or move, with the honest cost of moving and what
  it would buy. Default assumption is stay — the burden of proof is on moving.

### F. Competitive read — browser electronics simulators → `F-competitors.md`
**Highest-priority stream. Do not skip.**
- **Wokwi** (browser Arduino/ESP32 sim — the closest thing to a direct competitor),
  Tinkercad Circuits, Falstad/CircuitJS, EveryCircuit, PartQuest, Multisim Live.
- For each: simulation fidelity (do they do transient? transistors? MCU
  emulation?), pricing, education traction, whether they expose an API or an
  agent-facing surface.
- Specifically: **does any of them already have a programmatic mutation API and a
  correctness oracle?** That is the asset we believe is unique; verify it is.
- **Deliverable:** honest positioning statement, including "someone already did
  this" if true.

### G. Co-simulation and interchange standards → `G-standards.md`
- FMI/FMU, Modelica / OpenModelica, Simscape.
- SPICE netlist as an interchange format — could `bench/` tasks export to netlist
  so results are reproducible in ngspice by a third party? (Big credibility win
  for a paper: it makes the oracle independently checkable.)
- **Deliverable:** whether netlist export is cheap, and whether it's worth it.

### H. Does harder physics actually produce a finding? → `H-eval-methodology.md`
**The stream that decides whether any of the rest is worth building.**
- Read properly (not from abstracts): MMCircuitEval, AMSbench, ChipBench,
  CircuChain, PCBSchemaGen. What exactly do they test, how do they grade, what
  are frontier pass rates? Where is the ceiling?
- Difficulty calibration: labs reportedly want ~2–3% pass rates for training
  signal. Our tasks are at ~90%. What task class would land in that band?
- `pass@k`, sample sizes, and statistical significance — the pilot already showed
  a task flipping between runs, so single samples are noise.
- Gymnasium API, the `verifiers` library, Prime Intellect environment spec —
  what an environment must look like to be *usable* by a lab, not just published.
- **Deliverable:** a defensible answer to "is there a finding here at all, and at
  what task difficulty does it appear?" A well-supported **no** is a success.

## 3. Execution

**Order.** F and H first and in parallel — they are the kill-switch streams. If F
finds a mature incumbent with the same oracle, and H finds no headroom, streams
A–E are mostly wasted. Everything else can then run concurrently.

**Mechanism.** Options, in preference order:
1. **Scheduled cloud agent** (`/schedule`) — fire the streams overnight, results in
   files. Best fit for "overnight", survives the laptop sleeping.
2. **Multi-agent workflow** — fan out one agent per stream with an adversarial
   verify pass on the claims. Faster and more thorough, but this consumes a lot of
   tokens and **needs your explicit go-ahead** before I launch it.
3. Sequential in one session — slowest, cheapest, no opt-in needed.

**Guardrails — these are the difference between research and plausible text:**
- Every non-obvious claim carries a source URL. No numbers from memory.
- Mark each finding `VERIFIED` (read the primary source) or `INFERRED`.
- My knowledge cutoff is May 2026; anything newer must come from a fetched source,
  not recall. Stream E already has one correction of my own prior in it.
- Cross-check vendor claims against a second source. The prior session had two
  agent-reported figures conflict — treat single-source numbers as provisional.
- Every stream must reference the actual files in §1. A recommendation that
  doesn't survive contact with `js/sim/circuit.js` is not a recommendation.
- Prefer "this won't work because X" over enthusiasm. Three directions were
  already killed with evidence; killing a fourth cheaply is a win.

## 4. Output

- `docs/research/{A..H}-*.md` — one per stream.
- `docs/research/SYNTHESIS.md` — the only file that has to be read:
  1. Should the solver be extended, replaced, or left alone?
  2. Is there a benchmark finding at any reachable difficulty? If no, say no.
  3. Ranked build list with engineer-day estimates, split into
     "makes the product better" vs "makes the eval story credible" —
     they are not the same list and should not be conflated.
  4. What would have to be true for this to be a company rather than a portfolio
     piece.

## 5. Decision gates

Stop and escalate rather than grinding on if any of these fire:

- **F finds a mature incumbent** with a programmatic API + correctness oracle →
  the differentiator claim is dead; stop A–E and rewrite the positioning.
- **H finds frontier models near ceiling** on the hardest representable task →
  the eval direction is dead; keep only the product-facing recommendations.
- **D finds a browser-viable WASM SPICE** → most of A and B become moot; pivot to
  integration.
- **Everything requires a GPU or native binary** → the zero-install product
  constraint is incompatible with the eval ambition, and that tension is the
  finding.

## 6. Time and cost

Streams are research-agent work (web search + fetch + reading), not model
inference against the benchmark, so the OpenRouter credits are not the relevant
budget. Rough order: 8 streams × 30–60 min of agent time. The workflow option
costs meaningfully more tokens than the sequential one; the scheduled-agent option
sits in between.

Benchmark reruns during this are negligible — a full 10-task run on
`deepseek/deepseek-v4-flash` cost **$0.008**.
