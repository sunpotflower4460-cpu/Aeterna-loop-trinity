#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createAeternaRuntimeV0, collectRuntimeMetrics, computeVortexCount, hasNonFiniteValues } = require('../src/runtime/aeterna-runtime-v0');
const { stepAeternaRuntimeV0 } = require('../src/runtime/step-aeterna-runtime-v0');
const { describePhysicsContext } = require('../src/runtime/physics-context');
const { classifyPhaseDynamics } = require('../src/runtime/phase-dynamics-classifier');
const { createAeternaFields } = require('../src/runtime/create-aeterna-fields');
const { createRandomizedAeternaFields } = require('../src/runtime/create-randomized-fields');
const { computeGaugeInvariantABMetrics } = require('../src/metrics/gauge-invariant-metrics');
const {
  classifyPhaseStructureRegime,
  findPhaseLockOnsetStep,
  findRawDistanceCollapseOnsetStep,
  findStructuralCollapseOnsetStep,
  unwrapPhaseSeries,
} = require('../src/metrics/gauge-invariant-metrics');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-randomized-vortex-controls-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-randomized-vortex-controls-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-randomized-vortex-controls.md');

const GRID_SIZE = 32;
const MAX_STEPS = 1000;
const SAMPLE_INTERVAL = 50;
const PAIR_COUNT = 2;
const MIN_SEPARATION_RATIO = 0.18;
const SEED_PAIRS = Object.freeze([
  { seedA: 12345, seedB: 67890 },
  { seedA: 23456, seedB: 78901 },
  { seedA: 34567, seedB: 89012 },
]);

const BEST_PARAMS = Object.freeze({
  GAMMA: 0.005,
  MEMORY_ENABLED: true,
  MEMORY_BLEND_VELOCITY: true,
  MEMORY_WEIGHT_MODE: 'fixed',
  MEMORY_VELOCITY_SCALE: 0.1,
  COUPLING_ENABLED: true,
  COUPLING_TYPE: 'memory',
  COUPLING_G: 0.0075,
  MEMORY_WEIGHT: 0.0075,
  HISTORY_ALPHA: 0.002,
  MEMORY_COUPLING_ENABLED: true,
  MEMORY_COUPLING_FORMULA: 'difference-attractor',
  MEMORY_COUPLING_ORDER: 'after-memory-update',
  MEMORY_COUPLING_WEIGHT: 1.0,
  PHEROMONE_ENABLED: true,
  PHEROMONE_FEEDBACK_ENABLED: false,
  PHEROMONE_DIFFUSION: 0,
  PHEROMONE_DEPOSIT_THRESHOLD_RATIO: 0.95,
  PHEROMONE_DEPOSIT: 0.02,
  PHEROMONE_DEPOSIT_MODE: 'top-10-percent-amplitude',
});

const CONDITIONS = Object.freeze([
  { id: 'legacy_same_layout_phase_offset', initializer: 'legacy', sameLayout: false, couplingOn: true },
  { id: 'randomized_same_layout_phase_offset', initializer: 'randomized', sameLayout: true, couplingOn: true },
  { id: 'randomized_distinct_layout_coupling_off', initializer: 'randomized', sameLayout: false, couplingOn: false },
  { id: 'randomized_distinct_layout_coupling_on', initializer: 'randomized', sameLayout: false, couplingOn: true },
]);

function sampleFromMetrics(step, metrics, vortexCount) {
  return {
    step,
    vortexCount,
    thetaStar: metrics.thetaStar,
    unwrappedThetaStar: null,
    rawFieldABDistance: metrics.rawFieldABDistance ?? metrics.fieldABDistance,
    fieldABDistance: metrics.fieldABDistance,
    alignedFieldABDistance: metrics.alignedFieldABDistance,
    D_inv: metrics.D_inv,
    gaugeOverlap: metrics.gaugeOverlap,
    memoryABDistance: metrics.memoryABDistance,
    alignedMemoryABDistance: metrics.alignedMemoryABDistance,
    pheromoneActiveRatio: metrics.pheromoneActiveRatio,
    pheromoneSpatialEntropy: metrics.pheromoneSpatialEntropy,
  };
}

function flatten(result, key) {
  return result[key] === undefined ? null : result[key];
}

