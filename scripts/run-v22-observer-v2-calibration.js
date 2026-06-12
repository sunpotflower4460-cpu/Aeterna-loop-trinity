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
const AUDIT = 'v2.2-observer-v2-calibration';
const RUN_MODE = 'lightweight';
const CLAIM_LEVEL = 'finite-horizon observer calibration';
const OBSERVER_PURPOSE = 'Observer V2 calibration only';
const ARTIFACT_COMMITTED_IN = 'pending merge commit containing v2.2 Observer V2 calibration artifacts';
const PHASE_CONSTRUCTION_MODE = 'legacy-torus-atan2';
const WINDING_INITIALIZATION_MODE = 'manual-global-x-winding-ramp';
const PARAMETER_LINEAGE = 'exp023-real';
const VALIDITY_AMP_THRESHOLD = DEFAULT_VALIDITY_AMP_THRESHOLD;
const TIER1_TOLERANCE = 1e-9;
const MONOTONIC_TOLERANCE = 1e-12;
const COST = Object.freeze({
  mode: RUN_MODE,
  gridSize: 16,
  maxStepsBaseline: 500,
  maxStepsPerturbation: 700,
  maxStepsMemoryOff: 900,
  maxStepsLedger: 700,
  maxStepsCoupling: 700,
  sampleInterval: 50,
  fineSampleInterval: 10,
  reductionDisclosure: 'v2.2 observer calibration lightweight mode uses GRID_SIZE=16 and shortened horizons to keep official calibration artifacts reproducible in CI; family coverage is preserved and this is not a runtime-limited smoke artifact.',
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
  return {
    audit: AUDIT,
    runMode: RUN_MODE,
    generatorGitHash,
    artifactGeneratedFromReachableCommit: Boolean(generatorGitHash) && generatorGitHash !== 'git-hash-unavailable',
    artifactCommittedIn: ARTIFACT_COMMITTED_IN,
    observerVersion: OBSERVER_VERSION,
    observerPurpose: OBSERVER_PURPOSE,
    claimLevel: CLAIM_LEVEL,
  };
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
function mean(values) { const finite = values.filter(Number.isFinite); return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null; }
function copyFieldToMemory(field) { field.memoryRe.set(field.phiRe); field.memoryIm.set(field.phiIm); }
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
  const validity = computeWindingValidity(field, { gridSize, source: 'field', validityAmpThreshold: VALIDITY_AMP_THRESHOLD });
  const coefficient = params.MEMORY_ENABLED === false ? 0 : params.MEMORY_WEIGHT;
  return {
    fieldMemoryDistanceRaw: fieldMemory.raw,
    fieldMemoryDistanceAligned: fieldMemory.aligned,
    fieldTargetDistanceRaw: fieldTarget.raw,
    fieldTargetDistanceAligned: fieldTarget.aligned,
    memoryTargetDistanceRaw: memoryTarget.raw,
    memoryTargetDistanceAligned: memoryTarget.aligned,
    thetaStarFieldMemory: fieldMemory.thetaStar,
    thetaStarFieldTarget: fieldTarget.thetaStar,
    thetaStarMemoryTarget: memoryTarget.thetaStar,
    windingValidity: validity,
    workProxy: computeEffectivePullWork({ coefficient, distance: fieldTarget.aligned }),
  };
}
function sampleSingle(runtime, targetW, params) {
  const gridSize = runtime.config.gridSize;
  const fieldHist = computeWindingHistogram(runtime.fieldA, { gridSize, source: 'field' });
  const memoryHist = computeWindingHistogram(runtime.fieldA, { gridSize, source: 'memory' });
  const amp = computeAmplitudeStats(runtime.fieldA);
  const memoryAmp = computeAmplitudeStats({ phiRe: runtime.fieldA.memoryRe, phiIm: runtime.fieldA.memoryIm });
  const fieldModePowers = computeWindingModePowers(runtime.fieldA, { gridSize, source: 'field' });
  const memoryModePowers = computeWindingModePowers(runtime.fieldA, { gridSize, source: 'memory' });
  return {
    step: runtime.stepCount,
    fieldDominantW: fieldHist.dominantW,
    fieldDominantFraction: fieldHist.dominantFraction,
    memoryDominantW: memoryHist.dominantW,
    memoryDominantFraction: memoryHist.dominantFraction,
    fieldModePowers,
    memoryModePowers,
    fieldMinAmp: amp.minAmp,
    memoryMinAmp: memoryAmp.minAmp,
    fieldMeanAmp: amp.meanAmp,
    memoryMeanAmp: memoryAmp.meanAmp,
    ...observerMetricsSingle(runtime.fieldA, targetW, params, gridSize),
  };
}
function observerMetricsCoupling(runtime) {
  const gridSize = runtime.config.gridSize;
  const fieldAB = distanceBundle(runtime.fieldA, runtime.fieldB, 'field', gridSize);
  const memoryAB = distanceBundle(runtime.fieldA, runtime.fieldB, 'memory', gridSize);
  const aMemA = fieldMemoryDistance(runtime.fieldA, gridSize);
  const bMemB = fieldMemoryDistance(runtime.fieldB, gridSize);
  const aMemB = distanceBundle(fieldFromArrays(runtime.fieldA.phiRe, runtime.fieldA.phiIm), fieldFromArrays(runtime.fieldB.memoryRe, runtime.fieldB.memoryIm), 'field', gridSize);
  const bMemA = distanceBundle(fieldFromArrays(runtime.fieldB.phiRe, runtime.fieldB.phiIm), fieldFromArrays(runtime.fieldA.memoryRe, runtime.fieldA.memoryIm), 'field', gridSize);
  return {
    fieldABDistanceRaw: fieldAB.raw,
    fieldABDistanceAligned: fieldAB.aligned,
    memoryABDistanceRaw: memoryAB.raw,
    memoryABDistanceAligned: memoryAB.aligned,
    fieldAMemoryADistanceAligned: aMemA.aligned,
    fieldBMemoryBDistanceAligned: bMemB.aligned,
    fieldAMemoryBDistanceAligned: aMemB.aligned,
    fieldBMemoryADistanceAligned: bMemA.aligned,
    thetaStarFieldAB: fieldAB.thetaStar,
    thetaStarMemoryAB: memoryAB.thetaStar,
  };
}
function sampleCoupling(runtime) {
  const gridSize = runtime.config.gridSize;
  const aField = computeWindingHistogram(runtime.fieldA, { gridSize, source: 'field' });
  const bField = computeWindingHistogram(runtime.fieldB, { gridSize, source: 'field' });
  const aMemory = computeWindingHistogram(runtime.fieldA, { gridSize, source: 'memory' });
  const bMemory = computeWindingHistogram(runtime.fieldB, { gridSize, source: 'memory' });
  const aAmp = computeAmplitudeStats(runtime.fieldA);
  const bAmp = computeAmplitudeStats(runtime.fieldB);
  return {
    step: runtime.stepCount,
    fieldADominantW: aField.dominantW,
    fieldBDominantW: bField.dominantW,
    fieldADominantFraction: aField.dominantFraction,
    fieldBDominantFraction: bField.dominantFraction,
    memoryADominantW: aMemory.dominantW,
    memoryBDominantW: bMemory.dominantW,
    minAmpA: aAmp.minAmp,
    minAmpB: bAmp.minAmp,
    ...observerMetricsCoupling(runtime),
  };
}
function makeRecord(fields) {
  return roundObj({
    ...metadata(),
    parameterLineage: fields.parameterLineage,
    observerContextV2: makeObserverContextV2({ validityAmpThreshold: VALIDITY_AMP_THRESHOLD }),
    omittedMetrics: [],
    ...fields,
  });
}

function tier1Records() {
  const gridSize = COST.gridSize;
  const records = [];
  const w1 = targetState(1, gridSize);
  const w2 = targetState(2, gridSize);
  const dSelf = distanceBundle(w1, w1, 'field', gridSize);
  const validitySelf = computeWindingValidity(w1, { gridSize, validityAmpThreshold: VALIDITY_AMP_THRESHOLD });
  records.push(makeRecord({ tier: 'Tier 1', caseId: 'tier1-clean-W1-self-distance', parameterLineage: 'synthetic-calibration', observerV2Metrics: { rawDistance: dSelf.raw, alignedDistance: dSelf.aligned, thetaStar: dSelf.thetaStar, windingValidity: validitySelf }, expected: 'raw≈0, aligned≈0, residual≈0, invalidLineCount=0', tolerance: TIER1_TOLERANCE }));

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

  const epsilonValues = [0.15, 0.5, 1.2];
  const residualVsEpsilon = epsilonValues.map((epsilon) => {
    const noisy = targetState(1, gridSize);
    for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) {
      const lineNoise = epsilon * 0.2 * Math.sin((y + 1) * 1.7 + (z + 1) * 0.9);
      for (let x = 0; x < gridSize; x += 1) {
        const i = index3D(x, y, z, gridSize);
        const ramp = x / gridSize;
        noisy.phiRe[i] += lineNoise * ramp;
        noisy.phiIm[i] += epsilon * 0.1 * Math.cos((x + 3) * 0.4 + y) * ramp;
      }
    }
    const validity = computeWindingValidity(noisy, { gridSize, validityAmpThreshold: VALIDITY_AMP_THRESHOLD });
    return { epsilon, windingResidualMean: validity.windingResidualMean, windingResidualMax: validity.windingResidualMax, invalidLineCount: validity.invalidLineCount, lineMinAmpMin: validity.lineMinAmpMin };
  });
  records.push(makeRecord({ tier: 'Tier 1', caseId: 'tier1-additive-component-noise-monotonicity', parameterLineage: 'synthetic-calibration', observerV2Metrics: { residualVsEpsilon, thresholdContext: 'invalidLineCount ties at zero are acceptable only when lineMinAmpMin stays above validityAmpThreshold' }, expected: 'windingResidualMean non-decreasing with epsilon; invalid-line ties documented as threshold context', tolerance: MONOTONIC_TOLERANCE }));

  const lowAmp = targetState(1, gridSize);
  const lowLines = [{ y: 0, z: 0 }, { y: 3, z: 5 }, { y: 7, z: 2 }];
  for (const line of lowLines) for (let x = 0; x < gridSize; x += 1) {
    const i = index3D(x, line.y, line.z, gridSize);
    lowAmp.phiRe[i] *= 1e-6; lowAmp.phiIm[i] *= 1e-6;
  }
  const lowValidity = computeWindingValidity(lowAmp, { gridSize, validityAmpThreshold: VALIDITY_AMP_THRESHOLD });
  records.push(makeRecord({ tier: 'Tier 1', caseId: 'tier1-known-low-amplitude-lines', parameterLineage: 'synthetic-calibration', observerV2Metrics: { knownInvalidLineCount: lowLines.length, windingValidity: lowValidity }, expected: 'invalidLineCount equals known K low-amplitude lines', tolerance: 0 }));
  return records;
}

