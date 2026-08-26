# Stream F — competitive read: browser electronics simulators

**Run:** 2026-08-24. **Status:** two decision gates fired. Read §4 before building anything.

The question this stream had to answer was not "do browser circuit simulators
exist" — they obviously do. It was narrower and load-bearing:

> Does an incumbent already have a **programmatic mutation API plus a
> correctness oracle** — the pair we have been calling our differentiator?

## 1. Wokwi — not the competitor we assumed

Wokwi is an **MCU/digital simulator**, not an analog one.

- `VERIFIED` No SPICE / analog simulation. Wokwi's own docs describe a digital
  simulator with basic analog support on a handful of parts (potentiometer, NTC,
  photoresistor, joystick).
- `VERIFIED` **It ignores resistors in analog circuits.** It therefore cannot
  represent our central trap — the default 100Ω resistor pushing 48 mA through a
  30 mA LED — because it does not compute branch current at all.
- `VERIFIED` It *does* have real automation: `wokwi-cli` + YAML scenarios in CI,
  with actions `delay`, `expect-text`, `fail-text`, `write-serial`, `expect-pin`,
  `set-control`, `take-screenshot`, `touch`. Stateless cloud sim server, parallel
  runs.

**Read:** Wokwi's oracle is *firmware assertions* — did the serial output say X,
is this pin high. That is a unit test over emulated firmware, not an electrical
correctness oracle. On the physics axis we are ahead of Wokwi, not behind.
Its automation surface is also firmware-shaped: you upload a binary, you do not
build a circuit through an API.

## 2. Velxio — the actual competitor, and it is ahead of us on physics

`VERIFIED` (vendor page + independent corroboration of the underlying tech):

- **ngspice compiled to WebAssembly**, running full nodal analysis ~60×/second,
  in the browser.
- SPICE-accurate analog: op-amps with saturation, BJTs, MOSFETs, capacitors —
  "like real silicon, not idealised models".
- 100+ components, including 48+ Wokwi-compatible visual parts. MCU emulation
  (ESP32, RP2040, ATtiny85). Custom chips authored in C/Rust/AssemblyScript.
- Live instruments: oscilloscope, voltmeter, ammeter.
- **Classroom pricing from $40/student/year.** Free tier with AI credits.

**What it does not appear to have** (`INFERRED` — absent from the docs I read, not
confirmed absent): an agent-facing build API, or a pass/fail correctness oracle /
CI integration of the kind Wokwi has for firmware.

**Read:** on fidelity we are comprehensively behind — they have real transient
analysis, transistors and op-amps; we have a DC operating point and a
piecewise-linear diode. On education pricing they are at $40/yr against the
$149 figure in our plan, with more capability. This is the closest thing to a
direct competitor found so far, and it was not on our radar.

## 3. ngspice-in-WASM is a solved, crowded problem

This is the finding with the largest consequence for the build plan.

`VERIFIED` — at least five independent projects put SPICE in the browser:

| project | notes |
|---|---|
| **EEcircuit** | ngspice via WASM, WebGL plotting, CSV export |
| **EEsim** | ngspice in-browser; text netlists → version-controllable, scriptable |
| **ngspiceX** | ngspice via Emscripten. Transient, AC, DC, op, **noise, distortion, sensitivity, pole-zero, S-parameter** |
| **tscircuit/ngspice** | browser SPICE, packaged for a TS ecosystem |
| **Velxio** | as above, plus MCU emulation |

**Read:** writing our own transient solver — companion models for L and C,
trapezoidal integration, Newton–Raphson, gmin stepping — would be
re-implementing ngspice, worse, in JS. `docs/research/OVERNIGHT-PLAN.md` Streams
A and B were scoped to plan exactly that work. **They are now largely moot.**

## 4. Decision gates fired

Two of the four gates in the plan have tripped.

### Gate: "D finds a browser-viable WASM SPICE → A and B become moot"
**FIRED.** Do not write a transient solver. If deeper physics is wanted, the
question is integration (ngspice-WASM alongside or behind the existing JS
solver), not authorship. Note the cost: a WASM ngspice is far heavier than the
current pure-JS solver and would need checking against the zero-install
constraint and against `mcp/`'s server-side use.

### Gate: "F finds a mature incumbent with the same oracle"
**PARTIALLY FIRED.** No incumbent has the *pair*. But the differentiator is now
much narrower than claimed, and one leg of it is gone:

- ~~"Nobody has physics grading circuits in a browser"~~ — **false.** Several do,
  with better physics than ours.
- **A physics oracle is not scarce.** EEsim's netlists are plain text. Anyone can
  have an LLM emit a netlist, run it through ngspice-WASM, and check node
  voltages. That is a cheaper route to the benchmark we just built than
  SelfBalance Lab is, and it would be more credible, because ngspice is a
  reference implementation nobody has to trust us about.

### What actually survives
The **constrained mutation API** — a model making the same bounded, legal moves a
human makes on a bench (`place_component`, `connect`, `set_param`), rather than
emitting a netlist wholesale. That is a genuinely different thing to measure: it
tests building, not transcription. Whether anyone wants that measured is Stream H.

The 3D learner-facing bench is also unduplicated in this set, but that is a
pedagogy and UX asset, not a physics one, and it competes with Velxio at $40/yr.

## 5. What I would do with this

1. **Stop planning a solver rewrite.** Streams A and B shrink to "evaluate
   ngspice-WASM integration", which is Stream D's job.
2. **Take Velxio seriously as a competitor** for the education product, on both
   fidelity and price. Their existence weakens "zero-install browser electronics"
   as a moat.
3. **Re-scope the differentiator honestly** to the constrained-action API. It is
   real and it is narrow. Do not say "physics grades it, nobody else has that" in
   an application — it is checkable and false.
4. **Stream H is now the whole question.** If a netlist-plus-ngspice harness gets
   the same finding for less effort, the environment story rests entirely on
   whether *bounded construction* is a more meaningful test than transcription.

## Not yet covered

Tinkercad Circuits, Falstad/CircuitJS, EveryCircuit, Multisim Live, PartQuest.
CircuitJS in particular is a real analog solver in the browser (open source, does
transient with L/C and transistors) and should be read before this stream is
called complete.
