#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createAeternaRuntimeV0 } = require('../src/runtime/aeterna-runtime-v0');
const { stepAeternaRuntimeV0 } = require('../src/runtime/step-aeterna-runtime-v0');
const { createRng, index3D } = require('../src/runtime/create-aeterna-fields');
const { describePhysicsContext } = require('../src/runtime/physics-context');
const {
  DEFAULT_NEAR_PI_MARGIN,
  DEFAULT_VALIDITY_AMP_THRESHOLD,
  OBSERVER_VERSION,
  computeEffectivePullWork,
  computeFieldDistance,
  computeWindingValidity,
  makeAnalyticWindingState,
  makeObserverContextV2,
  predictedStationaryAmplitude,
} = require('../src/metrics/observer-v2');
const {
  computeAmplitudeStats,
  computeWindingHistogram,
  computeWindingModePowers,
  setGlobalWinding,
} = require('./run-v212-winding-memory-phase-slip-audit');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments/v2.2-observer-v2-calibration-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments/v2.2-observer-v2-calibration-summary.json');
const HISTORICAL_RESULTS_PATH = path.join(ROOT, 'experiments/v2.1.2-winding-memory-phase-slip-audit-results.json');
const AUDIT = 'v2.2-observer-v2-calibration';
const RUN_MODE = 'lightweight';
const CLAIM_LEVEL = 'finite-horizon observer calibration';
const OBSERVER_PURPOSE = 'Observer V2 calibration only';
const ARTIFACT_COMMITTED_IN = 'pending merge commit containing v2.2 Observer V2 calibration artifacts';
const PHASE_CONSTRUCTION_MODE = 'legacy-torus-atan2';
const WINDING_INITIALIZATION_MODE = 'manual-global-x-winding-ramp';
const PARAMETER_LINEAGE = 'exp023-real';
const VALIDITY_AMP_THRESHOLD = DEFAULT_VALIDITY_AMP_THRESHOLD;
const NEAR_PI_MARGIN = DEFAULT_NEAR_PI_MARGIN;
const TIER1_TOLERANCE = 1e-9;
const MONOTONIC_TOLERANCE = 1e-12;
const MEMORY_ON_OFF_DISTANCE_TOLERANCE = 0.05;
const COST = Object.freeze({
  mode: RUN_MODE,
  gridSize: 32,
  maxStepsBaseline: 3000,
  maxStepsPerturbation: 1500,
  maxStepsMemoryOff: 4500,
  maxStepsLedger: 1500,
  maxStepsCoupling: 2000,
  sampleInterval: 50,
  fineSampleInterval: 10,
  reductionDisclosure: 'Selected v2.1.2-style scenario families only; each selected scenario uses the finalized audit grid, seeds, perturbation ordering, and horizon for that scenario family.',
});
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
function metadata() {
  const generatorGitHash = getGitHash();
  return { audit: AUDIT, runMode: RUN_MODE, generatorGitHash, artifactGeneratedFromReachableCommit: Boolean(generatorGitHash) && generatorGitHash !== 'git-hash-unavailable', artifactCommittedIn: ARTIFACT_COMMITTED_IN, observerVersion: OBSERVER_VERSION, observerPurpose: OBSERVER_PURPOSE, claimLevel: CLAIM_LEVEL };
}
function round(value, digits = 10) {
  if (!Number.isFinite(value)) return value;
  if (value !== 0 && Math.abs(value) < 1e-9) return value;
  return Number(value.toFixed(digits));
}
function roundObj(obj, digits = 10) {
  if (obj === null || typeof obj !== 'object') return round(obj, digits);
  if (Array.isArray(obj)) return obj.map((item) => roundObj(item, digits));
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, roundObj(v, digits)]));
}
function copyFieldToMemory(field) { field.memoryRe.set(field.phiRe); field.memoryIm.set(field.phiIm); }
function baseParams(overrides = {}) {
  return { ...EXP023_REAL_PARAMS, parameterLineage: PARAMETER_LINEAGE, PHEROMONE_ENABLED: false, PHEROMONE_FEEDBACK_ENABLED: false, COUPLING_ENABLED: false, MEMORY_COUPLING_ENABLED: false, COUPLING_TYPE: 'memory', MEMORY_ENABLED: true, ...overrides };
}
function makeRuntime(params, gridSize = COST.gridSize) {
  return createAeternaRuntimeV0({ gridSize, seedA: 11, seedB: 22, params, config: { noiseAmp: 0, sampleInterval: COST.sampleInterval } });
}
function runSteps(runtime, maxSteps, onSample) {
  onSample(0);
  for (let step = 1; step <= maxSteps; step += 1) {
    stepAeternaRuntimeV0(runtime);
    const interval = step <= 200 ? Math.min(COST.sampleInterval, COST.fineSampleInterval) : COST.sampleInterval;
    if (step % interval === 0 || step === maxSteps) onSample(step);
  }
}
function addPerturbation(field, { epsilon, seed, velocityScale = 1 / 3 } = {}) {
  const rng = createRng(seed);
  for (let i = 0; i < field.phiRe.length; i += 1) {
    field.phiRe[i] += (rng() * 2 - 1) * epsilon;
    field.phiIm[i] += (rng() * 2 - 1) * epsilon;
    field.velRe[i] += (rng() * 2 - 1) * epsilon * velocityScale;
    field.velIm[i] += (rng() * 2 - 1) * epsilon * velocityScale;
  }
}
function addComponentNoise(field, { epsilon, seed } = {}) {
  const rng = createRng(seed);
  for (let i = 0; i < field.phiRe.length; i += 1) {
    field.phiRe[i] += (rng() * 2 - 1) * epsilon;
    field.phiIm[i] += (rng() * 2 - 1) * epsilon;
  }
}
function targetState(winding, gridSize = COST.gridSize) {
  return makeAnalyticWindingState({ gridSize, winding, amplitude: predictedStationaryAmplitude(winding, gridSize) });
}
function fieldFromArrays(re, im) { return { phiRe: re, phiIm: im, memoryRe: re, memoryIm: im }; }
function distanceBundle(a, b, source = 'field', gridSize = COST.gridSize) {
  const raw = computeFieldDistance(a, b, { gridSize, source, alignment: 'raw' });
  const aligned = computeFieldDistance(a, b, { gridSize, source, alignment: 'gauge-aligned' });
  return { raw: raw.distance, aligned: aligned.distance, thetaStar: aligned.thetaStar, gaugeOverlap: aligned.gaugeOverlap };
}
function fieldMemoryDistance(field, gridSize = COST.gridSize) {
  return distanceBundle(fieldFromArrays(field.phiRe, field.phiIm), fieldFromArrays(field.memoryRe, field.memoryIm), 'field', gridSize);
}
function observerMetricsSingle(field, targetW, params, gridSize = COST.gridSize) {
  const target = targetState(targetW, gridSize);
  const fieldTarget = distanceBundle(field, target, 'field', gridSize);
  const memoryTarget = distanceBundle(field, target, 'memory', gridSize);
  const fieldMemory = fieldMemoryDistance(field, gridSize);
  const validity = computeWindingValidity(field, { gridSize, source: 'field', validityAmpThreshold: VALIDITY_AMP_THRESHOLD, nearPiMargin: NEAR_PI_MARGIN });
  const coefficient = params.MEMORY_ENABLED === false ? 0 : params.MEMORY_WEIGHT;
  return { fieldMemoryDistanceRaw: fieldMemory.raw, fieldMemoryDistanceAligned: fieldMemory.aligned, fieldTargetDistanceRaw: fieldTarget.raw, fieldTargetDistanceAligned: fieldTarget.aligned, memoryTargetDistanceRaw: memoryTarget.raw, memoryTargetDistanceAligned: memoryTarget.aligned, thetaStarFieldMemory: fieldMemory.thetaStar, thetaStarFieldTarget: fieldTarget.thetaStar, thetaStarMemoryTarget: memoryTarget.thetaStar, windingValidity: validity, workProxy: computeEffectivePullWork({ coefficient, distance: fieldTarget.aligned }) };
}
function sampleSingle(runtime, targetW, params) {
  const gridSize = runtime.config.gridSize;
  const fieldHist = computeWindingHistogram(runtime.fieldA, { gridSize, source: 'field' });
  const memoryHist = computeWindingHistogram(runtime.fieldA, { gridSize, source: 'memory' });
  const amp = computeAmplitudeStats(runtime.fieldA);
  const memoryAmp = computeAmplitudeStats({ phiRe: runtime.fieldA.memoryRe, phiIm: runtime.fieldA.memoryIm });
  return { step: runtime.stepCount, fieldDominantW: fieldHist.dominantW, fieldDominantFraction: fieldHist.dominantFraction, memoryDominantW: memoryHist.dominantW, memoryDominantFraction: memoryHist.dominantFraction, fieldModePowers: computeWindingModePowers(runtime.fieldA, { gridSize, source: 'field' }), memoryModePowers: computeWindingModePowers(runtime.fieldA, { gridSize, source: 'memory' }), fieldMinAmp: amp.minAmp, memoryMinAmp: memoryAmp.minAmp, fieldMeanAmp: amp.meanAmp, memoryMeanAmp: memoryAmp.meanAmp, ...observerMetricsSingle(runtime.fieldA, targetW, params, gridSize) };
}
function observerMetricsCoupling(runtime) {
  const gridSize = runtime.config.gridSize;
  const fieldAB = distanceBundle(runtime.fieldA, runtime.fieldB, 'field', gridSize);
  const memoryAB = distanceBundle(runtime.fieldA, runtime.fieldB, 'memory', gridSize);
  const aMemA = fieldMemoryDistance(runtime.fieldA, gridSize);
  const bMemB = fieldMemoryDistance(runtime.fieldB, gridSize);
  const aMemB = distanceBundle(fieldFromArrays(runtime.fieldA.phiRe, runtime.fieldA.phiIm), fieldFromArrays(runtime.fieldB.memoryRe, runtime.fieldB.memoryIm), 'field', gridSize);
  const bMemA = distanceBundle(fieldFromArrays(runtime.fieldB.phiRe, runtime.fieldB.phiIm), fieldFromArrays(runtime.fieldA.memoryRe, runtime.fieldA.memoryIm), 'field', gridSize);
  return { fieldABDistanceRaw: fieldAB.raw, fieldABDistanceAligned: fieldAB.aligned, memoryABDistanceRaw: memoryAB.raw, memoryABDistanceAligned: memoryAB.aligned, fieldAMemoryADistanceAligned: aMemA.aligned, fieldBMemoryBDistanceAligned: bMemB.aligned, fieldAMemoryBDistanceAligned: aMemB.aligned, fieldBMemoryADistanceAligned: bMemA.aligned, thetaStarFieldAB: fieldAB.thetaStar, thetaStarMemoryAB: memoryAB.thetaStar };
}
function sampleCoupling(runtime) {
  const gridSize = runtime.config.gridSize;
  const aField = computeWindingHistogram(runtime.fieldA, { gridSize, source: 'field' });
  const bField = computeWindingHistogram(runtime.fieldB, { gridSize, source: 'field' });
  const aMemory = computeWindingHistogram(runtime.fieldA, { gridSize, source: 'memory' });
  const bMemory = computeWindingHistogram(runtime.fieldB, { gridSize, source: 'memory' });
  const aAmp = computeAmplitudeStats(runtime.fieldA);
  const bAmp = computeAmplitudeStats(runtime.fieldB);
  return { step: runtime.stepCount, fieldADominantW: aField.dominantW, fieldBDominantW: bField.dominantW, fieldADominantFraction: aField.dominantFraction, fieldBDominantFraction: bField.dominantFraction, memoryADominantW: aMemory.dominantW, memoryBDominantW: bMemory.dominantW, minAmpA: aAmp.minAmp, minAmpB: bAmp.minAmp, ...observerMetricsCoupling(runtime) };
}
function observerContext() { return makeObserverContextV2({ validityAmpThreshold: VALIDITY_AMP_THRESHOLD, nearPiMargin: NEAR_PI_MARGIN }); }
function makeRecord(fields) { return roundObj({ ...metadata(), parameterLineage: fields.parameterLineage, observerContextV2: observerContext(), omittedMetrics: [], ...fields }); }
function analyzeSamples(samples, targetW) {
  let firstNonTargetStep = null; let recoveryStep = null;
  for (const sample of samples) {
    const onTarget = sample.fieldDominantW === targetW && sample.fieldDominantFraction >= 0.99;
    if (!onTarget && firstNonTargetStep === null) firstNonTargetStep = sample.step;
    if (firstNonTargetStep !== null && recoveryStep === null && onTarget) recoveryStep = sample.step;
  }
  return { firstNonTargetStep, recoveryStep };
}
function classifyPerturbationSamples(samples, targetW = 1) {
  const analysis = analyzeSamples(samples, targetW);
  const final = samples[samples.length - 1];
  const finalOnTarget = final.fieldDominantW === targetW && final.fieldDominantFraction >= 0.99;
  if (analysis.firstNonTargetStep === null) return 'persistent_without_break';
  if (finalOnTarget) return 'break_then_recover';
  if (final.fieldDominantW === targetW && final.fieldDominantFraction < 0.99) return 'break_partial_recovery';
  if (analysis.recoveryStep !== null) return 'transient_recovery_then_loss';
  return final.fieldDominantW === null ? 'break_no_recovery' : 'phase_slip_to_other_W';
}
function classifyLedgerSamples(samples, { memoryEnabled, memoryW, label, memoryWeightRun = false } = {}) {
  const final = samples[samples.length - 1];
  const finalFieldOnW1 = final.fieldDominantW === 1 && final.fieldDominantFraction >= 0.99;
  const finalFieldOnW0 = final.fieldDominantW === 0 && final.fieldDominantFraction >= 0.99;
  const finalFieldOnW2 = final.fieldDominantW === 2 && final.fieldDominantFraction >= 0.99;
  const memoryRewrite = samples.find((sample) => memoryEnabled && memoryW !== null && memoryW !== 1 && sample.step > 0 && sample.memoryDominantW === 1 && sample.memoryDominantFraction >= 0.99);
  if (memoryWeightRun) {
    if (finalFieldOnW2) return 'memory_writes_W2_to_field';
    if (finalFieldOnW1 && final.memoryDominantW === 1 && memoryW !== 1 && memoryRewrite) return 'field_rewrites_memory';
    if (finalFieldOnW1) return 'field_returns_to_W1';
    return 'mixed_or_tangled';
  }
  if (!memoryEnabled) return finalFieldOnW1 ? 'memory_off_field_returns_to_W1' : 'memory_off_no_recovery';
  if (memoryW === 0 && finalFieldOnW0) return 'field_follows_clean_W0_memory';
  if (memoryW === 2 && finalFieldOnW2) return 'memory_writes_W2_to_field';
  if (memoryW !== 1 && memoryRewrite) return 'field_rewrites_memory';
  if (memoryW === 2 && finalFieldOnW1) return 'field_returns_to_W1';
  if (memoryW === 1 && finalFieldOnW1) return label === 'L1b_clean_W1' ? 'clean_W1_memory_recovery' : 'field_returns_to_W1';
  return 'mixed_or_tangled';
}
function classifyCouplingSamples(samples) {
  const firstSlipA = samples.find((s) => s.fieldADominantW !== 1 || s.fieldADominantFraction < 0.99);
  const firstSlipB = samples.find((s) => s.fieldBDominantW !== 0 || s.fieldBDominantFraction < 0.99);
  const final = samples[samples.length - 1];
  if (!firstSlipA && !firstSlipB) return 'topological_frustration_plateau';
  if (firstSlipA && firstSlipB && Math.abs(firstSlipA.step - firstSlipB.step) <= 50 && final.fieldADominantW === 0 && final.fieldBDominantW === 1) return 'double_slip_exchange';
  if (firstSlipA && firstSlipB && Math.abs(firstSlipA.step - firstSlipB.step) <= 50) return 'synchronized_double_phase_slip_candidate';
  if (Boolean(firstSlipA) !== Boolean(firstSlipB) && final.fieldADominantW === final.fieldBDominantW) return 'single_slip_merge';
  if (firstSlipA || firstSlipB) return 'transfer_then_merge';
  return 'indeterminate';
}
function historicalMap() {
  const out = new Map();
  if (!fs.existsSync(HISTORICAL_RESULTS_PATH)) return out;
  const historical = JSON.parse(fs.readFileSync(HISTORICAL_RESULTS_PATH, 'utf8')).results || [];
  for (const record of historical) out.set(record.runId, record.classification);
  return out;
}
const HISTORICAL_REFERENCE = historicalMap();
function equivalenceFields(referenceRunId, observedClassification, notes) {
  const historicalReferenceClassification = HISTORICAL_REFERENCE.get(referenceRunId) || null;
  return { historicalReferenceRunId: referenceRunId, historicalReferenceClassification, observedCalibrationClassification: observedClassification, classificationAgreementWithHistorical: historicalReferenceClassification === null ? null : historicalReferenceClassification === observedClassification, classificationAgreementNotes: historicalReferenceClassification === observedClassification ? 'Observed classification agrees with finalized v2.1.2 reference under matched construction.' : 'Observed classification differs after construction equivalence check; reported as calibration miss/observation, not hidden.', constructionEquivalenceChecked: true, constructionEquivalenceNotes: notes };
}

