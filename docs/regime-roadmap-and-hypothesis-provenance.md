# Regime Roadmap and Hypothesis Provenance

## Purpose

This document is a roadmap and provenance ledger for future AETERNA v2.2+ regime work. It organizes observed finite-horizon evidence, candidate interpretations, revised or missed expectations, regime taxonomy, hypothesis provenance from intuition to falsifiable predictions, superseded old gate definitions, and the next experimental sequence.

This document does not claim exact topology proof, biological life, consciousness, agency, or permanent survival. It records finite-horizon observations, candidate interpretations, and follow-up gates.

The purpose is not to keep doing meta-work forever. PR #31/#35 closed the winding/memory/phase-slip audit arc. This roadmap exists so the next work can return to phenomenon-facing experiments with clear guardrails.

## Confirmed audit baseline

The finalized v2.1.2 audit baseline is:

- PR #31 introduced the winding/memory/phase-slip audit.
- PR #35 finalized post-merge hygiene and protected the artifacts.
- The official artifacts are default lightweight 32³, `exp023-real` lineage.
- “Lightweight” here means the finalized official default audit mode, not runtime-limited CI smoke.
- Runtime-limited smoke outputs must not be promoted to official historical artifacts.
- The v2.1.2 winding/memory/phase-slip results and summary JSON are now historical artifacts and should not be silently rewritten.

Protected files:

- `experiments/v2.1.2-winding-memory-phase-slip-audit-results.json`
- `experiments/v2.1.2-winding-memory-phase-slip-audit-summary.json`

Future work must create new artifact files rather than rewriting these.

The finalized summary records `runMode: "lightweight"`, `parameterLineage: "exp023-real"`, and `windingInitializationMode: "manual-global-x-winding-ramp"`. The observer formula expectation is:

```text
P_m = |mean(phi * exp(-i2πmx/N))|^2
```

## Canonical provenance rules adopted

Current facts from the finalized v2.1.2 audit and validator:

- Every official audit must record `parameterLineage`.
- The v2.1.2 artifacts record `generatorGitHash`, `artifactGeneratedFromReachableCommit`, and `artifactCommittedIn` provenance fields.
- Official artifacts must not be runtime-limited smoke outputs.
- Results and summary `runMode` must match.
- Historical JSON must be protected by worktree and merge-base diff checks.
- Runtime initializer context is separated from manual analytic audit initialization by fields such as `runtimeInitializerContext`, `windingInitializationMode`, and `initializerComparisonMode`.
- Memory-off controls record `effectiveMemoryWeight=0`.
- Candidate tags must not be upgraded to proof language without follow-up gates.

Future official audits should:

- Continue recording `parameterLineage`.
- Record `generatorGitHash`, `artifactGeneratedFromReachableCommit`, `artifactCommittedIn`, or equivalent provenance fields.
- Keep official artifacts separate from runtime-limited smoke outputs.
- Require results and summary `runMode` agreement.
- Preserve historical JSON through worktree and merge-base diff checks.
- Preserve the separation between runtime initializer context and manual analytic audit initialization.
- Record `effectiveMemoryWeight=0` or an equivalent explicit effective-memory field for memory-off controls.
- Keep candidate classifications and atlas tags at candidate level until follow-up gates support stronger wording.

## Regime taxonomy

### A. transient relaxation

- **Definition:** Ordinary decay, local settling, noise dissipation, or non-persistent pattern relaxation.
- **Current evidence state:** Visible as the null/background alternative.
- **Current confidence:** High as a necessary control category, not as a special phenomenon claim.
- **Known limitations:** This category can absorb ambiguous cases if observer metrics are too weak.
- **Role:** Keeps candidate phenomena honest by separating transient activity from persistent or memory-mediated behavior.
- **Next gate:** G1 Observer V2 and G2 winding validity residuals / low-amplitude line confidence.

### B. topology-protected circulation

- **Definition:** Finite-horizon persistence of global winding-like circulation under the current x-line winding observer.
- **Current evidence state:** v2.1.2 audit measured `W=0`/`W=1`/`W=2` baseline persistence under `exp023-real` lineage.
- **Current confidence:** Strong finite-horizon candidate, not exact topology proof.
- **Known limitations:** x-axis line winding only; no full 3D vortex-core proof yet.
- **Next gate:** G6 full 3D vortex-core/topology observer, after G2 adds winding validity residuals.

