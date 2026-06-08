#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  CountBasedVortexLifetimeTracker,
  collectAeternaMetrics,
} = require('../src/metrics/aeterna-metrics');
const {
  DEFAULT_COUPLING_PARAMS,
  DEFAULT_COUPLING_SCAN_PARAMS,
  DEFAULT_MEMORY_PARAMS,
  DEFAULT_PHASE_ROTATION_PARAMS,
  DEFAULT_PHEROMONE_PARAMS,
} = require('../src/params/aeterna-params');
const {
  applyEWMAMemory,
  initializeMemoryField,
} = require('../src/physics/ewma-memory');
const {
  applyPhaseRotation,
  createPhaseRotationMetrics,
} = require('../src/physics/phase-rotation');
const { applySelectedCoupling } = require('../src/physics/memory-coupling');

const CONDITIONS = [
  { conditionName: 'Condition A amplitude scan', COUPLING_TYPE: 'amplitude', MEMORY_COUPLING_ENABLED: false, PHASE_ROTATION_ENABLED: false, PHEROMONE_ENABLED: false },
];

const CONFIG = Object.freeze({
  gridSize: 24,
  maxSteps: DEFAULT_COUPLING_SCAN_PARAMS.COUPLING_SCAN_MAX_STEPS,
  seedA: 12345,
  seedB: 67890,
  gamma: 0.003,
  dt: 0.03,
  c2: 1.0,
  lambda: 1.0,
  vev: 1.0,
  noiseAmp: 0.001,
  phaseOffsetB: Math.PI / 5,
  sampleInterval: DEFAULT_COUPLING_SCAN_PARAMS.COUPLING_SCAN_SAMPLE_INTERVAL,
  metricsSampleInterval: DEFAULT_COUPLING_SCAN_PARAMS.COUPLING_SCAN_SAMPLE_INTERVAL,
});

const OUTPUT_JSON_PATH = path.join(__dirname, '..', 'experiments', 'coupling-scan-results.json');
const OUTPUT_CSV_PATH = path.join(__dirname, '..', 'experiments', 'coupling-scan-results.csv');

function createRng(seed) {
  let state = seed >>> 0;

  return function nextRandom() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function index(x, y, z, n) {
  return x + n * (y + n * z);
}

function wrap(value, n) {
  return (value + n) % n;
}

function safeNumber(value, fallback = null) {
  return Number.isFinite(value) ? value : fallback;
}

function summarizeMetric(samples, key) {
  const values = samples.map((sample) => sample[key]).filter(Number.isFinite);
  if (values.length === 0) return { start: null, end: null, mean: null, min: null, max: null };

  return {
    start: safeNumber(values[0]),
    end: safeNumber(values[values.length - 1]),
    mean: safeNumber(values.reduce((sum, value) => sum + value, 0) / values.length),
    min: safeNumber(Math.min(...values)),
    max: safeNumber(Math.max(...values)),
  };
}

function initializeField(config, params, seed, phaseOffset = 0) {
  const n = config.gridSize;
  const size = n * n * n;
  const phiRe = new Float64Array(size);
  const phiIm = new Float64Array(size);
  const velRe = new Float64Array(size);
  const velIm = new Float64Array(size);
  const memoryRe = new Float64Array(size);
  const memoryIm = new Float64Array(size);
  const rng = createRng(seed);

  const vortices = [
    { x: n * 0.28, y: n * 0.30, charge: 1 },
    { x: n * 0.72, y: n * 0.32, charge: -1 },
    { x: n * 0.32, y: n * 0.70, charge: -1 },
    { x: n * 0.70, y: n * 0.72, charge: 1 },
  ];

  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        let phase = phaseOffset;
        let coreSuppression = 0;

        for (const vortex of vortices) {
          const dx = x - vortex.x;
          const dy = y - vortex.y;
          phase += vortex.charge * Math.atan2(dy, dx);
          const radiusSquared = dx * dx + dy * dy;
          coreSuppression += Math.exp(-radiusSquared / 5.0);
        }

        const noise = (rng() * 2 - 1) * config.noiseAmp;
        const amplitude = Math.max(0.05, config.vev * (1 - 0.85 * Math.min(1, coreSuppression)) + noise);
        const i = index(x, y, z, n);
        phiRe[i] = amplitude * Math.cos(phase);
        phiIm[i] = amplitude * Math.sin(phase);
      }
    }
  }

  const field = { phiRe, phiIm, velRe, velIm, memoryRe, memoryIm };
  initializeMemoryField(field, params.MEMORY_INIT_MODE);

  return field;
}

