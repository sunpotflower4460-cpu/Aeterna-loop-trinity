#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  CountBasedVortexLifetimeTracker,
  collectAeternaMetrics,
} = require('../src/metrics/aeterna-metrics');
const { DEFAULT_PULSE_PARAMS } = require('../src/params/aeterna-params');
const { applyGentlePulse } = require('../src/physics/gentle-pulse');

const CONDITIONS = [
  { conditionName: 'Baseline', PULSE_ENABLED: false },
  { conditionName: 'Pulse 0.005 / 100', PULSE_ENABLED: true, PULSE_STRENGTH: 0.005, PULSE_INTERVAL: 100 },
  { conditionName: 'Pulse 0.01 / 100', PULSE_ENABLED: true, PULSE_STRENGTH: 0.01, PULSE_INTERVAL: 100 },
  { conditionName: 'Pulse 0.02 / 100', PULSE_ENABLED: true, PULSE_STRENGTH: 0.02, PULSE_INTERVAL: 100 },
  { conditionName: 'Pulse 0.005 / 80', PULSE_ENABLED: true, PULSE_STRENGTH: 0.005, PULSE_INTERVAL: 80 },
  { conditionName: 'Pulse 0.005 / 120', PULSE_ENABLED: true, PULSE_STRENGTH: 0.005, PULSE_INTERVAL: 120 },
];

const CONFIG = Object.freeze({
  gridSize: 24,
  maxSteps: 5000,
  seed: 12345,
  gamma: 0.003,
  dt: 0.03,
  c2: 1.0,
  lambda: 1.0,
  vev: 1.0,
  noiseAmp: 0.001,
  sampleInterval: 25,
  metricsSampleInterval: 30,
  warningSampleInterval: 100,
});

const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'gentle-pulse-results.json');

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

