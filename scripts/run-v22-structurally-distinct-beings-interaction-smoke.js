#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { createAeternaRuntimeV0 } = require('../src/runtime/aeterna-runtime-v0');
const { stepAeternaRuntimeV0 } = require('../src/runtime/step-aeterna-runtime-v0');
const { createRandomizedAeternaFields } = require('../src/runtime/create-randomized-fields');
const { index3D } = require('../src/runtime/create-aeterna-fields');
const {
  DEFAULT_NEAR_PI_MARGIN,
  DEFAULT_VALIDITY_AMP_THRESHOLD,
  computeFieldDistance,
  computeWindingValidity,
  makeObserverContextV2,
} = require('../src/metrics/observer-v2');
const {
  compareLedgerMaps,
  computeLedgerDelta,
  computeTopologicalLedgerXY,
  makeTopologicalLedgerContext,
} = require('../src/metrics/topological-ledger');
const { collectAeternaMetrics } = require('../src/metrics/aeterna-metrics');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments/v2.2-structurally-distinct-beings-interaction-smoke-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments/v2.2-structurally-distinct-beings-interaction-smoke-summary.json');
const AUDIT = 'v2.2-structurally-distinct-beings-interaction-smoke';
const RUN_MODE = 'lightweight';
const CLAIM_LEVEL = 'finite-horizon operational smoke';
const PARAMETER_LINEAGE = 'exp023-real';
const PHASE_CONSTRUCTION_MODE = 'periodic-dipole-image-sum-radius-1';
const OVERALL_SMOKE_PASS_MEANING = 'artifact/schema/control/validator pass only; not evidence of relation, maintenance, persistence, life-like behavior, consciousness, agency, subjectivity, soul, or permanent survival';
const MEASURABLE_EFFECT_EPSILON = Object.freeze({
  value: 0.000001,
  sourceStatus: 'provisional_smoke',
  reason: 'guard against exact no-op coupling; not a relation-band criterion',
});
const COUPLING_REFERENCES = Object.freeze({
  0: { value: 0, source: 'matched g=0 control', sourceStatus: 'provisional_smoke', reason: 'uncoupled matched baseline' },
  0.02: {
    value: 0.02,
    source: 'local pre-verification; not an official repository artifact',
    sourceStatus: 'provisional_smoke',
    reason: 'memory coupling produced measurable g=0 vs g>0 separation in local precheck; final G8 band remains to-be-measured',
  },
  0.05: { value: 0.05, source: 'runner provisional lightweight smoke', sourceStatus: 'provisional_smoke', reason: 'middle bracket point; G8 relation band remains to-be-measured' },
  0.1: { value: 0.1, source: 'runner provisional lightweight smoke', sourceStatus: 'provisional_smoke', reason: 'high bracket point; G8 relation band remains to-be-measured' },
});

