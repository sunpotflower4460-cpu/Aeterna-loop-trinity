'use strict';

const DEFAULT_THRESHOLDS = Object.freeze({
  structuralDistinctnessThreshold: 0.02,
  structuralCollapseThreshold: 0.005,
  lockThetaStdMax: 0.02,
  driftMinTotalRadians: Math.PI,
});

function hasComplexArrays(re, im) {
  return Boolean(re && im && re.length === im.length);
}

function computeComplexABMetrics(aRe, aIm, bRe, bIm) {
  if (!hasComplexArrays(aRe, aIm) || !hasComplexArrays(bRe, bIm)) return null;

  const count = Math.min(aRe.length, bRe.length);
  if (count === 0) return null;

  let innerRe = 0;
  let innerIm = 0;
  let normA = 0;
  let normB = 0;
  let rawSum = 0;
  let rawSumSq = 0;

  for (let i = 0; i < count; i += 1) {
    const ar = aRe[i];
    const ai = aIm[i];
    const br = bRe[i];
    const bi = bIm[i];

    if (!Number.isFinite(ar) || !Number.isFinite(ai) || !Number.isFinite(br) || !Number.isFinite(bi)) continue;

    innerRe += ar * br + ai * bi;
    innerIm += ai * br - ar * bi;
    normA += ar * ar + ai * ai;
    normB += br * br + bi * bi;

    const dRe = ar - br;
    const dIm = ai - bi;
    const d = Math.hypot(dRe, dIm);
    rawSum += d;
    rawSumSq += d * d;
  }

  const innerAbs = Math.hypot(innerRe, innerIm);
  const thetaStar = Math.atan2(innerIm, innerRe);
  const cosTheta = Math.cos(thetaStar);
  const sinTheta = Math.sin(thetaStar);
  let alignedSum = 0;

  for (let i = 0; i < count; i += 1) {
    const ar = aRe[i];
    const ai = aIm[i];
    const br = bRe[i];
    const bi = bIm[i];

    if (!Number.isFinite(ar) || !Number.isFinite(ai) || !Number.isFinite(br) || !Number.isFinite(bi)) continue;

    const alignedBRe = br * cosTheta - bi * sinTheta;
    const alignedBIm = br * sinTheta + bi * cosTheta;
    alignedSum += Math.hypot(ar - alignedBRe, ai - alignedBIm);
  }

  const denominator = Math.sqrt(normA * normB);

  return {
    thetaStar,
    gaugeOverlap: denominator > 0 ? innerAbs / denominator : null,
    rawFieldABDistance: rawSum / count,
    rawFieldABDistanceL2: Math.sqrt(rawSumSq / count),
    alignedFieldABDistance: alignedSum / count,
    D_inv: Math.sqrt(Math.max(0, (normA + normB - 2 * innerAbs) / count)),
  };
}

function computeGaugeInvariantABMetrics(fieldA, fieldB) {
  if (!fieldA || !fieldB) return null;
  return computeComplexABMetrics(fieldA.phiRe, fieldA.phiIm, fieldB.phiRe, fieldB.phiIm);
}

function computeGaugeInvariantMemoryMetrics(fieldA, fieldB) {
  if (!fieldA || !fieldB) return null;
  const metrics = computeComplexABMetrics(fieldA.memoryRe, fieldA.memoryIm, fieldB.memoryRe, fieldB.memoryIm);
  if (!metrics) return null;

  return {
    thetaStarMemory: metrics.thetaStar,
    gaugeOverlapMemory: metrics.gaugeOverlap,
    rawMemoryABDistance: metrics.rawFieldABDistance,
    rawMemoryABDistanceL2: metrics.rawFieldABDistanceL2,
    alignedMemoryABDistance: metrics.alignedFieldABDistance,
    D_inv_memory: metrics.D_inv,
  };
}

function unwrapPhaseSeries(thetaSeries = []) {
  if (!Array.isArray(thetaSeries) || thetaSeries.length === 0) return [];

  const unwrapped = [];
  let previousRaw = null;
  let offset = 0;

  for (const theta of thetaSeries) {
    if (!Number.isFinite(theta)) {
      unwrapped.push(theta);
      continue;
    }

    if (previousRaw === null) {
      unwrapped.push(theta);
      previousRaw = theta;
      continue;
    }

    let delta = theta - previousRaw;
    while (delta <= -Math.PI) {
      offset += Math.PI * 2;
      delta += Math.PI * 2;
    }
    while (delta > Math.PI) {
      offset -= Math.PI * 2;
      delta -= Math.PI * 2;
    }

    unwrapped.push(theta + offset);
    previousRaw = theta;
  }

  return unwrapped;
}