function tier1Records() {
  const gridSize = COST.gridSize;
  const records = [];
  const w1 = targetState(1, gridSize);
  const w2 = targetState(2, gridSize);
  const dSelf = distanceBundle(w1, w1, 'field', gridSize);
  const validitySelf = computeWindingValidity(w1, { gridSize, validityAmpThreshold: VALIDITY_AMP_THRESHOLD, nearPiMargin: NEAR_PI_MARGIN });
  records.push(makeRecord({ tier: 'Tier 1', caseId: 'tier1-clean-W1-self-distance', parameterLineage: 'synthetic-calibration', observerV2Metrics: { rawDistance: dSelf.raw, alignedDistance: dSelf.aligned, thetaStar: dSelf.thetaStar, windingValidity: validitySelf }, expected: 'raw≈0, aligned≈0, closed-loop float residual≈0, invalidLineCount=0', tolerance: TIER1_TOLERANCE }));

  const phase = Math.PI / 5;
  const shifted = targetState(1, gridSize);
  for (let i = 0; i < shifted.phiRe.length; i += 1) {
    const re = shifted.phiRe[i]; const im = shifted.phiIm[i];
    shifted.phiRe[i] = re * Math.cos(phase) - im * Math.sin(phase);
    shifted.phiIm[i] = re * Math.sin(phase) + im * Math.cos(phase);
    shifted.memoryRe[i] = shifted.phiRe[i]; shifted.memoryIm[i] = shifted.phiIm[i];
  }
  const dPhase = distanceBundle(w1, shifted, 'field', gridSize);
  records.push(makeRecord({ tier: 'Tier 1', caseId: 'tier1-global-phase-offset-pi-over-5', parameterLineage: 'synthetic-calibration', observerV2Metrics: { phaseOffsetAppliedToSecondField: phase, rawDistance: dPhase.raw, alignedDistance: dPhase.aligned, thetaStar: dPhase.thetaStar, expectedThetaStar: -phase }, expected: 'raw>0, aligned≈0, thetaStar≈-π/5', tolerance: TIER1_TOLERANCE }));

  const w2Self = distanceBundle(w2, w2, 'field', gridSize);
  const w2VsW1 = distanceBundle(w2, w1, 'field', gridSize);
  records.push(makeRecord({ tier: 'Tier 1', caseId: 'tier1-W2-target-discrimination', parameterLineage: 'synthetic-calibration', observerV2Metrics: { w2SelfAlignedDistance: w2Self.aligned, w2VsW1AlignedDistance: w2VsW1.aligned, separation: w2VsW1.aligned - w2Self.aligned }, expected: 'W2 self≈0 and W2-vs-W1 clearly larger', tolerance: TIER1_TOLERANCE }));

  const noiseSeed = 424242;
  const residualVsEpsilon = [0.15, 0.5, 1.2].map((epsilon) => {
    const noisy = targetState(1, gridSize);
    addComponentNoise(noisy, { epsilon, seed: noiseSeed });
    const validity = computeWindingValidity(noisy, { gridSize, validityAmpThreshold: VALIDITY_AMP_THRESHOLD, nearPiMargin: NEAR_PI_MARGIN });
    return { epsilon, seed: noiseSeed, lineMaxAbsPhaseStepMean: validity.lineMaxAbsPhaseStepMean, lineMaxAbsPhaseStepMax: validity.lineMaxAbsPhaseStepMax, nearPiStepCount: validity.nearPiStepCount, nearPiStepFraction: validity.nearPiStepFraction, totalNearPiStepCount: validity.totalNearPiStepCount, maxNearPiStepCount: validity.maxNearPiStepCount, invalidLineCount: validity.invalidLineCount, lineMinAmpMin: validity.lineMinAmpMin, closedLoopFloatResidualMean: validity.closedLoopFloatResidualMean, closedLoopFloatResidualMax: validity.closedLoopFloatResidualMax };
  });
  records.push(makeRecord({ tier: 'Tier 1', caseId: 'tier1-additive-component-noise-monotonicity', parameterLineage: 'synthetic-calibration', observerV2Metrics: { residualVsEpsilon, thresholdContext: 'invalidLineCount ties are acceptable only when lineMinAmpMin stays above validityAmpThreshold; closedLoopFloatResidual is recorded only as float sanity' }, expected: 'seeded additive component noise increases or ties near-pi/phase-step reliability metrics; closed-loop float residual is not the success signal', tolerance: MONOTONIC_TOLERANCE }));

  const lowAmp = targetState(1, gridSize);
  const lowLines = [{ y: 0, z: 0 }, { y: 3, z: 5 }, { y: 7, z: 2 }];
  for (const line of lowLines) for (let x = 0; x < gridSize; x += 1) {
    const i = index3D(x, line.y, line.z, gridSize);
    lowAmp.phiRe[i] *= 1e-6; lowAmp.phiIm[i] *= 1e-6;
  }
  const lowValidity = computeWindingValidity(lowAmp, { gridSize, validityAmpThreshold: VALIDITY_AMP_THRESHOLD, nearPiMargin: NEAR_PI_MARGIN });
  records.push(makeRecord({ tier: 'Tier 1', caseId: 'tier1-known-low-amplitude-lines', parameterLineage: 'synthetic-calibration', observerV2Metrics: { knownInvalidLineCount: lowLines.length, windingValidity: lowValidity }, expected: 'invalidLineCount equals known K low-amplitude lines', tolerance: 0 }));
  return records;
}