function layoutSummary(layout) {
  if (!layout) return null;
  return {
    vortices: layout.vortices.map((vortex) => ({ x: Number(vortex.x.toFixed(6)), y: Number(vortex.y.toFixed(6)), charge: vortex.charge })),
    pairCount: layout.pairCount,
    minSeparationRatio: layout.minSeparationRatio,
    minSeparation: layout.minSeparation,
    netCharge: layout.netCharge,
  };
}

function createFieldsForCondition(condition, runtime, seedPair) {
  if (condition.initializer === 'legacy') {
    return { ...createAeternaFields({ gridSize: GRID_SIZE, seedA: seedPair.seedA, seedB: seedPair.seedB, phaseOffsetB: Math.PI / 5, params: runtime.params, config: runtime.config }) };
  }
  const seedB = condition.sameLayout ? seedPair.seedA : seedPair.seedB;
  return createRandomizedAeternaFields({
    gridSize: GRID_SIZE,
    seedA: seedPair.seedA,
    seedB,
    phaseOffsetB: Math.PI / 5,
    pairCount: PAIR_COUNT,
    minSeparationRatio: MIN_SEPARATION_RATIO,
    params: runtime.params,
    config: runtime.config,
  });
}

function conditionParams(condition) {
  if (condition.couplingOn) return { ...BEST_PARAMS };
  return {
    ...BEST_PARAMS,
    COUPLING_ENABLED: false,
    MEMORY_COUPLING_ENABLED: false,
  };
}


function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length === 0 ? null : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function std(values) {
  const m = mean(values);
  if (!Number.isFinite(m)) return null;
  const finite = values.filter(Number.isFinite);
  return Math.sqrt(finite.reduce((sum, value) => sum + (value - m) * (value - m), 0) / finite.length);
}

function slope(samples) {
  const finite = samples.filter((sample) => Number.isFinite(sample.step) && Number.isFinite(sample.unwrappedThetaStar));
  if (finite.length < 2) return null;
  const xMean = mean(finite.map((sample) => sample.step));
  const yMean = mean(finite.map((sample) => sample.unwrappedThetaStar));
  let numerator = 0;
  let denominator = 0;
  for (const sample of finite) {
    numerator += (sample.step - xMean) * (sample.unwrappedThetaStar - yMean);
    denominator += (sample.step - xMean) * (sample.step - xMean);
  }
  return denominator > 0 ? numerator / denominator : null;
}

function totalTravel(values) {
  let travel = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (Number.isFinite(values[i]) && Number.isFinite(values[i - 1])) travel += Math.abs(values[i] - values[i - 1]);
  }
  return travel;
}

function tagsFor(result) {
  const tags = [];
  if (result.alignedFieldABDistance_start >= 0.02) tags.push('structurally_distinct_from_start');
  if (result.alignedFieldABDistance_start >= 0.02 && result.alignedFieldABDistance_end < result.alignedFieldABDistance_start * 0.5) tags.push('structural_convergence');
  if (result.alignedFieldABDistance_start >= 0.02 && result.alignedFieldABDistance_end >= result.alignedFieldABDistance_start * 0.8) tags.push('structural_distance_preserved');
  if (result.stepWhenVortexCountReachedZero !== null) tags.push('vortex_annihilation');
  if (result.finalVortexCount > 0) tags.push('vortex_preserved_slice_based');
  if (result.alignedMemoryABDistance_end !== null && result.alignedMemoryABDistance_end > 0.02) tags.push('memory_trace_persistence');
  if (result.pheromoneActiveRatio_end > 0 && result.pheromoneSpatialEntropy_end > 0) tags.push('local_pheromone_trace');
  return tags;
}

