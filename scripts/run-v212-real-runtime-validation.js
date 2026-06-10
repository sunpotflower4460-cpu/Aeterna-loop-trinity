'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { DEFAULT_COUPLING_PARAMS, DEFAULT_MEMORY_PARAMS, DEFAULT_PHEROMONE_PARAMS } = require('../src/params/aeterna-params');
const { V212_CANDIDATE_PARAMS } = require('../src/params/v2.1.2-candidate-params');
const { runAeternaRuntimeV0Condition } = require('../src/runtime/aeterna-runtime-v0');

const RESULTS_PATH = path.join(__dirname, '..', 'experiments', 'v2.1.2-real-runtime-validation-results.json');
const SUMMARY_PATH = path.join(__dirname, '..', 'experiments', 'v2.1.2-real-runtime-validation-summary.json');
const DOC_PATH = path.join(__dirname, '..', 'docs', 'v2.1.2-real-runtime-validation.md');
const DEFAULT_SAMPLE_INTERVAL = 50;

function gitValue(command, fallback) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch (_error) {
    return fallback;
  }
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value = 'true'] = arg.slice(2).split('=');
    options[key] = value;
  }
  return options;
}

function parseSeeds(value, fallback) {
  if (!value) return fallback;
  return value.split(',').map((seed) => Number(seed.trim())).filter((seed) => Number.isFinite(seed));
}

function createStages(options) {
  if (options.grid || options.steps || options.seeds) {
    const gridSize = Number(options.grid || 32);
    const maxSteps = Number(options.steps || 1000);
    const seeds = parseSeeds(options.seeds, [12345]);
    const validationStage = gridSize === 64 && seeds.length > 1 ? 'stage-3-64-full' : (gridSize === 64 ? 'stage-2-64-smoke' : 'stage-1-32-smoke');
    return [{ validationStage, requestedGridSize: gridSize, actualGridSize: gridSize, maxSteps, seeds, status: 'configured' }];
  }

  const stages = [
    { validationStage: 'stage-1-32-smoke', requestedGridSize: 32, actualGridSize: 32, maxSteps: 1000, seeds: [12345], status: 'configured' },
    { validationStage: 'stage-2-64-smoke', requestedGridSize: 64, actualGridSize: 64, maxSteps: 1000, seeds: [12345], status: 'configured' },
  ];

  if (options['include-full']) {
    stages.push({ validationStage: 'stage-3-64-full', requestedGridSize: 64, actualGridSize: 64, maxSteps: 3000, seeds: [12345, 23456, 34567], status: 'configured' });
  } else {
    stages.push({ validationStage: 'stage-3-64-full', requestedGridSize: 64, actualGridSize: 64, maxSteps: 3000, seeds: [12345, 23456, 34567], status: 'skipped: use npm run experiment:v212-real-runtime-full64 for the full run' });
  }

  return stages;
}

function baseParams(overrides) {
  return {
    ...DEFAULT_MEMORY_PARAMS,
    ...DEFAULT_COUPLING_PARAMS,
    ...DEFAULT_PHEROMONE_PARAMS,
    ...V212_CANDIDATE_PARAMS,
    ...overrides,
    COUPLING_ENABLED: true,
    PHEROMONE_FEEDBACK_ENABLED: false,
  };
}

const CONDITIONS = [
  {
    conditionName: 'Condition A: baseline',
    purpose: 'real-runtime-v0 baseline with memory, coupling, and pheromone disabled',
    params: baseParams({ MEMORY_ENABLED: false, MEMORY_COUPLING_ENABLED: false, PHEROMONE_ENABLED: false }),
  },
  {
    conditionName: 'Condition B: memory only',
    purpose: 'real-runtime-v0 candidate memory without coupling or pheromone',
    params: baseParams({ MEMORY_ENABLED: true, MEMORY_COUPLING_ENABLED: false, PHEROMONE_ENABLED: false }),
  },
  {
    conditionName: 'Condition C: memory + coupling',
    purpose: 'real-runtime-v0 candidate memory and difference-attractor coupling without pheromone',
    params: baseParams({ MEMORY_ENABLED: true, MEMORY_COUPLING_ENABLED: true, PHEROMONE_ENABLED: false }),
  },
  {
    conditionName: 'Condition D: memory + coupling + pheromone trace',
    purpose: 'full v2.1.2 real-runtime-v0 candidate with pheromone trace and feedback OFF',
    params: baseParams({ MEMORY_ENABLED: true, MEMORY_COUPLING_ENABLED: true, PHEROMONE_ENABLED: true, PHEROMONE_FEEDBACK_ENABLED: false }),
  },
];

