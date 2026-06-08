# Agent Rules for AeternaLoop v2.1.1

## Core Rule

Do not implement multiple major layers in a single PR.

AeternaLoop must be developed as an observational system.
Each layer must be added only after baseline metrics are recorded.

## Development Rules

1. One PR should handle only one Step.
2. Do not combine EWMA memory, Gentle Pulse, phase rotation, memory coupling, and pheromone field in the same PR.
3. Before changing dynamics, make sure metrics exist.
4. Always preserve the ability to disable a new feature with a parameter or flag.
5. Never overwrite baseline behavior without a way to compare.
6. Record experiment results in `docs/experiment-log.md`.
7. If the result differs from the expected behavior, do not hide it.
8. Unexpected behavior should be documented as a possible clue.
9. Do not make the visualization prettier if it makes the underlying state less truthful.
10. Do not claim consciousness, life, or success unless the measured behavior supports the claim.

## Observability First

Before adding new life-like behavior, the system must be able to show:

- `vortexCount`
- `vortexLifetime`
- amplitude mean / std
- `R_global`
- `R_AB_relative`
- `R_local`
- `totalEnergy`

## Design Philosophy

The goal is not to force the system to look alive.
The goal is to prepare a field where coherent behavior may emerge and then observe it honestly.