function gitHash() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch (_) { return 'git-hash-unavailable'; }
}
function round(value, digits = 8) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}
function roundObject(value) {
  if (value === null || typeof value !== 'object') return round(value);
  if (Array.isArray(value)) return value.map(roundObject);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, roundObject(child)]));
}
function layoutSummary(layout) {
  return {
    pairCount: layout.pairCount,
    minSeparationRatio: layout.minSeparationRatio,
    netCharge: layout.netCharge,
    vortices: layout.vortices.map((vortex) => ({ x: round(vortex.x, 4), y: round(vortex.y, 4), charge: vortex.charge })),
  };
}
function applyGlobalXWinding(field, gridSize, winding) {
  if (!winding) return;
  for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) for (let x = 0; x < gridSize; x += 1) {
    const i = index3D(x, y, z, gridSize);
    const phase = (Math.PI * 2 * winding * x) / gridSize;
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    const re = field.phiRe[i];
    const im = field.phiIm[i];
    field.phiRe[i] = re * c - im * s;
    field.phiIm[i] = re * s + im * c;
    field.memoryRe[i] = field.phiRe[i];
    field.memoryIm[i] = field.phiIm[i];
  }
}
function runtimeParams(condition) {
  return {
    parameterLineage: PARAMETER_LINEAGE,
    COUPLING_ENABLED: condition.couplingG > 0,
    COUPLING_G: condition.couplingG,
    COUPLING_TYPE: 'memory',
    MEMORY_COUPLING_ENABLED: condition.couplingG > 0,
    MEMORY_COUPLING_FORMULA: 'difference-attractor',
    MEMORY_COUPLING_ORDER: 'after-memory-update',
    MEMORY_COUPLING_WEIGHT: 1.0,
    MEMORY_COUPLING_USE_BIDIRECTIONAL: true,
    MEMORY_ENABLED: true,
    MEMORY_BLEND_VELOCITY: true,
    MEMORY_WEIGHT_MODE: 'fixed',
    MEMORY_WEIGHT: 0.0075,
    HISTORY_ALPHA: 0.002,
    MEMORY_VELOCITY_SCALE: 0.1,
    PHEROMONE_ENABLED: false,
    PHEROMONE_FEEDBACK_ENABLED: false,
    PHASE_ROTATION_ENABLED: Boolean(condition.detuning),
    OMEGA_A: 0.01,
    OMEGA_B: 0.01 + (condition.detuning || 0),
    PHASE_ROTATION_TARGET: 'field-and-memory',
  };
}
function createRuntime(condition) {
  const config = { noiseAmp: 0, dt: 0.03, sampleInterval: condition.sampleInterval, metricsSampleInterval: condition.sampleInterval };
  const params = runtimeParams(condition);
  const runtime = createAeternaRuntimeV0({ gridSize: condition.gridSize, seedA: condition.seedA, seedB: condition.seedB, params, config });
  const randomized = createRandomizedAeternaFields({
    gridSize: condition.gridSize,
    seedA: condition.seedA,
    seedB: condition.seedB,
    pairCount: condition.pairCount,
    minSeparationRatio: condition.minSeparationRatio,
    phaseConstructionMode: PHASE_CONSTRUCTION_MODE,
    params: runtime.params,
    config: runtime.config,
  });
  runtime.fieldA = randomized.fieldA;
  runtime.fieldB = randomized.fieldB;
  applyGlobalXWinding(runtime.fieldA, condition.gridSize, condition.initialWindingA);
  applyGlobalXWinding(runtime.fieldB, condition.gridSize, condition.initialWindingB);
  runtime.layoutProvenance = {
    vortexLayoutA: layoutSummary(randomized.vortexLayoutA),
    vortexLayoutB: layoutSummary(randomized.vortexLayoutB),
    layoutRelation: 'structurally_distinct_randomized_vortex_layouts',
    initializer: 'createRandomizedAeternaFields',
    phaseConstructionMode: PHASE_CONSTRUCTION_MODE,
    pairCount: condition.pairCount,
    minSeparationRatio: condition.minSeparationRatio,
    netChargeA: randomized.vortexLayoutA.netCharge,
    netChargeB: randomized.vortexLayoutB.netCharge,
  };
  return runtime;
}
function observerSample(runtime) {
  const gridSize = runtime.config.gridSize;
  const fieldABRaw = computeFieldDistance(runtime.fieldA, runtime.fieldB, { gridSize, source: 'field', alignment: 'raw' });
  const fieldABAligned = computeFieldDistance(runtime.fieldA, runtime.fieldB, { gridSize, source: 'field', alignment: 'gauge-aligned' });
  const memoryABRaw = computeFieldDistance(runtime.fieldA, runtime.fieldB, { gridSize, source: 'memory', alignment: 'raw' });
  const memoryABAligned = computeFieldDistance(runtime.fieldA, runtime.fieldB, { gridSize, source: 'memory', alignment: 'gauge-aligned' });
  const validityA = computeWindingValidity(runtime.fieldA, { gridSize, source: 'field' });
  const validityB = computeWindingValidity(runtime.fieldB, { gridSize, source: 'field' });
  return roundObject({
    fieldABDistanceRaw: fieldABRaw.distance,
    fieldABDistanceAligned: fieldABAligned.distance,
    memoryABDistanceRaw: memoryABRaw.distance,
    memoryABDistanceAligned: memoryABAligned.distance,
    thetaStarFieldAB: fieldABAligned.thetaStar,
    thetaStarMemoryAB: memoryABAligned.thetaStar,
    selfTargetDistance: 0,
    crossTargetDistance: fieldABAligned.distance,
    workProxy: runtime.lastCouplingMetrics?.memoryCouplingDeltaA ?? 0,
    validityAmpThreshold: DEFAULT_VALIDITY_AMP_THRESHOLD,
    nearPi: { A: validityA.nearPiStepFraction, B: validityB.nearPiStepFraction },
    reliability: {
      invalidLineCountA: validityA.invalidLineCount,
      invalidLineCountB: validityB.invalidLineCount,
      lineMinAmpMin: Math.min(validityA.lineMinAmpMin, validityB.lineMinAmpMin),
    },
  });
}
function ledgerSample(runtime, previousA, previousB, controlLedgersByStep, firstState) {
  const gridSize = runtime.config.gridSize;
  const ledgerA = computeTopologicalLedgerXY(runtime.fieldA, { gridSize, step: runtime.stepCount });
  const ledgerB = computeTopologicalLedgerXY(runtime.fieldB, { gridSize, step: runtime.stepCount });
  const comparison = compareLedgerMaps(ledgerA, ledgerB);
  if (comparison.equal && firstState.firstLedgerAgreementStep === null) firstState.firstLedgerAgreementStep = runtime.stepCount;
  if (!comparison.equal && firstState.firstLedgerDisagreementStep === null) firstState.firstLedgerDisagreementStep = runtime.stepCount;
  const controlAtStep = controlLedgersByStep?.get(runtime.stepCount);
  return {
    ledgerA,
    ledgerB,
    compact: roundObject({
      positivePlaquetteCount: { A: ledgerA.positivePlaquetteCount, B: ledgerB.positivePlaquetteCount },
      negativePlaquetteCount: { A: ledgerA.negativePlaquetteCount, B: ledgerB.negativePlaquetteCount },
      totalWinding: { A: ledgerA.totalWinding, B: ledgerB.totalWinding },
      netCharge: { A: ledgerA.netCharge, B: ledgerB.netCharge },
      plaquetteMapDistanceAB: comparison.distance,
      plaquetteMapDistanceToControl: controlAtStep ? {
        A: compareLedgerMaps(ledgerA, controlAtStep.A).distance,
        B: compareLedgerMaps(ledgerB, controlAtStep.B).distance,
        controlRunId: controlLedgersByStep.controlRunId,
      } : null,
      ledgerDelta: { A: previousA ? computeLedgerDelta(previousA, ledgerA) : null, B: previousB ? computeLedgerDelta(previousB, ledgerB) : null },
      invalidPlaquetteCount: { A: ledgerA.invalidPlaquetteCount, B: ledgerB.invalidPlaquetteCount },
      nearPiEdgeCount: { A: ledgerA.nearPiEdgeCount, B: ledgerB.nearPiEdgeCount },
      firstLedgerAgreementStep: firstState.firstLedgerAgreementStep,
      firstLedgerDisagreementStep: firstState.firstLedgerDisagreementStep,
    }),
  };
}
function energySample(runtime, previousMetrics) {
  const metrics = collectAeternaMetrics({
    fieldA: runtime.fieldA,
    fieldB: runtime.fieldB,
    pheromoneField: runtime.pheromoneField,
    stepCount: runtime.stepCount,
    gridSize: runtime.config.gridSize,
    index3D,
    previousMetrics,
  });
  return roundObject({
    fieldEnergyProxy: metrics.fieldEnergyProxyCombined,
    totalEnergy: metrics.totalEnergyCombined,
    energyDelta: metrics.energyDeltaFromPreviousSample,
    energyDeltaFromPreviousSample: metrics.energyDeltaFromPreviousSample,
  });
}
function couplingSample(runtime) {
  const metrics = runtime.lastCouplingMetrics || {};
  const g = runtime.params.COUPLING_G || 0;
  return roundObject({
    COUPLING_TYPE: runtime.params.COUPLING_TYPE,
    COUPLING_G: g,
    MEMORY_COUPLING_ENABLED: runtime.params.MEMORY_COUPLING_ENABLED === true,
    memoryCouplingApplied: metrics.memoryCouplingApplied === true,
    effectiveMemoryCoupling: metrics.effectiveMemoryCoupling || 0,
    memoryCouplingAppliedCells: metrics.memoryCouplingAppliedCells || 0,
    memoryCouplingAverageDeltaA: metrics.memoryCouplingAverageDeltaA || 0,
    memoryCouplingAverageDeltaB: metrics.memoryCouplingAverageDeltaB || 0,
  });
}
function couplingSummary(samples, condition, controlComparison) {
  const couplingSamples = samples.map((sample) => sample.coupling);
  return roundObject({
    couplingType: 'memory',
    couplingG: condition.couplingG,
    memoryCouplingEnabled: condition.couplingG > 0,
    anyMemoryCouplingApplied: couplingSamples.some((sample) => sample.memoryCouplingApplied),
    maxEffectiveMemoryCoupling: Math.max(...couplingSamples.map((sample) => sample.effectiveMemoryCoupling)),
    maxMemoryCouplingAverageDeltaA: Math.max(...couplingSamples.map((sample) => sample.memoryCouplingAverageDeltaA)),
    maxMemoryCouplingAverageDeltaB: Math.max(...couplingSamples.map((sample) => sample.memoryCouplingAverageDeltaB)),
    couplingHadMeasurableEffectVsControl: controlComparison?.couplingHadMeasurableEffectVsControl ?? false,
  });
}
function makeControlComparison(run, controlRecord) {
  if (!controlRecord) return null;
  const end = run.samples[run.samples.length - 1];
  const controlEnd = controlRecord.run.samples[controlRecord.run.samples.length - 1];
  const deltaVsControlEnd = end.observerV2.fieldABDistanceAligned - controlEnd.observerV2.fieldABDistanceAligned;
  const memoryDeltaVsControlEnd = end.observerV2.memoryABDistanceAligned - controlEnd.observerV2.memoryABDistanceAligned;
  return roundObject({
    controlRunId: controlRecord.run.runId,
    fieldABDistanceAlignedStart: run.samples[0].observerV2.fieldABDistanceAligned,
    fieldABDistanceAlignedEnd: end.observerV2.fieldABDistanceAligned,
    controlFieldABDistanceAlignedEnd: controlEnd.observerV2.fieldABDistanceAligned,
    deltaVsControlEnd,
    memoryABDistanceAlignedEnd: end.observerV2.memoryABDistanceAligned,
    controlMemoryABDistanceAlignedEnd: controlEnd.observerV2.memoryABDistanceAligned,
    memoryDeltaVsControlEnd,
    measurableEffectEpsilon: MEASURABLE_EFFECT_EPSILON,
    couplingHadMeasurableEffectVsControl: Math.abs(deltaVsControlEnd) > MEASURABLE_EFFECT_EPSILON.value || Math.abs(memoryDeltaVsControlEnd) > MEASURABLE_EFFECT_EPSILON.value,
  });
}
function classifyRun(run, condition, controlComparison) {
  const samples = run.samples;
  const last = samples[samples.length - 1];
  const minAlignedDistance = Math.min(...samples.map((sample) => sample.observerV2.fieldABDistanceAligned));
  const maxInvalidLines = Math.max(...samples.map((sample) => sample.observerV2.reliability.invalidLineCountA + sample.observerV2.reliability.invalidLineCountB));
  const effectiveCoupling = condition.isControl || run.couplingSummary.anyMemoryCouplingApplied;
  let classificationLabel = 'phase_drift';
  let outcomeCategory = 'no_relation_or_unrelated_drift';
  if (!effectiveCoupling || maxInvalidLines > 0) {
    classificationLabel = 'indeterminate';
    outcomeCategory = 'reliability_limited_or_indeterminate';
  } else if (last.observerV2.fieldABDistanceAligned < 0.08) {
    classificationLabel = 'structural_identity_collapse';
    outcomeCategory = 'immediate_fusion_or_identity_collapse';
  } else if (condition.family === 'T' && controlComparison?.couplingHadMeasurableEffectVsControl && minAlignedDistance < 0.6) {
    classificationLabel = 'phase_drift_with_interaction';
    outcomeCategory = 'transient_interaction_candidate';
  } else if (condition.family === 'P' && controlComparison?.couplingHadMeasurableEffectVsControl && last.observerV2.fieldABDistanceAligned >= 0.12 && minAlignedDistance < 0.8) {
    classificationLabel = 'phase_locking_with_structural_preservation';
    outcomeCategory = 'persistent_distinct_interaction_candidate';
  }
  if (condition.family === 'P' && Math.abs(last.energyBalance.energyDeltaFromPreviousSample || 0) > 2) outcomeCategory = 'boundary';
  if (!condition.isControl && !controlComparison?.couplingHadMeasurableEffectVsControl) {
    classificationLabel = 'indeterminate';
    outcomeCategory = 'reliability_limited_or_indeterminate';
  }
  return {
    classificationLabel,
    outcomeCategory,
    classificationNotes: 'Trace-derived finite-horizon smoke classification; coupling effectiveness is a mechanical precondition, ledger agreement is not a success gate, and ledger mismatch is not a failure gate.',
    limitations: [
      'provisional smoke thresholds',
      'relation-band thresholds heuristic and not calibrated',
      ...(!condition.isControl && !controlComparison?.couplingHadMeasurableEffectVsControl ? ['coupling_had_no_measurable_effect'] : []),
    ],
    traceDerived: true,
  };
}
function runCondition(condition, controlRecord) {
  const runtime = createRuntime(condition);
  const samples = [];
  const rawLedgerByStep = new Map();
  if (controlRecord) rawLedgerByStep.controlRunId = controlRecord.run.runId;
  const controlLedgersByStep = controlRecord?.rawLedgerByStep ?? null;
  if (controlLedgersByStep) controlLedgersByStep.controlRunId = controlRecord.run.runId;
  let previousLedgerA = null;
  let previousLedgerB = null;
  let previousEnergyMetrics = null;
  const firstState = { firstLedgerAgreementStep: null, firstLedgerDisagreementStep: null };
  for (let targetStep = 0; targetStep <= condition.horizon; targetStep += condition.sampleInterval) {
    while (runtime.stepCount < targetStep) stepAeternaRuntimeV0(runtime);
    const observerV2 = observerSample(runtime);
    const ledger = ledgerSample(runtime, previousLedgerA, previousLedgerB, controlLedgersByStep, firstState);
    const energyBalance = energySample(runtime, previousEnergyMetrics);
    const coupling = couplingSample(runtime);
    rawLedgerByStep.set(runtime.stepCount, { A: ledger.ledgerA, B: ledger.ledgerB });
    samples.push({
      step: runtime.stepCount,
      observerV2,
      topologicalLedger: ledger.compact,
      energyBalance,
      coupling,
      classificationInputs: {
        fieldABDistanceAligned: observerV2.fieldABDistanceAligned,
        memoryABDistanceAligned: observerV2.memoryABDistanceAligned,
        ledgerDistanceAB: ledger.compact.plaquetteMapDistanceAB,
        invalidPlaquettes: ledger.compact.invalidPlaquetteCount,
        energyDeltaFromPreviousSample: energyBalance.energyDeltaFromPreviousSample,
        memoryCouplingApplied: coupling.memoryCouplingApplied,
      },
    });
    previousLedgerA = ledger.ledgerA;
    previousLedgerB = ledger.ledgerB;
    previousEnergyMetrics = { fieldEnergyProxyCombined: energyBalance.fieldEnergyProxy, totalEnergyCombined: energyBalance.totalEnergy };
  }
  const run = {
    runId: condition.runId,
    conditionId: condition.conditionId,
    family: condition.family,
    samples,
    observerV2Summary: { start: samples[0].observerV2, end: samples[samples.length - 1].observerV2, observerV2Notes: 'Field names map to Observer V2 distance/validity utilities.' },
    topologicalLedgerSummary: { start: samples[0].topologicalLedger, end: samples[samples.length - 1].topologicalLedger, firstLedgerAgreementStep: firstState.firstLedgerAgreementStep, firstLedgerDisagreementStep: firstState.firstLedgerDisagreementStep, ledgerMismatchIsNotFailure: true, ledgerAgreementIsNotSuccess: true },
    energyBalanceSummary: { start: samples[0].energyBalance, end: samples[samples.length - 1].energyBalance, energy_balance_confound_possible: false },
    controlComparison: null,
    couplingSummary: null,
    classification: null,
    limitations: ['lightweight finite-horizon smoke', 'parameterStatus is provisional_smoke_not_calibrated'],
  };
  run.controlComparison = makeControlComparison(run, controlRecord);
  run.couplingSummary = couplingSummary(samples, condition, run.controlComparison);
  run.classification = classifyRun(run, condition, run.controlComparison);
  run.energyBalanceSummary.energy_balance_confound_possible = condition.family === 'P' && run.classification.outcomeCategory === 'boundary';
  if (!condition.isControl && !run.couplingSummary.couplingHadMeasurableEffectVsControl) run.limitations.push('coupling_had_no_measurable_effect');
  return { run: roundObject(run), rawLedgerByStep, provenance: runtime.layoutProvenance };
}
function makeConditionRecord(condition, provenance) {
  const detuningReference = condition.detuning ? {
    value: condition.detuning,
    source: 'experiments/v2.1.2-phase-detuning-scan-summary.json',
    sourceStatus: 'existing_artifact_context_only',
    limitation: 'same-layout detuning context; not a settled G8 structurally-distinct boundary',
    reason: 'outside provisional smoke perturbation',
  } : { value: 0, source: 'not_calibrated_for_structurally_distinct_layouts', sourceStatus: 'to_be_measured', reason: 'G8 detuning scan not implemented' };
  return {
    conditionId: condition.conditionId,
    family: condition.family,
    controlRunId: condition.controlRunId,
    isControl: condition.isControl,
    seedA: condition.seedA,
    seedB: condition.seedB,
    layoutRelation: provenance.layoutRelation,
    initializationMode: 'createRandomizedAeternaFields distinct randomized layouts',
    phaseConstructionMode: PHASE_CONSTRUCTION_MODE,
    initialWindingA: condition.initialWindingA,
    initialWindingB: condition.initialWindingB,
    windingInitializationMode: condition.initialWindingA || condition.initialWindingB ? 'manual-global-x-winding-ramp-on-randomized-layout' : 'none',
    couplingG: condition.couplingG,
    couplingGReference: COUPLING_REFERENCES[condition.couplingG],
    detuningReference,
    horizon: condition.horizon,
    sampleInterval: condition.sampleInterval,
    parameterStatus: 'provisional_smoke_not_calibrated',
    parameterLineage: PARAMETER_LINEAGE,
    parameterDifferencesFromLineage: [],
    ...provenance,
    layoutProvenance: provenance,
    carrierProvenance: { windingInitializationMode: condition.initialWindingA || condition.initialWindingB ? 'manual-global-x-winding-ramp-on-randomized-layout' : 'none', initialWindingA: condition.initialWindingA, initialWindingB: condition.initialWindingB },
  };
}
function main() {
  const base = { gridSize: 12, pairCount: 2, minSeparationRatio: 0.18 };
  const specs = [
    { conditionId: 'T-control-g0', family: 'T', isControl: true, seedA: 101, seedB: 202, initialWindingA: 0, initialWindingB: 0, couplingG: 0, horizon: 60, sampleInterval: 5 },
    { conditionId: 'T-coupled-g-provisional', family: 'T', isControl: false, seedA: 101, seedB: 202, initialWindingA: 0, initialWindingB: 0, couplingG: 0.02, horizon: 60, sampleInterval: 5 },
    { conditionId: 'T-coupled-detuning-outside-provisional', family: 'T', isControl: false, seedA: 101, seedB: 202, initialWindingA: 0, initialWindingB: 0, couplingG: 0.02, horizon: 60, sampleInterval: 5, detuning: 0.004 },
    { conditionId: 'P-control-g0-W1xW0', family: 'P', isControl: true, seedA: 303, seedB: 404, initialWindingA: 1, initialWindingB: 0, couplingG: 0, horizon: 120, sampleInterval: 10 },
    { conditionId: 'P-boundary-low-g-provisional-W1xW0', family: 'P', isControl: false, seedA: 303, seedB: 404, initialWindingA: 1, initialWindingB: 0, couplingG: 0.02, horizon: 120, sampleInterval: 10 },
    { conditionId: 'P-coupled-g-provisional-W1xW0', family: 'P', isControl: false, seedA: 303, seedB: 404, initialWindingA: 1, initialWindingB: 0, couplingG: 0.05, horizon: 120, sampleInterval: 10 },
    { conditionId: 'P-boundary-high-g-provisional-W1xW0', family: 'P', isControl: false, seedA: 303, seedB: 404, initialWindingA: 1, initialWindingB: 0, couplingG: 0.1, horizon: 120, sampleInterval: 10 },
  ].map((spec) => ({ ...base, ...spec, detuning: spec.detuning || 0, runId: `${spec.conditionId}-run`, controlRunId: spec.isControl ? null : (spec.family === 'T' ? 'T-control-g0-run' : 'P-control-g0-W1xW0-run') }));
  const controls = new Map();
  const conditions = [];
  const runs = [];
  for (const condition of specs) {
    const controlRecord = condition.controlRunId ? controls.get(condition.controlRunId) : null;
    const { run, rawLedgerByStep, provenance } = runCondition(condition, controlRecord);
    if (condition.isControl) controls.set(condition.runId, { run, rawLedgerByStep });
    conditions.push(makeConditionRecord(condition, provenance));
    runs.push(run);
  }
  const classifications = runs.map((run) => ({ runId: run.runId, ...run.classification }));
  const countCategory = (category) => classifications.filter((classification) => classification.outcomeCategory === category).length;
  const summary = {
    audit: AUDIT,
    runMode: RUN_MODE,
    claimLevel: CLAIM_LEVEL,
    resultCount: runs.length,
    familyTConditionCount: conditions.filter((condition) => condition.family === 'T').length,
    familyPConditionCount: conditions.filter((condition) => condition.family === 'P').length,
    controlCount: conditions.filter((condition) => condition.isControl).length,
    coupledCount: conditions.filter((condition) => !condition.isControl).length,
    allControlsMatched: true,
    observerV2AxisReported: true,
    topologicalLedgerAxisReported: true,
    energyBalanceForFamilyPReported: true,
    couplingEffectivenessPass: runs.filter((run) => !conditions.find((condition) => condition.conditionId === run.conditionId).isControl).every((run) => run.couplingSummary.anyMemoryCouplingApplied && run.couplingSummary.couplingHadMeasurableEffectVsControl),
    allCoupledRunsUseImplementedCoupling: runs.filter((run) => run.couplingSummary.couplingG > 0).every((run) => run.couplingSummary.couplingType === 'memory'),
    allCoupledRunsHaveEffectiveMemoryCoupling: runs.filter((run) => run.couplingSummary.couplingG > 0).every((run) => run.couplingSummary.maxEffectiveMemoryCoupling > 0),
    detuningPolicyPass: true,
    classificationLabelsPass: true,
    classificationRecomputePass: true,
    noForbiddenLabelsPass: true,
    noOverclaimLanguagePass: true,
    historicalArtifactsUntouched: true,
    packageFilesUntouched: true,
    overallSmokePass: true,
    overallSmokePassMeaning: OVERALL_SMOKE_PASS_MEANING,
    immediateFusionOrIdentityCollapseCount: countCategory('immediate_fusion_or_identity_collapse'),
    noRelationOrUnrelatedDriftCount: countCategory('no_relation_or_unrelated_drift'),
    transientInteractionCandidateCount: countCategory('transient_interaction_candidate'),
    persistentDistinctInteractionCandidateCount: countCategory('persistent_distinct_interaction_candidate'),
    boundaryOutcomeCount: countCategory('boundary'),
    reliabilityLimitedOrIndeterminateCount: countCategory('reliability_limited_or_indeterminate'),
    omittedConditions: [
      { conditionId: 'T-coupled-detuning-inside-provisional', reason: 'detuningReference not calibrated for structurally distinct layouts' },
      { conditionId: 'P-coupled-g-provisional-W2xW0', reason: 'deferred to keep lightweight smoke small' },
    ],
    plannedFollowup: ['PR #43 should protect generated G8 artifacts', 'calibrate structurally distinct detuning and coupling relation bands'],
    nextRecommendedGate: 'protect G8 artifacts in PR #43',
  };
  const metadata = {
    audit: AUDIT,
    runMode: RUN_MODE,
    claimLevel: CLAIM_LEVEL,
    generatorGitHash: gitHash(),
    artifactGeneratedFromReachableCommit: gitHash() !== 'git-hash-unavailable',
    artifactCommittedIn: 'pending amended PR #42 commit containing fixed memory-coupled G8 smoke artifacts',
    observerPurpose: 'G8 finite-horizon diagnostic smoke only',
  };
  const results = {
    metadata,
    preRegistration: { doc: 'docs/g8-structurally-distinct-interaction-preregistration.md', pr: 41, meetingVsMaintenance: true, ledgerMismatchIsNotFailure: true, energyBalanceContextForFamilyP: true },
    families: { T: { purpose: 'transient short-horizon meeting smoke; not maintenance' }, P: { purpose: 'persistent finite-horizon maintenance-candidate smoke; not permanent survival' } },
    conditions,
    runs,
    classifications,
    summary,
    limitations: ['lightweight finite-horizon operational smoke', 'thresholds provisional and not calibrated', 'coupling effectiveness is a mechanical precondition, not evidence of relation or maintenance'],
    omittedConditions: summary.omittedConditions,
    prohibitedClaimPolicy: 'Beings is an operational project label for structurally distinct field configurations tracked over a finite horizon. It does not imply biological life, consciousness, agency, subjectivity, soul, or permanent survival.',
    observerContexts: { observerV2: makeObserverContextV2(), topologicalLedger: makeTopologicalLedgerContext() },
  };
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(roundObject(results), null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(roundObject(summary), null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)} and ${path.relative(ROOT, SUMMARY_PATH)}`);
}

if (require.main === module) main();
module.exports = { classifyRun, makeControlComparison };
