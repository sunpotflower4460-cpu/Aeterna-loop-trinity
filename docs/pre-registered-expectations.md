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

- `W=1` and `W=2` global winding baselines should persist under the damped runtime over the tested horizon.
- Moderate perturbation (`W=1 + ε=0.5`) should usually persist without a durable break.
- Strong perturbation (`W=1 + ε=1.2`) should probe phase-slip threshold behavior and may break then recover.
- Active memory was expected to improve recovery relative to memory-off under matched strong perturbation.
- Clean `W=0` memory was expected to bias damaged `W=1` field state toward `W=0`.
- Clean `W=2` memory at low memory weight was expected not to overwrite `W=1`, while stronger memory around `0.03–0.05` might write `W=2` into the field.
- One-sided `W=1 × W=0` coupling was expected to show low-`g` plateau, intermediate single-slip merge, and high-`g` double-slip / transfer candidate regimes.
- Pure `W=0 + ε=1.2` noise was expected not to produce stable `W=1` recovery.

### Formal predictions for this PR

- Baseline `W=0`, `W=1`, and `W=2` run records will include field and memory winding histograms plus mode powers.
- Perturbation records will include first non-target sample, recovery sample when present, minAmp minima, and P1 minima.
- Memory OFF will disable active memory influence rather than merely skipping memory reporting.
- Ledger matrix labels will distinguish noisy `W=1` memory copy (`L1`) from clean `W=1` memory (`L1b`).
- Memory-weight sweep will test `0.0075`, `0.03`, and `0.05` or explicitly document omissions.
- One-sided coupling sweep will test `g=0.0075`, `0.02`, and `0.05` or explicitly document omissions.
- Outputs and docs will avoid overclaiming and will separate measured, observed, interpretive, and speculative claim levels.

### Hits

- Baseline `W=0`, `W=1`, and `W=2` persisted through the runtime-limited checked-in horizon.
- Moderate `W=1 + ε=0.5` persisted without a break in the runtime-limited artifact.
- Strong `W=1 + ε=1.2` exposed break/recovery behavior.
- Clean `W=0` memory biased damaged field state to final `W=0` in D1.
- Low D2 memory weight (`0.0075`) did not write `W=2` into the field, while `0.03` and `0.05` did in the checked-in artifact.
- Pure `W=0 + ε=1.2` noise did not produce stable final `W=1` in the checked-in artifact.
- Low `g=0.0075` one-sided coupling produced a plateau; high `g=0.05` produced a synchronized double-slip candidate.

### Misses

- The memory-off no-recovery expectation was not cleanly confirmed in the runtime-limited artifact: matched memory-off recovered to `W=1` over the short horizon, while the longer memory-off run ended at `W=0` after a break/recovery sequence.
- The intermediate `g≈0.02` single-slip merge expectation was missed in the runtime-limited artifact; it remained a plateau over the shortened horizon.

### Indeterminate results

- Default lightweight `GRID_SIZE=32` thresholds are indeterminate until the audit is rerun without `--runtime-limited`.
- Transfer-vs-merge classification remains candidate-level without denser coupling sampling and full 3D vortex-core tracking.
- Whether memory ON reliably outperforms memory OFF remains indeterminate because the runtime-limited artifact shows both memory-mediated bias and field self-ordering/slip behavior.
