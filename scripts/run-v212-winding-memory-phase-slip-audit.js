#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createAeternaRuntimeV0 } = require('../src/runtime/aeterna-runtime-v0');
const { stepAeternaRuntimeV0 } = require('../src/runtime/step-aeterna-runtime-v0');
const { createRng, index3D } = require('../src/runtime/create-aeterna-fields');
const { describePhysicsContext } = require('../src/runtime/physics-context');
const { computeGaugeInvariantABMetrics } = require('../src/metrics/gauge-invariant-metrics');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments/v2.1.2-winding-memory-phase-slip-audit-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments/v2.1.2-winding-memory-phase-slip-audit-summary.json');
const PHASE_CONSTRUCTION_MODE = 'legacy-torus-atan2';
const MODE_POWER_FORMULA = 'P_m = |mean(phi * exp(-i2πmx/N))|^2';
const PARAMETER_LINEAGE = 'exp023-real';
const EXP023_REAL_PARAMS = Object.freeze({
  GAMMA: 0.005,
  MEMORY_ENABLED: true,
  MEMORY_BLEND_VELOCITY: true,
  HISTORY_ALPHA: 0.002,
  MEMORY_WEIGHT: 0.0075,
  MEMORY_WEIGHT_MODE: 'fixed',
  MEMORY_VELOCITY_SCALE: 0.1,
  MEMORY_COUPLING_ENABLED: true,
  MEMORY_COUPLING_FORMULA: 'difference-attractor',
  MEMORY_COUPLING_ORDER: 'after-memory-update',
  MEMORY_COUPLING_WEIGHT: 1.0,
  MEMORY_COUPLING_USE_BIDIRECTIONAL: true,
  COUPLING_G: 0.05,
  COUPLING_TYPE: 'memory',
});

function hasFlag(flag) { return process.argv.includes(flag); }
function getGitHash() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch (_) { return 'git-hash-unavailable'; }
}
function mean(values) { const finite = values.filter(Number.isFinite); return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null; }
function round(value, digits = 8) { return Number.isFinite(value) ? Number(value.toFixed(digits)) : value; }
function roundObj(obj, digits = 8) {
  if (obj === null || typeof obj !== 'object') return round(obj, digits);
  if (Array.isArray(obj)) return obj.map((item) => roundObj(item, digits));
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, roundObj(v, digits)]));
}

const FULL = hasFlag('--full');
const RUNTIME_LIMITED = hasFlag('--runtime-limited');
const COST = FULL ? {
  mode: 'full', GRID_SIZE: 32, NOISE_SEEDS: [101, 202, 303], EPSILON_VALUES: [0.15, 0.30, 0.50, 0.80, 1.20, 1.60],
  MEMORY_WEIGHT_VALUES: [0.0075, 0.015, 0.03, 0.05, 0.10], COUPLING_G_VALUES: [0.0075, 0.01, 0.0125, 0.015, 0.02, 0.03, 0.05],
  MAX_STEPS_BASELINE: 3000, MAX_STEPS_PERTURBATION: 1500, MAX_STEPS_LONG_MEMORY_OFF: 4500, MAX_STEPS_COUPLING_SWEEP: 2000,
  SAMPLE_INTERVAL: 50, FINE_SAMPLE_INTERVAL: 10,
} : RUNTIME_LIMITED ? {
  mode: 'lightweight-runtime-limited', GRID_SIZE: 16, NOISE_SEEDS: [101], EPSILON_VALUES: [0.5, 1.2],
  MEMORY_WEIGHT_VALUES: [0.0075, 0.03, 0.05], COUPLING_G_VALUES: [0.0075, 0.02, 0.05],
  MAX_STEPS_BASELINE: 600, MAX_STEPS_PERTURBATION: 400, MAX_STEPS_LONG_MEMORY_OFF: 900, MAX_STEPS_COUPLING_SWEEP: 500,
  SAMPLE_INTERVAL: 50, FINE_SAMPLE_INTERVAL: 10,
} : {
  mode: 'lightweight', GRID_SIZE: 32, NOISE_SEEDS: [101, 202], EPSILON_VALUES: [0.5, 1.2],
  MEMORY_WEIGHT_VALUES: [0.0075, 0.03, 0.05], COUPLING_G_VALUES: [0.0075, 0.02, 0.05],
  MAX_STEPS_BASELINE: 3000, MAX_STEPS_PERTURBATION: 1500, MAX_STEPS_LONG_MEMORY_OFF: 4500, MAX_STEPS_COUPLING_SWEEP: 2000,
  SAMPLE_INTERVAL: 50, FINE_SAMPLE_INTERVAL: 10,
};

