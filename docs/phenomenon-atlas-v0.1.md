# Phenomenon Atlas v0.1 Tag Definitions

Phenomenon Atlas records what occurred. It does not force success/failure. Collapse, drift, locking, annihilation, and preservation are all phenomena.

This document defines tag names, schema expectations, and observation-hygiene rules only. It does not activate a full Atlas implementation.

## Required future candidate fields

Future Atlas candidates should include:

```json
{
  "templateId": "string",
  "sourceExperiment": "string",
  "claimLevel": "measured | observed | interpretive | speculative",
  "initialConditionType": "string",
  "physicsContext": {},
  "runConfig": {},
  "measuredEvidence": [],
  "observedPhenomena": [],
  "regimeVerdict": "string",
  "structuralRegimeVerdict": "string",
  "phaseDynamicsVerdict": "string",
  "phaseBehavior": "locked | drifting | boundary-candidate | indeterminate",
  "limitations": [],
  "reinterpretationNotes": [],
  "notScriptedNotes": "string"
}
```

`physicsContext` is required for future Atlas candidates so readers can distinguish runtime mechanics from analogy language. Current `real-runtime-v0` context should identify `engineType=damped-nonlinear-klein-gordon`, `integrator=semi-implicit-euler`, `potentialType=mexican-hat`, velocity non-rotation for phase drive, and post-integration state-update coupling/memory behavior.

`initialConditionType` examples:

- `legacy_same_layout_phase_offset`
- `randomized_same_layout_phase_offset`
- `randomized_distinct_layout`
- `symmetric_baseline`

## Verdict separation

- `structuralRegimeVerdict` is the PR #27 integrated classifier output from `classifyPhaseStructureRegime`.
- Because the PR #27 classifier includes priority rules, `structuralRegimeVerdict` may still return phase-like labels such as `phase-locking` or `phase-drift`.
- For phase-dynamics interpretation, use `phaseDynamicsVerdict` and `phaseBehavior`.
- `phaseBehavior=boundary-candidate` must reuse the existing PR #28 scan-level `boundaryCandidate` logic; do not invent a new boundary threshold.
- `finalRegimeVerdict`, when present in future outputs, is only a legacy compatibility alias for `structuralRegimeVerdict`; use the separated verdict fields for interpretation.

## Gauge and A/B structure tags

### `global_phase_offset_relaxation`

Detection condition: unwrapped `thetaStar` moves monotonically or near-monotonically toward `0` while `alignedFieldABDistance` remains below the structural distinctness threshold (`0.02`).

### `near_identical_from_start`

Detection condition: `alignedFieldABDistance_start < 0.02`.

### `phase_locking`

Detection condition: the phase-dynamics end-window standard deviation of unwrapped `thetaStar` is `<= 0.02` rad and scan-level drift criteria are not met.

### `phase_drift`

Detection condition for v2.1.2 scan-scale summaries: unwrapped `thetaStar` total travel is `>= pi` or `abs(driftRatePerStep) > 1e-4` rad/step in the second half. This drift-rate threshold is a heuristic calibrated for `dt=0.03`, roughly 2000-step runs, and current sample intervals; it is not a universal physical constant.

### `phase_boundary_candidate`

Detection condition: existing PR #28 scan-level boundary candidate logic, such as adjacent lock/drift verdict flip across neighboring scan points, end-window std near the locking threshold, or small persistent drift near the scan boundary. Do not invent a new threshold in this PR.

### `arnold_tongue_region_candidate`

Detection condition: reserved for qualitative Adler-like / Arnold-tongue-region candidates. This tag is not a confirmed Arnold tongue and should cite phase scan evidence.

### `raw_distance_collapse`

Detection condition: raw phase-sensitive `fieldABDistance` crosses the legacy collapse threshold. This tag is retained for historical comparison and must not be used alone to claim structural collapse.

### `structural_identity_collapse`

Detection condition: `alignedFieldABDistance_start >= 0.02` and `alignedFieldABDistance_end < 0.005`.

### `structural_convergence`

Detection condition: measured decrease in `alignedFieldABDistance`. This is not automatically causal or mutual convergence.

### `mutual_structural_convergence`

Detection condition: coupling-ON run converges more strongly than its matched coupling-OFF control. This tag must include matched control evidence, for example `couplingOnRunId`, `controlRunId`, `alignedDistanceDelta_ON`, `alignedDistanceDelta_OFF`, and `comparisonRule`.

Any tag containing `mutual` must include a matched `controlRunId` or comparison evidence.

### `common_attractor_relaxation_candidate`

Detection condition: a coupling-OFF control also converges substantially, suggesting independent relaxation toward a common attractor.

### `vacuum_attractor_confound`

Detection condition: vortex annihilation, damping, or vacuum relaxation may be reducing A/B distance without mutual attraction.

### `gauge_invariant_structural_distance_preserved`

Detection condition: `alignedFieldABDistance_end / alignedFieldABDistance_start >= 0.5` when `alignedFieldABDistance_start >= 0.02`.

## Vortex and trace tags

### `vortex_annihilation`

Detection condition: `vortexCount` reaches `0`; record onset step.

### `vortex_preserved_slice_based`

Detection condition: final central-slice `vortexCount` remains above `0`; record the slice-based count and counting method.

### `persistent_vortex`

Detection condition: reuse the existing `vortexPreserved` guardrail definition from the v2.1.2 real-runtime stability / narrow-retune scripts and summaries. Do not redesign the threshold in this PR.

### `branch_cut_artifact_possible`

Observation-hygiene warning: randomized torus phase construction may introduce branch-cut / seam artifacts.

### `branch_cut_may_inflate_initial_count`

Observation-hygiene warning: branch-cut artifacts may inflate `initialVortexCount`.