### C. memory-mediated restoration & transfer

- **Definition:** Cases where memory state biases field recovery, field rewrites memory, or field/memory disagreement changes outcome.
- **Current evidence state:** Ledger matrix, memory-off comparisons, L1b clean `W=1`, L2 clean `W=0`, L3 clean `W=2`, and memory weight sweep.
- **Current confidence:** Observed finite-horizon memory-mediated behavior.
- **Known limitations:** Not an infallible ledger and not proof of agency.
- **Next gate:** G1 Observer V2, G3 memory anchoring comparison, and G5 `MEMORY_WEIGHT=0` coupling control.

### D. driven dissipative beings / interactions

- **Definition:** Future regime involving maintained non-equilibrium structures, distinct layouts, detuning, coupling, and possible interaction smoke tests.
- **Clarification:** Here “beings” is an operational project term for maintained, distinguishable non-equilibrium structures. It does not imply biological life, consciousness, agency, or permanent survival.
- **Current evidence state:** Not implemented yet; gate is beyond the current audit.
- **Current confidence:** Hypothesis / future gate only.
- **Known limitations:** Current audit does not implement structurally distinct maintained interaction experiments.
- **Next gate:** G8 Structurally Distinct Beings Interaction Smoke and G9 Rotation-Number Curve.

Regime D is a destination for future phenomenon work, not a result already observed.

## Current candidate phenomena

Use exact artifact classifications and atlas tag names where available. Roadmap phrases may be useful prose, but they must map back to existing artifact classifications or atlas tags and must not become independent aliases.

Roadmap phrase: winding persistence candidate. Mapped artifact evidence: `baseline_persistence_calibration`. Related atlas tag: `global_winding_persistence_candidate`.