const omittedConditions = RUNTIME_LIMITED ? [
  'Runtime-limited repository artifact used GRID_SIZE=16 instead of suggested lightweight GRID_SIZE=32.',
  'Runtime-limited repository artifact used NOISE_SEEDS=[101] instead of suggested lightweight [101,202].',
  'Runtime-limited repository artifact shortened baseline, perturbation, long memory-off, and coupling horizons; rerun without --runtime-limited for the full lightweight audit.',
] : [];
const observerContextBase = {
  observerVersion: `v212-winding-memory-phase-slip-audit@${getGitHash()}`,
  windingMeasuredAxis: 'x',
  windingLineCount: COST.GRID_SIZE * COST.GRID_SIZE,
  windingHistogramScope: 'x-lines across all y,z',
  detectsGlobalWinding: true,
  detectsFull3DPhaseSlipDirectly: false,
  detectsVortexTanglesDirectly: false,
  modePowerFormula: MODE_POWER_FORMULA,
  limitations: [
    'Winding histogram measures x-axis global line winding only.',
    'During tangled phases, line-wise W values are activity indicators rather than full topology classification.',
    'Phase slip is inferred from winding loss/recovery, minAmp collapse, and mode power changes.',
    'This audit does not implement full 3D vortex-core tracking.',
  ],
};

function phaseDelta(a, b) {
  let delta = b - a;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}