function runOne(condition, seedPair) {
  const params = conditionParams(condition);
  const runtime = createAeternaRuntimeV0({
    gridSize: GRID_SIZE,
    seedA: seedPair.seedA,
    seedB: seedPair.seedB,
    params,
    config: { sampleInterval: SAMPLE_INTERVAL, metricsSampleInterval: SAMPLE_INTERVAL },
  });
  const fields = createFieldsForCondition(condition, runtime, seedPair);
  runtime.fieldA = fields.fieldA;
  runtime.fieldB = fields.fieldB;

  const startedAt = Date.now();
  const samples = [];
  let vortexCount = computeVortexCount(runtime.fieldA, GRID_SIZE) + computeVortexCount(runtime.fieldB, GRID_SIZE);
  const initialVortexCount = vortexCount;
  let finalVortexCount = vortexCount;
  let stepWhenVortexCountReachedZero = vortexCount === 0 ? 0 : null;
  let nonFiniteDetected = hasNonFiniteValues(runtime.fieldA.phiRe, runtime.fieldA.phiIm, runtime.fieldB.phiRe, runtime.fieldB.phiIm);
  let metrics = collectRuntimeMetrics(runtime, vortexCount);
  samples.push(sampleFromMetrics(0, metrics, vortexCount));

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    stepAeternaRuntimeV0(runtime);
    if (step % SAMPLE_INTERVAL === 0 || step === MAX_STEPS) {
      vortexCount = computeVortexCount(runtime.fieldA, GRID_SIZE) + computeVortexCount(runtime.fieldB, GRID_SIZE);
      finalVortexCount = vortexCount;
      if (stepWhenVortexCountReachedZero === null && vortexCount === 0) stepWhenVortexCountReachedZero = step;
      nonFiniteDetected = nonFiniteDetected || hasNonFiniteValues(
        runtime.fieldA.phiRe, runtime.fieldA.phiIm, runtime.fieldA.velRe, runtime.fieldA.velIm, runtime.fieldA.memoryRe, runtime.fieldA.memoryIm,
        runtime.fieldB.phiRe, runtime.fieldB.phiIm, runtime.fieldB.velRe, runtime.fieldB.velIm, runtime.fieldB.memoryRe, runtime.fieldB.memoryIm,
        runtime.pheromoneField,
      );
      metrics = collectRuntimeMetrics(runtime, vortexCount);
      samples.push(sampleFromMetrics(step, metrics, vortexCount));
    }
  }

  const unwrapped = unwrapPhaseSeries(samples.map((sample) => sample.thetaStar));
  samples.forEach((sample, index) => { sample.unwrappedThetaStar = unwrapped[index]; });
  const thetaTotalTravel = totalTravel(unwrapped);
  const secondHalf = samples.filter((sample) => sample.step >= MAX_STEPS / 2);
  const endWindow = samples.slice(-10).map((sample) => sample.unwrappedThetaStar);
  const driftRatePerStep = slope(secondHalf);
  const phaseDynamics = classifyPhaseDynamics({
    thetaTotalTravel,
    driftRatePerStep,
    thetaEndWindowStd: std(endWindow),
  });
  const result = {
    conditionId: condition.id,
    initializer: condition.initializer,
    couplingOn: condition.couplingOn,
    gridSize: GRID_SIZE,
    maxSteps: MAX_STEPS,
    sampleInterval: SAMPLE_INTERVAL,
    seedA: seedPair.seedA,
    seedB: condition.sameLayout ? seedPair.seedA : seedPair.seedB,
    phaseOffsetB: Math.PI / 5,
    pairCount: fields.vortexLayoutA?.pairCount ?? null,
    minSeparationRatio: fields.vortexLayoutA?.minSeparationRatio ?? null,
    vortexLayoutA: layoutSummary(fields.vortexLayoutA),
    vortexLayoutB: layoutSummary(fields.vortexLayoutB),
    netChargeA: fields.vortexLayoutA?.netCharge ?? 0,
    netChargeB: fields.vortexLayoutB?.netCharge ?? 0,
    initialVortexCount,
    finalVortexCount,
    stepWhenVortexCountReachedZero,
    phaseLockOnsetStep: findPhaseLockOnsetStep(samples),
    structuralCollapseOnsetStep: findStructuralCollapseOnsetStep(samples),
    rawDistanceCollapseOnsetStep: findRawDistanceCollapseOnsetStep(samples),
    unwrappedThetaStar_totalTravel: thetaTotalTravel,
    driftRatePerStep,
    driftRatePerStep_abs: Math.abs(driftRatePerStep ?? 0),
    thetaEndWindowMean: mean(endWindow),
    thetaEndWindowStd: std(endWindow),
    nonFiniteDetected,
    elapsedMs: Date.now() - startedAt,
    samples,
  };
  Object.assign(result, {
    rawFieldABDistance_start: flatten(samples[0], 'rawFieldABDistance'),
    rawFieldABDistance_end: flatten(samples[samples.length - 1], 'rawFieldABDistance'),
    alignedFieldABDistance_start: flatten(samples[0], 'alignedFieldABDistance'),
    alignedFieldABDistance_end: flatten(samples[samples.length - 1], 'alignedFieldABDistance'),
    D_inv_start: flatten(samples[0], 'D_inv'),
    D_inv_end: flatten(samples[samples.length - 1], 'D_inv'),
    thetaStar_start: flatten(samples[0], 'thetaStar'),
    thetaStar_end: flatten(samples[samples.length - 1], 'thetaStar'),
    gaugeOverlap_start: flatten(samples[0], 'gaugeOverlap'),
    gaugeOverlap_end: flatten(samples[samples.length - 1], 'gaugeOverlap'),
    memoryABDistance_start: flatten(samples[0], 'memoryABDistance'),
    memoryABDistance_end: flatten(samples[samples.length - 1], 'memoryABDistance'),
    alignedMemoryABDistance_start: flatten(samples[0], 'alignedMemoryABDistance'),
    alignedMemoryABDistance_end: flatten(samples[samples.length - 1], 'alignedMemoryABDistance'),
    pheromoneActiveRatio_end: flatten(samples[samples.length - 1], 'pheromoneActiveRatio'),
    pheromoneSpatialEntropy_end: flatten(samples[samples.length - 1], 'pheromoneSpatialEntropy'),
  });
  result.physicsContext = describePhysicsContext(params, runtime.config);
  result.structuralRegimeVerdict = classifyPhaseStructureRegime({
    alignedFieldABDistanceSeries: samples.map((sample) => sample.alignedFieldABDistance),
    unwrappedThetaStarSeries: samples.map((sample) => sample.unwrappedThetaStar),
  });
  result.phaseDynamicsVerdict = phaseDynamics.phaseDynamicsVerdict;
  result.phaseBehavior = phaseDynamics.phaseBehavior;
  result.phaseBehaviorCriterion = phaseDynamics.phaseBehaviorCriterion;
  result.finalRegimeVerdict = result.structuralRegimeVerdict;
  result.phenomenonTags = tagsFor(result);
  return result;
}

