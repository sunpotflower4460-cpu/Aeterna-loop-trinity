# Pre-Registered Expectations

This file records expectations before or alongside audit interpretation. These are expectations, not success criteria. Prediction failures are evidence.

## v2.1.2 periodic vortex initialization expectations (PR #30)

### Prior smoke expectations

- Periodic vortex initialization hygiene should reduce branch-cut/seam artifacts relative to the legacy randomized construction where applicable.
- Legacy initialization should remain available for historical comparability.

### Formal predictions for PR #30

- New periodic construction modes should be opt-in and documented.
- Historical randomized-vortex result JSON files should remain unchanged.

### Hits / misses / indeterminate

- Hit: PR #30 preserved a documented legacy mode and added an initializer hygiene audit.
- Indeterminate here: this winding/memory/phase-slip PR does not retest PR #30 initializer comparisons.

## v2.1.2 winding / memory / phase-slip audit expectations

### Prior smoke expectations

- Canonical PR #31 artifacts should use `parameterLineage="exp023-real"`, not the surrogate / v2.1.2-candidate lineage.
- `W=1` and `W=2` global winding baselines should persist under the damped runtime over the tested horizon.
- Baseline mean amplitudes should match the exp023-real signatures: `W=1` close to `0.980597`, and `W=2` close to `0.920739`.
- Moderate perturbation (`W=1 + ε=0.5`) should usually persist without a durable break.
- Strong perturbation (`W=1 + ε=1.2`) should probe phase-slip threshold behavior and may break then recover.
- Active memory was expected to improve recovery relative to memory-off under matched strong perturbation or a longer memory-off horizon.
- Clean `W=0` memory was expected to bias damaged `W=1` field state toward `W=0`.
- Clean `W=2` memory at low memory weight was expected not to overwrite `W=1`, while stronger memory around `0.03–0.05` might write `W=2` into the field.
- One-sided-winding `W=1 × W=0` coupling was expected to show low-`g` plateau, intermediate single-slip merge, and high-`g` synchronized double-slip / transfer candidate regimes with bidirectional coupling preserved.
- Pure `W=0 + ε=1.2` noise was expected not to produce stable `W=1` recovery.

### Formal predictions for this PR

- Baseline `W=0`, `W=1`, and `W=2` run records will include field and memory winding histograms plus mode powers.
- Perturbation records will include first non-target sample, recovery sample when present, minAmp minima, and P1 minima.
- `break_then_recover` will only be used if the final sampled state is back on the target winding at the registered threshold.
- Weak plurality such as `dominantW=1` with `dominantFraction<0.99` will not be labeled clean recovery.
- Memory OFF will disable active memory influence rather than merely skipping memory reporting.
- Ledger matrix labels will distinguish noisy `W=1` memory copy (`L1`) from clean `W=1` memory (`L1b`).
- The main ledger-discrimination matrix will run at `MEMORY_WEIGHT=0.0075` to match low-weight spot checks.
- `field_rewrites_memory` will require initial memory winding to differ from field winding and will not fire at step `0` for already-target memory.
- Memory-weight sweep will test `0.0075`, `0.03`, and `0.05` or explicitly document omissions.
- One-sided-winding coupling sweep will test `g=0.0075`, `0.02`, and `0.05`, preserve bidirectional coupling, and record that “one-sided” means winding asymmetry only.
- Outputs and docs will avoid overclaiming and will separate measured, observed, interpretive, and speculative claim levels.

### Hits

- Default lightweight `GRID_SIZE=32` artifacts were generated with no omitted lightweight conditions under `parameterLineage="exp023-real"`.
- Baseline `W=0`, `W=1`, and `W=2` persisted through the default lightweight horizon.
- Baseline amplitude signatures matched exp023-real references: `W=1` final mean amplitude `0.98059731`, and `W=2` final mean amplitude `0.92073952`.
- Moderate `W=1 + ε=0.5` persisted without a break for seeds `101` and `202`.
- Strong memory-on `W=1 + ε=1.2` recovered cleanly for seed `101`; seed `202` ended as partial recovery and is not overstated.
- The matched memory-off control records `effectiveMemoryWeight=0` and is no longer overstated as recovered: it ends with weak `W=1` plurality and is classified as `break_partial_recovery`; the long memory-off control also records `effectiveMemoryWeight=0` and ends at `W=0`.
- Clean `W=0` memory biased damaged field state to final `W=0` in D1 at low memory weight.
- `L1b_clean_W1` was evaluated under exp023-real and recovers without a spurious memory rewrite step.
- Low D2 memory weight (`0.0075`) did not write `W=2` into the field; instead the field rewrote memory back to `W=1`. Weights `0.03` and `0.05` wrote `W=2` into the field.
- Pure `W=0 + ε=1.2` noise did not produce stable final `W=1` in the checked-in artifact.
- One-sided-winding bidirectional coupling produced the expected low-`g` plateau, `g=0.02` single-slip merge with first A slip at step `80`, and `g=0.05` synchronized double phase-slip candidate (not an exchange label without final swapped winding assignments).

### Misses

- Strong memory-on seed `202` did not recover cleanly at the final sample; it is a partial recovery under the strict threshold.

### Indeterminate results

