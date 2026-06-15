# G8 Structurally Distinct Interaction Pre-registration

## Purpose

G8 pre-registers the observation design for the future Structurally Distinct Beings Interaction Smoke before any G8 runner exists. It fixes the finite-horizon outcome categories, matched-control requirements, observer axes, limitation flags, and claim discipline so future results are not read opportunistically.

G8 asks whether two structurally distinct field configurations can show a controlled finite-horizon interaction under the existing dissipative setting. It does not claim that the interaction will be found.

## Scope

This is a design-only pre-registration for a future experiment. It defines what success, failure, boundary, and indeterminate outcomes would mean, but it does not implement G8 or generate G8 evidence.

The intended sequence is:

- PR #39: Add Topological Ledger smoke observer.
- PR #40: Protect v2.2 Topological Ledger smoke artifacts.
- PR #41: Pre-register G8 structurally distinct interaction design.
- PR #42: Implement G8 smoke.
- PR #43: Protect G8 artifacts.

## Claim discipline

All G8 claims are finite-horizon operational observations. G8 must not be framed as biological life, consciousness, agency, subjectivity, soul, or permanent survival.

Any numeric threshold used by the future G8 runner must either cite an existing artifact/doc source or be declared as provisional/to-be-measured before the runner is implemented.

Historical values such as fusion anchors, detuning lock boundaries, plateau distances, merge thresholds, relation-band thresholds, or P2/P3 boundaries must not be hardcoded unless the exact artifact or document source is named. If a value cannot be located in repository artifacts, do not assert it as canonical; mark it as not located in current repo artifacts and describe the reference method instead.

## Operational meaning of “beings”

“Beings” is an operational project label for structurally distinct field configurations that can be tracked over a finite horizon. It does not imply biological life, consciousness, agency, subjectivity, soul, or permanent survival.

Use the term only as a project-internal operational label. A difference in initial conditions must not be misread as a difference in “beings” unless it is recorded as a controlled structural distinction.

## Purely dissipative baseline

G8 is a pure-dissipative baseline experiment. It must not include external drive or gentle-pulse.

Gentle-pulse / driven open-system experiments are later middle-range work. G8 first tests what can and cannot happen without drive.

Driven/gentle-pulse experiments are not part of the pure-dissipative G8 pre-registration.

## Central question

In a purely dissipative system, can two structurally distinct field configurations enter an observable relation band without immediately collapsing into identity, remaining mutually irrelevant, or requiring external drive?

This is a finite-horizon operational question.

## Meeting vs maintenance

Meeting and maintenance are separate outcomes.
Family T can support a short-horizon meeting candidate.
Family P can support a finite-horizon maintenance candidate.
A short-horizon relation-band entry is not long-term maintenance.

Family T must not be called persistent. Temporary relation-band entry must not be called survival. Maintenance must not be described as proven permanent.

## Family T: transient short-horizon interaction

Family T tests meeting, not maintenance.

Purpose: test whether structurally distinct transient vortex-layout configurations can enter an observable relation band during relaxation.

Operational setup:

- different seeds / different layouts;
- prefer hygienic periodic-dipole-image-sum-style initialization if available;
- short horizon;
- fine early sampling;
- `g=0` matched control required;
- coupled condition required;
- detuning-inside-lock-region condition, if a lock-region reference exists;
- detuning-outside-lock-region condition, if a lock-region reference exists.

If detuning lock-region data cannot be cleanly transferred to this setup, detuning conditions must be marked provisional and to-be-measured.

## Family P: persistent finite-horizon interaction candidate

Family P tests maintenance candidate behavior, not permanent survival.

Purpose: test whether structurally distinct configurations with a topological carrier can remain distinguishable while showing interaction over a longer finite horizon.

Operational setup:

- distinct layouts plus global winding carrier;
- A: `W=1` ramp candidate;
- B: `W=0` candidate;
- longer finite horizon than Family T;
- `g=0` matched control required;
- coupled condition required;
- boundary bracket between distinct-related and too-fused regimes;
- optional `W=2 × W=0` condition only if scope remains small.

A global phase offset of the same layout is not a structurally distinct pair. Same-layout plus global phase offset is a U(1) equivariance/regression concept, not G8 structural distinction.

