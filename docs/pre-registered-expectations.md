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
- The matched memory-off control is no longer overstated as recovered: it ends with weak `W=1` plurality and is classified as `break_partial_recovery`; the long memory-off control ends at `W=0`.
- Clean `W=0` memory biased damaged field state to final `W=0` in D1 at low memory weight.
- `L1b_clean_W1` was evaluated under exp023-real and recovers without a spurious memory rewrite step.
- Low D2 memory weight (`0.0075`) did not write `W=2` into the field; instead the field rewrote memory back to `W=1`. Weights `0.03` and `0.05` wrote `W=2` into the field.
- Pure `W=0 + ε=1.2` noise did not produce stable final `W=1` in the checked-in artifact.
- One-sided-winding bidirectional coupling produced the expected low-`g` plateau, `g=0.02` single-slip merge with first A slip at step `80`, and `g=0.05` synchronized double-slip / exchange candidate.

### Misses

- Strong memory-on seed `202` did not recover cleanly at the final sample; it is a partial recovery under the strict threshold.

### Indeterminate results

- Transfer-vs-merge classification remains candidate-level without denser coupling sampling, bidirectional-control comparisons, and full 3D vortex-core tracking.
- Whether memory ON reliably outperforms memory OFF across a broader seed set remains indeterminate because the default lightweight artifact tests only one matched memory-off strong perturbation and one longer memory-off horizon.
- Exact threshold locations for memory strength and coupling require denser local scans around the observed transitions.
- Future work: add time-series L2 distances (`mean |field-memory|`, `mean |field-targetW|`, `mean |memory-targetW|`), a coupling control with `MEMORY_WEIGHT=0`, denser `g` values around `0.0125`, `0.015`, and `0.025`, low-amplitude winding validity residuals, and a later CI runtime-limited smoke command.