- Transfer-vs-merge classification remains candidate-level without denser coupling sampling, bidirectional-control comparisons, and full 3D vortex-core tracking.
- Whether memory ON reliably outperforms memory OFF across a broader seed set remains indeterminate because the default lightweight artifact tests only one matched memory-off strong perturbation and one longer memory-off horizon.
- The pure W0 noise control is explicitly memory-off (`memory_off_W0_noise_control`) and records `effectiveMemoryWeight=0`.
- Exact threshold locations for memory strength and coupling require denser local scans around the observed transitions.
- Future work: add time-series L2 distances (`mean |field-memory|`, `mean |field-targetW|`, `mean |memory-targetW|`), a coupling control with `MEMORY_WEIGHT=0`, denser `g` values around `0.0125`, `0.015`, and `0.025`, low-amplitude winding validity residuals, and a later CI runtime-limited smoke command.

## v2.2 Observer V2 Calibration

This section pre-registers Observer V2 calibration expectations before the official v2.2 calibration artifacts are generated. The calibration adds measurement aids only; it does not add physics, reclassify v2.1.2 artifacts, or promote candidate phenomena to proof claims.

### Tier 1 hard expectations

Tier 1 uses synthetic known-answer fields and is pass/fail for observer correctness.

1. Clean analytic `W=1` at the stationary-amplitude reference compared with itself should have raw distance near `0`, gauge-aligned distance near `0`, closed-loop float sanity near `0`, and `invalidLineCount=0` within numerical tolerance `1e-9`.
2. A global phase offset of `π/5` applied to the same `W=1` state should have raw distance above `0`, gauge-aligned distance near `0`, and recorded `thetaStar` matching the documented sign convention: the angle applied to the second field to align it to the first field.
3. Clean `W=2` compared with analytic `W=2` should have distance near `0`, while clean `W=2` compared with analytic `W=1` should be clearly larger than the `W=2` self-distance.
4. Seeded random additive component-noise cases at `epsilon=0.15`, `0.5`, and `1.2` should show non-decreasing `lineMaxAbsPhaseStepMean` or `lineMaxAbsPhaseStepMax` within tolerance `1e-12`; `nearPiStepCount` / `nearPiStepFraction` should increase or remain tied only with explicit threshold context. If `invalidLineCount` remains tied at zero while all line minima stay above the validity threshold, that tie is threshold context rather than a hidden failure. Closed-loop float residual is not the success signal.
5. A synthetic field with exactly `K` known near-zero-amplitude `(y,z)` x-lines should report `invalidLineCount=K`.

### Tier 2 soft expectations

Tier 2 reruns representative v2.1.2-style scenarios with Observer V2 attached. These expectations are hit/miss observations, not proof claims, and misses are evidence after construction equivalence is checked. A harness-construction mismatch is not evidence; it is a bug to fix.

- Clean recovery: `fieldTargetDistance(W=1)` returns near zero and reliability metrics remain high after recovery.
- Partial recovery: `W=1`-like dominance may return, while `fieldTargetDistance` remains finite and/or `invalidLineCount` stays elevated.
- Memory-on vs memory-off: distance traces diverge after the break window.
- L2 clean `W=0`: the field tends toward the memory basin.
- L3 clean `W=2`: field-memory direction distinguishes whether field rewrites memory or memory writes field.
- Coupling `g=0.0075`: aligned A/B distance plateaus rather than collapsing.
- Coupling `g=0.02`: distance traces collapse after single-slip merge.
- Coupling `g=0.05`: traces show a transient swap window followed by final merge.
- Optional `L3_clean_W2` at `MEMORY_WEIGHT=0.03`: work-proxy traces should make uphill `W=2` memory-writing more interpretable.

## v2.2 Topological Ledger Smoke

This section pre-registers the Topological Ledger smoke observer before interpreting the generated smoke artifacts. The smoke adds Observer-layer XY plaquette accounting per z-slice only. It does not change runtime physics, implement G8, or reinterpret historical artifacts.

### Pre-registered expectations

- C-1 global phase shift invariance: `plaquetteWinding` maps are exactly identical after a global phase shift, with unchanged `totalWinding` and `netCharge`.
- Random periodic field: in all-valid synthetic periodic cases, `totalWinding` and `netCharge` are zero per slice and globally.
- Known paired vortex layout: the branch-cut-safe local fixture should report the pre-registered paired count criteria, with equal positive and negative counts and net zero. The fixture is a count/net-charge test, not an exact full torus vortex-core location proof.
- Legacy fieldA/fieldB equivariance: identical layout plus global phase offset should have identical `plaquetteWinding` maps.
- Uniform x-winding distinction: an x-axis winding histogram can report `W=1` while the XY plaquette ledger remains free of vortex plaquette winding.
- Runtime/noisy smoke: `invalidPlaquetteCount` and `nearPiEdgeCount` are diagnostic reliability context, not strict topology claims.
- `ledgerDelta`: event diagnostic only; not a strict invariant.

### Measured results

The generated v2.2 Topological Ledger smoke artifacts record the measured C-1, random periodic, known paired fixture, invalid plaquette, metric relationship, U(1) equivariance, and limited runtime-smoke outcomes in `experiments/v2.2-topological-ledger-smoke-results.json` and summarize pass/fail status in `experiments/v2.2-topological-ledger-smoke-summary.json`.

## G8 Structurally Distinct Interaction Pre-registration

See `docs/g8-structurally-distinct-interaction-preregistration.md`.
This pre-registration fixes outcome categories before the G8 runner exists. It separates transient meeting from persistent maintenance candidates, declares that “beings” is an operational project label only, records the ledger-mismatch-is-not-failure rule, requires artifact-first provenance for any future numeric threshold, and requires energy-balance context for Family P.

Do not add measured results in this PR.
