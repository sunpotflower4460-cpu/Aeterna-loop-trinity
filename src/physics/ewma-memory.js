'use strict';

function ensureMemoryField(field) {
  if (!field || !field.phiRe || !field.phiIm) return field;

  const size = field.phiRe.length;
  if (!field.memoryRe || field.memoryRe.length !== size) {
    field.memoryRe = new field.phiRe.constructor(size);
  }
  if (!field.memoryIm || field.memoryIm.length !== size) {
    field.memoryIm = new field.phiIm.constructor(size);
  }

  return field;
}

function initializeMemoryField(field, mode = 'zero') {
  ensureMemoryField(field);
  if (!field || !field.memoryRe || !field.memoryIm) return field;

  if (mode === 'copy-current') {
    field.memoryRe.set(field.phiRe);
    field.memoryIm.set(field.phiIm);
  } else {
    field.memoryRe.fill(0);
    field.memoryIm.fill(0);
  }

  return field;
}

function computeMemoryWeight(baseWeight, R, mode = 'fixed') {
  switch (mode) {
    case 'inverse':
      return 0.1 + 0.4 * (1 - (R ?? 0));
    case 'direct':
      return 0.1 + 0.4 * (R ?? 0);
    case 'fixed':
    default:
      return baseWeight;
  }
}

function applyEWMAMemory(field, params = {}) {
  if (!params.MEMORY_ENABLED) return;
  if (!field || !field.phiRe || !field.phiIm) return;

  ensureMemoryField(field);

  const alpha = params.HISTORY_ALPHA ?? 0.04;
  const R = params.currentOrderParameter ?? null;
  const memWeight = computeMemoryWeight(
    params.MEMORY_WEIGHT ?? 0.12,
    R,
    params.MEMORY_WEIGHT_MODE ?? 'fixed',
  );
  const velocityEnabled = params.MEMORY_BLEND_VELOCITY ?? true;
  const velocityRatio = params.MEMORY_VELOCITY_WEIGHT_RATIO ?? 0.3;
  const dt = params.DT ?? params.dt ?? 0.03;
  const velocityMemoryWeight = memWeight * velocityRatio;

  for (let i = 0; i < field.phiRe.length; i += 1) {
    const re = field.phiRe[i];
    const im = field.phiIm[i];

    if (!Number.isFinite(re) || !Number.isFinite(im)) {
      field.phiRe[i] = 0;
      field.phiIm[i] = 0;
      continue;
    }

    const amp = Math.hypot(re, im);
    if (amp <= 0.01) continue;

    field.memoryRe[i] = (1 - alpha) * field.memoryRe[i] + alpha * re;
    field.memoryIm[i] = (1 - alpha) * field.memoryIm[i] + alpha * im;

    const memoryRe = field.memoryRe[i];
    const memoryIm = field.memoryIm[i];
    const oldRe = field.phiRe[i];
    const oldIm = field.phiIm[i];

    if (!Number.isFinite(memoryRe) || !Number.isFinite(memoryIm)) {
      field.memoryRe[i] = oldRe;
      field.memoryIm[i] = oldIm;
      continue;
    }

    field.phiRe[i] = (1 - memWeight) * oldRe + memWeight * memoryRe;
    field.phiIm[i] = (1 - memWeight) * oldIm + memWeight * memoryIm;

    if (velocityEnabled && field.velRe && field.velIm) {
      const safeDt = Math.max(dt, 1e-8);
      field.velRe[i] = (1 - velocityMemoryWeight) * field.velRe[i] +
        velocityMemoryWeight * (memoryRe - oldRe) / safeDt;
      field.velIm[i] = (1 - velocityMemoryWeight) * field.velIm[i] +
        velocityMemoryWeight * (memoryIm - oldIm) / safeDt;

      if (!Number.isFinite(field.velRe[i])) field.velRe[i] = 0;
      if (!Number.isFinite(field.velIm[i])) field.velIm[i] = 0;
    }
  }
}

module.exports = {
  applyEWMAMemory,
  computeMemoryWeight,
  ensureMemoryField,
  initializeMemoryField,
};