## Matched controls

Every coupled condition must have a matched `g=0` control. The common vacuum / dissipative relaxation pathway is a confound, so G8 must compare coupled runs to matched uncoupled controls before claiming interaction.

Future G8 records must include:

- `runId`
- `controlRunId`
- `family`
- `initializationMode`
- `phaseConstructionMode`
- `seedA`
- `seedB`
- `initialWindingA`
- `initialWindingB`
- `couplingG`
- `detuningReference`
- `horizon`
- `sampleInterval`
- `claimLevel`

This PR does not implement those fields. It pre-registers them for the future runner.

## Δω reference policy

`Δω` is an operational initialization/control parameter or measured proxy. It is not a biological, conscious, or metaphysical distinction.

The repository contains v2.1.2 phase-detuning scan materials:

- `experiments/v2.1.2-phase-detuning-scan-results.json`
- `experiments/v2.1.2-phase-detuning-scan-summary.json`
- `docs/v2.1.2-phase-detuning-scan.md`
- `scripts/run-v212-phase-detuning-scan.js`

Existing v2.1.2 phase-detuning scan values may be cited only as order-of-magnitude starting context if their artifact/doc source is explicitly named. They must not be transferred as settled lock/drift boundaries for structurally distinct G8 layouts.

The future G8 implementation must choose one of:

- explicit initialization parameter;
- initial phase-velocity difference;
- field/memory rotation-rate proxy;
- measured detuning/Arnold-tongue artifact.

If no stable `Δω` measurement exists for structurally distinct G8 layouts:

- G8 must report `Δω` conditions as provisional;
- the lock-region boundary for structurally distinct layouts must be marked to-be-measured;
- a detuning scan may be required before strong claims about inside/outside lock regions.

If a previously mentioned fusion-anchor or detuning-boundary value cannot be located:

- do not assert it;
- do not include it as a canonical threshold;
- mark it as not located in current repo artifacts.

Any drift/lock threshold inherited from v2.1.2 is `dt`/step/horizon dependent and must be recalibrated if G8 conditions differ.

## Energy-balance proxy requirement

Family P maintenance judgments must report an energy-balance proxy alongside distance and ledger diagnostics, using existing metrics when available, such as `fieldEnergyProxy`, `totalEnergy`, `energyDelta`, or inter-sample `energyDelta`.

This is a reporting requirement only. It does not add runtime code or new energy metrics in this PR.

Coupling may change amplitude or energy-like quantities. A finite-horizon persistence candidate should not be upgraded without checking whether the effect is separable from energy-injection or non-conservative coupling confounds.

Future G8 records must support the limitation flag `energy_injection_confound_possible`. Use this flag when a coupled Family P run appears persistent but also shows energy growth or `energyDelta` behavior not matched by the `g=0` control.

If persistence under coupling accompanies energy injection relative to control, keep the interpretation cautious and do not upgrade beyond finite-horizon interpretive candidate.

## P2/P3 boundary bracket

G8 pre-registers a boundary bracket between P2 and P3.

P2: too fused / identity collapse

- A and B become near-identical too early.
- Observer V2 aligned distance collapses toward near-identity.
- Topological Ledger maps may converge, but ledger convergence alone is not the criterion.
- Interpretation: not evidence of distinct relation; fusion/collapse candidate.

P3: distinct-but-related candidate

- A and B remain distinguishable while showing interaction relative to matched `g=0` controls.
- Observer V2 and Topological Ledger diagnostics are both reported.
- Energy-balance proxy is reported for Family P.
- Reliability guardrails remain interpretable.
- Interpretation: finite-horizon distinct interaction candidate; not biological life, consciousness, agency, or permanent survival.

No relation / unrelated drift:

- Coupled run is indistinguishable from its matched `g=0` control or does not enter the pre-registered relation band.

Boundary:

- Observer V2 and Topological Ledger disagree, energy-balance context complicates interpretation, relation-band entry is partial, or the run sits near a transition.
- Boundary outcomes are useful. Finding the transition bracket is a valid scientific result.

Indeterminate:

- Amplitude validity, near-π ambiguity, invalid plaquettes, missing diagnostics, energy proxy gaps, or guardrail failure prevents reliable classification.

