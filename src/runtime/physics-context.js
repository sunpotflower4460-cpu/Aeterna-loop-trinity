'use strict';

function derivePhaseRotationAppliedTo(params = {}) {
  if (!params.PHASE_ROTATION_ENABLED) return [];
  const target = params.PHASE_ROTATION_TARGET ?? 'field-and-memory';
  if (target === 'field-and-memory') return ['phi', 'memory'];
  if (target === 'field') return ['phi'];
  if (target === 'memory') return ['memory'];
  return ['phi'];
}

function deriveCouplingApplication(params = {}) {
  if (!params.COUPLING_ENABLED) return 'none';
  if ((params.COUPLING_TYPE ?? 'amplitude') !== 'memory') return 'none-currently-no-op-for-selected-type';
  if (!params.MEMORY_COUPLING_ENABLED) return 'none';
  if (params.MEMORY_COUPLING_ORDER === 'before-memory-update') return 'pre-memory-update-state-update';
  return 'post-memory-update-state-update';
}

function describePhysicsContext(params = {}, runtimeConfig = {}) {
  const phaseRotationAppliedTo = derivePhaseRotationAppliedTo(params);
  const couplingApplication = deriveCouplingApplication(params);
  const memoryCouplingApplied =
    couplingApplication === 'pre-memory-update-state-update' ||
    couplingApplication === 'post-memory-update-state-update';
  const notes = [
    'Second-order damped nonlinear Klein-Gordon-style runtime with Mexican-hat potential.',
    params.PHASE_ROTATION_ENABLED
      ? 'Phase rotation is an operational approximation; velocity is not rotated.'
      : null,
    memoryCouplingApplied
      ? 'Memory coupling applies state updates to phi fields using memory fields as the source.'
      : null,
    memoryCouplingApplied
      ? 'Current memory coupling and memory blending are post-integration state updates, not force/acceleration terms. If future implementations move coupling into the acceleration term, physicsContext must change accordingly.'
      : null,
  ].filter(Boolean);

  return {
    engineType: 'damped-nonlinear-klein-gordon',
    // vel_next = vel + dt * acc; phi_next = phi + dt * vel_next, so this is semi-implicit / symplectic Euler, not leapfrog.
    integrator: 'semi-implicit-euler',
    potentialType: 'mexican-hat',
    phaseDriveModel: params.PHASE_ROTATION_ENABLED ? 'operational-phase-drive' : 'none',
    phaseRotationAppliedTo,
    velocityRotated: false,
    couplingApplication,
    memoryBlendApplication: 'post-integration-state-update',
    adlerComparisonLevel: params.PHASE_ROTATION_ENABLED ? 'qualitative-only' : 'not-applicable',
    notes,
  };
}

module.exports = {
  deriveCouplingApplication,
  derivePhaseRotationAppliedTo,
  describePhysicsContext,
};