function deltaRatio(start, end) {
  if (!Number.isFinite(start) || Math.abs(start) < 1e-12 || !Number.isFinite(end)) return null;
  return (end - start) / Math.abs(start);
}

function safe(value) {
  return Number.isFinite(value) ? value : null;
}

function rejectReasons(result) {
  const reasons = [];
  if (result.notes.includes('Non-finite')) reasons.push('numeric instability');
  if (result.finalVortexCount === 0) reasons.push('vortex disappeared');
  if (result.fieldABDistance_end > result.fieldABDistance_start) reasons.push('A/B moved apart');
  if (result.fieldABDistance_end > 0.15) reasons.push('A/B remain too separate');
  if (result.fieldABDistance_end < 0.005) reasons.push('identity collapse risk');
  if (result.memoryABDistance_end !== null && result.memoryABDistance_end < 0.005) reasons.push('memory identity collapse risk');
  if (result.memoryFieldDifferenceA_end !== null && (result.memoryFieldDifferenceA_end < 0.05 || result.memoryFieldDifferenceA_end > 0.35)) reasons.push('memory trace A outside target band');
  if (result.memoryFieldDifferenceB_end !== null && (result.memoryFieldDifferenceB_end < 0.05 || result.memoryFieldDifferenceB_end > 0.35)) reasons.push('memory trace B outside target band');
  if (result.pheromoneActiveRatio_end >= 0.9) reasons.push('pheromone fog');
  if (result.pheromoneSpatialEntropy_end >= 0.95) reasons.push('pheromone uniformization');
  if (result.amplitudeStdA_end < 0.01 || result.amplitudeStdB_end < 0.01) reasons.push('field flattened');
  if (result.fieldEnergyProxyDeltaRatio !== null && Math.abs(result.fieldEnergyProxyDeltaRatio) > 0.25) reasons.push('energy unstable');
  if (result.runtimeMsTotal !== null && result.actualGridSize === 64 && result.maxSteps >= 3000 && result.runtimeMsTotal > 20 * 60 * 1000) reasons.push('performance issue');
  return reasons;
}

function isCandidate(result) {
  return result.runType === 'real-runtime-v0' &&
    result.runtimeAvailable === true &&
    rejectReasons(result).length === 0 &&
    result.fieldABDistance_end >= 0.01 &&
    result.fieldABDistance_end <= 0.15;
}

