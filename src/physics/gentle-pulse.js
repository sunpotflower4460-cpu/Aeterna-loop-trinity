'use strict';

const EMPTY_PULSE_METRICS = Object.freeze({
  pulseAppliedCells: 0,
  pulseTotalDelta: 0,
  pulseAverageDelta: 0,
});

function createPulseMetrics(appliedCells, totalDelta) {
  return {
    pulseAppliedCells: appliedCells,
    pulseTotalDelta: totalDelta,
    pulseAverageDelta: appliedCells > 0 ? totalDelta / appliedCells : 0,
  };
}

function applyGentlePulse(field, params = {}) {
  if (!params.PULSE_ENABLED) return { ...EMPTY_PULSE_METRICS };
  if (!field || !field.phiRe || !field.phiIm) return { ...EMPTY_PULSE_METRICS };

  const VEV = params.VEV ?? params.vev ?? 1.0;
  const strength = params.PULSE_STRENGTH ?? 0.005;
  const thresholdRatio = params.PULSE_THRESHOLD_RATIO ?? 0.95;
  const minAmp = params.PULSE_MIN_AMP ?? 0.01;
  let appliedCells = 0;
  let totalDelta = 0;

  for (let i = 0; i < field.phiRe.length; i += 1) {
    const re = field.phiRe[i];
    const im = field.phiIm[i];

    if (!Number.isFinite(re) || !Number.isFinite(im)) {
      field.phiRe[i] = 0;
      field.phiIm[i] = 0;
      continue;
    }

    const ampBefore = Math.hypot(re, im);
    if (ampBefore <= minAmp) continue;

    if (ampBefore < VEV * thresholdRatio) {
      const scale = VEV / Math.max(ampBefore, 1e-8);
      const newRe = (1 - strength) * re + strength * re * scale;
      const newIm = (1 - strength) * im + strength * im * scale;

      field.phiRe[i] = newRe;
      field.phiIm[i] = newIm;

      const ampAfter = Math.hypot(newRe, newIm);
      totalDelta += Math.abs(ampAfter - ampBefore);
      appliedCells += 1;
    }
  }

  return createPulseMetrics(appliedCells, totalDelta);
}

module.exports = {
  EMPTY_PULSE_METRICS,
  applyGentlePulse,
};