### `vortex_count_absolute_value_caution`

Observation-hygiene warning: absolute `initialVortexCount` and `vortexZeroStep` should not be over-interpreted until periodic-consistent vortex initialization exists.

### `legacy_torus_atan2_vortex_phase`

Initialization-audit tag: randomized vortex phase construction uses the legacy torus nearest-delta `atan2` construction. This is a construction-mode tag, not a new physics phenomenon.

### `unwrapped_atan2_vortex_phase_audit`

Initialization-audit tag: randomized vortex phase construction uses direct unwrapped coordinate deltas as a diagnostic for wrapped-delta seam artifacts. This is a diagnostic initializer, not a new physical force.

### `neutral_dipole_image_sum_candidate`

Initialization-audit tag: randomized vortex phase construction uses neutral +1/-1 pair image sums as a periodic-consistent candidate. This is an initial-condition hygiene candidate, not a closed-form periodic vortex construction and not a new physical force.

### `periodic_vortex_initialization_candidate`

Initialization-audit tag: a candidate initializer reduced or otherwise characterized periodic seam artifacts in measured initialization audits. Promotion requires matched-seed evidence and should remain separate from runtime physics claims.

### `wrapped_delta_seam_artifact_candidate`

Initialization-audit tag: measured counts or phase construction indicate possible non-`2π` discontinuity sheets from wrapped nearest-delta jumps near periodic seams.

### `branch_cut_artifact_reduced_candidate`

Initialization-audit tag: matched audit evidence indicates an opt-in initializer reduced branch-cut / wrapped-delta count inflation relative to the legacy construction.

### `branch_cut_artifact_still_present`

Initialization-audit tag: matched audit evidence indicates seam or wrapped-delta artifacts remain present after a candidate initializer.

Branch-cut cautions apply to both disappearance and preservation claims, including `vortex_annihilation`, `vortex_preserved_slice_based`, `persistent_vortex`, and `vortex_preserved`.

Current `vortexCount` is measured on the central z-slice using x-y plaquettes. It should be interpreted as a slice-based vortex indicator, not a full 3D vortex-tube census. Future z-dependent or twisted vortex initial conditions require multi-slice or full-3D vortex tracking.

### `memory_trace_persistence`

Detection condition: reuse the existing `memoryTraceInBand` guardrail definition from the v2.1.2 real-runtime stability / narrow-retune scripts and summaries. Do not redesign the threshold in this PR.

### `local_pheromone_trace`

Detection condition: reuse the existing `pheromoneLocal` guardrail definition from the v2.1.2 real-runtime stability / narrow-retune scripts and summaries. Do not redesign the threshold in this PR.

## Global winding, memory, and phase-slip candidate tags

These tags come from the v2.1.2 winding / memory / phase-slip audit family. They are candidate or observed tags in the current damped runtime only. They do not imply biological life, consciousness, exact topology proof, or permanent survival.

### `global_winding_persistence_candidate`

Detection condition: global x-axis line-winding histogram remains dominated by the target `W` across all sampled `(y,z)` lines through the tested horizon.

### `quantized_winding_amplitude_ladder`

Detection condition: baseline global winding runs show distinct stationary-amplitude levels that track the curvature-cost calibration prediction for different integer `W` values.

### `phase_slip_threshold`

Detection condition: a perturbation strength or coupling value produces a transition from target-dominant line winding to non-target-dominant winding, with supporting minAmp collapse or mode-power change evidence.

### `winding_self_repair_candidate`

Detection condition: a damaged global-winding run temporarily loses target-dominant winding and later returns to the target `W` with dominant fraction at or above the registered recovery threshold. This tag must not be used as a biological or permanent-survival claim.

### `memory_restores_destroyed_structure_candidate`

Detection condition: a damaged field returns to target-dominant winding in a memory-enabled condition more clearly than in a matched memory-off control. Requires exact memory parameters and matched perturbation details.

### `memory_biased_basin_selection`

Detection condition: initial field and memory windings differ, and the final field basin changes in a way that depends on memory winding or memory weight. This tag replaces infallible-ledger language.

### `memory_strength_threshold_candidate`

Detection condition: a memory-weight sweep shows a reproducible transition between field-dominated and memory-dominated final winding outcomes.

### `field_reeducates_memory_candidate`

Detection condition: memory starts in a different clean winding from the field, but memory-dominant winding later moves toward the field-dominant basin.

### `topological_frustration_plateau`

Detection condition: one-sided `W=1 × W=0` coupling preserves distinct dominant windings through the tested horizon without detected slip in either side.

### `frustration_breaking_threshold`

Detection condition: increasing coupling crosses from a frustration plateau into winding merge, exchange, or transfer-candidate behavior.

### `coupling_induced_amplitude_hole`

Detection condition: coupling run shows a local or global minAmp drop near a winding transition, supporting but not proving phase-slip interpretation.

### `single_slip_merge`

Detection condition: one side changes dominant winding and both sides end in the same dominant winding basin.

### `double_slip_exchange`

Detection condition: both sides change dominant winding within a nearby sampling window, with supporting amplitude or mode-power evidence, and the final dominant winding assignments are swapped relative to the initial setup.

### `synchronized_double_phase_slip`

Detection condition: both sides show minAmp drops and winding changes within a short registered window. This remains an inferred phase-slip tag unless full 3D vortex-core tracking is added.

### `winding_transfer_candidate`

Detection condition: a one-sided coupling run shows winding moving from one side to the other or an exchange-like event. Requires repeated evidence before promotion beyond candidate level.

### `transfer_then_merge`

Detection condition: a run first shows transfer- or exchange-like winding changes and later settles into a common dominant winding basin.
