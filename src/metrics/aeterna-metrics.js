'use strict';

const DEFAULT_AMP_THRESHOLD = 0.01;
const DEFAULT_LOCAL_SAMPLE_COUNT = 1024;
const DEFAULT_LOCAL_SAMPLE_INTERVAL = 30;
const DEFAULT_BREATHING_WINDOW = 20;

function defaultIndex3D(x, y, z, gridSize) {
  return x + gridSize * (y + gridSize * z);
}

function defaultIndexTo3D(index, gridSize) {
  const z = Math.floor(index / (gridSize * gridSize));
  const rem = index - z * gridSize * gridSize;
  const y = Math.floor(rem / gridSize);
  const x = rem - y * gridSize;
  return [x, y, z];
}

function hasFieldData(field) {
  return Boolean(field && field.phiRe && field.phiIm && field.phiRe.length === field.phiIm.length);
}

function computeOrderParameter(field, ampThreshold = DEFAULT_AMP_THRESHOLD) {
  if (!hasFieldData(field)) return null;

  let sumRe = 0;
  let sumIm = 0;
  let count = 0;

  for (let i = 0; i < field.phiRe.length; i += 1) {
    const re = field.phiRe[i];
    const im = field.phiIm[i];
    const amp = Math.hypot(re, im);

    if (amp > ampThreshold) {
      const theta = Math.atan2(im, re);
      sumRe += Math.cos(theta);
      sumIm += Math.sin(theta);
      count += 1;
    }
  }

  if (count === 0) return 0;

  return Math.hypot(sumRe, sumIm) / count;
}

function computeABRelativeOrder(R_A, R_B) {
  if (R_A === null || R_A === undefined || R_B === null || R_B === undefined) return null;
  return Math.abs(R_A - R_B) / Math.max(R_A + R_B, 1e-8);
}

function computeLocalOrderAt(field, centerIndex, gridSize, indexTo3D = defaultIndexTo3D, index3D = defaultIndex3D, ampThreshold = DEFAULT_AMP_THRESHOLD) {
  if (!hasFieldData(field)) return null;

  const [cx, cy, cz] = indexTo3D(centerIndex, gridSize);
  let sumRe = 0;
  let sumIm = 0;
  let count = 0;

  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = (cx + dx + gridSize) % gridSize;
        const y = (cy + dy + gridSize) % gridSize;
        const z = (cz + dz + gridSize) % gridSize;
        const i = index3D(x, y, z, gridSize);
        const re = field.phiRe[i];
        const im = field.phiIm[i];
        const amp = Math.hypot(re, im);

        if (amp > ampThreshold) {
          const theta = Math.atan2(im, re);
          sumRe += Math.cos(theta);
          sumIm += Math.sin(theta);
          count += 1;
        }
      }
    }
  }

  if (count === 0) return 0;

  return Math.hypot(sumRe, sumIm) / count;
}

function computeLocalOrderStats(field, options = {}) {
  if (!hasFieldData(field)) {
    return {
      average: null,
      max: null,
      min: null,
      sampleCount: 0,
    };
  }

  const gridSize = options.gridSize;
  if (!gridSize) {
    return {
      average: null,
      max: null,
      min: null,
      sampleCount: 0,
    };
  }

  const totalCells = field.phiRe.length;
  const targetSamples = Math.min(options.localSampleCount || DEFAULT_LOCAL_SAMPLE_COUNT, totalCells);
  const stride = Math.max(1, Math.floor(totalCells / Math.max(targetSamples, 1)));
  const indexTo3D = options.indexTo3D || defaultIndexTo3D;
  const index3D = options.index3D || defaultIndex3D;
  const ampThreshold = options.ampThreshold ?? DEFAULT_AMP_THRESHOLD;
  let sum = 0;
  let count = 0;
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;

  for (let i = 0; i < totalCells && count < targetSamples; i += stride) {
    const value = computeLocalOrderAt(field, i, gridSize, indexTo3D, index3D, ampThreshold);
    if (value === null) continue;

    sum += value;
    count += 1;
    if (value > max) max = value;
    if (value < min) min = value;
  }

  return {
    average: count === 0 ? 0 : sum / count,
    max: count === 0 ? 0 : max,
    min: count === 0 ? 0 : min,
    sampleCount: count,
  };
}