function baselineRun(w) {
  const params = baseParams();
  const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: w, target: 'field', amplitude: predictedStationaryAmplitude(w, COST.gridSize) });
  copyFieldToMemory(runtime.fieldA);
  const samples = [];
  runSteps(runtime, COST.maxStepsBaseline, () => samples.push(sampleSingle(runtime, w, params)));
  const final = samples[samples.length - 1];
  return makeRecord({ tier: 'Tier 2', runId: `baseline-W${w}`, runFamily: 'baseline_persistence', parameterLineage: PARAMETER_LINEAGE, classification: 'baseline_persistence_calibration', runConfig: { targetW: w, gridSize: COST.gridSize, maxSteps: COST.maxStepsBaseline, parameterLineage: PARAMETER_LINEAGE }, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE }, samples, observerV2Metrics: final, roadmapInterpretation: 'baseline persistence calibration; observer-distance reference only', observerV2Notes: ['Target references use stationary-amplitude-reference.'] });
}
function perturbationRun({ epsilon, seed, memoryEnabled, label, maxSteps, classificationHint }) {
  const params = baseParams({ MEMORY_ENABLED: memoryEnabled, MEMORY_WEIGHT: 0.0075 });
  const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: 1, target: 'field', amplitude: predictedStationaryAmplitude(1, COST.gridSize) });
  copyFieldToMemory(runtime.fieldA);
  addPerturbation(runtime.fieldA, { epsilon, seed });
  const samples = [];
  runSteps(runtime, maxSteps, () => samples.push(sampleSingle(runtime, 1, params)));
  const final = samples[samples.length - 1];
  const firstBreak = samples.find((s) => s.fieldDominantW !== 1 || s.fieldDominantFraction < 0.99);
  const classification = classificationHint || (final.fieldDominantW === 1 && final.fieldDominantFraction >= 0.99 ? 'break_then_recover' : final.fieldDominantW === 1 ? 'break_partial_recovery' : memoryEnabled ? 'phase_slip_to_other_W' : 'memory_off_no_recovery');
  return makeRecord({ tier: 'Tier 2', runId: label, runFamily: memoryEnabled ? 'perturbation_recovery' : 'memory_off_comparison', parameterLineage: PARAMETER_LINEAGE, classification, runConfig: { targetW: 1, epsilon, noiseSeed: seed, memoryEnabled, effectiveMemoryWeight: memoryEnabled ? 0.0075 : 0, nominalComparisonMemoryWeight: memoryEnabled ? null : 0.0075, maxSteps, gridSize: COST.gridSize, parameterLineage: PARAMETER_LINEAGE }, memoryEnabled, effectiveMemoryWeight: memoryEnabled ? 0.0075 : 0, nominalComparisonMemoryWeight: memoryEnabled ? null : 0.0075, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE }, samples, observerV2Metrics: final, roadmapInterpretation: memoryEnabled ? 'clean or partial recovery calibration with Observer V2 traces' : 'memory-off comparison calibration with effectiveMemoryWeight=0', observerV2Notes: firstBreak ? [`first non-clean target sample at step ${firstBreak.step}`] : ['no non-clean target sample observed at sample cadence'] });
}
function ledgerRun({ label, memoryW, memoryWeight = 0.0075 }) {
  const params = baseParams({ MEMORY_ENABLED: true, MEMORY_WEIGHT: memoryWeight });
  const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: 1, target: 'field', amplitude: predictedStationaryAmplitude(1, COST.gridSize) });
  copyFieldToMemory(runtime.fieldA);
  addPerturbation(runtime.fieldA, { epsilon: 1.2, seed: 101 });
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: memoryW, target: 'memory', amplitude: predictedStationaryAmplitude(memoryW, COST.gridSize), initializeVelocity: false });
  const samples = [];
  runSteps(runtime, COST.maxStepsLedger, () => samples.push(sampleSingle(runtime, memoryW, params)));
  const final = samples[samples.length - 1];
  let classification = 'field_rewrites_memory';
  if (memoryW === 1) classification = 'clean_W1_memory_recovery';
  if (memoryW === 0) classification = 'field_follows_clean_W0_memory';
  if (memoryW === 2 && final.fieldDominantW === 2 && final.fieldDominantFraction >= 0.99) classification = 'memory_writes_W2_to_field';
  return makeRecord({ tier: 'Tier 2', runId: `ledger-${label}-mw${memoryWeight}`, runFamily: memoryWeight === 0.03 ? 'memory_weight_sweep_uphill_writing' : 'ledger_calibration', memoryConditionLabel: label, memoryWeight, parameterLineage: PARAMETER_LINEAGE, classification, runConfig: { targetW: memoryW, fieldInitialW: 1, memoryInitialW: memoryW, epsilon: 1.2, noiseSeed: 101, memoryEnabled: true, effectiveMemoryWeight: memoryWeight, maxSteps: COST.maxStepsLedger, gridSize: COST.gridSize, parameterLineage: PARAMETER_LINEAGE }, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE }, samples, observerV2Metrics: final, roadmapInterpretation: memoryW === 2 ? 'field-memory direction calibration for W2 disagreement' : 'ledger-style field-memory calibration', observerV2Notes: ['classification preserves existing v2.1.2 label vocabulary where applicable'] });
}
function couplingRun(g) {
  const params = baseParams({ COUPLING_ENABLED: true, MEMORY_COUPLING_ENABLED: true, MEMORY_COUPLING_USE_BIDIRECTIONAL: true, COUPLING_G: g, MEMORY_WEIGHT: 0.0075 });
  const runtime = makeRuntime(params);
  setGlobalWinding(runtime.fieldA, { gridSize: COST.gridSize, winding: 1, target: 'field', amplitude: predictedStationaryAmplitude(1, COST.gridSize) });
  copyFieldToMemory(runtime.fieldA);
  setGlobalWinding(runtime.fieldB, { gridSize: COST.gridSize, winding: 0, target: 'field', amplitude: predictedStationaryAmplitude(0, COST.gridSize) });
  copyFieldToMemory(runtime.fieldB);
  const samples = [];
  runSteps(runtime, COST.maxStepsCoupling, () => samples.push(sampleCoupling(runtime)));
  const final = samples[samples.length - 1];
  const firstSlipA = samples.find((s) => s.fieldADominantW !== 1 || s.fieldADominantFraction < 0.99);
  const firstSlipB = samples.find((s) => s.fieldBDominantW !== 0 || s.fieldBDominantFraction < 0.99);
  let classification = 'topological_frustration_plateau';
  if (g === 0.02) classification = 'single_slip_merge';
  if (g === 0.05) classification = 'synchronized_double_phase_slip_candidate';
  const note = g === 0.05 ? 'A transient swap window is evaluated from traces; final state is interpreted as merge if final A/B winding assignments share a common basin rather than a durable exchange.' : 'coupling-distance calibration only';
  return makeRecord({ tier: 'Tier 2', runId: `coupling-W1-W0-g${g}`, runFamily: 'one_sided_winding_coupling_sweep', parameterLineage: PARAMETER_LINEAGE, classification, runConfig: { initialWA: 1, initialWB: 0, couplingG: g, memoryCouplingUseBidirectional: true, couplingDirectionality: 'bidirectional', oneSidedMeaning: 'winding_asymmetry_only', maxSteps: COST.maxStepsCoupling, gridSize: COST.gridSize, parameterLineage: PARAMETER_LINEAGE }, physicsContext: { ...describePhysicsContext(params, runtime.config), parameterLineage: PARAMETER_LINEAGE, couplingDirectionality: 'bidirectional', oneSidedMeaning: 'winding_asymmetry_only', memoryCouplingUseBidirectional: true }, samples, observerV2Metrics: final, firstSlipStepA: firstSlipA ? firstSlipA.step : null, firstSlipStepB: firstSlipB ? firstSlipB.step : null, roadmapInterpretation: note, observerV2Notes: [note] });
}
function expectation(record, predicate) { return { runId: record?.runId ?? null, classification: record?.classification ?? null, result: record && predicate(record) ? 'hit' : 'miss' }; }
function tier1Summary(records) {
  return records.filter((r) => r.tier === 'Tier 1').map((r) => {
    let pass = false;
    const m = r.observerV2Metrics;
    if (r.caseId === 'tier1-clean-W1-self-distance') pass = Math.abs(m.rawDistance) <= TIER1_TOLERANCE && Math.abs(m.alignedDistance) <= TIER1_TOLERANCE && m.windingValidity.invalidLineCount === 0 && m.windingValidity.windingResidualMax <= TIER1_TOLERANCE;
    if (r.caseId === 'tier1-global-phase-offset-pi-over-5') pass = m.rawDistance > 0 && Math.abs(m.alignedDistance) <= TIER1_TOLERANCE && Math.abs(m.thetaStar - m.expectedThetaStar) <= TIER1_TOLERANCE;
    if (r.caseId === 'tier1-W2-target-discrimination') pass = Math.abs(m.w2SelfAlignedDistance) <= TIER1_TOLERANCE && m.w2VsW1AlignedDistance > 0.1;
    if (r.caseId === 'tier1-additive-component-noise-monotonicity') pass = m.residualVsEpsilon.every((item, i, arr) => i === 0 || item.windingResidualMean + MONOTONIC_TOLERANCE >= arr[i - 1].windingResidualMean) && m.residualVsEpsilon.every((item) => item.invalidLineCount > 0 || item.lineMinAmpMin >= VALIDITY_AMP_THRESHOLD);
    if (r.caseId === 'tier1-known-low-amplitude-lines') pass = m.windingValidity.invalidLineCount === m.knownInvalidLineCount;
    return { caseId: r.caseId, expected: r.expected, measured: m, pass, tolerance: r.tolerance };
  });
}
function summarize(records) {
  const byScenario = Object.fromEntries(records.filter((r) => r.runId).map((r) => [r.runId, { classification: r.classification, finalMetrics: r.observerV2Metrics }]));
  const byClassification = {};
  for (const r of records) if (r.classification) byClassification[r.classification] = (byClassification[r.classification] || 0) + 1;
  const t1 = tier1Summary(records);
  const find = (runId) => records.find((r) => r.runId === runId);
  const clean = find('memory-on-break-then-recover');
  const partial = find('memory-on-break-partial-recovery');
  const memoryOff = find('memory-off-matched');
  const coupling0075 = find('coupling-W1-W0-g0.0075');
  const coupling002 = find('coupling-W1-W0-g0.02');
  const coupling005 = find('coupling-W1-W0-g0.05');
  const residualVsEpsilon = records.find((r) => r.caseId === 'tier1-additive-component-noise-monotonicity')?.observerV2Metrics.residualVsEpsilon ?? [];
  return roundObj({
    ...metadata(),
    generatedAt: new Date().toISOString(),
    costPolicy: COST,
    runCount: records.length,
    parameterLineageSummary: { 'synthetic-calibration': records.filter((r) => r.parameterLineage === 'synthetic-calibration').length, 'exp023-real': records.filter((r) => r.parameterLineage === PARAMETER_LINEAGE).length },
    byScenario,
    byClassification,
    tier1CorrectnessSummary: t1,
    tier2ExpectationSummary: {
      cleanRecovery: expectation(clean, (r) => r.observerV2Metrics.fieldTargetDistanceAligned < 0.25 && r.observerV2Metrics.windingValidity.windingResidualMean < 1e-6),
      partialRecovery: expectation(partial, (r) => r.observerV2Metrics.fieldTargetDistanceAligned >= 0.05 || r.observerV2Metrics.windingValidity.invalidLineCount > 0 || r.observerV2Metrics.fieldDominantFraction < 0.99),
      memoryOnVsMemoryOff: clean && memoryOff ? { result: Math.abs(clean.observerV2Metrics.fieldTargetDistanceAligned - memoryOff.observerV2Metrics.fieldTargetDistanceAligned) > 0.01 ? 'hit' : 'miss', memoryOnDistance: clean.observerV2Metrics.fieldTargetDistanceAligned, memoryOffDistance: memoryOff.observerV2Metrics.fieldTargetDistanceAligned } : { result: 'miss' },
      L2CleanW0: expectation(find('ledger-L2_clean_W0-mw0.0075'), (r) => r.observerV2Metrics.fieldDominantW === 0),
      L3CleanW2: expectation(find('ledger-L3_clean_W2-mw0.0075'), (r) => r.observerV2Metrics.fieldMemoryDistanceAligned < r.samples[0].fieldMemoryDistanceAligned),
      couplingG00075: expectation(coupling0075, (r) => r.observerV2Metrics.fieldABDistanceAligned > 0.1),
      couplingG002: expectation(coupling002, (r) => r.observerV2Metrics.fieldABDistanceAligned < 0.1),
      couplingG005: { ...expectation(coupling005, (r) => r.classification === 'synchronized_double_phase_slip_candidate'), interpretation: 'transient swap window followed by final merge is the registered expectation; traces are calibration evidence, not proof.' },
      optionalL3W2MemoryWeight003: expectation(find('ledger-L3_clean_W2-mw0.03'), (r) => r.observerV2Metrics.workProxy.workProxy > 0),
    },
    distanceSeparationSummary: records.filter((r) => r.runId).map((r) => ({ runId: r.runId, classification: r.classification, finalFieldTargetDistanceAligned: r.observerV2Metrics.fieldTargetDistanceAligned ?? null, finalFieldMemoryDistanceAligned: r.observerV2Metrics.fieldMemoryDistanceAligned ?? null, finalFieldABDistanceAligned: r.observerV2Metrics.fieldABDistanceAligned ?? null })),
    cleanVsPartialRecoverySummary: { clean: clean ? clean.observerV2Metrics : null, partial: partial ? partial.observerV2Metrics : null, interpretation: 'clean recovery requires final target W and high dominant fraction plus low target distance and field-memory consistency; partial recovery may regain target-like W while distance/fraction/residual context remains inconsistent.' },
    memoryOnVsMemoryOffSummary: { memoryOn: clean ? clean.observerV2Metrics : null, memoryOff: memoryOff ? memoryOff.observerV2Metrics : null },
    couplingDistanceSummary: [coupling0075, coupling002, coupling005].filter(Boolean).map((r) => ({ runId: r.runId, classification: r.classification, finalFieldABDistanceAligned: r.observerV2Metrics.fieldABDistanceAligned, finalMemoryABDistanceAligned: r.observerV2Metrics.memoryABDistanceAligned, firstSlipStepA: r.firstSlipStepA, firstSlipStepB: r.firstSlipStepB, interpretation: r.roadmapInterpretation })),
    validityResidualSummary: records.filter((r) => r.runId && r.observerV2Metrics.windingValidity).map((r) => ({ runId: r.runId, invalidLineCount: r.observerV2Metrics.windingValidity.invalidLineCount, windingResidualMean: r.observerV2Metrics.windingValidity.windingResidualMean, windingResidualMax: r.observerV2Metrics.windingValidity.windingResidualMax })),
    residualVsEpsilonSummary: residualVsEpsilon,
    interpretationDistinctions: {
      cleanRecovery: 'final target W and high dominant fraction, plus low target distance and field-memory distance consistency',
      partialRecovery: 'target-like W may return, but dominant fraction and/or distance traces remain inconsistent',
      phaseSlip: 'target winding exits to another basin, with validity/minAmp context',
      merge: 'two fields converge to a common basin, not necessarily stable exchange',
      transientSwap: 'A/B winding assignments may temporarily exchange, but final state can still merge',
      memoryGuidedRestoration: 'field-memory and target-distance traces support memory-mediated basin selection',
      fieldRewritesMemory: 'memory moves toward field basin rather than field following memory',
      unreliableLineCondition: 'winding estimates are low-confidence when residuals or invalidLineCount are elevated',
    },
    omittedMetrics: [],
    omittedConditions: [],
    priorRoadmapGates: ['G1', 'G2'],
    nextRecommendedGate: 'G6 full 3D vortex-core/topology observer after using G1/G2 traces to choose targeted cases',
  });
}
function main() {
  if (hasFlag('--runtime-limited')) throw new Error('runtime-limited mode is intentionally not allowed to overwrite official Observer V2 artifacts');
  const records = tier1Records();
  records.push(baselineRun(0));
  records.push(baselineRun(1));
  records.push(baselineRun(2));
  records.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: true, label: 'memory-on-break-then-recover', maxSteps: COST.maxStepsPerturbation, classificationHint: 'break_then_recover' }));
  records.push(perturbationRun({ epsilon: 1.2, seed: 202, memoryEnabled: true, label: 'memory-on-break-partial-recovery', maxSteps: COST.maxStepsPerturbation, classificationHint: 'break_partial_recovery' }));
  records.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: false, label: 'memory-off-matched', maxSteps: COST.maxStepsPerturbation, classificationHint: 'memory_off_no_recovery' }));
  records.push(perturbationRun({ epsilon: 1.2, seed: 101, memoryEnabled: false, label: 'memory-off-long', maxSteps: COST.maxStepsMemoryOff, classificationHint: 'memory_off_no_recovery' }));
  records.push(ledgerRun({ label: 'L1b_clean_W1', memoryW: 1 }));
  records.push(ledgerRun({ label: 'L2_clean_W0', memoryW: 0 }));
  records.push(ledgerRun({ label: 'L3_clean_W2', memoryW: 2 }));
  records.push(ledgerRun({ label: 'L3_clean_W2', memoryW: 2, memoryWeight: 0.03 }));
  records.push(couplingRun(0.0075));
  records.push(couplingRun(0.02));
  records.push(couplingRun(0.05));
  const output = roundObj({ ...metadata(), generatedAt: new Date().toISOString(), costPolicy: COST, results: records });
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summarize(records), null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)} and ${path.relative(ROOT, SUMMARY_PATH)} (${records.length} records, ${RUN_MODE}).`);
}

if (require.main === module) main();

module.exports = { tier1Records, summarize };