function sourceArrays(fieldLike, source) {
  return source === 'memory' ? { re: fieldLike.memoryRe, im: fieldLike.memoryIm } : { re: fieldLike.phiRe, im: fieldLike.phiIm };
}
function setGlobalWinding(field, { gridSize, winding, axis = 'x', target = 'field', amplitude = 1.0, phaseOffset = 0, initializeVelocity = true } = {}) {
  if (axis !== 'x') throw new Error('This audit only implements x-axis winding');
  const re = target === 'memory' ? field.memoryRe : field.phiRe;
  const im = target === 'memory' ? field.memoryIm : field.phiIm;
  for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) for (let x = 0; x < gridSize; x += 1) {
    const i = index3D(x, y, z, gridSize);
    const phase = phaseOffset + (Math.PI * 2 * winding * x) / gridSize;
    re[i] = amplitude * Math.cos(phase);
    im[i] = amplitude * Math.sin(phase);
    if (initializeVelocity && target === 'field') { field.velRe[i] = 0; field.velIm[i] = 0; }
  }
}
function copyFieldToMemory(field) { field.memoryRe.set(field.phiRe); field.memoryIm.set(field.phiIm); }
function addPerturbation(field, { epsilon, seed, velocityScale = 1 / 3 } = {}) {
  const rng = createRng(seed);
  for (let i = 0; i < field.phiRe.length; i += 1) {
    field.phiRe[i] += (rng() * 2 - 1) * epsilon;
    field.phiIm[i] += (rng() * 2 - 1) * epsilon;
    field.velRe[i] += (rng() * 2 - 1) * epsilon * velocityScale;
    field.velIm[i] += (rng() * 2 - 1) * epsilon * velocityScale;
  }
}
function computeWindingHistogram(fieldLike, { gridSize, axis = 'x', source = 'field' } = {}) {
  if (axis !== 'x') throw new Error('This audit only implements x-axis winding histograms');
  const { re, im } = sourceArrays(fieldLike, source);
  const histogram = {};
  let lineWindingSum = 0;
  for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) {
    let total = 0;
    for (let x = 0; x < gridSize; x += 1) {
      const i = index3D(x, y, z, gridSize);
      const j = index3D((x + 1) % gridSize, y, z, gridSize);
      total += phaseDelta(Math.atan2(im[i], re[i]), Math.atan2(im[j], re[j]));
    }
    const w = Math.round(total / (Math.PI * 2));
    histogram[w] = (histogram[w] || 0) + 1;
    lineWindingSum += w;
  }
  const lineCount = gridSize * gridSize;
  const entries = Object.entries(histogram).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
  const dominantW = entries.length ? Number(entries[0][0]) : null;
  const dominantFraction = entries.length ? entries[0][1] / lineCount : null;
  return { axis, source, lineCount, histogram, dominantW, dominantFraction, allLinesTargetW: null, lineWindingSum };
}
function computeWindingModePowers(fieldLike, { gridSize, axis = 'x', modes = [0, 1, 2], source = 'field' } = {}) {
  if (axis !== 'x') throw new Error('This audit only implements x-axis mode powers');
  const { re, im } = sourceArrays(fieldLike, source);
  const nTotal = gridSize ** 3;
  const raw = {};
  for (const m of modes) {
    let sumRe = 0; let sumIm = 0;
    for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) for (let x = 0; x < gridSize; x += 1) {
      const i = index3D(x, y, z, gridSize);
      const angle = -(Math.PI * 2 * m * x) / gridSize;
      const c = Math.cos(angle); const s = Math.sin(angle);
      sumRe += re[i] * c - im[i] * s;
      sumIm += re[i] * s + im[i] * c;
    }
    raw[`P${m}`] = (sumRe * sumRe + sumIm * sumIm) / (nTotal * nTotal);
  }
  const denom = modes.reduce((sum, m) => sum + raw[`P${m}`], 0);
  const out = { source, axis, normalization: `${MODE_POWER_FORMULA}; normalized over P0+P1+P2` };
  for (const m of modes) out[`P${m}`] = raw[`P${m}`];
  for (const m of modes) out[`normalizedP${m}`] = denom > 0 ? raw[`P${m}`] / denom : null;
  out.P1OverP0 = raw.P0 > 0 ? raw.P1 / raw.P0 : null;
  out.P2OverP0 = raw.P0 > 0 ? raw.P2 / raw.P0 : null;
  return out;
}
function computeAmplitudeStats(fieldLike) {
  let minAmp = Infinity; let maxAmp = -Infinity; let sum = 0; let finiteCount = 0; let nonFiniteCount = 0;
  for (let i = 0; i < fieldLike.phiRe.length; i += 1) {
    const amp = Math.hypot(fieldLike.phiRe[i], fieldLike.phiIm[i]);
    if (!Number.isFinite(amp)) { nonFiniteCount += 1; continue; }
    minAmp = Math.min(minAmp, amp); maxAmp = Math.max(maxAmp, amp); sum += amp; finiteCount += 1;
  }
  return { minAmp: finiteCount ? minAmp : null, meanAmp: finiteCount ? sum / finiteCount : null, maxAmp: finiteCount ? maxAmp : null, finiteCount, nonFiniteCount };
}
function computeKineticEnergyProxy(fieldLike) {
  if (!fieldLike.velRe || !fieldLike.velIm) return null;
  let sum = 0; let count = 0; let nonFiniteCount = 0;
  for (let i = 0; i < fieldLike.velRe.length; i += 1) {
    const v2 = fieldLike.velRe[i] * fieldLike.velRe[i] + fieldLike.velIm[i] * fieldLike.velIm[i];
    if (!Number.isFinite(v2)) { nonFiniteCount += 1; continue; }
    sum += 0.5 * v2; count += 1;
  }
  return { meanKineticEnergyProxy: count ? sum / count : null, totalKineticEnergyProxy: sum, nonFiniteCount };
}
function snapshot(field, gridSize, sourcePrefix = '') {
  const fieldWindingHistogram = computeWindingHistogram(field, { gridSize, source: 'field' });
  const memoryWindingHistogram = computeWindingHistogram(field, { gridSize, source: 'memory' });
  return {
    [`${sourcePrefix}fieldWindingHistogram`]: fieldWindingHistogram,
    [`${sourcePrefix}memoryWindingHistogram`]: memoryWindingHistogram,
    [`${sourcePrefix}fieldModePowers`]: computeWindingModePowers(field, { gridSize, source: 'field' }),
    [`${sourcePrefix}memoryModePowers`]: computeWindingModePowers(field, { gridSize, source: 'memory' }),
    [`${sourcePrefix}amplitudeStats`]: computeAmplitudeStats(field),
    [`${sourcePrefix}kineticEnergyProxy`]: computeKineticEnergyProxy(field),
  };
}
function markTarget(hist, targetW) { return { ...hist, allLinesTargetW: hist.histogram[String(targetW)] === hist.lineCount }; }
function baseParams(overrides = {}) {
  return {
    ...EXP023_REAL_PARAMS,
    parameterLineage: PARAMETER_LINEAGE,
    PHEROMONE_ENABLED: false,
    PHEROMONE_FEEDBACK_ENABLED: false,
    COUPLING_ENABLED: false,
    MEMORY_COUPLING_ENABLED: false,
    COUPLING_TYPE: 'memory',
    MEMORY_ENABLED: true,
    ...overrides,
  };
}
function makeRuntime(params, gridSize = COST.GRID_SIZE) {
  return createAeternaRuntimeV0({ gridSize, seedA: 11, seedB: 22, params, config: { noiseAmp: 0, sampleInterval: COST.SAMPLE_INTERVAL } });
}
function runSteps(runtime, maxSteps, sampleInterval, onSample) {
  onSample(0);
  for (let step = 1; step <= maxSteps; step += 1) {
    stepAeternaRuntimeV0(runtime);
    const interval = step <= 200 ? Math.min(sampleInterval, COST.FINE_SAMPLE_INTERVAL) : sampleInterval;
    if (step % interval === 0 || step === maxSteps) onSample(step);
  }
}
function predictedAmplitude(w, gridSize, config) {
  const vev = config.vev ?? 1.0; const lambda = config.lambda ?? 1.0;
  const k = (Math.PI * 2 * w) / gridSize;
  const curvatureCost = 2 - 2 * Math.cos(k);
  return Math.sqrt(Math.max(0, vev * vev - curvatureCost / lambda));
}
function commonRecord({ runId, runFamily, runConfig, params, runtime, samples, classification, claimLevelNotes = [], limitations = [] }) {
  const gridSize = runtime.config.gridSize;
  const finalSnap = snapshot(runtime.fieldA, gridSize);
  return roundObj({
    runId, runFamily, parameterLineage: PARAMETER_LINEAGE, runConfig, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE }, observerContext: observerContextBase,
    phaseConstructionMode: PHASE_CONSTRUCTION_MODE, samples, ...finalSnap, classification, claimLevelNotes, limitations,
  });
}
function analyzeSamples(samples, targetW) {
  let firstNonTargetStep = null; let recoveryStep = null; let minimumDominantFraction = 1; let minAmpMin = Infinity; let minAmpAtSlip = null;
  let fieldP1Min = Infinity; let memoryP1Min = Infinity; let fieldP1RecoveryStep = null; let memoryP1RecoveryStep = null;
  for (const s of samples) {
    minimumDominantFraction = Math.min(minimumDominantFraction, s.fieldDominantFraction);
    minAmpMin = Math.min(minAmpMin, s.minAmp);
    fieldP1Min = Math.min(fieldP1Min, s.fieldP1);
    memoryP1Min = Math.min(memoryP1Min, s.memoryP1);
    const onTarget = s.fieldDominantW === targetW && s.fieldDominantFraction >= 0.99;
    if (!onTarget && firstNonTargetStep === null) { firstNonTargetStep = s.step; minAmpAtSlip = s.minAmp; }
    if (firstNonTargetStep !== null && recoveryStep === null && onTarget) recoveryStep = s.step;
    if (fieldP1RecoveryStep === null && firstNonTargetStep !== null && s.fieldP1 >= 0.95) fieldP1RecoveryStep = s.step;
    if (memoryP1RecoveryStep === null && firstNonTargetStep !== null && s.memoryP1 >= 0.95) memoryP1RecoveryStep = s.step;
  }
  return { firstNonTargetStep, recoveryStep, minimumDominantFraction, minAmpMin, minAmpAtSlip, fieldP1Min, memoryP1Min, fieldP1RecoveryStep, memoryP1RecoveryStep };
}
function sampleSolo(runtime, targetW) {
  const fs = computeWindingHistogram(runtime.fieldA, { gridSize: runtime.config.gridSize, source: 'field' });
  const ms = computeWindingHistogram(runtime.fieldA, { gridSize: runtime.config.gridSize, source: 'memory' });
  const amp = computeAmplitudeStats(runtime.fieldA);
  const fp = computeWindingModePowers(runtime.fieldA, { gridSize: runtime.config.gridSize, source: 'field' });
  const mp = computeWindingModePowers(runtime.fieldA, { gridSize: runtime.config.gridSize, source: 'memory' });
  return { step: runtime.stepCount, fieldDominantW: fs.dominantW, fieldDominantFraction: fs.dominantFraction, fieldAllLinesTargetW: fs.histogram[String(targetW)] === fs.lineCount, memoryDominantW: ms.dominantW, memoryDominantFraction: ms.dominantFraction, minAmp: amp.minAmp, meanAmp: amp.meanAmp, fieldP1: fp.normalizedP1, memoryP1: mp.normalizedP1 };
}