function computeAmplitudeStats(field, ampThreshold = DEFAULT_AMP_THRESHOLD) {
  if (!hasFieldData(field)) {
    return {
      mean: null,
      std: null,
      activeCellRatio: null,
    };
  }

  let sum = 0;
  let sumSq = 0;
  let activeCount = 0;
  const count = field.phiRe.length;

  for (let i = 0; i < count; i += 1) {
    const re = field.phiRe[i];
    const im = field.phiIm[i];
    const amp = Math.hypot(re, im);

    sum += amp;
    sumSq += amp * amp;

    if (amp > ampThreshold) {
      activeCount += 1;
    }
  }

  const mean = sum / Math.max(count, 1);
  const variance = sumSq / Math.max(count, 1) - mean * mean;

  return {
    mean,
    std: Math.sqrt(Math.max(variance, 0)),
    activeCellRatio: activeCount / Math.max(count, 1),
  };
}

function computeAmplitudeEnergy(field) {
  if (!hasFieldData(field)) return null;

  let energy = 0;

  for (let i = 0; i < field.phiRe.length; i += 1) {
    const re = field.phiRe[i];
    const im = field.phiIm[i];
    energy += re * re + im * im;
  }

  return energy;
}

function computeTotalEnergy(field, options = {}) {
  const amplitudeEnergy = computeAmplitudeEnergy(field);

  if (amplitudeEnergy === null) {
    return {
      amplitudeEnergy: null,
      gradientEnergy: null,
      totalEnergy: null,
    };
  }

  const gradientEnergy = typeof options.computeGradientEnergy === 'function'
    ? options.computeGradientEnergy(field, options)
    : 0;

  return {
    amplitudeEnergy,
    gradientEnergy,
    totalEnergy: amplitudeEnergy + gradientEnergy,
  };
}


function normalizePulseMetrics(metrics) {
  return {
    pulseAppliedCells: metrics?.pulseAppliedCells ?? 0,
    pulseTotalDelta: metrics?.pulseTotalDelta ?? 0,
    pulseAverageDelta: metrics?.pulseAverageDelta ?? 0,
  };
}

function computeMemoryStats(field) {
  if (!field || !field.phiRe || !field.phiIm || !field.memoryRe || !field.memoryIm) {
    return {
      memoryEnergy: 0,
      memoryFieldDifference: null,
    };
  }

  let memoryEnergy = 0;
  let diffSum = 0;
  let count = 0;

  for (let i = 0; i < field.phiRe.length; i += 1) {
    const mr = field.memoryRe[i];
    const mi = field.memoryIm[i];
    const re = field.phiRe[i];
    const im = field.phiIm[i];

    memoryEnergy += mr * mr + mi * mi;

    const dr = re - mr;
    const di = im - mi;
    diffSum += Math.hypot(dr, di);
    count += 1;
  }

  return {
    memoryEnergy,
    memoryFieldDifference: diffSum / Math.max(count, 1),
  };
}

function computeFieldDistance(fieldA, fieldB) {
  if (!hasFieldData(fieldA) || !hasFieldData(fieldB)) return null;

  const count = Math.min(fieldA.phiRe.length, fieldB.phiRe.length);
  let sum = 0;

  for (let i = 0; i < count; i += 1) {
    const dRe = fieldA.phiRe[i] - fieldB.phiRe[i];
    const dIm = fieldA.phiIm[i] - fieldB.phiIm[i];
    sum += Math.hypot(dRe, dIm);
  }

  return sum / Math.max(count, 1);
}

function computeMemoryDistance(fieldA, fieldB) {
  if (!fieldA || !fieldB || !fieldA.memoryRe || !fieldA.memoryIm || !fieldB.memoryRe || !fieldB.memoryIm) return null;

  const count = Math.min(fieldA.memoryRe.length, fieldB.memoryRe.length);
  let sum = 0;

  for (let i = 0; i < count; i += 1) {
    const dRe = fieldA.memoryRe[i] - fieldB.memoryRe[i];
    const dIm = fieldA.memoryIm[i] - fieldB.memoryIm[i];
    sum += Math.hypot(dRe, dIm);
  }

  return sum / Math.max(count, 1);
}

