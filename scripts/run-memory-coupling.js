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
  DEFAULT_MEMORY_PARAMS,
  DEFAULT_PHASE_ROTATION_PARAMS,
} = require('../src/params/aeterna-params');
const {
  applyEWMAMemory,
  initializeMemoryField,
} = require('../src/physics/ewma-memory');
const {
  applyPhaseRotation,
  createPhaseRotationMetrics,
  softRenormalizeField,
} = require('../src/physics/phase-rotation');
const { applySelectedCoupling } = require('../src/physics/memory-coupling');

const CONDITIONS = [
  { conditionName: 'Baseline amplitude', COUPLING_TYPE: 'amplitude', MEMORY_COUPLING_ENABLED: false, PHASE_ROTATION_ENABLED: false },
  { conditionName: 'Memory 0.5', COUPLING_TYPE: 'memory', MEMORY_COUPLING_ENABLED: true, MEMORY_COUPLING_WEIGHT: 0.5, PHASE_ROTATION_ENABLED: false },
  { conditionName: 'Memory 1.0', COUPLING_TYPE: 'memory', MEMORY_COUPLING_ENABLED: true, MEMORY_COUPLING_WEIGHT: 1.0, PHASE_ROTATION_ENABLED: false },
  { conditionName: 'Memory 1.5', COUPLING_TYPE: 'memory', MEMORY_COUPLING_ENABLED: true, MEMORY_COUPLING_WEIGHT: 1.5, PHASE_ROTATION_ENABLED: false },
  { conditionName: 'Memory 2.0', COUPLING_TYPE: 'memory', MEMORY_COUPLING_ENABLED: true, MEMORY_COUPLING_WEIGHT: 2.0, PHASE_ROTATION_ENABLED: false },
];

const CONFIG = Object.freeze({
  gridSize: 24,
  maxSteps: 5000,
  seedA: 12345,
  seedB: 67890,
  gamma: 0.003,
  dt: 0.03,
  c2: 1.0,
  lambda: 1.0,
  vev: 1.0,
  noiseAmp: 0.001,
  phaseOffsetB: Math.PI / 5,
  sampleInterval: 25,
  metricsSampleInterval: 30,
});

const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'memory-coupling-results.json');

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

function computeAmplitudeStats(field) {
  const { phiRe, phiIm } = field;
  let sum = 0;
  let sumSquared = 0;

  for (let i = 0; i < phiRe.length; i += 1) {
    const amplitude = Math.hypot(phiRe[i], phiIm[i]);
    sum += amplitude;
    sumSquared += amplitude * amplitude;
  }

  const mean = sum / phiRe.length;
  const variance = Math.max(0, sumSquared / phiRe.length - mean * mean);

  return {
    mean,
    std: Math.sqrt(variance),
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

      if (Math.abs(winding) > Math.PI) {
        count += 1;
      }
    }
  }

  return count;
}

function hasNonFiniteValues(field) {
  const arrays = [field.phiRe, field.phiIm, field.velRe, field.velIm, field.memoryRe, field.memoryIm];
  return arrays.some((array) => Array.from(array).some((value) => !Number.isFinite(value)));
}

