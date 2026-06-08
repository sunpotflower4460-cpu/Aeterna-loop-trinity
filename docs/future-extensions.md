# AeternaLoop Future Extensions

## Purpose

This document separates future extension ideas from the current MVP implementation.

These ideas are important, but they should not be mixed into the core loop until Step 0–6 metrics are stable.

The current rule is:

Do not add symbolic, biological, acoustic, or morphic extensions until the base field behavior is observable, comparable, and stable.

---

## Current Core Before Extensions

The current AeternaLoop core is:

1. 3D torus field
2. Mexican-hat dynamics
3. GAMMA scan and dissipation diagnosis
4. observability metrics
5. EWMA private memory
6. homeostatic Gentle Pulse
7. phase rotation
8. memory coupling
9. pheromone public trace
10. coupling scan / transition observation

Future extensions must build on this, not replace it.

---

## Extension Candidates

1. Bhramari dual-period modulation
2. Katakamuna formant / seed injection
3. Day-night rhythm
4. Cell-division-like memory propagation
5. Morphic resonance bias
6. External sound / microphone input
7. Ritual / practice mode
8. Pattern archive and replay

---

## 1. Bhramari Dual-Period Modulation

### Concept

Introduce a slow, breath-like modulation inspired by humming / Bhramari-style vibration.

This should not be treated as proof of any biological or spiritual claim.
It is a periodic perturbation experiment.

### Possible Implementation

- Add a low-frequency modulation to selected parameters
- Candidate targets:
  - GAMMA
  - PULSE_STRENGTH
  - PHASE_ROTATION omega
  - noise amplitude
- Use two periods:
  - slow envelope
  - faster vibration-like oscillation

### Why It Might Matter

It may reveal whether the field responds differently to:
- constant input
- periodic input
- dual-period input
- breath-like gentle modulation

### Risks

- Can easily become forced animation rather than emergent behavior
- May hide the true cause of stability
- Can create pseudo-life-like motion without meaningful structure

### Required Before Implementation

- Stable baseline metrics
- Known best GAMMA range
- Known stable COUPLING_G range
- Pulse and phase rotation ON/OFF comparison
- Clear experiment log template

### Status

Future extension.
Do not implement yet.

---

## 2. Katakamuna Formant / Seed Injection

### Concept

Treat Katakamuna sounds or symbolic patterns as seed catalogs, not as proven physical laws.

A seed may influence initial conditions, local perturbations, or frequency/formant-like parameter sets.

### Possible Implementation

- Define seed presets
- Each seed may include:
  - spatial pattern
  - initial phase arrangement
  - frequency ratio
  - amplitude envelope
  - color / visualization metadata
- Inject seeds into the field as initial conditions or rare perturbations

### Important Boundary

Katakamuna seeds are symbolic experimental inputs.
Do not claim they are proven physical forces.

### Why It Might Matter

This allows symbolic structures to be tested as repeatable initial conditions.

The question becomes:

Given a seed pattern, what does the field do?

Not:

Does the symbol prove cosmic physics?

### Risks

- Overclaiming
- Mixing symbolic meaning with measured behavior
- Losing scientific clarity
- Making the system harder to debug

### Required Before Implementation

- Seed format design
- Baseline comparison mode
- Repeatable random seed support
- Metrics before/after seed injection
- Clear labeling: symbolic / speculative / measured

### Status

Future extension.
Do not implement yet.

---

## 3. Day-Night Rhythm

### Concept

Introduce a slow environmental rhythm that changes the field over long cycles.

This may represent:
- rest / activity
- contraction / expansion
- cooling / warming
- forgetting / remembering

### Possible Implementation

Slowly modulate:
- GAMMA
- NOISE_AMP
- PHEROMONE_RETENTION
- HISTORY_ALPHA
- PULSE_INTERVAL
- PULSE_STRENGTH

### Why It Might Matter

A field may behave differently when it has long-cycle environmental variation rather than constant conditions.

### Risks

- Adds another cause before existing causes are understood
- Can make experiments difficult to compare
- May create attractive but misleading visual rhythms

### Required Before Implementation

- Stable Step 0–6 baseline
- A way to replay exact cycles
- Cycle phase included in metrics
- Long-run experiment mode

### Status