function normalizeMemoryCouplingMetrics(metrics) {
  const appliedCells = metrics?.memoryCouplingAppliedCells ?? 0;
  const deltaA = metrics?.memoryCouplingDeltaA ?? 0;
  const deltaB = metrics?.memoryCouplingDeltaB ?? 0;

  return {
    memoryCouplingApplied: metrics?.memoryCouplingApplied ?? false,
    memoryCouplingAppliedCells: appliedCells,
    memoryCouplingDeltaA: deltaA,
    memoryCouplingDeltaB: deltaB,
    memoryCouplingAverageDeltaA: metrics?.memoryCouplingAverageDeltaA ?? (appliedCells > 0 ? deltaA / appliedCells : 0),
    memoryCouplingAverageDeltaB: metrics?.memoryCouplingAverageDeltaB ?? (appliedCells > 0 ? deltaB / appliedCells : 0),
    effectiveMemoryCoupling: metrics?.effectiveMemoryCoupling ?? 0,
  };
}

function computeEnergyDeltaFromPreviousSample(totalEnergyCombined, previousMetrics) {
  if (!previousMetrics || previousMetrics.totalEnergyCombined === null || previousMetrics.totalEnergyCombined === undefined) return null;
  if (totalEnergyCombined === null || totalEnergyCombined === undefined) return null;
  return totalEnergyCombined - previousMetrics.totalEnergyCombined;
}

function computeAmplitudeBreathingScore(amplitudeMean, history = [], windowSize = DEFAULT_BREATHING_WINDOW) {
  if (amplitudeMean === null || amplitudeMean === undefined) return null;

  const values = history.slice(-Math.max(windowSize - 1, 0));
  values.push(amplitudeMean);

  if (values.length < 2) return 0;

  return Math.max(...values) - Math.min(...values);
}

class CountBasedVortexLifetimeTracker {
  constructor() {
    this.activeStartStep = null;
    this.completedLifetimes = [];
    this.lastNonZeroStep = null;
    this.currentCount = 0;
  }

  update(currentVorticesOrCount, stepCount) {
    const count = Array.isArray(currentVorticesOrCount)
      ? currentVorticesOrCount.length
      : Number(currentVorticesOrCount || 0);

    if (count > 0) {
      if (this.activeStartStep === null) this.activeStartStep = stepCount;
      this.lastNonZeroStep = stepCount;
    } else if (this.activeStartStep !== null) {
      this.completedLifetimes.push(stepCount - this.activeStartStep);
      this.activeStartStep = null;
    }

    this.currentCount = count;
  }

  getSummary(stepCount = this.lastNonZeroStep) {
    const recent = this.completedLifetimes.slice(-20);
    const vortexLifetimeAverage = recent.length > 0
      ? recent.reduce((sum, value) => sum + value, 0) / recent.length
      : 0;
    const activeDuration = this.activeStartStep === null || stepCount === null || stepCount === undefined
      ? 0
      : stepCount - this.activeStartStep;

    return {
      vortexLifetimeAverage,
      vortexLifetimeMax: this.completedLifetimes.length > 0 ? Math.max(...this.completedLifetimes) : activeDuration,
      vortexLifetimeRecent: recent,
      completedCount: this.completedLifetimes.length,
      activeCount: this.currentCount,
      stepWhenVortexCountReachedZero: this.completedLifetimes.length > 0 ? this.lastNonZeroStep : null,
      vortexNonZeroDuration: activeDuration,
      vortexSurvivalRatio: this.currentCount > 0 ? 1 : 0,
      trackingMode: 'count-based',
    };
  }
}

function normalizeVortexCount(vortices) {
  if (Array.isArray(vortices)) return vortices.length;
  if (vortices === null || vortices === undefined) return null;
  return Number(vortices);
}