## Heuristic relation band

Relation-band thresholds in G8 are heuristic finite-horizon criteria. They must be reported as pre-registered operational thresholds and later tightened by Relation Maintenance Trace or related calibration work.

Heuristic bands are not universal pass/fail laws.

## Observer V2 axis

G8 must pre-register use of existing Observer V2 concepts and match current repository artifact names where possible. Candidate fields include:

- `fieldABDistanceRaw` / current raw A/B field-distance equivalent;
- `fieldABDistanceAligned` / current aligned A/B field-distance equivalent;
- `memoryABDistanceRaw` / current raw A/B memory-distance equivalent;
- `memoryABDistanceAligned` / current aligned A/B memory-distance equivalent;
- `thetaStarFieldAB` / current field `thetaStar` equivalent;
- `thetaStarMemoryAB` / current memory `thetaStar` equivalent;
- field-memory distances;
- self target distance;
- cross target distance;
- work proxy;
- `validityAmpThreshold`;
- near-π metrics;
- amplitude/reliability guardrails.

Exact field names must follow the future runner's actual artifacts. If names differ, match current repository artifacts rather than inventing aliases.

## Topological Ledger axis

G8 must pre-register use of Topological Ledger integer bookkeeping, including:

- `positivePlaquetteCount`
- `negativePlaquetteCount`
- `totalWinding`
- `netCharge`
- plaquette-winding map distance
- `ledgerDelta`
- `invalidPlaquetteCount`
- `nearPiEdgeCount`
- `firstLedgerAgreementStep`
- `firstLedgerDisagreementStep`

Ledger agreement is not automatically success. Ledger mismatch is not automatically failure. For intentionally distinct A/B layouts, mismatch is expected and is an observation target.

Ledger equality is meaningful as a U(1) equivariance regression only in the limited same-layout + global phase offset case. G8 must not use fieldA/fieldB ledger identity as a universal success gate.

## Energy-balance context axis

For Family P, G8 must report energy-balance context using existing energy proxy fields when available, including `fieldEnergyProxy`, `totalEnergy`, and `energyDelta`.

This is not a new success axis by itself. It is a confound check.

## Trace-derived classification taxonomy

Future G8 validators should recompute classifications from traces, following the discipline established in Observer V2 work. Prose interpretation should go in notes fields rather than in new label strings.

Existing labels to reuse when applicable:

- `topological_frustration_plateau`
- `single_slip_merge`
- `synchronized_double_phase_slip_candidate`
- `winding_transfer_candidate`
- `phase_locking`
- `phase_drift`
- `structural_identity_collapse`
- `near_identical_from_start`
- `raw_distance_collapse`

Use `winding_transfer_candidate`, not `winding_transferred_candidate`.

G8-introduced labels, only if no existing label matches:

- `structural_fusion`
- `phase_locking_with_structural_preservation`
- `phase_drift_with_interaction`
- `common_vacuum_relaxation`
- `asymmetric_persistence_candidate`
- `winding_destroyed`
- `indeterminate`

Avoid `asymmetric_survival` because it overclaims maintenance/survival. Avoid `winding_transferred_candidate` because it duplicates the existing `winding_transfer_candidate` tag.

If `structural_fusion` overlaps with existing `structural_identity_collapse`, prefer `structural_identity_collapse`. If both remain necessary, document `structural_fusion` as a broader G8 outcome category, not a replacement alias.

Suggested notes fields:

- `observerV2Notes`
- `topologicalLedgerNotes`
- `energyBalanceNotes`
- `classificationNotes`
- `limitations`

## Outcome taxonomy

### A. Immediate fusion / identity collapse

Definition: A and B rapidly become near-identical under Observer V2 and/or Topological Ledger diagnostics.

Preferred existing label if applicable: `structural_identity_collapse`.

Interpretation: not evidence of distinct relation; fusion/collapse candidate.

### B. No relation / unrelated drift

Definition: A and B stay far apart, or the coupled run does not meaningfully differ from its matched `g=0` control.

Interpretation: not evidence of interaction. It may indicate insufficient coupling, incompatible initialization, or horizon too short.

### C. Transient interaction candidate / Family T