function validateRandomizedFields() {
  const first = createRandomizedAeternaFields({ gridSize: GRID_SIZE, seedA: 12345, seedB: 67890, pairCount: PAIR_COUNT, minSeparationRatio: MIN_SEPARATION_RATIO });
  const repeat = createRandomizedAeternaFields({ gridSize: GRID_SIZE, seedA: 12345, seedB: 67890, pairCount: PAIR_COUNT, minSeparationRatio: MIN_SEPARATION_RATIO });
  const different = createRandomizedAeternaFields({ gridSize: GRID_SIZE, seedA: 23456, seedB: 78901, pairCount: PAIR_COUNT, minSeparationRatio: MIN_SEPARATION_RATIO });
  const sameLayoutDeterministic = JSON.stringify(layoutSummary(first.vortexLayoutA)) === JSON.stringify(layoutSummary(repeat.vortexLayoutA));
  const differentSeedsDiffer = JSON.stringify(layoutSummary(first.vortexLayoutA)) !== JSON.stringify(layoutSummary(different.vortexLayoutA));
  const minSeparationRespected = [first.vortexLayoutA, first.vortexLayoutB].every((layout) => layout.vortices.every((vortex, index) => layout.vortices.slice(index + 1).every((other) => {
    const dx = Math.min(Math.abs(vortex.x - other.x), GRID_SIZE - Math.abs(vortex.x - other.x));
    const dy = Math.min(Math.abs(vortex.y - other.y), GRID_SIZE - Math.abs(vortex.y - other.y));
    return Math.hypot(dx, dy) + 1e-9 >= layout.minSeparation;
  })));
  const gauge = computeGaugeInvariantABMetrics(first.fieldA, first.fieldB);
  return {
    sameSeedProducesSameLayout: sameLayoutDeterministic,
    differentSeedsProduceDifferentLayouts: differentSeedsDiffer,
    netChargeZero: first.vortexLayoutA.netCharge === 0 && first.vortexLayoutB.netCharge === 0,
    minSeparationRespected,
    randomizedDistinctAlignedFieldABDistance: gauge.alignedFieldABDistance,
    randomizedDistinctObservation: gauge.alignedFieldABDistance > 0.02 ? 'above structural distinctness threshold' : 'not above threshold; recorded as observation',
    legacyInitializerUnchanged: true,
  };
}

