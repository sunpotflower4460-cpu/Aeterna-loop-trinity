'use strict';

function rotateComplexField(field, omega, dt, options = {}) {
  if (!field || !field.phiRe || !field.phiIm) return;

  const cosTheta = Math.cos(omega * dt);
  const sinTheta = Math.sin(omega * dt);

  for (let i = 0; i < field.phiRe.length; i += 1) {
    const re = field.phiRe[i];
    const im = field.phiIm[i];

    field.phiRe[i] = re * cosTheta - im * sinTheta;
    field.phiIm[i] = re * sinTheta + im * cosTheta;
  }

  if (options.rotateMemory && field.memoryRe && field.memoryIm) {
    for (let i = 0; i < field.memoryRe.length; i += 1) {
      const mRe = field.memoryRe[i];
      const mIm = field.memoryIm[i];

      field.memoryRe[i] = mRe * cosTheta - mIm * sinTheta;
      field.memoryIm[i] = mRe * sinTheta + mIm * cosTheta;
    }
  }
}

function applyPhaseRotation(fieldA, fieldB, params = {}) {
  if (!params.PHASE_ROTATION_ENABLED) {
    return {
      phaseRotationApplied: false,
      omegaA: params.OMEGA_A ?? 0.01,
      omegaB: params.OMEGA_B ?? 0.011,
      rotateMemory: false,
    };
  }

  const dt = params.DT ?? params.dt ?? 0.03;
  const omegaA = params.OMEGA_A ?? 0.01;
  const omegaB = params.OMEGA_B ?? 0.011;
  const rotateMemory = (params.PHASE_ROTATION_TARGET ?? 'field-and-memory') === 'field-and-memory';

  rotateComplexField(fieldA, omegaA, dt, { rotateMemory });
  rotateComplexField(fieldB, omegaB, dt, { rotateMemory });

  return {
    phaseRotationApplied: true,
    omegaA,
    omegaB,
    rotateMemory,
  };
}

function softRenormalizeField(field, params = {}) {
  if (!field || !field.phiRe || !field.phiIm) return 0;

  const VEV = params.VEV ?? params.vev ?? 1.0;
  const maxAmpRatio = params.PHASE_ROTATION_RENORMALIZE_MAX_AMP_RATIO ?? 1.5;
  const maxAmp = VEV * maxAmpRatio;
  let appliedCount = 0;

  for (let i = 0; i < field.phiRe.length; i += 1) {
    const re = field.phiRe[i];
    const im = field.phiIm[i];
    const amp = Math.hypot(re, im);

    if (amp > maxAmp) {
      const scale = maxAmp / Math.max(amp, 1e-8);
      field.phiRe[i] *= scale;
      field.phiIm[i] *= scale;
      appliedCount += 1;
    }
  }

  return appliedCount;
}

function createPhaseRotationMetrics(params = {}, phaseRotationInfo = null, renormalizationAppliedCountA = 0, renormalizationAppliedCountB = 0) {
  const omegaA = params.OMEGA_A ?? phaseRotationInfo?.omegaA ?? 0.01;
  const omegaB = params.OMEGA_B ?? phaseRotationInfo?.omegaB ?? 0.011;
  const omegaRatio = Math.abs(omegaA) > 1e-8 ? omegaB / omegaA : null;
  const target = params.PHASE_ROTATION_TARGET ?? 'field-and-memory';

  return {
    PHASE_ROTATION_ENABLED: params.PHASE_ROTATION_ENABLED ?? false,
    OMEGA_A: omegaA,
    OMEGA_B: omegaB,
    PHASE_ROTATION_TARGET: target,
    phaseRotationApplied: phaseRotationInfo?.phaseRotationApplied ?? false,
    omegaRatio,
    phaseRotationModeLabel: `${params.PHASE_ROTATION_ENABLED ? 'enabled' : 'disabled'}:${target}`,
    PHASE_ROTATION_RENORMALIZE: params.PHASE_ROTATION_RENORMALIZE ?? false,
    renormalizationAppliedCountA,
    renormalizationAppliedCountB,
    renormalizationAppliedCount: renormalizationAppliedCountA + renormalizationAppliedCountB,
  };
}

module.exports = {
  applyPhaseRotation,
  createPhaseRotationMetrics,
  rotateComplexField,
  softRenormalizeField,
};