| Artifact classification / atlas tag | Roadmap description | Observed evidence | Current confidence | Limitation | Next gate |
| --- | --- | --- | --- | --- | --- |
| `baseline_persistence_calibration` | Baseline finite-horizon global winding persistence calibration for `W=0`, `W=1`, and `W=2`. | `baseline-W0`, `baseline-W1`, and `baseline-W2` ended with target final winding and dominant fraction 1. | Strong finite-horizon calibration candidate. | x-line winding observer only; not exact topology proof. | G2 and G6. |
| `global_winding_persistence_candidate` | Atlas tag corresponding to finite-horizon target-dominant line winding persistence. | Supported by baseline persistence runs under `exp023-real` lineage. | Candidate-level atlas interpretation. | Tag is broader than one artifact classification and must cite measured runs. | G6. |
| `quantized_winding_amplitude_ladder` | Atlas tag for distinct stationary-amplitude levels across integer winding states. | Baseline `W=1` and `W=2` lineage sanity checks matched expected stationary amplitudes closely. | Useful structural calibration. | Not a complete physical or musical equivalence. | G2 and G6. |
| `break_then_recover` | Damaged `W=1` loses target dominance and later returns cleanly to target dominance. | `perturb-W1-e1.2-seed101-memory-on` and matched memory-on case ended in clean `W=1`. | Observed finite-horizon recovery classification. | Needs richer distance traces to distinguish recovery path quality. | G1. |
| `break_partial_recovery` | Damaged `W=1` returns to `W=1`-like dominance without full clean dominant fraction. | Memory-on seed 202 and memory-off matched cases ended at final `W=1` with low dominant fraction. | Observed partial recovery classification. | Partial return is not full restoration; tangled structure may remain. | G1 and G2. |
| `phase_slip_to_other_W` | Damaged `W=1` exits target basin and ends in another dominant winding. | Memory-off long case ended with final `W=0`. | Observed finite-horizon phase-slip outcome. | Phase slip is inferred from winding, minAmp, and mode changes, not full 3D core tracking. | G2 and G6. |
| `memory_off_no_recovery` | Memory-off ledger condition does not achieve clean target recovery. | `ledger-L0_memory_OFF-mw0.0075` ended with final field `W=1` but dominant fraction 0.39160156 and memory `W=0`. | Observed memory-off control outcome. | The name records no clean recovery, not absence of any `W=1`-like partial return. | G1. |
| `clean_W1_memory_recovery` | Clean `W=1` memory supports clean final `W=1` recovery. | `ledger-L1b_clean_W1-mw0.0075` ended with field and memory `W=1`, dominant fraction 1. | Observed memory-mediated behavior. | Does not establish that memory is an infallible ledger. | G1 and G3. |
| `field_follows_clean_W0_memory` | Clean `W=0` memory biases damaged field toward `W=0`. | `ledger-L2_clean_W0-mw0.0075` ended with field and memory `W=0`. | Observed memory-mediated basin selection. | Causal interpretation needs lineage and distance controls. | G1 and G3. |
| `field_rewrites_memory` | Field and memory disagree initially, then memory moves into the field basin. | `ledger-L3_clean_W2-mw0.0075` and D2 low-weight sweep ended with field and memory `W=1`. | Observed bidirectional field-memory behavior. | Not proof of agency or intentional correction. | G1 and G3. |
| `memory_writes_W2_to_field` | Stronger clean `W=2` memory writes `W=2` into the field. | D2 memory-weight sweep at `MEMORY_WEIGHT=0.03` and `0.05` ended with field and memory `W=2`. | Observed finite-horizon memory-weight effect. | Needs lineage comparison and broader sweep. | G3. |
| `memory_biased_basin_selection` | Atlas tag for field/memory disagreement changing final basin depending on memory state or weight. | Ledger matrix and memory-weight sweep show `W=0`, `W=1`, and `W=2` outcomes under different memory conditions. | Interpretive atlas candidate grounded in observed classifications. | Should replace infallible-ledger language and must cite measured conditions. | G1 and G3. |
| `topological_frustration_plateau` | One-sided `W=1 × W=0` coupling preserves distinct dominant windings through the tested horizon. | `coupling-W1-W0-g0.0075` ended A=`W=1`, B=`W=0`, with no detected slip. | Candidate plateau at tested low `g`. | Sparse `g` scan and one seed/configuration family. | G4 and G5. |
| `single_slip_merge` | One side changes dominant winding and both sides end in the same basin. | `coupling-W1-W0-g0.02` had first slip A at step 80 and final A/B `W=0`. | Observed coupling outcome. | Needs denser scan and multiple seeds. | G4 and G5. |
| `synchronized_double_phase_slip_candidate` | Both sides transition within the same early window, but final state is merge rather than stable exchange. | `coupling-W1-W0-g0.05` had first slip A and B at step 20, transient B `W=1`, and final A/B `W=0`. | Candidate synchronized slip event. | Transfer/exchange interpretation remains candidate-level until replicated and distinguished from merge. | G4 and G5. |
| `synchronized_double_phase_slip` | Atlas tag for synchronized slips with supporting minAmp and winding changes in a short window. | Related to the `synchronized_double_phase_slip_candidate` artifact classification. | Candidate atlas interpretation only. | Full 3D vortex-core tracking is not present. | G4 and G6. |
| `transfer_then_merge` | Atlas tag for exchange-like or transfer-like transition followed by common-basin settling. | Relevant prose mapping for the `g=0.05` transient swap followed by final merge. | Candidate interpretation. | Must not be used to imply stable final exchange. | G4. |

## Structured miss / revision ledger

| Original expectation | Observed result | Revised interpretation | Future test |
| --- | --- | --- | --- |
| Memory-off matched would simply fail to recover. | Memory-off matched showed `break_partial_recovery`, with final `W=1` but low dominant fraction rather than full clean recovery. | Partial return to `W=1`-like dominance is not full restoration; dominant fraction must be reported to distinguish tangled partial recovery from clean recovery. | Observer V2 L2 distances and winding validity residuals. |
| `g=0.05` might be labeled `double_slip_exchange`. | A transient swap did occur: both fields transitioned within the same early window and B temporarily carried `W=1`. However, the exchange was not permanent; by the final state, both A and B had relaxed/merged to `W=0`. | The label `double_slip_exchange` could imply a stable final exchange, so the artifact was revised to `synchronized_double_phase_slip_candidate`. This records the measured synchronized slip event while keeping transfer/exchange interpretation candidate-level until replicated across follow-up gates. | Coupling regime map with denser `g` scan, multiple seeds, explicit time-series transfer windows, and final-state distinction between transient swap, stable exchange, and merge. |
| Surrogate `mw=0.04` behavior was at risk of being mixed into `exp023-real` interpretation. | The finalized audit uses `exp023-real` lineage as canonical. | Surrogate memory anchoring behavior must be treated as a separate future comparison, not mixed into the canonical audit. | Memory anchoring comparison across `MEMORY_WEIGHT` and `HISTORY_ALPHA` lineages. |