function resultRow({ condition, stage, seed, output, runtimeMsTotal }) {
  const initial = output.initialMetrics;
  const final = output.finalMetrics;
  const params = output.params;
  const fieldEnergyProxy_start = safe(initial.fieldEnergyProxyCombined);
  const fieldEnergyProxy_end = safe(final.fieldEnergyProxyCombined);
  const row = {
    conditionName: condition.conditionName,
    validationStage: stage.validationStage,
    seed,
    requestedGridSize: stage.requestedGridSize,
    actualGridSize: stage.actualGridSize,
    maxSteps: stage.maxSteps,
    runType: 'real-runtime-v0',
    dynamicsType: 'aeterna-runtime-v0',
    runtimeAvailable: true,

    GAMMA: params.GAMMA,

    MEMORY_ENABLED: params.MEMORY_ENABLED,
    MEMORY_BLEND_VELOCITY: params.MEMORY_BLEND_VELOCITY,
    HISTORY_ALPHA: params.HISTORY_ALPHA,
    MEMORY_WEIGHT: params.MEMORY_WEIGHT,
    MEMORY_WEIGHT_MODE: params.MEMORY_WEIGHT_MODE,
    MEMORY_VELOCITY_SCALE: params.MEMORY_VELOCITY_SCALE,

    MEMORY_COUPLING_ENABLED: params.MEMORY_COUPLING_ENABLED,
    MEMORY_COUPLING_FORMULA: params.MEMORY_COUPLING_FORMULA,
    MEMORY_COUPLING_ORDER: params.MEMORY_COUPLING_ORDER,
    MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_WEIGHT,
    COUPLING_G: params.COUPLING_G,
    COUPLING_TYPE: params.COUPLING_TYPE,

    PHEROMONE_ENABLED: params.PHEROMONE_ENABLED,
    PHEROMONE_FEEDBACK_ENABLED: params.PHEROMONE_FEEDBACK_ENABLED,
    PHEROMONE_DIFFUSION: params.PHEROMONE_DIFFUSION,
    PHEROMONE_DEPOSIT_THRESHOLD_RATIO: params.PHEROMONE_DEPOSIT_THRESHOLD_RATIO,
    PHEROMONE_DEPOSIT: params.PHEROMONE_DEPOSIT,
    PHEROMONE_DEPOSIT_MODE: params.PHEROMONE_DEPOSIT_MODE,

    initialVortexCount: output.initialVortexCount,
    finalVortexCount: output.finalVortexCount,
    vortexLifetimeAverage: safe(final.vortexLifetimeAverage),
    vortexLifetimeMax: safe(final.vortexLifetimeMax),
    stepWhenVortexCountReachedZero: output.stepWhenVortexCountReachedZero,

    fieldABDistance_start: safe(initial.fieldABDistance),
    fieldABDistance_end: safe(final.fieldABDistance),
    fieldABDistanceDelta: safe(final.fieldABDistance - initial.fieldABDistance),
    fieldABDistanceDeltaRatio: deltaRatio(initial.fieldABDistance, final.fieldABDistance),

    memoryABDistance_start: safe(initial.memoryABDistance),
    memoryABDistance_end: safe(final.memoryABDistance),
    memoryABDistanceDelta: safe(final.memoryABDistance - initial.memoryABDistance),
    memoryABDistanceDeltaRatio: deltaRatio(initial.memoryABDistance, final.memoryABDistance),

    memoryFieldDifferenceA_end: safe(final.memoryFieldDifferenceA),
    memoryFieldDifferenceB_end: safe(final.memoryFieldDifferenceB),

    R_A_global_end: safe(final.R_A_global),
    R_B_global_end: safe(final.R_B_global),
    R_AB_orderDifferenceRatio_end: safe(final.R_AB_orderDifferenceRatio),
    R_A_local_average_end: safe(final.R_A_local_average),
    R_B_local_average_end: safe(final.R_B_local_average),

    pheromoneActiveRatio_end: safe(final.pheromoneActiveRatio),
    pheromoneSpatialEntropy_end: safe(final.pheromoneSpatialEntropy),
    pheromoneEnergyL2_end: safe(final.pheromoneEnergyL2),
    pheromoneMax_end: safe(final.pheromoneMax),

    amplitudeMeanA_end: safe(final.amplitudeMeanA),
    amplitudeMeanB_end: safe(final.amplitudeMeanB),
    amplitudeStdA_end: safe(final.amplitudeStdA),
    amplitudeStdB_end: safe(final.amplitudeStdB),

    fieldEnergyProxy_start,
    fieldEnergyProxy_end,
    fieldEnergyProxyDeltaRatio: deltaRatio(fieldEnergyProxy_start, fieldEnergyProxy_end),

    stepMsAverage: safe(output.stepMsAverage),
    stepMsMax: safe(output.stepMsMax),
    runtimeMsTotal: safe(runtimeMsTotal),
    memoryMBStart: safe(output.memoryMBStart),
    memoryMBEnd: safe(output.memoryMBEnd),
    memoryMBPeak: safe(output.memoryMBPeak),

    candidate: false,
    rejected: false,
    decision: '',
    notes: output.nonFiniteDetected ? 'Non-finite value detected.' : 'real-runtime-v0 completed without non-finite values.',
  };

  const reasons = rejectReasons(row);
  row.candidate = isCandidate(row);
  row.rejected = !row.candidate;
  row.decision = row.candidate ? 'runtime candidate' : `rejected: ${reasons.join('; ') || 'outside target band'}`;
  return row;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function createDecision(results) {
  const stage1Candidates = results.filter((result) => result.validationStage === 'stage-1-32-smoke' && result.conditionName === 'Condition D: memory + coupling + pheromone trace' && result.candidate);
  const stage2Candidates = results.filter((result) => result.validationStage === 'stage-2-64-smoke' && result.conditionName === 'Condition D: memory + coupling + pheromone trace' && result.candidate);
  const stage3Candidates = results.filter((result) => result.validationStage === 'stage-3-64-full' && result.conditionName === 'Condition D: memory + coupling + pheromone trace' && result.candidate);
  const runtime32CandidateFound = stage1Candidates.length > 0;
  const runtime64SmokeCandidateFound = stage2Candidates.length > 0;
  const runtime64FullCandidateFound = stage3Candidates.length >= 3;
  const blockingIssues = [];

  if (!runtime32CandidateFound) blockingIssues.push('32³ Condition D real-runtime-v0 candidate not found');
  if (runtime32CandidateFound && !runtime64SmokeCandidateFound) blockingIssues.push('64³ smoke Condition D real-runtime-v0 candidate not found');
  if (runtime64SmokeCandidateFound && !runtime64FullCandidateFound) blockingIssues.push('64³ three-seed Condition D real-runtime-v0 candidate not found');

  return {
    runtime32CandidateFound,
    runtime64SmokeCandidateFound,
    runtime64FullCandidateFound,
    canProceedToV22Planning: runtime64FullCandidateFound,
    needsAdditionalV212Scan: runtime32CandidateFound && runtime64SmokeCandidateFound && !runtime64FullCandidateFound,
    needsRuntimeRework: !runtime32CandidateFound || !runtime64SmokeCandidateFound,
    blockingIssues,
    recommendedNextStep: runtime64FullCandidateFound
      ? 'Proceed to v2.2 planning; do not implement v2.2 features in this PR.'
      : (runtime64SmokeCandidateFound ? 'Run or tune 64³ three-seed real-runtime-v0 validation.' : (runtime32CandidateFound ? 'Run or tune 64³ smoke real-runtime-v0 validation.' : 'Continue v2.1.2 real-runtime-v0 implementation/tuning before v2.2 planning.')),
  };
}

function formatNumber(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'number') return String(value);
  return Number.isFinite(value) ? value.toFixed(6) : '';
}