Definition: A and B enter a relation band for a short finite interval, then separate, collapse, or decay.

Possible existing labels if applicable: `phase_locking`, `phase_drift`.

Interpretation: meeting candidate only; not maintenance.

### D. Persistent distinct interaction candidate / Family P

Definition: A and B remain distinguishable while showing sustained relation-band evidence over the pre-registered finite horizon.

Possible labels if applicable: `topological_frustration_plateau`, `phase_locking_with_structural_preservation`, `phase_drift_with_interaction`.

Interpretation: maintenance candidate; not biological life, consciousness, agency, or permanent survival. Energy-balance context must be reported.

### E. Boundary / bracket outcome

Definition: the run lies near a transition between fusion, relation, and no-relation regimes; the two observer axes disagree; or energy-balance context complicates the interpretation.

Interpretation: useful boundary information; not success and not failure.

### F. Reliability-limited / indeterminate

Definition: amplitude validity, near-π ambiguity, invalid ledger plaquettes, missing metrics, missing energy proxy context, or guardrail failure prevents reliable interpretation.

Interpretation: requires improved observer, bounded rerun, or narrower setup.

## Success criteria

A Family T run supports a transient interaction candidate when A and B enter the pre-registered relation band for a short finite interval without immediate identity collapse, while reliability guardrails remain valid and the coupled run differs from its matched `g=0` control.

A Family P run supports a persistent distinct interaction candidate only if A and B remain distinguishable and relation-band evidence persists over the pre-registered finite horizon, with Observer V2 and Topological Ledger diagnostics both reported, and energy-balance context recorded.

If Family P persistence accompanies energy growth or `energyDelta` behavior not present in the matched `g=0` control, record `energy_injection_confound_possible` and keep the interpretation cautious.

## Failure criteria

Pre-registered failure categories:

- immediate identity collapse;
- no relation-band entry;
- coupled run indistinguishable from `g=0` control;
- uncontrolled invalid amplitude / near-π ambiguity;
- ledger diagnostics missing;
- Observer V2 diagnostics missing;
- energy-balance context missing for Family P;
- runtime artifact or validator failure.

Failure categories are diagnostic outcomes and will guide future boundary bracketing. Misses are preserved as evidence.

## Boundary / indeterminate criteria

- If A/B distinction is ambiguous because field distance collapses but ledger maps remain different, classify as boundary rather than success.
- If ledger maps converge but Observer V2 distance remains distinguishable, classify as boundary rather than success.
- If reliability metrics cross invalid thresholds before relation-band interpretation is possible, classify as reliability-limited / indeterminate.
- If the coupled run differs from `g=0` only after reliability has degraded, classify as indeterminate or reliability-limited rather than success.
- If Family P looks persistent but energy-balance proxy suggests coupling-related energy injection relative to control, classify cautiously and record `energy_injection_confound_possible`.

## Initializer provenance and seam-artifact caution

Future G8 records must include:

- `seedA`
- `seedB`
- layout description
- `phaseConstructionMode`
- `windingInitializationMode`
- net charge
- initial ledger summary
- initializer provenance

A difference in initial conditions must not be misread as a difference in “beings” unless it is recorded as a controlled structural distinction.

If randomized distinct layouts use a legacy atan2-style initializer, record seam-artifact risk and vortex inflation risk. Prefer hygienic periodic initialization for structurally distinct vortex fixtures when available.

## What this PR does not do

This PR does not:

- implement G8;
- add a G8 runner;
- add G8 artifacts;
- modify runtime physics;
- modify gentle-pulse;
- connect gentle-pulse to runtime step;
- modify Topological Ledger logic;
- modify Observer V2 logic;
- modify energy metrics;
- modify validators;
- modify protected historical artifacts;
- change package files or lockfiles.

Driven/gentle-pulse experiments are later middle-range work and are not part of the pure-dissipative G8 pre-registration.

## Next PR

The next implementation PR may add the G8 smoke runner only after this design gate is merged. That future PR must preserve this pre-registration discipline, use new G8 artifact names, keep every coupled condition matched to a `g=0` control, and report Observer V2, Topological Ledger, and Family P energy-balance context before classifying outcomes.