function std(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return null;
  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  const variance = finiteValues.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / finiteValues.length;
  return Math.sqrt(Math.max(variance, 0));
}

function totalTravel(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length < 2) return 0;
  let travel = 0;
  for (let i = 1; i < finiteValues.length; i += 1) {
    travel += Math.abs(finiteValues[i] - finiteValues[i - 1]);
  }
  return travel;
}

function classifyPhaseStructureRegime(input = {}, thresholdOverrides = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...thresholdOverrides };
  const alignedSeries = input.alignedFieldABDistanceSeries || input.alignedSeries || [];
  const thetaSeries = input.unwrappedThetaStarSeries || input.thetaStarSeries || [];
  const unwrappedTheta = input.unwrappedThetaStarSeries || unwrapPhaseSeries(thetaSeries);
  const alignedStart = input.alignedFieldABDistance_start ?? input.alignedStart ?? alignedSeries[0];
  const alignedEnd = input.alignedFieldABDistance_end ?? input.alignedEnd ?? alignedSeries[alignedSeries.length - 1];
  const endWindowSize = Math.min(10, unwrappedTheta.length);
  const endWindow = endWindowSize > 0 ? unwrappedTheta.slice(-endWindowSize) : [];
  const endWindowStd = input.thetaEndWindowStd ?? std(endWindow);
  const thetaTotalTravel = input.thetaTotalTravel ?? totalTravel(unwrappedTheta);

  if (Number.isFinite(alignedStart) && alignedStart < thresholds.structuralDistinctnessThreshold) {
    return 'near-identical-from-start';
  }

  if (
    Number.isFinite(alignedStart) &&
    Number.isFinite(alignedEnd) &&
    alignedStart >= thresholds.structuralDistinctnessThreshold &&
    alignedEnd < thresholds.structuralCollapseThreshold
  ) {
    return 'structural-collapse';
  }

  if (Number.isFinite(endWindowStd) && endWindowStd <= thresholds.lockThetaStdMax) {
    return 'phase-locking';
  }

  if (Number.isFinite(thetaTotalTravel) && thetaTotalTravel >= thresholds.driftMinTotalRadians) {
    return 'phase-drift';
  }

  return 'indeterminate';
}

function findPhaseLockOnsetStep(samples = [], options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options };
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const thetaSeries = samples.map((sample) => sample.unwrappedThetaStar ?? sample.thetaStar);
  const unwrapped = samples.some((sample) => Number.isFinite(sample.unwrappedThetaStar))
    ? thetaSeries
    : unwrapPhaseSeries(thetaSeries);
  const windowSize = Math.min(options.windowSize || 10, samples.length);
  const lockedAt = samples.map((_sample, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const windowStd = std(unwrapped.slice(start, index + 1));
    return Number.isFinite(windowStd) && windowStd <= thresholds.lockThetaStdMax;
  });

  for (let i = 0; i < lockedAt.length; i += 1) {
    if (lockedAt[i] && lockedAt.slice(i).every(Boolean)) return samples[i].step;
  }

  return null;
}

function findStructuralCollapseOnsetStep(samples = [], options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options };
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const start = samples[0].alignedFieldABDistance;
  if (!Number.isFinite(start) || start < thresholds.structuralDistinctnessThreshold) return null;

  const hit = samples.find((sample) => sample.alignedFieldABDistance < thresholds.structuralCollapseThreshold);
  return hit ? hit.step : null;
}

function findRawDistanceCollapseOnsetStep(samples = [], legacyCollapseThreshold = DEFAULT_THRESHOLDS.structuralCollapseThreshold) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const hit = samples.find((sample) => sample.rawFieldABDistance < legacyCollapseThreshold || sample.fieldABDistance < legacyCollapseThreshold);
  return hit ? hit.step : null;
}

module.exports = {
  DEFAULT_THRESHOLDS,
  classifyPhaseStructureRegime,
  computeGaugeInvariantABMetrics,
  computeGaugeInvariantMemoryMetrics,
  findPhaseLockOnsetStep,
  findRawDistanceCollapseOnsetStep,
  findStructuralCollapseOnsetStep,
  unwrapPhaseSeries,
};
