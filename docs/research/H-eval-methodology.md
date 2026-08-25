# Stream H — is there a finding here at all?

**Run:** 2026-08-24. **Status:** partial. The headline answer changed shape.

The kill-switch question: *is there headroom for a capability finding at any
task difficulty we can reach?* Our pilot showed a cheap model at 27/29 blind, so
either our tasks are trivial or models are simply good at circuits.

## 1. Frontier models are NOT saturated on circuits generally

`VERIFIED` — MMCircuitEval (3,614 QA pairs across EDA stages), overall accuracy:

| model | overall | back-end design (hardest) |
|---|---|---|
| GPT-4v | 69.4% | 48.2% |
| GPT-4o | 68.0% | 48.6% |
| Gemini 1.5-Pro | 62.2% | 42.6% |
| Claude 3.5-Sonnet | 53.5% | 39.9% |

Two patterns the authors call out:

- **Back-end design is worst** — 12–21.8 points below other stages.
- **Computation trails knowledge retrieval by 8.9–15.1 points.** Models recall
  circuit facts better than they calculate with them.

Caveat: the models benchmarked are a generation old (GPT-4o, Claude 3.5 Sonnet,
Gemini 1.5 Pro). Current frontier models would score higher, so these numbers
are a floor on capability, not a current reading.

## 2. So why did a cheap model get 93% on ours?

Because the headroom is not where our tasks are. MMCircuitEval's difficulty
lives in **IC and back-end design** — layout, DRC, analog IC sizing. Ours lives
in discrete breadboard circuits: one battery, one LED, one resistor.

Those are different domains, and the hard one is not the one SelfBalance Lab
models or is about. Closing that gap would mean becoming a chip-design tool,
which is not the product.

The one transferable signal: **computation is the weak axis.** Our LED-sizing
task is exactly a computation task, and DeepSeek got it 3/3 blind — but ours is
single-constraint arithmetic. Multi-constraint numeric design (tolerance
stack-ups, operating-point targets, AC behaviour) is where the reported weakness
would live, and **all of it needs physics the current solver does not have.**

## 3. The strongest thing found in this stream is about grading, not capability

`VERIFIED` MMCircuitEval grades with a **multi-metric ensemble**: BLEU (4-gram),
ROUGE (1/2/LCS), embedding cosine similarity, and **GPT preference scoring**
(weighted 2×).

That is string similarity plus an LLM judge — on a benchmark whose own finding is
that models are worst at *computation*. A model can score well by producing text
that resembles a correct answer.

Set against what labs reportedly care about most — "high reward must mean the
task was actually solved, not hacked" — this is a real, checkable methodological
gap. Our harness grades with an MNA solve: current in amps, violations, pass or
fail. There is no rubric and no judge anywhere in it.

**This is the most defensible contribution the pilot has produced, and it is not
the one we set out to find.** "Circuit benchmarks grade with BLEU and a GPT
judge; here is one graded by a solver, and here is what changes when you do
that" is a narrow, true, publishable claim. It does not require models to be bad
at circuits.

## 4. Honest answer to the kill-switch question

**Is there a capability finding?** Not at our current task difficulty, and not
reachable without either (a) physics we do not have — transient, transistors,
operating points — or (b) moving into IC design, which is a different product.

Cross-reference Stream F: a browser-runnable ngspice already exists in at least
five projects, and anyone can pipe an LLM-generated netlist into it. So the
cheaper path to a *capability* benchmark does not go through SelfBalance Lab at
all.

**Is there a methodological finding?** Yes, and it is cheap: solver-graded vs
judge-graded, measured head to head on the same tasks. That is a paper-shaped
contribution, it is O-1A "original contribution" evidence, and it costs cents.

**Is there a company?** Nothing in this stream supports one. Labs are buying
enterprise-workflow environments; circuits are not on that list, and the oracle
we thought was scarce is not.

## 5. What would sharpen this

- Run the head-to-head: score the same 10 builds with (a) the solver and (b) an
  LLM judge shown only the build description. Any disagreement is the finding,
  and it is directly measurable with `bench/` as it stands.
- Raise task difficulty toward multi-constraint numeric design and see whether a
  signal appears *before* the physics runs out. That bounds how much fidelity is
  actually worth buying.
- Read AMSbench and ChipBench for their grading methods too — if they also use
  judges, the methodological gap is a category-wide claim rather than a
  single-paper one, which is considerably stronger.

## Not yet covered

`pass@k` conventions and sample-size norms; the Gymnasium API and `verifiers`
library conformance needed for an environment to be *usable* by a lab rather
than merely published; AMSbench / ChipBench / CircuChain grading methods.