function collectMemoryCouplingMetrics(fieldA, fieldB, vortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeanHistory, phaseRotationMetrics, couplingMetrics, couplingParams) {
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

function runCondition(condition, config) {
  const params = {
    ...DEFAULT_MEMORY_PARAMS,
    ...DEFAULT_PHASE_ROTATION_PARAMS,
    ...DEFAULT_COUPLING_PARAMS,
    MEMORY_ENABLED: true,
    MEMORY_INIT_MODE: 'copy-current',
    ...condition,
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
  const initialAmplitudeA = computeAmplitudeStats(fieldA);
  const initialAmplitudeB = computeAmplitudeStats(fieldB);
  const amplitudeMeans = [(initialAmplitudeA.mean + initialAmplitudeB.mean) / 2];
  let previousMetrics = null;
  let phaseRotationInfo = applyPhaseRotation(null, null, { ...params, PHASE_ROTATION_ENABLED: false });
  let phaseMetrics = createPhaseRotationMetrics(params, phaseRotationInfo, 0, 0);
  let couplingInfo = applySelectedCoupling(null, null, { ...params, COUPLING_ENABLED: false });
  let initialMetrics = collectMemoryCouplingMetrics(fieldA, fieldB, initialVortexCount, 0, config, vortexTracker, previousMetrics, amplitudeMeans, phaseMetrics, couplingInfo, params);
  let finalVortexCount = initialVortexCount;
  let finalVortexCountA = initialVortexCountA;
  let finalVortexCountB = initialVortexCountB;
  let finalAmplitudeA = initialAmplitudeA;
  let finalAmplitudeB = initialAmplitudeB;
  let stepWhenVortexCountReachedZero = initialVortexCount === 0 ? 0 : null;
  let nonFiniteDetected = false;
  let renormalizationAppliedCountA_total = 0;
  let renormalizationAppliedCountB_total = 0;
  let memoryCouplingAppliedCells_total = 0;
  let memoryCouplingDeltaA_total = 0;
  let memoryCouplingDeltaB_total = 0;
  previousMetrics = initialMetrics;

  for (let step = 1; step <= config.maxSteps; step += 1) {
    stepField(fieldA, config.gamma, config, scratchARe, scratchAIm);
    stepField(fieldB, config.gamma, config, scratchBRe, scratchBIm);

    couplingInfo = params.COUPLING_TYPE === 'memory'
      ? applySelectedCoupling(fieldA, fieldB, params)
      : applySelectedCoupling(null, null, params);
    memoryCouplingAppliedCells_total += couplingInfo.memoryCouplingAppliedCells ?? 0;
    memoryCouplingDeltaA_total += couplingInfo.memoryCouplingDeltaA ?? 0;
    memoryCouplingDeltaB_total += couplingInfo.memoryCouplingDeltaB ?? 0;

    if (params.MEMORY_ENABLED) {
      applyEWMAMemory(fieldA, params);
      applyEWMAMemory(fieldB, params);
    }

    phaseRotationInfo = params.PHASE_ROTATION_ENABLED
      ? applyPhaseRotation(fieldA, fieldB, params)
      : applyPhaseRotation(null, null, params);

    let renormAppliedA = 0;
    let renormAppliedB = 0;

    if (
      params.PHASE_ROTATION_ENABLED &&
      params.PHASE_ROTATION_RENORMALIZE &&
      step % params.PHASE_ROTATION_RENORMALIZE_INTERVAL === 0
    ) {
      renormAppliedA = softRenormalizeField(fieldA, params);
      renormAppliedB = softRenormalizeField(fieldB, params);
      renormalizationAppliedCountA_total += renormAppliedA;
      renormalizationAppliedCountB_total += renormAppliedB;
    }

    phaseMetrics = createPhaseRotationMetrics(params, phaseRotationInfo, renormalizationAppliedCountA_total, renormalizationAppliedCountB_total);

    if (step % config.sampleInterval === 0 || step === config.maxSteps) {
      finalVortexCountA = computeVortexCount(fieldA, config);
      finalVortexCountB = computeVortexCount(fieldB, config);
      finalVortexCount = finalVortexCountA + finalVortexCountB;
      finalAmplitudeA = computeAmplitudeStats(fieldA);
      finalAmplitudeB = computeAmplitudeStats(fieldB);
      amplitudeMeans.push((finalAmplitudeA.mean + finalAmplitudeB.mean) / 2);

      if (stepWhenVortexCountReachedZero === null && finalVortexCount === 0) {
        stepWhenVortexCountReachedZero = step;
      }

      if (!nonFiniteDetected) {
        nonFiniteDetected = hasNonFiniteValues(fieldA) || hasNonFiniteValues(fieldB);
      }
    }

    if (step % config.metricsSampleInterval === 0 || step === config.maxSteps) {
      const sampledVortexCount = step % config.sampleInterval === 0 || step === config.maxSteps
        ? finalVortexCount
        : computeVortexCount(fieldA, config) + computeVortexCount(fieldB, config);
      previousMetrics = collectMemoryCouplingMetrics(fieldA, fieldB, sampledVortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeans, phaseMetrics, couplingInfo, params);
      globalThis.__AETERNA_COUPLING_METRICS__ = {
        COUPLING_TYPE: params.COUPLING_TYPE,
        COUPLING_G: params.COUPLING_G,
        MEMORY_COUPLING_ENABLED: params.MEMORY_COUPLING_ENABLED,
        MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_WEIGHT,
        effectiveMemoryCoupling: previousMetrics.effectiveMemoryCoupling,
        memoryCouplingAppliedCells: previousMetrics.memoryCouplingAppliedCells,
        memoryCouplingAverageDeltaA: previousMetrics.memoryCouplingAverageDeltaA,
        memoryCouplingAverageDeltaB: previousMetrics.memoryCouplingAverageDeltaB,
        fieldABDistance: previousMetrics.fieldABDistance,
        memoryABDistance: previousMetrics.memoryABDistance,
      };
    }
  }

  const finalMetrics = previousMetrics;
  const notes = [];
  if (nonFiniteDetected) notes.push('Non-finite values detected during sampled checks.');
  if (params.COUPLING_TYPE !== 'memory') notes.push('Baseline amplitude coupling selected; this repository snapshot has no pre-existing amplitude coupling operation, so no additional coupling was applied.');
  if (params.COUPLING_TYPE === 'memory' && !params.MEMORY_COUPLING_ENABLED) notes.push('Memory coupling type selected but MEMORY_COUPLING_ENABLED is false.');
  if (finalMetrics.memoryCouplingAverageDeltaA > 0.1 || finalMetrics.memoryCouplingAverageDeltaB > 0.1) notes.push('Memory coupling average delta exceeded caution threshold 0.1.');
  if (finalMetrics.fieldABDistance === 0) notes.push('fieldABDistance reached 0; possible over-coupling collapse.');
  if (params.PHASE_ROTATION_ENABLED && finalAmplitudeA.mean > config.vev * 1.2) notes.push('A amplitude mean exceeded VEV * 1.2.');
  if (params.PHASE_ROTATION_ENABLED && finalAmplitudeB.mean > config.vev * 1.2) notes.push('B amplitude mean exceeded VEV * 1.2.');
  if (notes.length === 0) notes.push('Completed without sampled non-finite values or memory coupling warning thresholds.');

  return {
    conditionName: condition.conditionName,
    COUPLING_TYPE: params.COUPLING_TYPE,
    COUPLING_G: params.COUPLING_G,
    MEMORY_COUPLING_ENABLED: params.MEMORY_COUPLING_ENABLED,
    MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_ENABLED ? params.MEMORY_COUPLING_WEIGHT : null,
    effectiveMemoryCoupling: finalMetrics.effectiveMemoryCoupling,
    PHASE_ROTATION_ENABLED: params.PHASE_ROTATION_ENABLED,
    OMEGA_A: params.PHASE_ROTATION_ENABLED ? params.OMEGA_A : null,
    OMEGA_B: params.PHASE_ROTATION_ENABLED ? params.OMEGA_B : null,
    omegaRatio: params.PHASE_ROTATION_ENABLED ? phaseMetrics.omegaRatio : null,
    PHASE_ROTATION_TARGET: params.PHASE_ROTATION_ENABLED ? params.PHASE_ROTATION_TARGET : null,
    PHASE_ROTATION_RENORMALIZE: params.PHASE_ROTATION_RENORMALIZE,
    MEMORY_ENABLED: params.MEMORY_ENABLED,
    initialVortexCount,
    initialVortexCountA,
    initialVortexCountB,
    finalVortexCount,
    finalVortexCountA,
    finalVortexCountB,
    stepWhenVortexCountReachedZero,
    vortexLifetimeAverage: finalMetrics.vortexLifetimeAverage,
    vortexLifetimeMax: finalMetrics.vortexLifetimeMax,
    R_A_global_start: initialMetrics.R_A_global,
    R_A_global_end: finalMetrics.R_A_global,
    R_B_global_start: initialMetrics.R_B_global,
    R_B_global_end: finalMetrics.R_B_global,
    R_AB_relative_start: initialMetrics.R_AB_relative,
    R_AB_relative_end: finalMetrics.R_AB_relative,
    R_A_local_average_start: initialMetrics.R_A_local_average,
    R_A_local_average_end: finalMetrics.R_A_local_average,
    R_B_local_average_start: initialMetrics.R_B_local_average,
    R_B_local_average_end: finalMetrics.R_B_local_average,
    fieldABDistance_start: initialMetrics.fieldABDistance,
    fieldABDistance_end: finalMetrics.fieldABDistance,
    memoryABDistance_start: initialMetrics.memoryABDistance,
    memoryABDistance_end: finalMetrics.memoryABDistance,
    amplitudeMeanA_start: initialMetrics.amplitudeMeanA,
    amplitudeMeanA_end: finalMetrics.amplitudeMeanA,
    amplitudeMeanB_start: initialMetrics.amplitudeMeanB,
    amplitudeMeanB_end: finalMetrics.amplitudeMeanB,
    amplitudeStdA_start: initialAmplitudeA.std,
    amplitudeStdA_end: finalAmplitudeA.std,
    amplitudeStdB_start: initialAmplitudeB.std,
    amplitudeStdB_end: finalAmplitudeB.std,
    totalEnergyCombined_start: initialMetrics.totalEnergyCombined,
    totalEnergyCombined_end: finalMetrics.totalEnergyCombined,
    memoryCouplingAppliedCells_total,
    memoryCouplingDeltaA_total,
    memoryCouplingDeltaB_total,
    renormalizationAppliedCountA_total,
    renormalizationAppliedCountB_total,
    nonFiniteDetected,
    notes: notes.join(' '),
    latestMetrics: finalMetrics,
  };
}

function formatNumber(value) {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return String(value);
  return Number(value.toFixed(6));
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const results = CONDITIONS.map((condition) => runCondition(condition, CONFIG));
  const finishedAt = new Date().toISOString();
  const output = {
    experiment: 'Experiment 006: Step 4 Memory Coupling',
    generatedAt: finishedAt,
    startedAt,
    finishedAt,
    implementationNote: 'Isolated A/B headless diagnostic surrogate. Field dynamics run first, memory coupling references the previous EWMA memory second, EWMA memory updates third, and phase rotation remains disabled in the primary conditions before vortex and metrics sampling.',
    config: CONFIG,
    conditions: CONDITIONS,
    results,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.map((result) => ({
    condition: result.conditionName,
    type: result.COUPLING_TYPE,
    weight: result.MEMORY_COUPLING_WEIGHT,
    effective: formatNumber(result.effectiveMemoryCoupling),
    initialVortex: result.initialVortexCount,
    finalVortex: result.finalVortexCount,
    zeroStep: result.stepWhenVortexCountReachedZero,
    lifetimeAvg: formatNumber(result.vortexLifetimeAverage),
    rABEnd: formatNumber(result.R_AB_relative_end),
    fieldDistanceEnd: formatNumber(result.fieldABDistance_end),
    memoryDistanceEnd: formatNumber(result.memoryABDistance_end),
    avgDeltaA: formatNumber(result.latestMetrics.memoryCouplingAverageDeltaA),
    avgDeltaB: formatNumber(result.latestMetrics.memoryCouplingAverageDeltaB),
    ampMeanAEnd: formatNumber(result.amplitudeMeanA_end),
    ampMeanBEnd: formatNumber(result.amplitudeMeanB_end),
  })));
}

main();