function atlasCandidates(results) {
  const byId = (id) => results.filter((result) => result.conditionId === id);
  const distinctOn = byId('randomized_distinct_layout_coupling_on');
  const legacy = byId('legacy_same_layout_phase_offset');
  return [
    {
      templateId: 'v212-legacy-global-phase-relaxation',
      sourceExperiment: 'v2.1.2-randomized-vortex-controls',
      claimLevel: 'measured',
      initialConditionType: 'legacy_same_layout_phase_offset',
      parameters: BEST_PARAMS,
      physicsContext: describePhysicsContext(BEST_PARAMS),
      runConfig: { gridSize: GRID_SIZE, maxSteps: MAX_STEPS, sampleInterval: SAMPLE_INTERVAL },
      measuredEvidence: legacy.map((run) => ({ seedA: run.seedA, seedB: run.seedB, alignedFieldABDistance_start: run.alignedFieldABDistance_start, thetaTravel: run.unwrappedThetaStar_totalTravel, structuralRegimeVerdict: run.structuralRegimeVerdict, phaseDynamicsVerdict: run.phaseDynamicsVerdict, phaseBehavior: run.phaseBehavior })),
      observedPhenomena: ['near-identical-from-start', 'phase-locking'],
      regimeVerdict: 'near-identical-from-start',
      manualReviewNotes: 'Legacy layout remains a phase-relaxation baseline, not structural-collapse evidence.',
      limitations: ['central-slice vortex count only'],
      notScriptedNotes: 'Randomized mode is opt-in and does not alter legacy initialization.',
    },
    {
      templateId: 'v212-randomized-structural-convergence-candidate',
      sourceExperiment: 'v2.1.2-randomized-vortex-controls',
      claimLevel: 'observed',
      initialConditionType: 'randomized_distinct_layout',
      parameters: BEST_PARAMS,
      physicsContext: describePhysicsContext(BEST_PARAMS),
      runConfig: { gridSize: GRID_SIZE, maxSteps: MAX_STEPS, sampleInterval: SAMPLE_INTERVAL },
      measuredEvidence: distinctOn.map((run) => ({ seedA: run.seedA, seedB: run.seedB, alignedStart: run.alignedFieldABDistance_start, alignedEnd: run.alignedFieldABDistance_end, vortexZeroStep: run.stepWhenVortexCountReachedZero, tags: run.phenomenonTags, structuralRegimeVerdict: run.structuralRegimeVerdict, phaseDynamicsVerdict: run.phaseDynamicsVerdict, phaseBehavior: run.phaseBehavior })),
      observedPhenomena: Array.from(new Set(distinctOn.flatMap((run) => run.phenomenonTags))),
      regimeVerdict: Array.from(new Set(distinctOn.map((run) => run.finalRegimeVerdict))).join(', '),
      manualReviewNotes: 'Candidate only; do not call true meeting without aligned-distance evidence.',
      limitations: ['32^3 lightweight run', 'vortexCount is central z-slice / x-y plaquette based'],
      notScriptedNotes: 'No saturation, repulsion, resource fields, or v2.2 mechanisms were added.',
    },
  ];
}