function baselineRun(w) {
  const params = baseParams(); const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.GRID_SIZE, winding: w, target: 'field' }); copyFieldToMemory(runtime.fieldA);
  setGlobalWinding(runtime.fieldB, { gridSize: COST.GRID_SIZE, winding: 0, target: 'field' }); copyFieldToMemory(runtime.fieldB);
  const initialAmp = computeAmplitudeStats(runtime.fieldA);
  const samples = [];
  runSteps(runtime, COST.MAX_STEPS_BASELINE, COST.SAMPLE_INTERVAL, () => samples.push(sampleSolo(runtime, w)));
  const finalAmp = computeAmplitudeStats(runtime.fieldA); const predicted = predictedAmplitude(w, COST.GRID_SIZE, runtime.config);
  const rec = commonRecord({ runId: `baseline-W${w}`, runFamily: 'baseline_global_winding', runConfig: { initialW: w, targetW: w, maxSteps: COST.MAX_STEPS_BASELINE, gridSize: COST.GRID_SIZE, parameterLineage: PARAMETER_LINEAGE }, params, runtime, samples, classification: 'baseline_persistence_calibration', claimLevelNotes: ['measured: final x-line winding histogram and mode powers; observed if dominant W persists through tested horizon.'] });
  rec.initialW = w; rec.targetW = w; rec.finalDominantW = rec.fieldWindingHistogram.dominantW; rec.finalDominantFraction = rec.fieldWindingHistogram.dominantFraction; rec.allLinesTargetW = rec.fieldWindingHistogram.histogram[String(w)] === rec.fieldWindingHistogram.lineCount; rec.initialMeanAmp = round(initialAmp.meanAmp); rec.finalMeanAmp = round(finalAmp.meanAmp); rec.predictedStationaryAmplitude = round(predicted); rec.meanAmpError = round(finalAmp.meanAmp - predicted); rec.minAmp = round(finalAmp.minAmp); rec.kineticEnergyProxy = rec.kineticEnergyProxy;
  return rec;
}
function perturbationRun({ epsilon, seed, memoryEnabled = true, maxSteps = COST.MAX_STEPS_PERTURBATION, label = 'memory-on', memoryWeight = 0.0075 }) {
  const params = baseParams(memoryEnabled ? { MEMORY_WEIGHT: memoryWeight } : { MEMORY_ENABLED: false, MEMORY_WEIGHT: 0, MEMORY_COUPLING_ENABLED: false, COUPLING_ENABLED: false });
  const runtime = makeRuntime(params); setGlobalWinding(runtime.fieldA, { gridSize: COST.GRID_SIZE, winding: 1, target: 'field' }); copyFieldToMemory(runtime.fieldA); addPerturbation(runtime.fieldA, { epsilon, seed }); if (memoryEnabled) copyFieldToMemory(runtime.fieldA);
  const samples = []; runSteps(runtime, maxSteps, COST.SAMPLE_INTERVAL, () => samples.push(sampleSolo(runtime, 1)));
  const analysis = analyzeSamples(samples, 1); const final = samples[samples.length - 1];
  const finalOnTarget = final.fieldDominantW === 1 && final.fieldDominantFraction >= 0.99;
  let classification = 'persistent_without_break';
  if (analysis.firstNonTargetStep !== null && finalOnTarget) classification = 'break_then_recover';
  else if (analysis.firstNonTargetStep !== null && final.fieldDominantW === 1 && final.fieldDominantFraction < 0.99) classification = 'break_partial_recovery';
  else if (analysis.firstNonTargetStep !== null && analysis.recoveryStep !== null && !finalOnTarget) classification = 'transient_recovery_then_loss';
  else if (analysis.firstNonTargetStep !== null && final.fieldDominantW !== 1) classification = final.fieldDominantW === null ? 'break_no_recovery' : 'phase_slip_to_other_W';
  const rec = commonRecord({ runId: `perturb-W1-e${epsilon}-seed${seed}-${label}`, runFamily: 'perturbation_sweep', runConfig: { initialW: 1, targetW: 1, epsilon, noiseSeed: seed, memoryEnabled, memoryConditionLabel: label, maxSteps, gridSize: COST.GRID_SIZE, parameterLineage: PARAMETER_LINEAGE }, params, runtime, samples, classification, claimLevelNotes: ['measured: winding loss/recovery, minAmp collapse, and P1 recovery; interpretive tag remains candidate only.'] });
  return { ...rec, epsilon, noiseSeed: seed, initialDominantW: samples[0].fieldDominantW, ...roundObj(analysis), finalDominantW: final.fieldDominantW, finalDominantFraction: final.fieldDominantFraction };
}
function ledgerRun({ label, memoryW, memoryEnabled = true, epsilon = 1.2, seed = 101, memoryWeight = 0.0075 }) {
  const params = baseParams(memoryEnabled ? { MEMORY_WEIGHT: memoryWeight } : { MEMORY_ENABLED: false, MEMORY_WEIGHT: 0, MEMORY_COUPLING_ENABLED: false, COUPLING_ENABLED: false });
  const runtime = makeRuntime(params); setGlobalWinding(runtime.fieldA, { gridSize: COST.GRID_SIZE, winding: 1, target: 'field' }); addPerturbation(runtime.fieldA, { epsilon, seed });
  if (memoryEnabled) {
    if (label === 'L1_noisy_W1_copy') copyFieldToMemory(runtime.fieldA);
    else setGlobalWinding(runtime.fieldA, { gridSize: COST.GRID_SIZE, winding: memoryW, target: 'memory', initializeVelocity: false });
  } else setGlobalWinding(runtime.fieldA, { gridSize: COST.GRID_SIZE, winding: 0, target: 'memory', initializeVelocity: false });
  const samples = []; runSteps(runtime, COST.MAX_STEPS_PERTURBATION, COST.SAMPLE_INTERVAL, () => samples.push(sampleSolo(runtime, 1)));
  const final = samples[samples.length - 1]; const analysis = analyzeSamples(samples, 1);
  const fieldInitialW = 1;
  const targetW = 1;
  const finalFieldOnW1 = final.fieldDominantW === 1 && final.fieldDominantFraction >= 0.99;
  const finalFieldOnW0 = final.fieldDominantW === 0 && final.fieldDominantFraction >= 0.99;
  const finalFieldOnW2 = final.fieldDominantW === 2 && final.fieldDominantFraction >= 0.99;
  const memoryRewrite = samples.find((sample) => memoryEnabled && memoryW !== null && memoryW !== targetW && sample.step > 0 && sample.memoryDominantW === targetW && sample.memoryDominantFraction >= 0.99);
  let classification = 'mixed_or_tangled';
  if (!memoryEnabled) classification = finalFieldOnW1 ? 'memory_off_field_returns_to_W1' : 'memory_off_no_recovery';
  else if (memoryW === 0 && finalFieldOnW0) classification = 'field_follows_clean_W0_memory';
  else if (memoryW === 2 && finalFieldOnW2) classification = 'memory_writes_W2_to_field';
  else if (memoryW !== fieldInitialW && memoryRewrite) classification = 'field_rewrites_memory';
  else if (memoryW === 2 && finalFieldOnW1) classification = 'field_returns_to_W1';
  else if (memoryW === 1 && finalFieldOnW1) classification = label === 'L1b_clean_W1' ? 'clean_W1_memory_recovery' : 'field_returns_to_W1';
  const rec = commonRecord({ runId: `ledger-${label}-mw${memoryWeight}`, runFamily: 'ledger_discrimination_matrix', runConfig: { fieldInitialW: 1, memoryInitialW: memoryW, memoryConditionLabel: label, epsilon, noiseSeed: seed, memoryEnabled, memoryWeight, maxSteps: COST.MAX_STEPS_PERTURBATION, gridSize: COST.GRID_SIZE, parameterLineage: PARAMETER_LINEAGE }, params, runtime, samples, classification, claimLevelNotes: ['observed ledger-discrimination result; interpretive level: memory_biased_basin_selection if field/memory disagreement changes outcome.'] });
  return { ...rec, fieldInitialW, memoryInitialW: memoryW, memoryConditionLabel: label, epsilon, memoryWeight, finalFieldDominantW: final.fieldDominantW, finalFieldDominantFraction: final.fieldDominantFraction, finalMemoryDominantW: final.memoryDominantW, finalMemoryDominantFraction: final.memoryDominantFraction, fieldRecoveryStep: analysis.recoveryStep, memoryRewriteStep: memoryRewrite ? memoryRewrite.step : null };
}
function memoryWeightRun(memoryWeight) {
  const rec = ledgerRun({ label: 'D2_clean_W2_memory_weight_sweep', memoryW: 2, memoryEnabled: true, memoryWeight });
  if (rec.finalFieldDominantW === 2 && rec.finalFieldDominantFraction >= 0.99) rec.classification = 'memory_writes_W2_to_field';
  else if (rec.finalFieldDominantW === 1 && rec.finalFieldDominantFraction >= 0.99 && rec.finalMemoryDominantW === 1 && rec.memoryInitialW !== 1 && rec.memoryRewriteStep !== null) rec.classification = 'field_rewrites_memory';
  else if (rec.finalFieldDominantW === 1 && rec.finalFieldDominantFraction >= 0.99) rec.classification = 'field_returns_to_W1';
  else rec.classification = 'mixed_or_tangled';
  rec.runFamily = 'memory_weight_sweep_uphill_writing';
  return rec;
}
function pureNoiseRun() {
  const params = baseParams(); const runtime = makeRuntime(params); setGlobalWinding(runtime.fieldA, { gridSize: COST.GRID_SIZE, winding: 0, target: 'field' }); copyFieldToMemory(runtime.fieldA); addPerturbation(runtime.fieldA, { epsilon: 1.2, seed: 101 }); copyFieldToMemory(runtime.fieldA);
  const samples = []; runSteps(runtime, COST.MAX_STEPS_PERTURBATION, COST.SAMPLE_INTERVAL, () => samples.push(sampleSolo(runtime, 0)));
  const final = samples[samples.length - 1];
  const classification = final.fieldDominantW === 1 && final.fieldDominantFraction >= 0.99 ? 'spurious_W1_creation_candidate' : 'no_stable_W1_created';
  const rec = commonRecord({ runId: 'pure-noise-W0-e1.2', runFamily: 'pure_noise_control', runConfig: { initialW: 0, targetW: 0, epsilon: 1.2, noiseSeed: 101, maxSteps: COST.MAX_STEPS_PERTURBATION, gridSize: COST.GRID_SIZE, parameterLineage: PARAMETER_LINEAGE }, params, runtime, samples, classification, claimLevelNotes: ['control: strong W=0 noise should not be described as spontaneous stable W=1 recovery unless measured.'] });
  return { ...rec, finalDominantW: final.fieldDominantW, finalDominantFraction: final.fieldDominantFraction };
}
function couplingRun(g) {
  const params = baseParams({ COUPLING_ENABLED: true, MEMORY_COUPLING_ENABLED: true, MEMORY_COUPLING_USE_BIDIRECTIONAL: true, COUPLING_G: g, MEMORY_WEIGHT: 0.0075 });
  const runtime = makeRuntime(params); setGlobalWinding(runtime.fieldA, { gridSize: COST.GRID_SIZE, winding: 1, target: 'field' }); copyFieldToMemory(runtime.fieldA); setGlobalWinding(runtime.fieldB, { gridSize: COST.GRID_SIZE, winding: 0, target: 'field' }); copyFieldToMemory(runtime.fieldB);
  const samples = [];
  runSteps(runtime, COST.MAX_STEPS_COUPLING_SWEEP, COST.SAMPLE_INTERVAL, () => {
    const a = sampleSolo({ ...runtime, fieldA: runtime.fieldA }, 1); const bfield = runtime.fieldB;
    const bw = computeWindingHistogram(bfield, { gridSize: COST.GRID_SIZE, source: 'field' }); const bm = computeWindingHistogram(bfield, { gridSize: COST.GRID_SIZE, source: 'memory' }); const ba = computeAmplitudeStats(bfield);
    const gauge = computeGaugeInvariantABMetrics(runtime.fieldA, runtime.fieldB);
    samples.push({ step: runtime.stepCount, fieldDominantWA: a.fieldDominantW, fieldDominantFractionA: a.fieldDominantFraction, memoryDominantWA: a.memoryDominantW, fieldDominantWB: bw.dominantW, fieldDominantFractionB: bw.dominantFraction, memoryDominantWB: bm.dominantW, minAmpA: a.minAmp, minAmpB: ba.minAmp, alignedFieldABDistance: gauge.alignedFieldABDistance, rawFieldABDistance: gauge.rawFieldABDistance, gaugeOverlap: gauge.gaugeOverlap });
  });
  const firstSlipA = samples.find((s) => s.fieldDominantWA !== 1 || s.fieldDominantFractionA < 0.99);
  const firstSlipB = samples.find((s) => s.fieldDominantWB !== 0 || s.fieldDominantFractionB < 0.99);
  const final = samples[samples.length - 1];
  let classification = 'indeterminate';
  if (!firstSlipA && !firstSlipB) classification = 'topological_frustration_plateau';
  else if (firstSlipA && firstSlipB && Math.abs(firstSlipA.step - firstSlipB.step) <= 50) classification = 'double_slip_exchange';
  else if (Boolean(firstSlipA) !== Boolean(firstSlipB) && final.fieldDominantWA === final.fieldDominantWB) classification = 'single_slip_merge';
  else if (firstSlipA || firstSlipB) classification = 'transfer_then_merge';
  const snapA = snapshot(runtime.fieldA, COST.GRID_SIZE, 'A'); const snapB = snapshot(runtime.fieldB, COST.GRID_SIZE, 'B'); const gauge = computeGaugeInvariantABMetrics(runtime.fieldA, runtime.fieldB);
  const physicsContext = { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE, couplingDirectionality: 'bidirectional', oneSidedMeaning: 'winding_asymmetry_only', memoryCouplingUseBidirectional: params.MEMORY_COUPLING_USE_BIDIRECTIONAL };
  return roundObj({ runId: `coupling-W1-W0-g${g}`, runFamily: 'one_sided_winding_coupling_sweep', parameterLineage: PARAMETER_LINEAGE, runConfig: { initialWA: 1, initialWB: 0, couplingG: g, memoryCouplingUseBidirectional: params.MEMORY_COUPLING_USE_BIDIRECTIONAL, couplingDirectionality: 'bidirectional', oneSidedMeaning: 'winding_asymmetry_only', parameterLineage: PARAMETER_LINEAGE, maxSteps: COST.MAX_STEPS_COUPLING_SWEEP, gridSize: COST.GRID_SIZE, samplePolicy: 'every 10 steps for first 200 steps, then every 50 steps' }, physicsContext, observerContext: observerContextBase, phaseConstructionMode: PHASE_CONSTRUCTION_MODE, samples, fieldWindingHistogramA: snapA.AfieldWindingHistogram, fieldWindingHistogramB: snapB.BfieldWindingHistogram, memoryWindingHistogramA: snapA.AmemoryWindingHistogram, memoryWindingHistogramB: snapB.BmemoryWindingHistogram, minAmpA: snapA.AamplitudeStats.minAmp, minAmpB: snapB.BamplitudeStats.minAmp, fieldPowersA: snapA.AfieldModePowers, fieldPowersB: snapB.BfieldModePowers, memoryPowersA: snapA.AmemoryModePowers, memoryPowersB: snapB.BmemoryModePowers, alignedFieldABDistance: gauge.alignedFieldABDistance, rawFieldABDistance: gauge.rawFieldABDistance, gaugeOverlap: gauge.gaugeOverlap, firstSlipStepA: firstSlipA ? firstSlipA.step : null, firstSlipStepB: firstSlipB ? firstSlipB.step : null, transferWindow: firstSlipA && firstSlipB ? { stepA: firstSlipA.step, stepB: firstSlipB.step, deltaSteps: Math.abs(firstSlipA.step - firstSlipB.step) } : null, classification, claimLevelNotes: ['candidate coupling regime classification; synchronized_double_phase_slip requires nearby W changes and minAmp drops, not full topology proof.'], limitations: observerContextBase.limitations });
}