Future extension.
Do not implement yet.

---

## 4. Cell-Division-Like Memory Propagation

### Concept

Allow high-amplitude or stable cells to pass part of their memory to neighboring cells.

This is not biological cell division.
It is a memory propagation experiment.

### Possible Implementation

When a cell meets certain conditions:

- amplitude is stable
- memoryFieldDifference is low
- local order is high
- pheromone density is high

then it may copy a small fraction of memoryRe / memoryIm to neighbors.

### Why It Might Matter

This may allow local patterns to grow, spread, and stabilize.

### Risks

- Can cause runaway homogenization
- Can erase local diversity
- Can make memory too dominant
- May blur the difference between private memory and public trace

### Required Before Implementation

- memory metrics stable
- local order metrics stable
- pheromone field stable
- safeguards against global homogenization
- ability to disable propagation

### Status

Future extension.
Do not implement yet.

---

## 5. Morphic Resonance Bias

### Concept

Introduce a statistical bias toward previously observed stable patterns.

This should be treated as an experimental pattern-memory bias,
not as a proven metaphysical mechanism.

### Possible Implementation

- Save stable field snapshots
- Detect recurring structures
- Create a pattern archive
- Bias future evolution slightly toward archived patterns
- Compare with no-bias baseline

### Important Boundary

Use the phrase "morphic resonance" only as an inspiration label.
The implemented mechanism should be described as:

pattern archive bias
or
history-conditioned initialization

### Why It Might Matter

It may allow the system to develop repeatable habits across runs.

### Risks

- Overfitting to previous runs
- Killing novelty
- Confusing memory with proof
- Creating artificial recurrence

### Required Before Implementation

- Snapshot format
- Pattern similarity metric
- Archive / replay system
- Baseline comparison
- Strict labeling of speculative concepts

### Status

Future extension.
Do not implement yet.

---

## 6. External Sound / Microphone Input

### Concept

Allow sound input to perturb the field.

This may connect AeternaLoop to voice, humming, music, field recordings, or ritual practice.

### Possible Implementation

- Analyze audio amplitude envelope
- Extract dominant frequencies or bands
- Map audio features to:
  - phase rotation
  - local seed injection
  - pulse strength
  - noise amplitude
  - color / visualization layer

### Why It Might Matter

This could turn AeternaLoop into a sound-responsive field instrument.

### Risks

- Audio input can dominate the system
- Hard to separate internal dynamics from external forcing
- Latency and browser audio complexity
- Overinterpretation of visual response

### Required Before Implementation

- Stable internal field first
- Audio feature extraction module
- Clear input/output mapping
- Recording / replay of audio-driven sessions
- Baseline without audio

### Status

Future extension.
Do not implement yet.

---

## 7. Ritual / Practice Mode

### Concept

Create a guided practice mode where a human interacts with the field through breath, sound, intention, or observation.

This is not part of the core scientific engine.
It is an experiential layer.

### Possible Implementation

- Session timer
- Breath pacing
- Gentle sound input
- Before/after field comparison
- Reflection notes
- Exportable session record

### Important Boundary

Separate practice mode from core simulation.

Core simulation should remain:
- measurable
- reproducible
- comparable

Practice mode can be:
- experiential
- poetic
- reflective

### Risks

- Blurring experiment and experience
- Making unsupported claims
- Making results non-repeatable

### Required Before Implementation

- Core engine stable
- Session recording
- Clear labels:
  - measured
  - inferred
  - subjective note
  - symbolic interpretation

### Status

Future extension.
Do not implement yet.

---

## 8. Pattern Archive and Replay

### Concept

Save interesting field states and replay them for analysis.

This is likely the most useful future extension after Step 6.

### Possible Implementation

- Save field snapshots
- Save metrics timeline
- Save params
- Save random seed
- Replay runs
- Compare two runs
- Mark unexpected phenomena

### Why It Might Matter

AeternaLoop is an observation instrument.
An observation instrument needs memory, replay, and comparison.

### Risks

- Large storage size
- Inconsistent snapshot formats
- Hard-to-reproduce states if seed or params are missing

### Required Before Implementation

- Snapshot schema
- Params serialization
- Metrics serialization
- Replay controls
- Version metadata

### Status

High-priority future extension.
Do not implement in this PR.