function initializeField(config) {
  const n = config.gridSize;
  const size = n * n * n;
  const phiRe = new Float64Array(size);
  const phiIm = new Float64Array(size);
  const velRe = new Float64Array(size);
  const velIm = new Float64Array(size);
  const rng = createRng(config.seed);

  const vortices = [
    { x: n * 0.28, y: n * 0.30, charge: 1 },
    { x: n * 0.72, y: n * 0.32, charge: -1 },
    { x: n * 0.32, y: n * 0.70, charge: -1 },
    { x: n * 0.70, y: n * 0.72, charge: 1 },
  ];

  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        let phase = 0;
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

  return { phiRe, phiIm, velRe, velIm };
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

function computeTotalEnergy(field) {
  const { phiRe, phiIm } = field;
  let amplitudeEnergy = 0;

  for (let i = 0; i < phiRe.length; i += 1) {
    const re = phiRe[i];
    const im = phiIm[i];
    amplitudeEnergy += re * re + im * im;
  }

  return amplitudeEnergy;
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
  const arrays = [field.phiRe, field.phiIm, field.velRe, field.velIm];
  return arrays.some((array) => Array.from(array).some((value) => !Number.isFinite(value)));
}

function addPulseTotals(total, pulseMetrics) {
  total.pulseAppliedCells += pulseMetrics.pulseAppliedCells;
  total.pulseTotalDelta += pulseMetrics.pulseTotalDelta;
}

function collectPulseMetrics(field, vortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeanHistory, pulseMetrics, lastPulseStep) {
  return collectAeternaMetrics({
    fieldA: field,
    fieldB: null,
    vortexCount,
    stepCount: step,
    gridSize: config.gridSize,
    index3D: index,
    vortexTracker,
    previousMetrics,
    amplitudeMeanHistory,
    localSampleCount: 512,
    pulseMetricsA: pulseMetrics,
    lastPulseStep,
  });
}

function warnIfPulseLooksTooStrong(params, field, pulseMetrics, amplitude, vortexCount, previousVortexCount, step, warningState) {
  if (!params.PULSE_ENABLED || step % CONFIG.warningSampleInterval !== 0) return;

  const VEV = params.VEV ?? params.vev ?? 1.0;
  const totalCells = field.phiRe.length;
  const warnings = [];

  if (pulseMetrics.pulseAppliedCells > totalCells * 0.9) warnings.push('pulseAppliedCells covered more than 90% of cells');
  if (pulseMetrics.pulseTotalDelta > totalCells * 0.05) warnings.push('pulseTotalDelta increased beyond conservative surrogate threshold');
  if (amplitude.mean > VEV * 1.2) warnings.push('amplitudeMean > VEV * 1.2');
  if (amplitude.std > 0.5) warnings.push('amplitudeStd is high for the surrogate');
  if (previousVortexCount > 0 && vortexCount === 0) warnings.push('vortexCount dropped to zero');

  if (warnings.length > 0 && warningState.lastWarningStep !== step) {
    console.warn(`[AeternaLoop] Gentle Pulse may be too strong at step ${step}: ${warnings.join('; ')}`);
    warningState.lastWarningStep = step;
  }
}

function runCondition(condition, config) {
  const params = {
    ...DEFAULT_PULSE_PARAMS,
    ...condition,
    VEV: config.vev,
    vev: config.vev,
  };
  const field = initializeField(config);
  const scratchRe = new Float64Array(field.phiRe.length);
  const scratchIm = new Float64Array(field.phiIm.length);
  const vortexTracker = new CountBasedVortexLifetimeTracker();
  const initialAmplitude = computeAmplitudeStats(field);
  const initialEnergy = computeTotalEnergy(field);
  const initialVortexCount = computeVortexCount(field, config);
  const amplitudeMeans = [initialAmplitude.mean];
  const pulseTotalsA = { pulseAppliedCells: 0, pulseTotalDelta: 0 };
  const pulseTotalsB = { pulseAppliedCells: 0, pulseTotalDelta: 0 };
  const warningState = { lastWarningStep: null };
  let previousMetrics = null;
  let stepWhenVortexCountReachedZero = initialVortexCount === 0 ? 0 : null;
  let finalVortexCount = initialVortexCount;
  let previousVortexCount = initialVortexCount;
  let finalAmplitude = initialAmplitude;
  let finalEnergy = initialEnergy;
  let nonFiniteDetected = false;
  let lastPulseStep = null;
  let lastPulseMetricsA = { pulseAppliedCells: 0, pulseTotalDelta: 0, pulseAverageDelta: 0 };

  const initialMetrics = collectPulseMetrics(field, initialVortexCount, 0, config, vortexTracker, previousMetrics, amplitudeMeans, lastPulseMetricsA, lastPulseStep);
  previousMetrics = initialMetrics;

  for (let step = 1; step <= config.maxSteps; step += 1) {
    stepField(field, config.gamma, config, scratchRe, scratchIm);

    if (params.PULSE_ENABLED && step % params.PULSE_INTERVAL === 0) {
      lastPulseMetricsA = applyGentlePulse(field, params);
      addPulseTotals(pulseTotalsA, lastPulseMetricsA);
      lastPulseStep = step;
    } else {
      lastPulseMetricsA = { pulseAppliedCells: 0, pulseTotalDelta: 0, pulseAverageDelta: 0 };
    }

    if (step % config.sampleInterval === 0 || step === config.maxSteps) {
      finalVortexCount = computeVortexCount(field, config);
      finalAmplitude = computeAmplitudeStats(field);
      finalEnergy = computeTotalEnergy(field);
      amplitudeMeans.push(finalAmplitude.mean);

      if (stepWhenVortexCountReachedZero === null && finalVortexCount === 0) {
        stepWhenVortexCountReachedZero = step;
      }

      if (!nonFiniteDetected) {
        nonFiniteDetected = hasNonFiniteValues(field);
      }

      warnIfPulseLooksTooStrong(params, field, lastPulseMetricsA, finalAmplitude, finalVortexCount, previousVortexCount, step, warningState);
      previousVortexCount = finalVortexCount;
    }

    if (step % config.metricsSampleInterval === 0 || step === config.maxSteps) {
      const sampledVortexCount = step % config.sampleInterval === 0 || step === config.maxSteps
        ? finalVortexCount
        : computeVortexCount(field, config);
      previousMetrics = collectPulseMetrics(field, sampledVortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeans, lastPulseMetricsA, lastPulseStep);
      globalThis.__AETERNA_PULSE_METRICS__ = {
        PULSE_ENABLED: params.PULSE_ENABLED,
        PULSE_INTERVAL: params.PULSE_INTERVAL,
        PULSE_STRENGTH: params.PULSE_STRENGTH,
        PULSE_THRESHOLD_RATIO: params.PULSE_THRESHOLD_RATIO,
        pulseAppliedCellsA: previousMetrics.pulseAppliedCellsA,
        pulseAppliedCellsB: previousMetrics.pulseAppliedCellsB,
        pulseAverageDeltaA: previousMetrics.pulseAverageDeltaA,
        pulseAverageDeltaB: previousMetrics.pulseAverageDeltaB,
        lastPulseStep: previousMetrics.lastPulseStep,
      };
    }
  }

  const finalMetrics = previousMetrics;
  const notes = [];
  if (nonFiniteDetected) notes.push('Non-finite values detected during sampled checks.');
  if (!params.PULSE_ENABLED) notes.push('Baseline pulse disabled; existing headless dynamics run without pulse intervention.');
  if (params.PULSE_ENABLED && pulseTotalsA.pulseAppliedCells === 0) notes.push('Pulse enabled but no cells crossed the homeostatic threshold at pulse steps.');
  if (params.PULSE_ENABLED && finalMetrics.amplitudeMeanA > params.VEV * 1.2) notes.push('Gentle Pulse may be too strong: amplitudeMeanA exceeded VEV * 1.2.');
  if (notes.length === 0) notes.push('Completed without sampled non-finite values or pulse warning thresholds.');

  return {
    conditionName: condition.conditionName,
    PULSE_ENABLED: params.PULSE_ENABLED,
    PULSE_STRENGTH: params.PULSE_ENABLED ? params.PULSE_STRENGTH : null,
    PULSE_INTERVAL: params.PULSE_ENABLED ? params.PULSE_INTERVAL : null,
    PULSE_THRESHOLD_RATIO: params.PULSE_ENABLED ? params.PULSE_THRESHOLD_RATIO : null,
    PULSE_MIN_AMP: params.PULSE_ENABLED ? params.PULSE_MIN_AMP : null,
    initialVortexCount,
    finalVortexCount,
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
    amplitudeMeanA_start: initialMetrics.amplitudeMeanA,
    amplitudeMeanA_end: finalMetrics.amplitudeMeanA,
    amplitudeMeanB_start: initialMetrics.amplitudeMeanB,
    amplitudeMeanB_end: finalMetrics.amplitudeMeanB,
    amplitudeStdA_start: initialAmplitude.std,
    amplitudeStdA_end: finalAmplitude.std,
    amplitudeStdB_start: initialMetrics.amplitudeStdB,
    amplitudeStdB_end: finalMetrics.amplitudeStdB,
    totalEnergyCombined_start: initialMetrics.totalEnergyCombined,
    totalEnergyCombined_end: finalMetrics.totalEnergyCombined,
    pulseAppliedCellsA_total: pulseTotalsA.pulseAppliedCells,
    pulseAppliedCellsB_total: pulseTotalsB.pulseAppliedCells,
    pulseTotalDeltaA_total: pulseTotalsA.pulseTotalDelta,
    pulseTotalDeltaB_total: pulseTotalsB.pulseTotalDelta,
    lastPulseStep,
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
    experiment: 'Experiment 004: Step 2 Homeostatic Gentle Pulse',
    generatedAt: finishedAt,
    startedAt,
    finishedAt,
    implementationNote: 'Isolated headless diagnostic surrogate; no application simulation code was present in this repository snapshot. Gentle Pulse is applied after field dynamics and before vortex / metrics sampling.',
    config: CONFIG,
    conditions: CONDITIONS,
    results,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.map((result) => ({
    condition: result.conditionName,
    pulse: result.PULSE_ENABLED,
    strength: result.PULSE_STRENGTH,
    interval: result.PULSE_INTERVAL,
    initialVortex: result.initialVortexCount,
    finalVortex: result.finalVortexCount,
    zeroStep: result.stepWhenVortexCountReachedZero,
    lifetimeAvg: formatNumber(result.vortexLifetimeAverage),
    ampMeanEnd: formatNumber(result.amplitudeMeanA_end),
    energyEnd: formatNumber(result.totalEnergyCombined_end),
    pulseCells: result.pulseAppliedCellsA_total,
    pulseDelta: formatNumber(result.pulseTotalDeltaA_total),
  })));
}

main();