## Hypothesis provenance ledger

This section records conceptual provenance, not technical artifact provenance. It documents the path from intuition to falsifiable prediction to measurement.

| Hypothesis | Intuition source | Translation into falsifiable prediction | Current evidence | Status | Next gate |
| --- | --- | --- | --- | --- | --- |
| Torus circulation hypothesis | 2026-06 Ueki / Yoshiro conceptual intuition. Circulation around a torus-like relation may preserve a coherent phase relationship. | Some winding-like states persist over finite horizons under controlled initialization. | `W=0`/`W=1`/`W=2` baseline persistence in the v2.1.2 audit under `exp023-real` lineage. | finite-horizon candidate, not exact topology proof. | G2 and G6. |
| Octave / winding-level ladder hypothesis | 2026-06 Ueki / Yoshiro conceptual intuition. Winding number behaves like a discrete ladder, analogous to octave-like levels. | `W=0`/`W=1`/`W=2` can be initialized and measured as distinct global line-winding states, with different stationary amplitudes. | baseline `W=1` and `W=2` lineage sanity checks and persistence measurements. | useful structural metaphor and measurable discrete winding family; not a complete musical/physical equivalence. | G2 and G6. |
| Golden ratio / anti-locking ruler hypothesis | 2026-06 Ueki / Yoshiro conceptual intuition. Golden-ratio-like detuning may act as an anti-locking reference or ruler for resonance avoidance. | Detuning scans may show distinguishable locking / anti-locking behavior near selected irrational references. | not established in the finalized winding audit. | future hypothesis only. Golden ratio should be a post-hoc reference point or preregistered comparison in a dedicated rotation-number curve PR, not smuggled into current audit claims. | G9. |
| Memory / afterimage hypothesis | 2026-06 Ueki / Yoshiro conceptual intuition. Memory acts like an afterimage or basin-biasing trace that can restore, redirect, or be overwritten by the field. | Changing memory state while keeping field initialization comparable changes recovery, rewrites, or final basin selection. | ledger matrix, L1b clean `W=1`, L2 clean `W=0`, L3 clean `W=2`, `field_rewrites_memory`, memory-off controls. | observed finite-horizon memory-mediated behavior, not an infallible ledger. | G1, G3, and G5. |
| Distinct beings / interaction hypothesis | 2026-06 Ueki / Yoshiro conceptual intuition. Structurally distinct maintained patterns may interact through coupling, detuning, and memory. | Different layouts or initial winding/memory structures show distinguishable interaction regimes under controlled coupling. | not yet implemented as beings. Current coupling audit only tests one-sided winding asymmetry under bidirectional coupling. | future phenomenon-facing gate. | G8 and G9. |

## `MEMORY_INIT_MODE` policy

Future audits must distinguish:

- runtime default initializer behavior;
- manual analytic winding initialization;
- memory buffer initialization;
- initializer comparison experiments.

If an audit overwrites field or memory buffers after runtime creation, the run record must say so. `MEMORY_INIT_MODE` defaults must not be treated as the source of the recorded winding/memory initial conditions unless the audit explicitly tests that initializer path.

Runtime initializer context and audit initialization mode are separate provenance fields.

## Superseded gate definitions

The v2.2 gate definitions in this roadmap supersede earlier informal gate definitions, including the old Codex Task 4 criteria and the candidate-notes 64³ criteria. Those older gates remain historical notes, but should not be used as current merge or claim-upgrade criteria.

Superseding old gates changes future merge and claim-upgrade criteria only. It does not rewrite or reclassify historical artifacts.

Future PRs should reference this roadmap as the current source of gate definitions until a newer roadmap explicitly supersedes it.

## v2.2 gate roadmap

These gates define future work without implementing it in this PR.

### G1. Observer V2: L2 distance traces