function stepField(field, gamma, config, scratchRe, scratchIm) {
  const n = config.gridSize;
  const dt = config.dt;
  const c2 = config.c2;
  const lambda = config.lambda;
  const vevSquared = config.vev * config.vev;
  const { phiRe, phiIm, velRe, velIm } = field;

  for (let z = 0; z < n; z += 1) {
    const zp = wrap(z + 1, n);
    const zm = wrap(z - 1, n);

    for (let y = 0; y < n; y += 1) {
      const yp = wrap(y + 1, n);
      const ym = wrap(y - 1, n);

      for (let x = 0; x < n; x += 1) {
        const xp = wrap(x + 1, n);
        const xm = wrap(x - 1, n);
        const i = index(x, y, z, n);
        const re = phiRe[i];
        const im = phiIm[i];
        const lapRe = phiRe[index(xp, y, z, n)] + phiRe[index(xm, y, z, n)] +
          phiRe[index(x, yp, z, n)] + phiRe[index(x, ym, z, n)] +
          phiRe[index(x, y, zp, n)] + phiRe[index(x, y, zm, n)] - 6 * re;
        const lapIm = phiIm[index(xp, y, z, n)] + phiIm[index(xm, y, z, n)] +
          phiIm[index(x, yp, z, n)] + phiIm[index(x, ym, z, n)] +
          phiIm[index(x, y, zp, n)] + phiIm[index(x, y, zm, n)] - 6 * im;
        const ampSquared = re * re + im * im;
        const potentialForce = -lambda * (ampSquared - vevSquared);
        const accRe = c2 * lapRe + potentialForce * re - gamma * velRe[i];
        const accIm = c2 * lapIm + potentialForce * im - gamma * velIm[i];
        const nextVelRe = velRe[i] + dt * accRe;
        const nextVelIm = velIm[i] + dt * accIm;

        velRe[i] = nextVelRe;
        velIm[i] = nextVelIm;
        scratchRe[i] = re + dt * nextVelRe;
        scratchIm[i] = im + dt * nextVelIm;
      }
    }
  }

  phiRe.set(scratchRe);
  phiIm.set(scratchIm);
}

function applyAmplitudeCoupling(fieldA, fieldB, params = {}) {
  if (!params.COUPLING_ENABLED || params.COUPLING_TYPE !== 'amplitude') {
    return { memoryCouplingAppliedCells: 0, memoryCouplingDeltaA: 0, memoryCouplingDeltaB: 0, effectiveMemoryCoupling: 0 };
  }

  const g = params.COUPLING_G ?? 0.05;
  const count = Math.min(fieldA.phiRe.length, fieldB.phiRe.length);
  let totalDeltaA = 0;
  let totalDeltaB = 0;

  for (let i = 0; i < count; i += 1) {
    const aRe = fieldA.phiRe[i];
    const aIm = fieldA.phiIm[i];
    const bRe = fieldB.phiRe[i];
    const bIm = fieldB.phiIm[i];
    const deltaARe = g * (bRe - aRe);
    const deltaAIm = g * (bIm - aIm);
    const deltaBRe = g * (aRe - bRe);
    const deltaBIm = g * (aIm - bIm);

    fieldA.phiRe[i] = aRe + deltaARe;
    fieldA.phiIm[i] = aIm + deltaAIm;
    fieldB.phiRe[i] = bRe + deltaBRe;
    fieldB.phiIm[i] = bIm + deltaBIm;
    totalDeltaA += Math.hypot(deltaARe, deltaAIm);
    totalDeltaB += Math.hypot(deltaBRe, deltaBIm);
  }

  return {
    memoryCouplingApplied: true,
    memoryCouplingAppliedCells: count,
    memoryCouplingDeltaA: totalDeltaA,
    memoryCouplingDeltaB: totalDeltaB,
    memoryCouplingAverageDeltaA: count > 0 ? totalDeltaA / count : 0,
    memoryCouplingAverageDeltaB: count > 0 ? totalDeltaB / count : 0,
    effectiveMemoryCoupling: g,
  };
}

