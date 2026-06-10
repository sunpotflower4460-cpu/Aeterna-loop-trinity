'use strict';

const EMPTY_MEMORY_COUPLING_METRICS = Object.freeze({
  memoryCouplingApplied: false,
  memoryCouplingDeltaA: 0,
  memoryCouplingDeltaB: 0,
  memoryCouplingAppliedCells: 0,
  memoryCouplingAverageDeltaA: 0,
  memoryCouplingAverageDeltaB: 0,
  effectiveMemoryCoupling: 0,
});

function createMemoryCouplingMetrics(applied, totalDeltaA, totalDeltaB, appliedCells, effectiveMemoryCoupling, warning = null) {
  return {
    memoryCouplingApplied: applied,
    memoryCouplingDeltaA: totalDeltaA,
    memoryCouplingDeltaB: totalDeltaB,
    memoryCouplingAppliedCells: appliedCells,
    memoryCouplingAverageDeltaA: appliedCells > 0 ? totalDeltaA / appliedCells : 0,
    memoryCouplingAverageDeltaB: appliedCells > 0 ? totalDeltaB / appliedCells : 0,
    effectiveMemoryCoupling,
    ...(warning ? { warning } : {}),
  };
}

function hasMemoryFields(field) {
  return Boolean(field && field.memoryRe && field.memoryIm);
}

function applyMemoryCoupling(fieldA, fieldB, params = {}) {
  if (!params.MEMORY_COUPLING_ENABLED) return { ...EMPTY_MEMORY_COUPLING_METRICS };

  if (!fieldA || !fieldA.phiRe || !fieldA.phiIm || !fieldB || !fieldB.phiRe || !fieldB.phiIm) {
    return createMemoryCouplingMetrics(false, 0, 0, 0, 0, 'field data missing');
  }

  if (!hasMemoryFields(fieldA) || !hasMemoryFields(fieldB)) {
    console.warn('[AeternaLoop] Memory coupling requested, but memory fields are missing.');
    return createMemoryCouplingMetrics(false, 0, 0, 0, 0, 'memory fields missing');
  }

  const g = params.COUPLING_G ?? 0.05;
  const weight = params.MEMORY_COUPLING_WEIGHT ?? 1.0;
  const formula = params.MEMORY_COUPLING_FORMULA ?? 'difference-attractor';
  const coupling = g * weight;
  const minAmp = params.MEMORY_COUPLING_MIN_AMP ?? 0.01;
  const bidirectional = params.MEMORY_COUPLING_USE_BIDIRECTIONAL ?? true;
  const count = Math.min(fieldA.phiRe.length, fieldB.phiRe.length);
  let totalDeltaA = 0;
  let totalDeltaB = 0;
  let appliedCells = 0;

  for (let i = 0; i < count; i += 1) {
    const aRe = fieldA.phiRe[i];
    const aIm = fieldA.phiIm[i];
    const bRe = fieldB.phiRe[i];
    const bIm = fieldB.phiIm[i];

    if (!Number.isFinite(aRe) || !Number.isFinite(aIm)) {
      fieldA.phiRe[i] = 0;
      fieldA.phiIm[i] = 0;
      continue;
    }

    if (!Number.isFinite(bRe) || !Number.isFinite(bIm)) {
      fieldB.phiRe[i] = 0;
      fieldB.phiIm[i] = 0;
      continue;
    }

    const ampA = Math.hypot(aRe, aIm);
    const ampB = Math.hypot(bRe, bIm);

    if (ampA <= minAmp && ampB <= minAmp) continue;

    const targetARe = fieldB.memoryRe[i];
    const targetAIm = fieldB.memoryIm[i];

    if (!Number.isFinite(targetARe) || !Number.isFinite(targetAIm)) continue;

    let deltaARe;
    let deltaAIm;

    if (formula === 'absolute-memory') {
      deltaARe = coupling * targetARe;
      deltaAIm = coupling * targetAIm;
    } else {
      deltaARe = coupling * (targetARe - aRe);
      deltaAIm = coupling * (targetAIm - aIm);
    }

    fieldA.phiRe[i] = aRe + deltaARe;
    fieldA.phiIm[i] = aIm + deltaAIm;

    totalDeltaA += Math.hypot(deltaARe, deltaAIm);
    appliedCells += 1;

    if (bidirectional) {
      const targetBRe = fieldA.memoryRe[i];
      const targetBIm = fieldA.memoryIm[i];

      if (!Number.isFinite(targetBRe) || !Number.isFinite(targetBIm)) continue;

      let deltaBRe;
      let deltaBIm;

      if (formula === 'absolute-memory') {
        deltaBRe = coupling * targetBRe;
        deltaBIm = coupling * targetBIm;
      } else {
        deltaBRe = coupling * (targetBRe - bRe);
        deltaBIm = coupling * (targetBIm - bIm);
      }

      fieldB.phiRe[i] = bRe + deltaBRe;
      fieldB.phiIm[i] = bIm + deltaBIm;

      totalDeltaB += Math.hypot(deltaBRe, deltaBIm);
    }

  }

  const metrics = createMemoryCouplingMetrics(true, totalDeltaA, totalDeltaB, appliedCells, coupling);

  if (metrics.memoryCouplingAverageDeltaA > 0.1 || metrics.memoryCouplingAverageDeltaB > 0.1) {
    console.warn('[AeternaLoop] Memory coupling delta may be too strong.');
  }

  return metrics;
}

function applySelectedCoupling(fieldA, fieldB, params = {}) {
  if (!params.COUPLING_ENABLED) return { ...EMPTY_MEMORY_COUPLING_METRICS };

  switch (params.COUPLING_TYPE ?? 'amplitude') {
    case 'memory':
      return applyMemoryCoupling(fieldA, fieldB, params);
    case 'amplitude':
    case 'phase':
    case 'cross':
    default:
      return { ...EMPTY_MEMORY_COUPLING_METRICS };
  }
}

module.exports = {
  EMPTY_MEMORY_COUPLING_METRICS,
  applyMemoryCoupling,
  applySelectedCoupling,
  createMemoryCouplingMetrics,
};
