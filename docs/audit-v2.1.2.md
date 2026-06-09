# AeternaLoop-Trinity v2.1.2 Audit

## Summary

- Overall status: tuning-phase fixes and documentation prepared for v2.1.2.
- Critical fixes: EWMA velocity scaling, symmetric amplitude safety helper, A/B metric naming, energy proxy labels, and pheromone diffusion/energy metrics.
- Warnings: current experiment harnesses are surrogate/headless unless explicitly marked as real 64³ loop.
- Remaining risks: memory may still copy the current field too closely, coupling may still over-fuse A/B, and pheromone traces may still saturate globally.
- Recommended next experiments: HISTORY_ALPHA scan, Memory Coupling micro scan, Pheromone localization retune, then real 64³ validation.

## Critical Fixes

| id | area | issue | fix | status |
|---|---|---|---|---|
| C1 | EWMA velocity | /DT may amplify velocity too strongly | remove /DT or add MEMORY_VELOCITY_SCALE | Fixed |
| C2 | field symmetry | fieldB may not receive amplitude safety | apply shared safety to both fields | Fixed for shared phase-renormalization safety path |
| C3 | AB metric | R_AB_relative can be misread as fusion | rename/clarify and clamp denominator | Fixed with R_AB_orderDifferenceRatio alias |
| C4 | energy labels | totalEnergy may imply strict physical energy | rename to fieldEnergyProxy and add pheromoneEnergyL2 | Fixed with backward-compatible aliases |
| C5 | pheromone diffusion | laplacian3D may be undefined | define or replace with explicit diffusion function | Fixed by explicit diffusePheromoneField |

## Metrics Clarification

### R_AB_orderDifferenceRatio

This measures the relative difference between global order parameters, not direct phase alignment or fusion.

`R_AB_relative` / `R_AB_orderDifferenceRatio` is not a direct measure of A/B phase agreement or complete fusion. It is the relative difference between A/B global order parameters. A/B fusion should be evaluated together with `fieldABDistance`, `memoryABDistance`, phase alignment, and related distance metrics.

### fieldEnergyProxy

This is a diagnostic energy proxy, not a strict conserved Hamiltonian.

`fieldEnergyProxy` is not a strict Hamiltonian; it is a simple diagnostic for numerical amplification or damping trends.

### pheromoneEnergyL2

This is closer to Sarkar-style memory energy saturation.

`pheromoneEnergyL2` is treated as a closer proxy for Sarkar-style memory energy saturation than a simple pheromone mean.

## v2.1.1 Experiment Reinterpretation

### GAMMA

GAMMA=0.005 is a current baseline candidate.

It should be read as the condition with relatively lower field-energy-proxy growth and amplitudes near VEV, not as proof of ideal dissipation.

### Pulse

Pulse did not extend vortex lifetime in the existing experiments.

This suggests vortex disappearance is probably not mainly caused by amplitude loss.

### EWMA

EWMA preserved vortices but may have frozen the field.

The memory-field difference was small enough that EWMA may have behaved like current-copying or freezing rather than long-range memory.

### Memory Coupling

Memory Coupling fused A/B strongly; micro scan is required.

Weights at or above 0.5 may already be too strong if the goal is dynamic meeting rather than identity collapse.

### Pheromone

Pheromone became too diffuse; localization retune is required.

`pheromoneActiveRatio = 1` suggests the trace became a background field rather than path-like memory.

## Remaining Risks

- Surrogate results may not transfer to real 64³ dynamics
- Memory may still be too close to current field
- A/B fusion may become identity collapse
- Pheromone may saturate globally again

## Final Recommendation

Proceed to:
1. HISTORY_ALPHA scan
2. Memory Coupling micro scan
3. Pheromone localization retune
4. real 64³ validation