function summarize(results) {
  const byFamily = {};
  for (const r of results) {
    byFamily[r.runFamily] ||= [];
    if (r.runFamily === 'one_sided_winding_coupling_sweep') {
      byFamily[r.runFamily].push({
        runId: r.runId,
        classification: r.classification,
        finalWA: r.fieldWindingHistogramA?.dominantW ?? null,
        finalWB: r.fieldWindingHistogramB?.dominantW ?? null,
        finalMemoryWA: r.memoryWindingHistogramA?.dominantW ?? null,
        finalMemoryWB: r.memoryWindingHistogramB?.dominantW ?? null,
        firstSlipStepA: r.firstSlipStepA,
        firstSlipStepB: r.firstSlipStepB,
        transferWindow: r.transferWindow,
      });
    } else {
      byFamily[r.runFamily].push({
        runId: r.runId,
        classification: r.classification,
        finalW: r.finalDominantW ?? r.finalFieldDominantW ?? r.fieldWindingHistogram?.dominantW ?? null,
        finalFraction: r.finalDominantFraction ?? r.finalFieldDominantFraction ?? r.fieldWindingHistogram?.dominantFraction ?? null,
        finalMemoryW: r.finalMemoryDominantW ?? r.memoryWindingHistogram?.dominantW ?? null,
        finalMemoryFraction: r.finalMemoryDominantFraction ?? r.memoryWindingHistogram?.dominantFraction ?? null,
      });
    }
  }
  const baseline = results.filter((r) => r.runFamily === 'baseline_global_winding').map((r) => ({ W: r.initialW, finalDominantW: r.finalDominantW, allLinesTargetW: r.allLinesTargetW, finalMeanAmp: r.finalMeanAmp, predictedStationaryAmplitude: r.predictedStationaryAmplitude, meanAmpError: r.meanAmpError }));
  const priorExpectations = {
    baselinePersistence: baseline.map((b) => ({ expectation: `W=${b.W} persists through tested horizon`, result: b.allLinesTargetW ? 'hit' : 'miss' })),
    memoryOffNoRecovery: classifyExpectation(results.find((r) => r.runId.includes('memory-off-long')), (r) => r && r.finalDominantW !== 1),
    cleanW0Memory: classifyExpectation(results.find((r) => r.memoryConditionLabel === 'L2_clean_W0'), (r) => r && r.finalFieldDominantW === 0),
    lowWeightW2Failure: classifyExpectation(results.find((r) => r.runFamily === 'memory_weight_sweep_uphill_writing' && r.memoryWeight === 0.0075), (r) => r && r.finalFieldDominantW !== 2),
    pureNoiseNoW1: classifyExpectation(results.find((r) => r.runFamily === 'pure_noise_control'), (r) => r && r.finalDominantW !== 1),
  };
  const couplingG02 = results.find((r) => r.runFamily === 'one_sided_winding_coupling_sweep' && r.runConfig?.couplingG === 0.02);
  const l1b = results.find((r) => r.memoryConditionLabel === 'L1b_clean_W1');
  const memoryOffMatched = results.find((r) => r.runConfig?.memoryConditionLabel === 'memory-off-matched');
  const memoryOffLong = results.find((r) => r.runConfig?.memoryConditionLabel === 'memory-off-long');
  const baselineW1 = baseline.find((b) => b.W === 1);
  const baselineW2 = baseline.find((b) => b.W === 2);
  const lineageSanityChecks = {
    parameterLineage: PARAMETER_LINEAGE,
    baselineW1MeanAmpCloseTo0980597: { observed: baselineW1?.finalMeanAmp ?? null, reference: 0.980597, delta: baselineW1 ? baselineW1.finalMeanAmp - 0.980597 : null, claimLevel: 'lineage sanity check, not pass/fail' },
    baselineW2MeanAmpCloseTo0920739: { observed: baselineW2?.finalMeanAmp ?? null, reference: 0.920739, delta: baselineW2 ? baselineW2.finalMeanAmp - 0.920739 : null, claimLevel: 'lineage sanity check, not pass/fail' },
    couplingG02SingleSlipExpectation: { runId: couplingG02?.runId ?? null, classification: couplingG02?.classification ?? null, firstSlipStepA: couplingG02?.firstSlipStepA ?? null, priorExpectedFirstSlipStepAWindow: '70-90', claimLevel: 'expectation comparison, not pass/fail' },
    l1bEvaluatedUnderExp023Real: { runId: l1b?.runId ?? null, parameterLineage: l1b?.parameterLineage ?? l1b?.runConfig?.parameterLineage ?? null, classification: l1b?.classification ?? null },
    strictMemoryOffClassifications: { matched: memoryOffMatched ? { runId: memoryOffMatched.runId, classification: memoryOffMatched.classification, finalW: memoryOffMatched.finalDominantW, finalFraction: memoryOffMatched.finalDominantFraction } : null, long: memoryOffLong ? { runId: memoryOffLong.runId, classification: memoryOffLong.classification, finalW: memoryOffLong.finalDominantW, finalFraction: memoryOffLong.finalDominantFraction } : null },
  };
  return roundObj({ audit: 'v2.1.2-winding-memory-phase-slip-audit', generatedAt: new Date().toISOString(), runMode: COST.mode, parameterLineage: PARAMETER_LINEAGE, phaseConstructionMode: PHASE_CONSTRUCTION_MODE, costPolicy: COST, omittedConditions, lineageSanityChecks, observerContext: observerContextBase, modePowerFormula: MODE_POWER_FORMULA, runCount: results.length, byFamily, baseline, priorExpectations, cautions: ['Memory is not interpreted as an infallible ledger.', 'Candidate tags do not imply biological life, consciousness, exact topology proof, or permanent survival.'] });
}
function classifyExpectation(record, predicate) { if (!record) return 'indeterminate'; return predicate(record) ? 'hit' : 'miss'; }

