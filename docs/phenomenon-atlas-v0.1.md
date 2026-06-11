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

Branch-cut cautions apply to both disappearance and preservation claims, including `vortex_annihilation`, `vortex_preserved_slice_based`, `persistent_vortex`, and `vortex_preserved`.

Current `vortexCount` is measured on the central z-slice using x-y plaquettes. It should be interpreted as a slice-based vortex indicator, not a full 3D vortex-tube census. Future z-dependent or twisted vortex initial conditions require multi-slice or full-3D vortex tracking.

### `memory_trace_persistence`

Detection condition: reuse the existing `memoryTraceInBand` guardrail definition from the v2.1.2 real-runtime stability / narrow-retune scripts and summaries. Do not redesign the threshold in this PR.

### `local_pheromone_trace`

Detection condition: reuse the existing `pheromoneLocal` guardrail definition from the v2.1.2 real-runtime stability / narrow-retune scripts and summaries. Do not redesign the threshold in this PR.