- **Goal:** Distinguish clean recovery, partial recovery, merge, and ordinary relaxation using richer distance traces.
- **Required metrics:** field/memory L2 traces, A/B L2 traces, aligned and raw variants where applicable, dominant winding fraction, and time-aligned minAmp.
- **What would count as support:** L2 traces separate clean recovery from tangled partial recovery and improve interpretation of memory-off and ledger cases.
- **What would count as a miss/revision:** L2 traces add no discriminatory power beyond existing winding/mode metrics.
- **Artifact naming rule:** `experiments/v2.2-observer-v2-calibration-results.json` and `experiments/v2.2-observer-v2-calibration-summary.json`.
- **Status:** implemented by v2.2 Observer V2 calibration PR.
- **Artifacts:**
  - `experiments/v2.2-observer-v2-calibration-results.json`
  - `experiments/v2.2-observer-v2-calibration-summary.json`

### G2. Winding validity residuals / low-amplitude line confidence

- **Goal:** Prevent low-amplitude phase-slip windows from being overinterpreted as reliable integer winding.
- **Required metrics:** line minAmp, low-amplitude line count, invalid line count, lineMaxAbsPhaseStep, nearPiStepCount / nearPiStepFraction, and validity confidence.
- **What would count as support:** Low-amplitude flags and near-π phase-step metrics identify low-confidence windows and distinguish stable winding from unreliable winding estimates.
- **What would count as a miss/revision:** Reliability metrics do not correlate with slip or classification changes.
- **Artifact naming rule:** `experiments/v2.2-winding-validity-observer-results.json` and `experiments/v2.2-winding-validity-observer-summary.json`.
- **Status:** implemented by v2.2 Observer V2 calibration PR.
- **Artifacts:**
  - `experiments/v2.2-observer-v2-calibration-results.json`
  - `experiments/v2.2-observer-v2-calibration-summary.json`

### G3. Memory anchoring comparison

- **Goal:** Separate `exp023-real` memory behavior from surrogate or altered `MEMORY_WEIGHT` / `HISTORY_ALPHA` anchoring behavior.
- **Required metrics:** `MEMORY_WEIGHT`, `HISTORY_ALPHA`, `effectiveMemoryWeight`, field/memory winding, mode powers, field-memory distances, recovery basin.
- **What would count as support:** Different lineages show reproducible differences in memory anchoring or basin selection.
- **What would count as a miss/revision:** No robust lineage distinction or effects are explained by initialization artifacts.
- **Artifact naming rule:** `experiments/v2.2-memory-anchoring-comparison-results.json` and `experiments/v2.2-memory-anchoring-comparison-summary.json`.

### G4. Coupling regime map with denser `g` scan

- **Goal:** Resolve plateau, single-slip merge, synchronized slip, transient exchange, stable exchange, and final merge regimes.
- **Required metrics:** dense `COUPLING_G` scan, multiple seeds, `W` time series, minAmp, event windows, final-state classification, aligned distance.
- **What would count as support:** Reproducible regime boundaries or transition bands appear across seeds.
- **What would count as a miss/revision:** No stable boundary structure beyond noise or sampling artifacts.
- **Artifact naming rule:** `experiments/v2.2-coupling-regime-map-results.json` and `experiments/v2.2-coupling-regime-map-summary.json`.

### G5. `MEMORY_WEIGHT=0` coupling control

- **Goal:** Determine which coupling outcomes require memory blending / anchoring versus direct coupling dynamics.
- **Required metrics:** `effectiveMemoryWeight=0`, coupling parameters, field/memory winding, minAmp, mode powers, final classifications.
- **What would count as support:** Removing memory weight changes restoration, transfer, or slip outcomes in a reproducible way.
- **What would count as a miss/revision:** Outcomes are unchanged, implying the tested effect is not memory-weight dependent under that condition.
- **Artifact naming rule:** `experiments/v2.2-memory-weight-zero-coupling-control-results.json` and `experiments/v2.2-memory-weight-zero-coupling-control-summary.json`.

### G6. Full 3D vortex-core/topology observer

Topological Ledger smoke adds an XY plaquette integer ledger per z-slice as a G6-adjacent observer and G8 preparation step. It is intentionally narrower than full 3D vortex-core topology.

- **Goal:** Check whether x-line winding observations correspond to fuller 3D topology/vortex-core structure.
- **Required metrics:** 3D vortex-core or plaquette/circulation observer if feasible, comparison to x-line winding, low-amplitude core locations.
- **What would count as support:** 3D observer supports the x-line winding interpretation or reveals consistent topological structures.
- **What would count as a miss/revision:** x-line winding is shown to be insufficient or misleading for some regimes.
- **Artifact naming rule:** `experiments/v2.2-3d-topology-observer-results.json` and `experiments/v2.2-3d-topology-observer-summary.json`.

