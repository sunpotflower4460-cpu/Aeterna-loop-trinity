# Claim Level Guide

This guide keeps AeternaLoop language tied to the evidence level actually measured by the runtime and observer.

## Claim levels

### measured

Direct numeric metric values.

Example: `thetaStar` moved from `-0.628319` to near `0`.

### observed

Phenomenon tags whose detection conditions are satisfied.

Example: `phase_locking` was detected under the defined threshold.

### interpretive

Analogy language such as “-like” or “reminiscent of”. Interpretive statements must cite measured or observed evidence.

Example: the dynamics are reminiscent of synchronization, supported by `thetaStar` convergence and a locked end-window.

### speculative

Hypotheses, intuitions, or future questions. Speculative statements must cite measured or observed evidence and must be marked as future-facing.

Example: future randomized-vortex controls may reveal whether structurally distinct fields can maintain identity while interacting.

## Required distinctions

- Always distinguish raw distance collapse, phase locking, and structural collapse.
- Existing `fieldABDistance` is a raw phase-sensitive A/B distance, not a structural identity distance.
- Structural-collapse claims require gauge-invariant structural metrics such as `alignedFieldABDistance` and `D_inv`.
- Do not infer causality from distance reduction alone.
- A decrease in `alignedFieldABDistance` is measured structural convergence, not necessarily mutual convergence.
- Mutual convergence requires a matched control comparison. Any tag containing `mutual` must include a matched `controlRunId` or comparison evidence.
- `identity collapse` alone is forbidden because it hides whether the measured event was raw distance collapse, phase locking, structural collapse, or near-identical-from-start.

## Historical output preservation

Historical JSON outputs should not be rewritten after observer improvements. Later interpretations should be added as documentation notes or explicitly named derived summaries. Preserve what was measured at the time, then document how later observer improvements changed the interpretation.

## Runtime implementation labels

Do not use CGL as the implementation label for `real-runtime-v0`. Current `real-runtime-v0` should be described as a damped nonlinear Klein-Gordon-style engine with a Mexican-hat potential and a semi-implicit Euler integrator.

CGL may be mentioned only as historical context, analogy, or a future candidate framework.

## Not allowed at the current evidence level

The following claims, and equivalent biological or ontological claims, are not allowed at the current evidence level:

- “life emerged”
- “real cell division occurred”
- “intelligence emerged”
- “consciousness emerged”
- unsupported claims of biological agency or organism status

## Safe wording pattern

Use this sequence when making interpretive or speculative claims:

1. State the measured values.
2. State the observed tag, if a detection condition is satisfied.
3. Add interpretive “-like” language only after the measured/observed basis.
4. Mark future questions as speculative.

Example:

> Measured: `thetaStar` moved from `-0.628319` toward `0`, while `alignedFieldABDistance` stayed below `0.02`. Observed: `near_identical_from_start` and phase offset relaxation. Interpretive: this is synchronization-like phase relaxation, not measured structural identity collapse. Speculative: randomized-vortex controls may test whether structurally distinct fields can lock without collapsing.
