# Phenomenon Atlas v0.1 Tag Definitions

Phenomenon Atlas records what occurred. It does not force success/failure. Collapse, drift, locking, annihilation, and preservation are all phenomena.

This document defines tag names and detection conditions only. It does not activate a full Atlas implementation.

## Gauge and A/B structure tags

### `global_phase_offset_relaxation`

Detection condition: unwrapped `thetaStar` moves monotonically or near-monotonically toward `0` while `alignedFieldABDistance` remains below the structural distinctness threshold (`0.02`).

### `phase_locking`

Detection condition: the end-window standard deviation of unwrapped `thetaStar` is `<= 0.02` rad.

### `phase_drift`

Detection condition: unwrapped `thetaStar` total travel is `>= pi` and the run is not locked.

### `phase_locking_boundary`

Detection condition: reserved for an Arnold tongue or frequency/coupling boundary scan; do not invent a new threshold in this PR.

### `arnold_tongue_region`

Detection condition: reserved for future Arnold tongue mapping where contiguous parameter regions satisfy `phase_locking` under the defined lock threshold.

### `raw_distance_collapse`

Detection condition: raw phase-sensitive `fieldABDistance` crosses the legacy collapse threshold. This tag is retained for historical comparison and must not be used alone to claim structural collapse.

### `structural_identity_collapse`

Detection condition: `alignedFieldABDistance_start >= 0.02` and `alignedFieldABDistance_end < 0.005`.

### `near_identical_from_start`

Detection condition: `alignedFieldABDistance_start < 0.02`.

### `gauge_invariant_structural_distance_preserved`

Detection condition: `alignedFieldABDistance_end / alignedFieldABDistance_start >= 0.5` when `alignedFieldABDistance_start >= 0.02`.

## Vortex and trace tags

### `vortex_annihilation`

Detection condition: `vortexCount` reaches `0`; record onset step.

Current `vortexCount` is measured on the central z-slice using x-y plaquettes. It should be interpreted as a slice-based vortex indicator, not a full 3D vortex-tube census. Future work may add multi-slice or full-3D vortex tracking.

### `memory_trace_persistence`

Detection condition: reuse the existing `memoryTraceInBand` guardrail definition from the v2.1.2 real-runtime stability / narrow-retune scripts and summaries. Do not redesign the threshold in this PR.

### `local_pheromone_trace`

Detection condition: reuse the existing `pheromoneLocal` guardrail definition from the v2.1.2 real-runtime stability / narrow-retune scripts and summaries. Do not redesign the threshold in this PR.

### `persistent_vortex`

Detection condition: reuse the existing `vortexPreserved` guardrail definition from the v2.1.2 real-runtime stability / narrow-retune scripts and summaries. Do not redesign the threshold in this PR.