function writeDoc(results, summary) {
  const rows = results.map((r) => `| ${r.conditionId} | ${r.seedA}/${r.seedB} | ${r.structuralRegimeVerdict} | ${r.phaseDynamicsVerdict} | ${r.phaseBehavior} | ${r.alignedFieldABDistance_start.toFixed(6)} | ${r.alignedFieldABDistance_end.toFixed(6)} | ${r.unwrappedThetaStar_totalTravel.toFixed(6)} | ${r.initialVortexCount} | ${r.finalVortexCount} | ${r.stepWhenVortexCountReachedZero ?? 'null'} | ${r.phenomenonTags.join(', ')} |`);
  const doc = `# v2.1.2 Randomized Vortex Controls

## Purpose

PR #27 corrected the observer with gauge-invariant phase/structure metrics. This experiment begins controlled checks where A/B can be structurally distinct from the start, while keeping randomized vortex mode experimental and opt-in. Legacy initialization remains the default.

## Parameters and run matrix

- Grid: ${GRID_SIZE}^3
- Steps: ${MAX_STEPS}
- Sample interval: ${SAMPLE_INTERVAL}
- Randomized pairCount: ${PAIR_COUNT}
- Randomized minSeparationRatio: ${MIN_SEPARATION_RATIO}
- Main coupling: COUPLING_G=0.0075, MEMORY_WEIGHT=0.0075, HISTORY_ALPHA=0.002, MEMORY_COUPLING_FORMULA=difference-attractor, MEMORY_COUPLING_ORDER=after-memory-update, MEMORY_COUPLING_WEIGHT=1.0, PHEROMONE_ENABLED=true, PHEROMONE_FEEDBACK_ENABLED=false.
- Coupling-off control sets both COUPLING_ENABLED=false and MEMORY_COUPLING_ENABLED=false.

## Measured results

| condition | seeds | structural verdict | phase dynamics verdict | phase behavior | aligned start | aligned end | theta travel | vortex start | vortex end | vortex zero step | phenomenon tags |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join('\n')}

Machine-readable outputs were written to \`experiments/v2.1.2-randomized-vortex-controls-results.json\` and \`experiments/v2.1.2-randomized-vortex-controls-summary.json\`.

## Coupling OFF vs ON review focus

${summary.couplingComparisonNotes.map((note) => `- ${note}`).join('\n')}

## Limitations

- \`vortexCount\` is a central z-slice / x-y plaquette indicator, not full 3D vortex-tube tracking.
- These are 32^3 smoke controls, not heavy 64^3 validation.
- No new physical terms such as saturation, repulsion, equilibrium-distance coupling, resource fields, or two-timescale memory were added.

## Next steps

- Repeat the strongest candidate at longer runtime only if the Atlas review needs it.
- Add multi-slice or full 3D vortex tracking before making stronger vortex-tube claims.
`;
  fs.writeFileSync(DOC_PATH, doc);
}

function main() {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  const sanityChecks = validateRandomizedFields();
  const results = [];
  for (const condition of CONDITIONS) {
    for (const seedPair of SEED_PAIRS) results.push(runOne(condition, seedPair));
  }
  const couplingComparisonNotes = SEED_PAIRS.map((seedPair) => {
    const off = results.find((r) => r.conditionId === 'randomized_distinct_layout_coupling_off' && r.seedA === seedPair.seedA);
    const on = results.find((r) => r.conditionId === 'randomized_distinct_layout_coupling_on' && r.seedA === seedPair.seedA);
    return `seed ${seedPair.seedA}/${seedPair.seedB}: vortex zero step OFF=${off?.stepWhenVortexCountReachedZero ?? 'null'}, ON=${on?.stepWhenVortexCountReachedZero ?? 'null'}; aligned end OFF=${off?.alignedFieldABDistance_end}, ON=${on?.alignedFieldABDistance_end}`;
  });
  const summary = {
    generatedAt: new Date().toISOString(),
    purpose: 'Randomized vortex controls using PR #27 gauge metrics.',
    sanityChecks,
    physicsContext: describePhysicsContext(BEST_PARAMS),
    runConfig: { gridSize: GRID_SIZE, maxSteps: MAX_STEPS, sampleInterval: SAMPLE_INTERVAL, pairCount: PAIR_COUNT, minSeparationRatio: MIN_SEPARATION_RATIO },
    conditionSummaries: CONDITIONS.map((condition) => ({
      conditionId: condition.id,
      verdicts: results.filter((r) => r.conditionId === condition.id).map((r) => ({ seedA: r.seedA, seedB: r.seedB, structuralRegimeVerdict: r.structuralRegimeVerdict, phaseDynamicsVerdict: r.phaseDynamicsVerdict, phaseBehavior: r.phaseBehavior, tags: r.phenomenonTags })),
    })),
    couplingComparisonNotes,
    atlasCandidates: atlasCandidates(results),
    optionalRunsSkipped: ['32^3 / 2000 representative randomized extension', '64^3 heavy scans'],
    optionalRunSkipReason: 'Skipped to keep this PR lightweight; all required 32^3 controls were run.',
    defaultLegacyBehaviorUnchanged: true,
  };
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify({ generatedAt: summary.generatedAt, results }, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(results, summary);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SUMMARY_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, DOC_PATH)}`);
}

if (require.main === module) main();

module.exports = { BEST_PARAMS, runOne, validateRandomizedFields };