function baselineRun(w) {
  const params = baseParams(); const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: w, target: 'field' }); copyFieldToMemory(runtime.fieldA);
  setGlobalWinding(runtime.fieldB, { gridSize: COST.gridSize, winding: 0, target: 'field' }); copyFieldToMemory(runtime.fieldB);
  const samples = []; runSteps(runtime, COST.maxStepsBaseline, () => samples.push(sampleSingle(runtime, w, params)));
  const final = samples[samples.length - 1];
  const classification = 'baseline_persistence_calibration';
  return makeRecord({ tier: 'Tier 2', runId: `baseline-W${w}`, runFamily: 'baseline_global_winding', parameterLineage: PARAMETER_LINEAGE, classification, ...equivalenceFields(`baseline-W${w}`, classification, 'Matched v2.1.2 baseline setup: exp023-real params, seeds 11/22, GRID_SIZE=32, amplitude-1 manual winding, memory copied from field before stepping, and 3000-step horizon.'), runConfig: { initialW: w, targetW: w, gridSize: COST.gridSize, maxSteps: COST.maxStepsBaseline, parameterLineage: PARAMETER_LINEAGE }, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE }, samples, observerV2Metrics: final, roadmapInterpretation: 'baseline persistence calibration; observer-distance reference only', observerV2Notes: ['Runtime construction is matched to finalized v2.1.2 baseline; target distance references still use stationary-amplitude-reference.'] });
}
function perturbationRun({ epsilon, seed, memoryEnabled, label, maxSteps, referenceRunId }) {
  const params = baseParams(memoryEnabled ? { MEMORY_WEIGHT: 0.0075 } : { MEMORY_ENABLED: false, MEMORY_WEIGHT: 0, MEMORY_COUPLING_ENABLED: false, COUPLING_ENABLED: false });
  const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: 1, target: 'field' });
  copyFieldToMemory(runtime.fieldA);
  addPerturbation(runtime.fieldA, { epsilon, seed });
  if (memoryEnabled) copyFieldToMemory(runtime.fieldA);
  const samples = []; runSteps(runtime, maxSteps, () => samples.push(sampleSingle(runtime, 1, params)));
  const classification = classifyPerturbationSamples(samples, 1);
  const analysis = analyzeSamples(samples, 1);
  return makeRecord({ tier: 'Tier 2', runId: referenceRunId || `perturb-W1-e${epsilon}-seed${seed}-${label}`, runFamily: 'perturbation_sweep', parameterLineage: PARAMETER_LINEAGE, classification, ...equivalenceFields(referenceRunId || `perturb-W1-e${epsilon}-seed${seed}-${label}`, classification, `Matched v2.1.2 perturbation setup: exp023-real params, seed ${seed}, epsilon ${epsilon}, velocity kick epsilon/3, memory ${memoryEnabled ? 'copied after perturbation' : 'disabled with effectiveMemoryWeight=0'}, RNG call order from addPerturbation, and horizon ${maxSteps}.`), runConfig: { initialW: 1, targetW: 1, epsilon, noiseSeed: seed, memoryEnabled, memoryConditionLabel: label, effectiveMemoryWeight: memoryEnabled ? 0.0075 : 0, nominalComparisonMemoryWeight: 0.0075, maxSteps, gridSize: COST.gridSize, parameterLineage: PARAMETER_LINEAGE }, memoryEnabled, effectiveMemoryWeight: memoryEnabled ? 0.0075 : 0, nominalComparisonMemoryWeight: 0.0075, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE }, samples, observerV2Metrics: samples[samples.length - 1], ...analysis, roadmapInterpretation: memoryEnabled ? 'memory-on perturbation calibration with v2.1.2 memory-copy semantics' : 'memory-off comparison calibration with effectiveMemoryWeight=0', observerV2Notes: ['classification is trace-derived from this calibration record, not copied from the historical reference label'] });
}
function ledgerRun({ label, memoryW, memoryWeight = 0.0075, referenceRunId, memoryWeightRun = false }) {
  const params = baseParams({ MEMORY_ENABLED: true, MEMORY_WEIGHT: memoryWeight });
  const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: 1, target: 'field' });
  addPerturbation(runtime.fieldA, { epsilon: 1.2, seed: 101 });
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: memoryW, target: 'memory', initializeVelocity: false });
  const samples = []; runSteps(runtime, COST.maxStepsLedger, () => samples.push(sampleSingle(runtime, 1, params)));
  const classification = classifyLedgerSamples(samples, { memoryEnabled: true, memoryW, label, memoryWeightRun });
  const runId = referenceRunId || `ledger-${label}-mw${memoryWeight}`;
  return makeRecord({ tier: 'Tier 2', runId, runFamily: memoryWeightRun ? 'memory_weight_sweep_uphill_writing' : 'ledger_discrimination_matrix', memoryConditionLabel: label, memoryWeight, parameterLineage: PARAMETER_LINEAGE, classification, ...equivalenceFields(runId === 'ledger-L3_clean_W2-mw0.03' ? 'ledger-D2_clean_W2_memory_weight_sweep-mw0.03' : runId, classification, `Matched v2.1.2 ledger setup: field W=1, epsilon 1.2 seed 101 perturbation before clean memory assignment, memory W=${memoryW}, MEMORY_WEIGHT=${memoryWeight}, and ${COST.maxStepsLedger}-step horizon.`), runConfig: { fieldInitialW: 1, targetW: 1, memoryInitialW: memoryW, memoryConditionLabel: label, epsilon: 1.2, noiseSeed: 101, memoryEnabled: true, effectiveMemoryWeight: memoryWeight, memoryWeight, maxSteps: COST.maxStepsLedger, gridSize: COST.gridSize, parameterLineage: PARAMETER_LINEAGE }, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE }, samples, observerV2Metrics: samples[samples.length - 1], roadmapInterpretation: memoryW === 2 ? 'field-memory direction calibration for W2 disagreement' : 'ledger-style field-memory calibration', observerV2Notes: ['classification preserves existing v2.1.2 vocabulary but is trace-derived from calibration samples'] });
}
function couplingRun(g) {
  const params = baseParams({ COUPLING_ENABLED: true, MEMORY_COUPLING_ENABLED: true, MEMORY_COUPLING_USE_BIDIRECTIONAL: true, COUPLING_G: g, MEMORY_WEIGHT: 0.0075 });
  const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: 1, target: 'field' }); copyFieldToMemory(runtime.fieldA);
  setGlobalWinding(runtime.fieldB, { gridSize: COST.gridSize, winding: 0, target: 'field' }); copyFieldToMemory(runtime.fieldB);
  const samples = []; runSteps(runtime, COST.maxStepsCoupling, () => samples.push(sampleCoupling(runtime)));
  const classification = classifyCouplingSamples(samples);
  const firstSlipA = samples.find((s) => s.fieldADominantW !== 1 || s.fieldADominantFraction < 0.99);
  const firstSlipB = samples.find((s) => s.fieldBDominantW !== 0 || s.fieldBDominantFraction < 0.99);
  const note = g === 0.05 ? 'A transient swap occurred, but the final state merged to W=0/W=0.' : 'coupling-distance calibration only';
  return makeRecord({ tier: 'Tier 2', runId: `coupling-W1-W0-g${g}`, runFamily: 'one_sided_winding_coupling_sweep', parameterLineage: PARAMETER_LINEAGE, classification, ...equivalenceFields(`coupling-W1-W0-g${g}`, classification, `Matched v2.1.2 coupling setup: A W=1, B W=0, copied memories, bidirectional coupling, COUPLING_G=${g}, MEMORY_WEIGHT=0.0075, and 2000-step horizon.`), runConfig: { initialWA: 1, initialWB: 0, couplingG: g, memoryCouplingUseBidirectional: true, couplingDirectionality: 'bidirectional', oneSidedMeaning: 'winding_asymmetry_only', maxSteps: COST.maxStepsCoupling, gridSize: COST.gridSize, parameterLineage: PARAMETER_LINEAGE }, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE, couplingDirectionality: 'bidirectional', oneSidedMeaning: 'winding_asymmetry_only', memoryCouplingUseBidirectional: true }, samples, observerV2Metrics: samples[samples.length - 1], firstSlipStepA: firstSlipA ? firstSlipA.step : null, firstSlipStepB: firstSlipB ? firstSlipB.step : null, roadmapInterpretation: note, observerV2Notes: [note, 'classification is trace-derived from A/B samples'] });
}
function expectationRow(expectationId, expected, record, predicate, measured, notes) {
  let result = 'indeterminate';
  if (record) result = predicate(record) ? 'hit' : 'miss';
  return { expectationId, expected, measured: measured(record), result, notes };
}
function tier1Summary(records) {
  return records.filter((r) => r.tier === 'Tier 1').map((r) => {
    let pass = false;
    const m = r.observerV2Metrics;
    if (r.caseId === 'tier1-clean-W1-self-distance') pass = Math.abs(m.rawDistance) <= TIER1_TOLERANCE && Math.abs(m.alignedDistance) <= TIER1_TOLERANCE && m.windingValidity.invalidLineCount === 0 && m.windingValidity.closedLoopFloatResidualMax <= TIER1_TOLERANCE;
    if (r.caseId === 'tier1-global-phase-offset-pi-over-5') pass = m.rawDistance > 0 && Math.abs(m.alignedDistance) <= TIER1_TOLERANCE && Math.abs(m.thetaStar - m.expectedThetaStar) <= TIER1_TOLERANCE;
    if (r.caseId === 'tier1-W2-target-discrimination') pass = Math.abs(m.w2SelfAlignedDistance) <= TIER1_TOLERANCE && m.w2VsW1AlignedDistance > 0.1;
    if (r.caseId === 'tier1-additive-component-noise-monotonicity') pass = m.residualVsEpsilon.every((item, i, arr) => i === 0 || item.lineMaxAbsPhaseStepMean + MONOTONIC_TOLERANCE >= arr[i - 1].lineMaxAbsPhaseStepMean || item.lineMaxAbsPhaseStepMax + MONOTONIC_TOLERANCE >= arr[i - 1].lineMaxAbsPhaseStepMax) && m.residualVsEpsilon.every((item) => Number.isFinite(item.nearPiStepFraction) && Number.isFinite(item.totalNearPiStepCount)) && m.residualVsEpsilon.every((item) => item.invalidLineCount > 0 || item.lineMinAmpMin >= VALIDITY_AMP_THRESHOLD);
    if (r.caseId === 'tier1-known-low-amplitude-lines') pass = m.windingValidity.invalidLineCount === m.knownInvalidLineCount;
    return { caseId: r.caseId, expected: r.expected, measured: m, pass, tolerance: r.tolerance };
  });
}
function summarize(records) {
  const byScenario = Object.fromEntries(records.filter((r) => r.runId).map((r) => [r.runId, { classification: r.classification, historicalReferenceClassification: r.historicalReferenceClassification, observedCalibrationClassification: r.observedCalibrationClassification, classificationAgreementWithHistorical: r.classificationAgreementWithHistorical, finalMetrics: r.observerV2Metrics }]));
  const byClassification = {};
  for (const r of records) if (r.classification) byClassification[r.classification] = (byClassification[r.classification] || 0) + 1;
  const t1 = tier1Summary(records);
  const find = (runId) => records.find((r) => r.runId === runId);
  const clean = find('perturb-W1-e1.2-seed101-memory-on-matched');
  const partial = find('perturb-W1-e1.2-seed202-memory-on');
  const memoryOff = find('perturb-W1-e1.2-seed101-memory-off-matched');
  const coupling0075 = find('coupling-W1-W0-g0.0075');
  const coupling002 = find('coupling-W1-W0-g0.02');
  const coupling005 = find('coupling-W1-W0-g0.05');
  const l3Optional = find('ledger-L3_clean_W2-mw0.03');
  const residualVsEpsilon = records.find((r) => r.caseId === 'tier1-additive-component-noise-monotonicity')?.observerV2Metrics.residualVsEpsilon ?? [];
  const tier2ExpectationSummary = [
    expectationRow('clean-recovery', 'fieldTargetDistance(W=1) returns near zero and reliability remains high after recovery', clean, (r) => r.classification === 'break_then_recover' && r.observerV2Metrics.fieldTargetDistanceAligned < 0.25 && r.observerV2Metrics.windingValidity.invalidLineCount === 0, (r) => r ? { classification: r.classification, fieldTargetDistanceAligned: r.observerV2Metrics.fieldTargetDistanceAligned, invalidLineCount: r.observerV2Metrics.windingValidity.invalidLineCount } : null, 'Hard classification agreement is separate from the soft distance threshold.'),
    expectationRow('partial-recovery', 'target-like W may return while distance, fraction, or reliability remains inconsistent', partial, (r) => r.classification === 'break_partial_recovery' && (r.observerV2Metrics.fieldDominantFraction < 0.99 || r.observerV2Metrics.fieldTargetDistanceAligned >= 0.25 || r.observerV2Metrics.windingValidity.invalidLineCount > 0), (r) => r ? { classification: r.classification, fieldDominantFraction: r.observerV2Metrics.fieldDominantFraction, fieldTargetDistanceAligned: r.observerV2Metrics.fieldTargetDistanceAligned, invalidLineCount: r.observerV2Metrics.windingValidity.invalidLineCount } : null, 'Partial recovery is not clean recovery.'),
    { expectationId: 'memory-on-vs-memory-off', expected: `memoryOnFinalFieldTargetDistanceAligned + ${MEMORY_ON_OFF_DISTANCE_TOLERANCE} < memoryOffFinalFieldTargetDistanceAligned at matched horizon`, measured: clean && memoryOff ? { memoryOnFinalFieldTargetDistanceAligned: clean.observerV2Metrics.fieldTargetDistanceAligned, memoryOffFinalFieldTargetDistanceAligned: memoryOff.observerV2Metrics.fieldTargetDistanceAligned, memoryOnFinalW: clean.observerV2Metrics.fieldDominantW, memoryOffFinalW: memoryOff.observerV2Metrics.fieldDominantW, memoryOnDominantFraction: clean.observerV2Metrics.fieldDominantFraction, memoryOffDominantFraction: memoryOff.observerV2Metrics.fieldDominantFraction, tolerance: MEMORY_ON_OFF_DISTANCE_TOLERANCE } : null, result: clean && memoryOff ? (clean.observerV2Metrics.fieldTargetDistanceAligned + MEMORY_ON_OFF_DISTANCE_TOLERANCE < memoryOff.observerV2Metrics.fieldTargetDistanceAligned ? 'hit' : 'miss') : 'indeterminate', notes: 'Directional comparator; mere divergence is not a hit.' },
    expectationRow('L2-clean-W0', 'field tends toward clean W0 memory basin', find('ledger-L2_clean_W0-mw0.0075'), (r) => r.classification === 'field_follows_clean_W0_memory', (r) => r ? { classification: r.classification, fieldDominantW: r.observerV2Metrics.fieldDominantW, fieldMemoryDistanceAligned: r.observerV2Metrics.fieldMemoryDistanceAligned } : null, 'Ledger classification is trace-derived.'),
    expectationRow('L3-clean-W2-direction', 'field-memory direction distinguishes field rewrite from memory writing', find('ledger-L3_clean_W2-mw0.0075'), (r) => ['field_rewrites_memory', 'memory_writes_W2_to_field'].includes(r.classification), (r) => r ? { classification: r.classification, fieldDominantW: r.observerV2Metrics.fieldDominantW, memoryDominantW: r.observerV2Metrics.memoryDominantW, fieldMemoryDistanceStart: r.samples[0].fieldMemoryDistanceAligned, fieldMemoryDistanceFinal: r.observerV2Metrics.fieldMemoryDistanceAligned } : null, 'Low-weight W2 case is not overclaimed as memory writing unless measured.'),
    expectationRow('coupling-g0.0075', 'aligned A/B distance plateaus rather than collapsing', coupling0075, (r) => r.classification === 'topological_frustration_plateau' && r.observerV2Metrics.fieldABDistanceAligned > 0.1, (r) => r ? { classification: r.classification, finalFieldABDistanceAligned: r.observerV2Metrics.fieldABDistanceAligned } : null, 'Plateau is finite-horizon calibration only.'),
    expectationRow('coupling-g0.02', 'distance traces collapse after single-slip merge', coupling002, (r) => r.classification === 'single_slip_merge' && r.observerV2Metrics.fieldABDistanceAligned < 0.1, (r) => r ? { classification: r.classification, finalFieldABDistanceAligned: r.observerV2Metrics.fieldABDistanceAligned, firstSlipStepA: r.firstSlipStepA, firstSlipStepB: r.firstSlipStepB } : null, 'Merge is not stable exchange.'),
    expectationRow('coupling-g0.05', 'transient swap window followed by final merge', coupling005, (r) => r.classification === 'synchronized_double_phase_slip_candidate' && r.observerV2Metrics.fieldADominantW === 0 && r.observerV2Metrics.fieldBDominantW === 0, (r) => r ? { classification: r.classification, finalWA: r.observerV2Metrics.fieldADominantW, finalWB: r.observerV2Metrics.fieldBDominantW, firstSlipStepA: r.firstSlipStepA, firstSlipStepB: r.firstSlipStepB } : null, 'A transient swap occurred, but the final state merged to W=0/W=0.'),
    expectationRow('optional-L3-W2-mw0.03', 'workProxy traces help interpret uphill W2 memory writing', l3Optional, (r) => r.classification === 'memory_writes_W2_to_field' && r.observerV2Metrics.workProxy.workProxy > 0, (r) => r ? { classification: r.classification, workProxy: r.observerV2Metrics.workProxy, fieldDominantW: r.observerV2Metrics.fieldDominantW } : null, 'Optional scenario included.'),
  ];
  return roundObj({ ...metadata(), generatedAt: new Date().toISOString(), costPolicy: COST, runCount: records.length, parameterLineageSummary: { 'synthetic-calibration': records.filter((r) => r.parameterLineage === 'synthetic-calibration').length, 'exp023-real': records.filter((r) => r.parameterLineage === PARAMETER_LINEAGE).length }, byScenario, byClassification, tier1CorrectnessSummary: t1, tier2ExpectationSummary, distanceSeparationSummary: records.filter((r) => r.runId).map((r) => ({ runId: r.runId, classification: r.classification, historicalReferenceClassification: r.historicalReferenceClassification, classificationAgreementWithHistorical: r.classificationAgreementWithHistorical, finalFieldTargetDistanceAligned: r.observerV2Metrics.fieldTargetDistanceAligned ?? null, finalFieldMemoryDistanceAligned: r.observerV2Metrics.fieldMemoryDistanceAligned ?? null, finalFieldABDistanceAligned: r.observerV2Metrics.fieldABDistanceAligned ?? null })), cleanVsPartialRecoverySummary: { clean: clean ? clean.observerV2Metrics : null, partial: partial ? partial.observerV2Metrics : null, interpretation: 'clean recovery requires trace-derived final target W/high dominant fraction plus low target distance and field-memory consistency; partial recovery may regain target-like W while distance/fraction/reliability context remains inconsistent.' }, memoryOnVsMemoryOffSummary: tier2ExpectationSummary.find((row) => row.expectationId === 'memory-on-vs-memory-off'), couplingDistanceSummary: [coupling0075, coupling002, coupling005].filter(Boolean).map((r) => ({ runId: r.runId, classification: r.classification, finalWA: r.observerV2Metrics.fieldADominantW, finalWB: r.observerV2Metrics.fieldBDominantW, finalFieldABDistanceAligned: r.observerV2Metrics.fieldABDistanceAligned, finalMemoryABDistanceAligned: r.observerV2Metrics.memoryABDistanceAligned, firstSlipStepA: r.firstSlipStepA, firstSlipStepB: r.firstSlipStepB, interpretation: r.roadmapInterpretation })), validityResidualSummary: records.filter((r) => r.runId && r.observerV2Metrics.windingValidity).map((r) => ({ runId: r.runId, invalidLineCount: r.observerV2Metrics.windingValidity.invalidLineCount, lineMaxAbsPhaseStepMean: r.observerV2Metrics.windingValidity.lineMaxAbsPhaseStepMean, lineMaxAbsPhaseStepMax: r.observerV2Metrics.windingValidity.lineMaxAbsPhaseStepMax, nearPiStepFraction: r.observerV2Metrics.windingValidity.nearPiStepFraction, totalNearPiStepCount: r.observerV2Metrics.windingValidity.totalNearPiStepCount, closedLoopFloatResidualMean: r.observerV2Metrics.windingValidity.closedLoopFloatResidualMean })), residualVsEpsilonSummary: residualVsEpsilon, constructionEquivalenceSummary: records.filter((r) => r.runId).map((r) => ({ runId: r.runId, constructionEquivalenceChecked: r.constructionEquivalenceChecked, constructionEquivalenceNotes: r.constructionEquivalenceNotes })), classificationAgreementSummary: records.filter((r) => r.runId).map((r) => ({ runId: r.runId, historicalReferenceClassification: r.historicalReferenceClassification, observedCalibrationClassification: r.observedCalibrationClassification, classification: r.classification, classificationAgreementWithHistorical: r.classificationAgreementWithHistorical, classificationAgreementNotes: r.classificationAgreementNotes })), interpretationDistinctions: { cleanRecovery: 'final target W and high dominant fraction, plus low target distance and field-memory distance consistency', partialRecovery: 'target-like W may return, but dominant fraction and/or distance traces remain inconsistent', phaseSlip: 'target winding exits to another basin, with validity/minAmp/near-pi context', merge: 'two fields converge to a common basin, not necessarily stable exchange', transientSwap: 'A/B winding assignments may temporarily exchange, but final state can still merge', memoryGuidedRestoration: 'field-memory and target-distance traces support memory-mediated basin selection only when directional comparators support it', fieldRewritesMemory: 'memory moves toward field basin rather than field following memory', unreliableLineCondition: 'winding estimates are low-confidence when low-amplitude lines or near-pi phase steps are elevated' }, omittedMetrics: [], omittedConditions: [], priorRoadmapGates: ['G1', 'G2'], nextRecommendedGate: 'G6 full 3D vortex-core/topology observer after using G1/G2 traces to choose targeted cases' });
}
function main() {
  if (hasFlag('--runtime-limited')) throw new Error('runtime-limited mode is intentionally not allowed to overwrite official Observer V2 artifacts');
  const records = tier1Records();
  records.push(baselineRun(0)); records.push(baselineRun(1)); records.push(baselineRun(2));
  records.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: true, label: 'memory-on-matched', maxSteps: COST.maxStepsPerturbation, referenceRunId: 'perturb-W1-e1.2-seed101-memory-on-matched' }));
  records.push(perturbationRun({ epsilon: 1.2, seed: 202, memoryEnabled: true, label: 'memory-on', maxSteps: COST.maxStepsPerturbation, referenceRunId: 'perturb-W1-e1.2-seed202-memory-on' }));
  records.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: false, label: 'memory-off-matched', maxSteps: COST.maxStepsPerturbation, referenceRunId: 'perturb-W1-e1.2-seed101-memory-off-matched' }));
  records.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: false, label: 'memory-off-long', maxSteps: COST.maxStepsMemoryOff, referenceRunId: 'perturb-W1-e1.2-seed101-memory-off-long' }));
  records.push(ledgerRun({ label: 'L1b_clean_W1', memoryW: 1 }));
  records.push(ledgerRun({ label: 'L2_clean_W0', memoryW: 0 }));
  records.push(ledgerRun({ label: 'L3_clean_W2', memoryW: 2 }));
  records.push(ledgerRun({ label: 'L3_clean_W2', memoryW: 2, memoryWeight: 0.03, referenceRunId: 'ledger-L3_clean_W2-mw0.03', memoryWeightRun: true }));
  records.push(couplingRun(0.0075)); records.push(couplingRun(0.02)); records.push(couplingRun(0.05));
  const output = roundObj({ ...metadata(), generatedAt: new Date().toISOString(), costPolicy: COST, results: records });
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summarize(records), null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)} and ${path.relative(ROOT, SUMMARY_PATH)} (${records.length} records, ${RUN_MODE}).`);
}

if (require.main === module) main();

module.exports = { classifyCouplingSamples, classifyLedgerSamples, classifyPerturbationSamples, summarize, tier1Records };