function phaseAt(field, x, y, z, n) {
  const i = index(x, y, z, n);
  return Math.atan2(field.phiIm[i], field.phiRe[i]);
}

function phaseDelta(a, b) {
  let delta = b - a;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function computeVortexCount(field, config) {
  const n = config.gridSize;
  const z = Math.floor(n / 2);
  let count = 0;

  for (let y = 0; y < n; y += 1) {
    const yp = wrap(y + 1, n);

    for (let x = 0; x < n; x += 1) {
      const xp = wrap(x + 1, n);
      const p00 = phaseAt(field, x, y, z, n);
      const p10 = phaseAt(field, xp, y, z, n);
      const p11 = phaseAt(field, xp, yp, z, n);
      const p01 = phaseAt(field, x, yp, z, n);
      const winding = phaseDelta(p00, p10) + phaseDelta(p10, p11) + phaseDelta(p11, p01) + phaseDelta(p01, p00);

      if (Math.abs(winding) > Math.PI) count += 1;
    }
  }

  return count;
}

function hasNonFiniteValues(field) {
  const arrays = [field.phiRe, field.phiIm, field.velRe, field.velIm, field.memoryRe, field.memoryIm];
  return arrays.some((array) => Array.from(array).some((value) => !Number.isFinite(value)));
}

function collectCouplingScanMetrics(fieldA, fieldB, vortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeanHistory, phaseRotationMetrics, couplingMetrics, couplingParams) {
  return collectAeternaMetrics({
    fieldA,
    fieldB,
    vortexCount,
    stepCount: step,
    gridSize: config.gridSize,
    index3D: index,
    vortexTracker,
    previousMetrics,
    amplitudeMeanHistory,
    localSampleCount: 512,
    phaseRotationMetrics,
    couplingMetrics,
    couplingParams,
  });
}

function detectCollapseOrUniformization(summary) {
  const amplitudeStdA = summary.amplitudeStdA_end ?? null;
  const amplitudeStdB = summary.amplitudeStdB_end ?? null;
  const vortexCount = summary.finalVortexCount ?? null;
  const R_A = summary.R_A_global_end ?? 0;
  const R_B = summary.R_B_global_end ?? 0;

  const uniformizationDetected =
    amplitudeStdA !== null &&
    amplitudeStdB !== null &&
    amplitudeStdA < 0.01 &&
    amplitudeStdB < 0.01 &&
    R_A > 0.95 &&
    R_B > 0.95;

  const collapseDetected =
    vortexCount === 0 &&
    amplitudeStdA !== null &&
    amplitudeStdB !== null &&
    amplitudeStdA < 0.01 &&
    amplitudeStdB < 0.01;

  return { uniformizationDetected, collapseDetected };
}

function computeStableDynamicBalanceScore(summary) {
  const R_A = summary.R_A_global_mean ?? 0;
  const R_B = summary.R_B_global_mean ?? 0;
  const R_AB = summary.R_AB_relative_mean ?? 1;
  const vortexLife = summary.vortexLifetimeAverage ?? 0;
  const ampStdA = summary.amplitudeStdA_end ?? 0;
  const ampStdB = summary.amplitudeStdB_end ?? 0;

  const orderScore = (R_A + R_B) / 2;
  const fusionScore = 1 - Math.min(1, R_AB);
  const vortexScore = Math.min(1, vortexLife / 1000);
  const nonUniformityScore = Math.min(1, (ampStdA + ampStdB) / 0.2);

  return safeNumber(
    orderScore * 0.25 +
    fusionScore * 0.25 +
    vortexScore * 0.25 +
    nonUniformityScore * 0.25,
    0,
  );
}

function detectCouplingTransition(results) {
  const candidates = [];

  for (let i = 1; i < results.length; i += 1) {
    const prev = results[i - 1];
    const curr = results[i];
    const deltaR =
      ((curr.R_A_global_mean ?? 0) + (curr.R_B_global_mean ?? 0)) / 2 -
      ((prev.R_A_global_mean ?? 0) + (prev.R_B_global_mean ?? 0)) / 2;
    const deltaRelative = (prev.R_AB_relative_mean ?? 0) - (curr.R_AB_relative_mean ?? 0);
    const vortexChange = (curr.vortexLifetimeAverage ?? 0) - (prev.vortexLifetimeAverage ?? 0);
    const fieldDistanceDrop = (prev.fieldABDistance_mean ?? prev.fieldABDistance_end ?? 0) -
      (curr.fieldABDistance_mean ?? curr.fieldABDistance_end ?? 0);
    const transitionScore = deltaR * 2 + deltaRelative * 2 + Math.max(0, vortexChange) * 0.001 + Math.max(0, fieldDistanceDrop) * 2;

    if (deltaR > 0.1 || deltaRelative > 0.1 || fieldDistanceDrop > 0.01) {
      candidates.push({
        from: prev.COUPLING_G,
        to: curr.COUPLING_G,
        deltaR: safeNumber(deltaR),
        deltaRelative: safeNumber(deltaRelative),
        fieldDistanceDrop: safeNumber(fieldDistanceDrop),
        vortexChange: safeNumber(vortexChange),
        transitionScore: safeNumber(transitionScore),
      });
    }
  }

  return candidates;
}

function recommendFineScanRange(candidate) {
  if (!candidate) return null;

  const from = candidate.from;
  const to = candidate.to;
  const width = Math.max((to - from) / 4, 0.005);
  const start = Math.max(0.001, from - width);
  const end = to + width;
  const values = [];
  const intervals = 6;

  for (let i = 0; i <= intervals; i += 1) {
    values.push(safeNumber(start + ((end - start) * i) / intervals));
  }

  return { start: safeNumber(start), end: safeNumber(end), values };
}

function withDetection(summary) {
  const detection = detectCollapseOrUniformization(summary);
  const stableDynamicBalanceScore = computeStableDynamicBalanceScore(summary);
  const transitionScore = safeNumber(
    ((summary.R_A_global_mean ?? 0) + (summary.R_B_global_mean ?? 0)) / 2 +
    (1 - Math.min(1, summary.R_AB_relative_mean ?? 1)),
    0,
  );

  return {
    ...summary,
    transitionScore,
    possibleTransitionDetected: false,
    ...detection,
    stableDynamicBalanceScore,
  };
}

function runCondition(condition, couplingG, config) {
  const params = {
    ...DEFAULT_MEMORY_PARAMS,
    ...DEFAULT_PHASE_ROTATION_PARAMS,
    ...DEFAULT_COUPLING_PARAMS,
    ...DEFAULT_PHEROMONE_PARAMS,
    MEMORY_ENABLED: true,
    MEMORY_INIT_MODE: 'copy-current',
    ...condition,
    COUPLING_G: couplingG,
    DT: config.dt,
    VEV: config.vev,
    vev: config.vev,
  };
  const fieldA = initializeField(config, params, config.seedA, 0);
  const fieldB = initializeField(config, params, config.seedB, config.phaseOffsetB);
  const scratchARe = new Float64Array(fieldA.phiRe.length);
  const scratchAIm = new Float64Array(fieldA.phiIm.length);
  const scratchBRe = new Float64Array(fieldB.phiRe.length);
  const scratchBIm = new Float64Array(fieldB.phiIm.length);
  const vortexTracker = new CountBasedVortexLifetimeTracker();
  const initialVortexCountA = computeVortexCount(fieldA, config);
  const initialVortexCountB = computeVortexCount(fieldB, config);
  const initialVortexCount = initialVortexCountA + initialVortexCountB;
  const amplitudeMeans = [];
  const metricsSamples = [];
  const warnings = [];
  let previousMetrics = null;
  let phaseRotationInfo = applyPhaseRotation(null, null, { ...params, PHASE_ROTATION_ENABLED: false });
  let phaseMetrics = createPhaseRotationMetrics(params, phaseRotationInfo, 0, 0);
  let couplingInfo = params.COUPLING_TYPE === 'amplitude'
    ? applyAmplitudeCoupling(fieldA, fieldB, { ...params, COUPLING_ENABLED: false })
    : applySelectedCoupling(null, null, { ...params, COUPLING_ENABLED: false });
  let finalVortexCount = initialVortexCount;
  let stepWhenVortexCountReachedZero = initialVortexCount === 0 ? 0 : null;
  let nonFiniteDetected = false;

  previousMetrics = collectCouplingScanMetrics(fieldA, fieldB, initialVortexCount, 0, config, vortexTracker, previousMetrics, amplitudeMeans, phaseMetrics, couplingInfo, params);
  metricsSamples.push(previousMetrics);
  amplitudeMeans.push((previousMetrics.amplitudeMeanA + previousMetrics.amplitudeMeanB) / 2);

  for (let step = 1; step <= config.maxSteps; step += 1) {
    stepField(fieldA, config.gamma, config, scratchARe, scratchAIm);
    stepField(fieldB, config.gamma, config, scratchBRe, scratchBIm);

    couplingInfo = params.COUPLING_TYPE === 'amplitude'
      ? applyAmplitudeCoupling(fieldA, fieldB, params)
      : applySelectedCoupling(fieldA, fieldB, params);

    if (params.MEMORY_ENABLED) {
      applyEWMAMemory(fieldA, params);
      applyEWMAMemory(fieldB, params);
    }

    phaseRotationInfo = params.PHASE_ROTATION_ENABLED
      ? applyPhaseRotation(fieldA, fieldB, params)
      : applyPhaseRotation(null, null, params);
    phaseMetrics = createPhaseRotationMetrics(params, phaseRotationInfo, 0, 0);

    if (step % config.sampleInterval === 0 || step === config.maxSteps) {
      const finalVortexCountA = computeVortexCount(fieldA, config);
      const finalVortexCountB = computeVortexCount(fieldB, config);
      finalVortexCount = finalVortexCountA + finalVortexCountB;

      if (stepWhenVortexCountReachedZero === null && finalVortexCount === 0) {
        stepWhenVortexCountReachedZero = step;
      }

      if (!nonFiniteDetected) {
        nonFiniteDetected = hasNonFiniteValues(fieldA) || hasNonFiniteValues(fieldB);
        if (nonFiniteDetected) warnings.push(`Non-finite value detected at step ${step}.`);
      }

      previousMetrics = collectCouplingScanMetrics(fieldA, fieldB, finalVortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeans, phaseMetrics, couplingInfo, params);
      metricsSamples.push(previousMetrics);
      amplitudeMeans.push((previousMetrics.amplitudeMeanA + previousMetrics.amplitudeMeanB) / 2);
    }
  }

  const finalMetrics = metricsSamples[metricsSamples.length - 1];
  const rA = summarizeMetric(metricsSamples, 'R_A_global');
  const rB = summarizeMetric(metricsSamples, 'R_B_global');
  const rAB = summarizeMetric(metricsSamples, 'R_AB_relative');
  const localA = summarizeMetric(metricsSamples, 'R_A_local_average');
  const localB = summarizeMetric(metricsSamples, 'R_B_local_average');
  const ampMeanA = summarizeMetric(metricsSamples, 'amplitudeMeanA');
  const ampMeanB = summarizeMetric(metricsSamples, 'amplitudeMeanB');
  const ampStdA = summarizeMetric(metricsSamples, 'amplitudeStdA');
  const ampStdB = summarizeMetric(metricsSamples, 'amplitudeStdB');
  const energy = summarizeMetric(metricsSamples, 'totalEnergyCombined');
  const fieldDistance = summarizeMetric(metricsSamples, 'fieldABDistance');
  const memoryDistance = summarizeMetric(metricsSamples, 'memoryABDistance');
  const notes = [];

  if (nonFiniteDetected) notes.push('NaN/non-finite values detected; inspect warnings before interpreting transition results.');
  if (finalMetrics.totalEnergyCombined > metricsSamples[0].totalEnergyCombined * 2) notes.push('totalEnergyCombined increased by more than 2x; possible instability.');
  if (finalMetrics.totalEnergyCombined < metricsSamples[0].totalEnergyCombined * 0.5) notes.push('totalEnergyCombined decreased by more than 50%; possible collapse/dissipation.');
  if (finalMetrics.fieldABDistance === 0) notes.push('fieldABDistance reached 0; possible over-coupling fusion/uniformization.');
  if (notes.length === 0) notes.push('Completed without sampled non-finite values or danger-sign thresholds.');

  return withDetection({
    conditionName: condition.conditionName,
    COUPLING_TYPE: params.COUPLING_TYPE,
    COUPLING_G: params.COUPLING_G,
    MEMORY_COUPLING_ENABLED: params.MEMORY_COUPLING_ENABLED,
    MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_ENABLED ? params.MEMORY_COUPLING_WEIGHT : null,
    PHASE_ROTATION_ENABLED: params.PHASE_ROTATION_ENABLED,
    PHEROMONE_ENABLED: params.PHEROMONE_ENABLED,
    maxSteps: config.maxSteps,
    sampleInterval: config.sampleInterval,
    initialVortexCount,
    finalVortexCount,
    stepWhenVortexCountReachedZero,
    vortexLifetimeAverage: safeNumber(finalMetrics.vortexLifetimeAverage),
    vortexLifetimeMax: safeNumber(finalMetrics.vortexLifetimeMax),
    R_A_global_start: rA.start,
    R_A_global_end: rA.end,
    R_A_global_mean: rA.mean,
    R_A_global_max: rA.max,
    R_B_global_start: rB.start,
    R_B_global_end: rB.end,
    R_B_global_mean: rB.mean,
    R_B_global_max: rB.max,
    R_AB_relative_start: rAB.start,
    R_AB_relative_end: rAB.end,
    R_AB_relative_mean: rAB.mean,
    R_AB_relative_min: rAB.min,
    R_A_local_average_start: localA.start,
    R_A_local_average_end: localA.end,
    R_A_local_average_mean: localA.mean,
    R_B_local_average_start: localB.start,
    R_B_local_average_end: localB.end,
    R_B_local_average_mean: localB.mean,
    amplitudeMeanA_start: ampMeanA.start,
    amplitudeMeanA_end: ampMeanA.end,
    amplitudeMeanB_start: ampMeanB.start,
    amplitudeMeanB_end: ampMeanB.end,
    amplitudeStdA_start: ampStdA.start,
    amplitudeStdA_end: ampStdA.end,
    amplitudeStdB_start: ampStdB.start,
    amplitudeStdB_end: ampStdB.end,
    totalEnergyCombined_start: energy.start,
    totalEnergyCombined_end: energy.end,
    fieldABDistance_start: fieldDistance.start,
    fieldABDistance_end: fieldDistance.end,
    fieldABDistance_mean: fieldDistance.mean,
    memoryABDistance_start: memoryDistance.start,
    memoryABDistance_end: memoryDistance.end,
    memoryABDistance_mean: memoryDistance.mean,
    warnings,
    notes: notes.join(' '),
  });
}

function markTransitionCandidates(results, candidates) {
  const candidateTargets = new Set(candidates.map((candidate) => candidate.to));
  return results.map((result) => ({
    ...result,
    possibleTransitionDetected: candidateTargets.has(result.COUPLING_G),
  }));
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (!/[",\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function writeCsv(results) {
  const columns = [
    'conditionName', 'COUPLING_TYPE', 'COUPLING_G', 'finalVortexCount', 'vortexLifetimeAverage',
    'R_A_global_mean', 'R_B_global_mean', 'R_AB_relative_mean', 'R_A_local_average_mean',
    'R_B_local_average_mean', 'amplitudeStdA_end', 'amplitudeStdB_end', 'totalEnergyCombined_end',
    'fieldABDistance_end', 'memoryABDistance_end', 'possibleTransitionDetected', 'collapseDetected',
    'uniformizationDetected', 'stableDynamicBalanceScore', 'notes',
  ];
  const lines = [columns.join(',')];

  for (const result of results) {
    lines.push(columns.map((column) => csvEscape(result[column])).join(','));
  }

  fs.writeFileSync(OUTPUT_CSV_PATH, `${lines.join('\n')}\n`);
}

function formatNumber(value) {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return String(value);
  return Number(value.toFixed(6));
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const scanValues = DEFAULT_COUPLING_SCAN_PARAMS.COUPLING_SCAN_VALUES;
  const runWarnings = [];
  let results = [];

  for (const condition of CONDITIONS) {
    for (const couplingG of scanValues) {
      results.push(runCondition(condition, couplingG, CONFIG));
    }
  }

  const transitionCandidates = DEFAULT_COUPLING_SCAN_PARAMS.COUPLING_SCAN_DETECT_TRANSITION
    ? detectCouplingTransition(results)
    : [];
  const bestTransitionCandidate = transitionCandidates.length > 0
    ? transitionCandidates.slice().sort((a, b) => b.transitionScore - a.transitionScore)[0]
    : null;
  const recommendedFineScanRange = recommendFineScanRange(bestTransitionCandidate);
  results = markTransitionCandidates(results, transitionCandidates);

  for (const result of results) {
    if (result.warnings.length > 0) runWarnings.push(...result.warnings.map((warning) => `${result.COUPLING_G}: ${warning}`));
  }

  const finishedAt = new Date().toISOString();
  const output = {
    experiment: 'Experiment 008: Step 6 Kuramoto Transition / Coupling Scan',
    runMeta: {
      generatedAt: finishedAt,
      startedAt,
      finishedAt,
      implementationNote: 'Headless A/B diagnostic surrogate. The normal app defaults keep COUPLING_SCAN_ENABLED=false; this script performs an isolated amplitude COUPLING_G scan and records transition / collapse diagnostics without enabling Step 7 extensions.',
      config: CONFIG,
    },
    scanValues,
    conditions: CONDITIONS,
    results,
    transitionCandidates,
    bestTransitionCandidate,
    recommendedFineScanRange,
    warnings: runWarnings,
  };

  fs.writeFileSync(OUTPUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  writeCsv(results);

  console.log(`Wrote ${OUTPUT_JSON_PATH}`);
  console.log(`Wrote ${OUTPUT_CSV_PATH}`);
  console.table(results.map((result) => ({
    g: result.COUPLING_G,
    finalVortex: result.finalVortexCount,
    lifetimeAvg: formatNumber(result.vortexLifetimeAverage),
    rAMean: formatNumber(result.R_A_global_mean),
    rBMean: formatNumber(result.R_B_global_mean),
    rABMean: formatNumber(result.R_AB_relative_mean),
    ampStdAEnd: formatNumber(result.amplitudeStdA_end),
    ampStdBEnd: formatNumber(result.amplitudeStdB_end),
    transition: result.possibleTransitionDetected,
    collapse: result.collapseDetected,
    uniform: result.uniformizationDetected,
    balance: formatNumber(result.stableDynamicBalanceScore),
  })));
  console.log('transitionCandidates:', transitionCandidates);
  console.log('bestTransitionCandidate:', bestTransitionCandidate);
  console.log('recommendedFineScanRange:', recommendedFineScanRange);
}

if (require.main === module) main();

module.exports = {
  computeStableDynamicBalanceScore,
  detectCollapseOrUniformization,
  detectCouplingTransition,
  recommendFineScanRange,
  safeNumber,
};