function paramsTable(params) {
  return Object.entries(params).map(([key, value]) => `| ${key} | ${JSON.stringify(value)} |`).join('\n');
}

function writeDocs(output, summary) {
  const stageRows = output.stages.map((stage) => `| ${stage.validationStage} | ${stage.actualGridSize} | ${stage.maxSteps} | ${stage.seeds.join(', ')} | ${stage.status} |`).join('\n');
  const conditionRows = output.conditions.map((condition) => `| ${condition.conditionName} | ${condition.params.MEMORY_ENABLED} | ${condition.params.MEMORY_COUPLING_ENABLED} | ${condition.params.PHEROMONE_ENABLED} | ${condition.purpose} |`).join('\n');
  const resultRows = output.results.map((result) => `| ${result.validationStage} | ${result.conditionName} | ${result.seed} | ${result.actualGridSize} | ${result.runType} | ${formatNumber(result.fieldABDistance_start)} | ${formatNumber(result.fieldABDistance_end)} | ${formatNumber(result.memoryFieldDifferenceA_end)} / ${formatNumber(result.memoryFieldDifferenceB_end)} | ${result.finalVortexCount} | ${formatNumber(result.pheromoneActiveRatio_end)} | ${formatNumber(result.fieldEnergyProxyDeltaRatio)} | ${formatNumber(result.runtimeMsTotal)} | ${result.decision} |`).join('\n');
  const topCandidateRows = summary.topCandidates.map((result) => `- ${result.validationStage} / ${result.conditionName} / seed ${result.seed}: fieldABDistance ${formatNumber(result.fieldABDistance_start)} → ${formatNumber(result.fieldABDistance_end)}, memory trace ${formatNumber(result.memoryFieldDifferenceA_end)} / ${formatNumber(result.memoryFieldDifferenceB_end)}`).join('\n') || '- None';

  const doc = `# AeternaLoop-Trinity v2.1.2 Real Runtime Validation

## Summary

Experiment 020 created and executed a clearly labeled \`real-runtime-v0\` A/B field loop. This is not the diagnostic-surrogate runner: it owns A/B field arrays under \`src/runtime/\`, connects memory, difference-attractor coupling, pheromone trace-only updates, and collects metrics from the live arrays.

## Why This Step Was Needed

Experiment 019 found that surrogate-64 produced a candidate, but real 64³ validation remained blocked because no production-equivalent runtime was available. v2.2 should not begin until a non-surrogate runtime can carry the v2.1.2 candidate through staged validation.

## Difference From Previous Real64 Gate

The previous Real64 gate audited for an existing runtime and fell back to a labeled diagnostic surrogate. This validation creates a runtime foundation named \`real-runtime-v0\` and records its limitations separately from surrogate evidence.

## Candidate Params

| param | value |
|---|---:|
${paramsTable(output.candidateParams)}

## Runtime Foundation

| item | result |
|---|---|
${Object.entries(output.runtimeFoundation).map(([key, value]) => `| ${key} | ${Array.isArray(value) ? value.join('<br>') : value} |`).join('\n')}

## Runtime Files

${output.runtimeFoundation.files.map((file) => `- ${file}`).join('\n')}

## Validation Stages

| stage | grid | steps | seeds | status |
|---|---:|---:|---|---|
${stageRows}

## Conditions

| condition | memory | coupling | pheromone | purpose |
|---|---|---|---|---|
${conditionRows}

## Results

| stage | condition | seed | grid | runType | fieldABDistance start | fieldABDistance end | memoryTrace | vortex | pheromoneActiveRatio | energyDelta | runtime | decision |
|---|---|---:|---:|---|---:|---:|---:|---|---:|---:|---:|---|
${resultRows}

## Interpretation

### Did real-runtime-v0 exist?

Yes. \`real-runtime-v0\` was created under \`src/runtime/\` and run with \`runType = real-runtime-v0\` and \`dynamicsType = aeterna-runtime-v0\`.

### Did 32³ smoke pass?

${summary.decision.runtime32CandidateFound ? 'Yes. Condition D reached the runtime candidate band at 32³.' : 'No. Condition D did not satisfy all runtime candidate checks at 32³.'}

### Did 64³ smoke pass?

${summary.decision.runtime64SmokeCandidateFound ? 'Yes. Condition D reached the runtime candidate band at 64³ smoke scale.' : 'No. Condition D did not satisfy all runtime candidate checks at 64³ smoke scale, or the stage was not run.'}

### Did 64³ full validation pass?

${summary.decision.runtime64FullCandidateFound ? 'Yes. Condition D passed the three-seed 64³ validation rule.' : 'No. The three-seed 64³ validation rule did not pass, or the stage was not run.'}

### Did A/B meet?

${output.results.some((result) => result.fieldABDistance_end < result.fieldABDistance_start) ? 'At least one condition reduced A/B field distance.' : 'No recorded condition reduced A/B field distance.'}

### Did A/B collapse?

${output.results.some((result) => result.fieldABDistance_end < 0.005) ? 'At least one row reached the identity-collapse risk band.' : 'No recorded row reached the field identity-collapse risk band.'}

### Did memory remain a trace?

${output.results.some((result) => result.memoryFieldDifferenceA_end >= 0.05 && result.memoryFieldDifferenceA_end <= 0.35 && result.memoryFieldDifferenceB_end >= 0.05 && result.memoryFieldDifferenceB_end <= 0.35) ? 'At least one row retained memory-field differences in the target trace band.' : 'No recorded row retained memory-field differences in the target trace band.'}

### Did pheromone remain local?

${output.results.some((result) => result.PHEROMONE_ENABLED && result.pheromoneActiveRatio_end < 0.9 && result.pheromoneSpatialEntropy_end < 0.95) ? 'At least one pheromone-enabled row avoided fog/uniformization thresholds.' : 'No pheromone-enabled row met locality thresholds.'}

### Did vortices persist?

${output.results.every((result) => result.finalVortexCount > 0) ? 'Yes. Vortex count stayed non-zero in all recorded rows.' : 'No. At least one row lost all vortices.'}

### Did performance hold?

${output.results.every((result) => result.runtimeMsTotal === null || result.runtimeMsTotal < 20 * 60 * 1000) ? 'No configured performance hard block was hit.' : 'At least one row exceeded the configured performance guard.'}

## Recommended Params

${Object.keys(summary.recommendedParams).length > 0 ? paramsTable(summary.recommendedParams) : 'No recommended real-runtime-v0 params were accepted.'}

Top candidates:
${topCandidateRows}

## Decision

${summary.decision.canProceedToV22Planning ? '- Proceed to v2.2 planning' : '- Continue runtime implementation'}

## Recommended Next Step

${summary.decision.recommendedNextStep}
`;

  fs.writeFileSync(DOC_PATH, doc);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const stages = createStages(options);
  const sampleInterval = Number(options.sampleInterval || DEFAULT_SAMPLE_INTERVAL);
  const results = [];
  const blockedReasons = [];
  const rejectedPatterns = [];
  const createdAt = new Date().toISOString();

  for (const stage of stages) {
    if (stage.status && stage.status.startsWith('skipped')) continue;
    stage.status = 'running';
    for (const seed of stage.seeds) {
      for (const condition of CONDITIONS) {
        const seedB = seed + 55545;
        const start = process.hrtime.bigint();
        const output = runAeternaRuntimeV0Condition({
          conditionParams: condition.params,
          gridSize: stage.actualGridSize,
          maxSteps: stage.maxSteps,
          seed,
          seedB,
          sampleInterval,
          metricsSampleInterval: sampleInterval,
        });
        const end = process.hrtime.bigint();
        const runtimeMsTotal = Number(end - start) / 1e6;
        const row = resultRow({ condition, stage, seed, output, runtimeMsTotal });
        results.push(row);
        if (row.rejected) rejectedPatterns.push({ validationStage: row.validationStage, conditionName: row.conditionName, seed: row.seed, decision: row.decision });
        console.log(`${row.validationStage} ${row.conditionName} seed=${seed} fieldAB=${formatNumber(row.fieldABDistance_start)}->${formatNumber(row.fieldABDistance_end)} decision=${row.decision}`);
      }
    }
    stage.status = 'completed';
  }

  const candidates = results.filter((result) => result.candidate);
  const decision = createDecision(results);
  const runMeta = {
    experimentName: 'experiment:v212-real-runtime-validation',
    version: 'v2.1.2',
    createdAt,
    commit: gitValue('git rev-parse HEAD', 'unknown'),
    branch: gitValue('git rev-parse --abbrev-ref HEAD', 'unknown'),
    requestedGridSize: stages[stages.length - 1]?.requestedGridSize ?? null,
    actualGridSize: stages[stages.length - 1]?.actualGridSize ?? null,
    seeds: stages[stages.length - 1]?.seeds ?? [],
    maxSteps: stages[stages.length - 1]?.maxSteps ?? null,
    sampleInterval,
    runType: 'real-runtime-v0',
    dynamicsType: 'aeterna-runtime-v0',
    runtimeAvailable: true,
    validationStage: stages.map((stage) => stage.validationStage).join(', '),
    notes: 'real-runtime-v0 foundation run; diagnostic-surrogate was not used.',
  };
  const runtimeFoundation = {
    created: true,
    files: [
      'src/runtime/aeterna-runtime-v0.js',
      'src/runtime/create-aeterna-fields.js',
      'src/runtime/step-aeterna-runtime-v0.js',
      'scripts/run-v212-real-runtime-validation.js',
    ],
    usesDiagnosticSurrogate: false,
    hasFieldA: true,
    hasFieldB: true,
    hasMemory: true,
    hasCoupling: true,
    hasPheromone: true,
    hasMetrics: true,
    supportsGrid32: results.some((result) => result.actualGridSize === 32),
    supportsGrid64: results.some((result) => result.actualGridSize === 64),
    limitations: [
      'real-runtime-v0 is a headless runtime foundation, not the full browser/UI production runtime.',
      'Field dynamics use the repository scalar complex field pattern with periodic 3D Laplacian and simple potential force.',
      'Pheromone remains trace-only because PHEROMONE_FEEDBACK_ENABLED is false.',
      'Vortex counting samples the mid-z plane as a validation proxy.',
    ],
  };
  const output = {
    runMeta,
    candidateParams: V212_CANDIDATE_PARAMS,
    runtimeFoundation,
    conditions: CONDITIONS.map((condition) => ({ conditionName: condition.conditionName, purpose: condition.purpose, params: condition.params })),
    stages,
    results,
    candidates,
    blockedReasons,
    rejectedPatterns,
    decision,
  };
  const summary = {
    runMeta: {
      version: 'v2.1.2',
      createdAt,
      sourceExperiment: 'experiments/v2.1.2-real-runtime-validation-results.json',
      interpretationRunType: 'real-runtime-v0-validation',
    },
    runtimeFoundation,
    topCandidates: candidates.slice(0, 10),
    blockedReasons,
    rejectedPatterns: rejectedPatterns.slice(0, 20),
    recommendedParams: candidates.length > 0 ? V212_CANDIDATE_PARAMS : {},
    decision,
  };

  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDocs(output, summary);
  console.log(`Wrote ${path.relative(path.join(__dirname, '..'), RESULTS_PATH)}`);
  console.log(`Wrote ${path.relative(path.join(__dirname, '..'), SUMMARY_PATH)}`);
  console.log(`Wrote ${path.relative(path.join(__dirname, '..'), DOC_PATH)}`);
}

main();