function main() {
  const results = [];
  for (const w of [0, 1, 2]) results.push(baselineRun(w));
  for (const epsilon of COST.EPSILON_VALUES) for (const seed of COST.NOISE_SEEDS) results.push(perturbationRun({ epsilon, seed }));
  results.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: true, label: 'memory-on-matched' }));
  results.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: false, label: 'memory-off-matched' }));
  results.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: false, label: 'memory-off-long', maxSteps: COST.MAX_STEPS_LONG_MEMORY_OFF }));
  results.push(ledgerRun({ label: 'L0_memory_OFF', memoryW: null, memoryEnabled: false }));
  results.push(ledgerRun({ label: 'L1_noisy_W1_copy', memoryW: 1, memoryEnabled: true }));
  results.push(ledgerRun({ label: 'L1b_clean_W1', memoryW: 1, memoryEnabled: true }));
  results.push(ledgerRun({ label: 'L2_clean_W0', memoryW: 0, memoryEnabled: true }));
  results.push(ledgerRun({ label: 'L3_clean_W2', memoryW: 2, memoryEnabled: true }));
  for (const memoryWeight of COST.MEMORY_WEIGHT_VALUES) results.push(memoryWeightRun(memoryWeight));
  for (const g of COST.COUPLING_G_VALUES) results.push(couplingRun(g));
  results.push(pureNoiseRun());
  const output = { audit: 'v2.1.2-winding-memory-phase-slip-audit', generatedAt: new Date().toISOString(), runMode: COST.mode, parameterLineage: PARAMETER_LINEAGE, phaseConstructionMode: PHASE_CONSTRUCTION_MODE, results };
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(roundObj(output), null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summarize(results), null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)} and ${path.relative(ROOT, SUMMARY_PATH)} (${results.length} runs, ${COST.mode}).`);
}

if (require.main === module) main();

module.exports = { computeWindingHistogram, computeWindingModePowers, computeAmplitudeStats, computeKineticEnergyProxy, setGlobalWinding };