### G7. Runtime-limited CI smoke

- **Goal:** Provide fast regression detection without producing official historical artifacts.
- **Required metrics:** minimal runtime smoke metrics only, enough to catch broken observers or validators.
- **What would count as support:** CI smoke catches obvious regressions while not overwriting official artifacts.
- **What would count as a miss/revision:** Smoke is flaky, too slow, or mistaken for official evidence.
- **Artifact naming rule:** No official experiment artifact. CI logs may be ephemeral. If committed documentation is needed, it must not be placed in historical artifact paths.

### G8. Structurally Distinct Beings Interaction Smoke

- **Goal:** Return from audit hygiene to phenomenon-facing experiments.
- **Required ingredients:** distinct layouts, detuning, coupling, memory conditions, and at least one one-sided-`W` or asymmetric initial condition.
- **What would count as support:** Different structures produce distinguishable interaction outcomes under controlled settings.
- **What would count as a miss/revision:** Outcomes collapse to ordinary transient relaxation or cannot be distinguished from initialization artifacts.
- **Artifact naming rule:** `experiments/v2.2-structurally-distinct-beings-interaction-smoke-results.json` and `experiments/v2.2-structurally-distinct-beings-interaction-smoke-summary.json`.

G8 has now been run as a lightweight finite-horizon operational smoke after the design-only pre-registration in `docs/g8-structurally-distinct-interaction-preregistration.md`. The generated artifacts use the roadmap names and record Family T transient meeting diagnostics, Family P finite-horizon maintenance-candidate diagnostics, randomized layout provenance, matched controls, Observer V2, Topological Ledger, and Family P energy-balance context without treating ledger equality as a universal success gate. PR #43 protects the generated v2.2 G8 smoke artifacts as finalized historical artifacts. Follow-up G8 work must write new artifact names. Disclosed supersession PRs are the only sanctioned exception. The protected G8 artifacts remain finite-horizon operational smoke artifacts. They do not establish relation, maintenance, persistence, biological life, consciousness, agency, subjectivity, s-o-u-l, or permanent survival.

### G9. Rotation-Number Curve

- **Goal:** Redesign dense detuning analysis around rotation-number / locking behavior.
- **Required policy:** Golden ratio is a reference point or preregistered comparison, not a claim by itself.
- **What would count as support:** A reproducible curve shows interpretable locking / anti-locking / transition regimes.
- **What would count as a miss/revision:** No robust structure beyond noise or sampling artifacts.
- **Artifact naming rule:** `experiments/v2.2-rotation-number-curve-results.json` and `experiments/v2.2-rotation-number-curve-summary.json`.

## Artifact naming policy

Once an audit JSON is added to `HISTORICAL_JSON`, follow-up work must not modify that file. New evidence should use a new artifact name.

The v2.2 Topological Ledger smoke artifacts are finalized historical artifacts. Follow-up ledger or G8 work must use new artifact names. Disclosed supersession PRs are the only sanctioned exception.

Concrete future artifact examples:

- `experiments/v2.2-observer-v2-calibration-results.json`
- `experiments/v2.2-observer-v2-calibration-summary.json`
- `experiments/v2.2-coupling-regime-map-results.json`
- `experiments/v2.2-coupling-regime-map-summary.json`
- `experiments/v2.2-structurally-distinct-beings-interaction-smoke-results.json`
- `experiments/v2.2-structurally-distinct-beings-interaction-smoke-summary.json`

Do not use broken placeholder names such as:

- `experiments/v2.2--results.json`
- `experiments/v2.2--summary.json`

## Recommended next PR sequence

- PR A: Regime Roadmap & Hypothesis Provenance ← this PR
- PR B: Observer V2 metrics only
- PR C: Structurally Distinct Beings Interaction Smoke
- PR D: Rotation-Number Curve
- PR E: Memory anchoring comparison
- PR F: Coupling regime map
- PR G: v2.2 gate validator / CI smoke

Observer V2 may come first because L2 distances and line reliability confidence will improve the quality of phenomenon-facing measurements. But the roadmap must keep the phenomenon-facing destination visible: structurally distinct interactions and rotation-number behavior are not optional side notes.