function combineMetricValues(values, reducer) {
  const finiteValues = values.filter((value) => value !== null && value !== undefined);
  if (finiteValues.length === 0) return null;
  return reducer(finiteValues);
}

function collectAeternaMetrics({
  fieldA,
  fieldB,
  vortices,
  vortexCount,
  stepCount,
  gridSize,
  indexTo3D,
  index3D,
  vortexTracker,
  previousMetrics,
  amplitudeMeanHistory = [],
  localSampleCount = DEFAULT_LOCAL_SAMPLE_COUNT,
  ampThreshold = DEFAULT_AMP_THRESHOLD,
  computeGradientEnergy,
  pulseMetricsA,
  pulseMetricsB,
  lastPulseStep = null,
  phaseRotationMetrics,
  couplingMetrics,
  couplingParams,
} = {}) {
  const R_A_global = computeOrderParameter(fieldA, ampThreshold);
  const R_B_global = computeOrderParameter(fieldB, ampThreshold);
  const R_AB_relative = computeABRelativeOrder(R_A_global, R_B_global);
  const localOptions = { gridSize, indexTo3D, index3D, localSampleCount, ampThreshold };
  const localA = computeLocalOrderStats(fieldA, localOptions);
  const localB = computeLocalOrderStats(fieldB, localOptions);
  const ampA = computeAmplitudeStats(fieldA, ampThreshold);
  const ampB = computeAmplitudeStats(fieldB, ampThreshold);
  const energyA = computeTotalEnergy(fieldA, { computeGradientEnergy });
  const energyB = computeTotalEnergy(fieldB, { computeGradientEnergy });
  const memoryA = computeMemoryStats(fieldA);
  const memoryB = computeMemoryStats(fieldB);
  const pulseA = normalizePulseMetrics(pulseMetricsA);
  const pulseB = normalizePulseMetrics(pulseMetricsB);
  const phaseMetrics = phaseRotationMetrics || {};
  const memoryCoupling = normalizeMemoryCouplingMetrics(couplingMetrics);
  const fieldABDistance = computeFieldDistance(fieldA, fieldB);
  const memoryABDistance = computeMemoryDistance(fieldA, fieldB);
  const normalizedVortexCount = vortexCount ?? normalizeVortexCount(vortices);
  let vortexLifetime = null;

  if (vortexTracker && normalizedVortexCount !== null) {
    vortexTracker.update(normalizedVortexCount, stepCount);
    vortexLifetime = vortexTracker.getSummary(stepCount);
  }

  const totalEnergyCombined = combineMetricValues(
    [energyA.totalEnergy, energyB.totalEnergy],
    (values) => values.reduce((sum, value) => sum + value, 0),
  );
  const combinedAmplitudeMean = ampB.mean === null ? ampA.mean : (ampA.mean + ampB.mean) / 2;

  return {
    stepCount,
    R_A_global,
    R_B_global,
    R_AB_relative,
    R_A_local_average: localA.average,
    R_B_local_average: localB.average,
    localOrderMax: combineMetricValues([localA.max, localB.max], (values) => Math.max(...values)),
    localOrderMin: combineMetricValues([localA.min, localB.min], (values) => Math.min(...values)),
    localOrderSampleCountA: localA.sampleCount,
    localOrderSampleCountB: localB.sampleCount,
    amplitudeMeanA: ampA.mean,
    amplitudeMeanB: ampB.mean,
    amplitudeStdA: ampA.std,
    amplitudeStdB: ampB.std,
    activeCellRatioA: ampA.activeCellRatio,
    activeCellRatioB: ampB.activeCellRatio,
    totalEnergyA: energyA.totalEnergy,
    totalEnergyB: energyB.totalEnergy,
    totalEnergyCombined,
    fieldABDistance,
    memoryABDistance,
    memoryEnergyA: memoryA.memoryEnergy,
    memoryEnergyB: memoryB.memoryEnergy,
    memoryFieldDifferenceA: memoryA.memoryFieldDifference,
    memoryFieldDifferenceB: memoryB.memoryFieldDifference,
    pulseAppliedCellsA: pulseA.pulseAppliedCells,
    pulseAppliedCellsB: pulseB.pulseAppliedCells,
    pulseTotalDeltaA: pulseA.pulseTotalDelta,
    pulseTotalDeltaB: pulseB.pulseTotalDelta,
    pulseAverageDeltaA: pulseA.pulseAverageDelta,
    pulseAverageDeltaB: pulseB.pulseAverageDelta,
    lastPulseStep,
    COUPLING_TYPE: couplingParams?.COUPLING_TYPE ?? null,
    COUPLING_G: couplingParams?.COUPLING_G ?? null,
    MEMORY_COUPLING_ENABLED: couplingParams?.MEMORY_COUPLING_ENABLED ?? false,
    MEMORY_COUPLING_WEIGHT: couplingParams?.MEMORY_COUPLING_WEIGHT ?? null,
    effectiveMemoryCoupling: memoryCoupling.effectiveMemoryCoupling,
    memoryCouplingApplied: memoryCoupling.memoryCouplingApplied,
    memoryCouplingAppliedCells: memoryCoupling.memoryCouplingAppliedCells,
    memoryCouplingDeltaA: memoryCoupling.memoryCouplingDeltaA,
    memoryCouplingDeltaB: memoryCoupling.memoryCouplingDeltaB,
    memoryCouplingAverageDeltaA: memoryCoupling.memoryCouplingAverageDeltaA,
    memoryCouplingAverageDeltaB: memoryCoupling.memoryCouplingAverageDeltaB,
    PHASE_ROTATION_ENABLED: phaseMetrics.PHASE_ROTATION_ENABLED ?? false,
    OMEGA_A: phaseMetrics.OMEGA_A ?? null,
    OMEGA_B: phaseMetrics.OMEGA_B ?? null,
    PHASE_ROTATION_TARGET: phaseMetrics.PHASE_ROTATION_TARGET ?? null,
    phaseRotationApplied: phaseMetrics.phaseRotationApplied ?? false,
    omegaRatio: phaseMetrics.omegaRatio ?? null,
    phaseRotationModeLabel: phaseMetrics.phaseRotationModeLabel ?? null,
    PHASE_ROTATION_RENORMALIZE: phaseMetrics.PHASE_ROTATION_RENORMALIZE ?? false,
    renormalizationAppliedCountA: phaseMetrics.renormalizationAppliedCountA ?? 0,
    renormalizationAppliedCountB: phaseMetrics.renormalizationAppliedCountB ?? 0,
    renormalizationAppliedCount: phaseMetrics.renormalizationAppliedCount ?? 0,
    energyDeltaFromPreviousSample: computeEnergyDeltaFromPreviousSample(totalEnergyCombined, previousMetrics),
    amplitudeBreathingScore: computeAmplitudeBreathingScore(combinedAmplitudeMean, amplitudeMeanHistory),
    vortexCount: normalizedVortexCount,
    vortexLifetimeAverage: vortexLifetime?.vortexLifetimeAverage ?? null,
    vortexLifetimeMax: vortexLifetime?.vortexLifetimeMax ?? null,
    vortexLifetimeRecent: vortexLifetime?.vortexLifetimeRecent ?? null,
    vortexLifetimeTrackingMode: vortexLifetime?.trackingMode ?? null,
  };
}

module.exports = {
  DEFAULT_AMP_THRESHOLD,
  DEFAULT_LOCAL_SAMPLE_COUNT,
  DEFAULT_LOCAL_SAMPLE_INTERVAL,
  CountBasedVortexLifetimeTracker,
  collectAeternaMetrics,
  computeABRelativeOrder,
  computeAmplitudeBreathingScore,
  computeAmplitudeEnergy,
  computeAmplitudeStats,
  computeEnergyDeltaFromPreviousSample,
  computeFieldDistance,
  computeLocalOrderAt,
  computeLocalOrderStats,
  computeMemoryDistance,
  computeMemoryStats,
  normalizeMemoryCouplingMetrics,
  normalizePulseMetrics,
  computeOrderParameter,
  computeTotalEnergy,
  defaultIndex3D,
  defaultIndexTo3D,
};
