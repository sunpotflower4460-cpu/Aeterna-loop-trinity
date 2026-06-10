'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  DEFAULT_COUPLING_PARAMS,
  DEFAULT_MEMORY_PARAMS,
  DEFAULT_PHEROMONE_PARAMS,
} = require('../src/params/aeterna-params');
const { V212_CANDIDATE_PARAMS } = require('../src/params/v2.1.2-candidate-params');
const {
  runDualFieldCondition,
  updatePheromoneFieldByDepositMode,
} = require('./diagnostic-surrogate-utils');

const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'v2.1.2-real64-validation-results.json');
const SUMMARY_PATH = path.join(__dirname, '..', 'experiments', 'v2.1.2-real64-validation-summary.json');
const DOC_PATH = path.join(__dirname, '..', 'docs', 'v2.1.2-real64-validation.md');
const REQUESTED_GRID_SIZE = 64;
const SEEDS = [12345, 23456, 34567];
const MAX_STEPS = Number(process.env.AETERNA_REAL64_MAX_STEPS || 50);
const SAMPLE_INTERVAL = Number(process.env.AETERNA_REAL64_SAMPLE_INTERVAL || 50);

function gitValue(command, fallback) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch (_error) {
    return fallback;
  }
}

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function auditRuntime() {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = listFiles(srcDir).map((file) => path.relative(path.join(__dirname, '..'), file));
  const runtimeNamePattern = /(^|\/)(main|app|simulation|loop|engine|runtime|aeterna)[^/]*\.js$/i;
  const realRuntimeFiles = files.filter((file) => runtimeNamePattern.test(file) && !file.startsWith('src/metrics/') && !file.startsWith('src/params/'));
  const searchedFiles = files.filter((file) => /\.(js|mjs|cjs|ts|tsx|jsx)$/.test(file));
  const contents = searchedFiles.map((file) => ({ file, text: fs.readFileSync(path.join(__dirname, '..', file), 'utf8') }));
  const simulationLoopFiles = contents
    .filter(({ text }) => /requestAnimationFrame|setInterval|for\s*\([^)]*step|while\s*\([^)]*step|function\s+step|stepField/.test(text))
    .map(({ file }) => file);
  const metricsConnectionFiles = contents
    .filter(({ text }) => /collectAeternaMetrics|fieldABDistance|memoryABDistance|vortexCount/.test(text))
    .map(({ file }) => file);
  const hasDiagnosticOnly = simulationLoopFiles.every((file) => file.startsWith('scripts/') || file.includes('diagnostic'));
  const realRuntimeFound = realRuntimeFiles.length > 0;
  const simulationLoopFound = simulationLoopFiles.some((file) => file.startsWith('src/') && !file.startsWith('src/metrics/') && !file.startsWith('src/params/'));
  const metricsConnectionFound = metricsConnectionFiles.some((file) => file.startsWith('src/') && !file.startsWith('src/metrics/') && !file.startsWith('src/params/'));
  const realAvailable = realRuntimeFound && simulationLoopFound && metricsConnectionFound && !hasDiagnosticOnly;
  return {
    realRuntimeFound,
    realRuntimeFiles,
    simulationLoopFound,
    simulationLoopFiles,
    metricsConnectionFound,
    metricsConnectionFiles,
    canRunGrid64: realAvailable,
    limitations: realAvailable ? [] : [
      'No production-equivalent browser/UI or main A/B simulation runtime was found under src/.',
      'Available executable field dynamics are diagnostic-surrogate scripts, not real-runtime validation.',
      'Real 64³ validation is blocked until a real runtime exposes A/B fields and metrics.',
      `Surrogate-64 fallback defaults to maxSteps=${MAX_STEPS} as a smoke gate because long 64³ diagnostic runs are expensive in this environment.`,
    ],
  };
}

function deltaRatio(start, end) {
  if (!Number.isFinite(start) || Math.abs(start) < 1e-12) return null;
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
  if (result.memoryABDistance_end < 0.005) reasons.push('memory identity collapse risk');
  if (result.memoryFieldDifferenceA_end < 0.05 || result.memoryFieldDifferenceA_end > 0.35) reasons.push('memory trace A outside target band');
  if (result.memoryFieldDifferenceB_end < 0.05 || result.memoryFieldDifferenceB_end > 0.35) reasons.push('memory trace B outside target band');
  if (result.pheromoneActiveRatio_end >= 0.9) reasons.push('pheromone fog');
  if (result.pheromoneSpatialEntropy_end >= 0.95) reasons.push('pheromone uniformization');
  if (result.amplitudeStdA_end < 0.01 || result.amplitudeStdB_end < 0.01) reasons.push('field flattened');
  if (Math.abs(result.fieldEnergyProxyDeltaRatio) > 0.25) reasons.push('energy unstable');
  return reasons;
}

function isCandidate(result) {
  return result.runType === 'real-64' &&
    result.dynamicsType === 'real-runtime' &&
    result.runtimeAvailable === true &&
    rejectReasons(result).length === 0 &&
    result.fieldABDistance_end >= 0.01 &&
    result.fieldABDistance_end <= 0.15;
}

function isSurrogateCandidate(result) {
  return result.runType === 'surrogate-64' &&
    result.dynamicsType === 'diagnostic-surrogate' &&
    rejectReasons(result).length === 0 &&
    result.fieldABDistance_end >= 0.01 &&
    result.fieldABDistance_end <= 0.15;
}

const CONDITIONS = [
  {
    conditionName: 'Condition A: baseline surrogate 64 default behavior',
    purpose: 'existing default behavior with v2.1.2 candidate OFF',
    params: {
      MEMORY_ENABLED: false,
      COUPLING_ENABLED: DEFAULT_COUPLING_PARAMS.COUPLING_ENABLED,
      COUPLING_TYPE: DEFAULT_COUPLING_PARAMS.COUPLING_TYPE,
      MEMORY_COUPLING_ENABLED: false,
      PHEROMONE_ENABLED: false,
      PHEROMONE_FEEDBACK_ENABLED: false,
    },
  },
  {
    conditionName: 'Condition B: memory only',
    purpose: 'candidate memory without coupling or pheromone',
    params: {
      ...V212_CANDIDATE_PARAMS,
      MEMORY_COUPLING_ENABLED: false,
      COUPLING_TYPE: DEFAULT_COUPLING_PARAMS.COUPLING_TYPE,
      PHEROMONE_ENABLED: false,
      PHEROMONE_FEEDBACK_ENABLED: false,
    },
  },
  {
    conditionName: 'Condition C: memory + coupling',
    purpose: 'candidate memory and coupling without pheromone',
    params: {
      ...V212_CANDIDATE_PARAMS,
      PHEROMONE_ENABLED: false,
      PHEROMONE_FEEDBACK_ENABLED: false,
    },
  },
  {
    conditionName: 'Condition D: memory + coupling + pheromone trace',
    purpose: 'full v2.1.2 candidate with pheromone feedback OFF',
    params: {
      ...V212_CANDIDATE_PARAMS,
      PHEROMONE_FEEDBACK_ENABLED: false,
    },
  },
];

function buildResult(condition, seed, runtimeAudit) {
  const memoryStart = process.memoryUsage().rss / (1024 * 1024);
  let memoryPeak = memoryStart;
  const started = process.hrtime.bigint();
  const config = Object.freeze({
    gridSize: REQUESTED_GRID_SIZE,
    maxSteps: MAX_STEPS,
    seed,
    seedA: seed,
    seedB: seed + 555,
    gamma: condition.params.GAMMA ?? V212_CANDIDATE_PARAMS.GAMMA,
    dt: 0.03,
    c2: 1.0,
    lambda: 1.0,
    vev: 1.0,
    noiseAmp: 0.001,
    phaseOffsetB: Math.PI / 5,
    sampleInterval: SAMPLE_INTERVAL,
    metricsSampleInterval: SAMPLE_INTERVAL,
  });
  const run = runDualFieldCondition(condition.params, config, {
    createPheromoneField: true,
    updatePheromoneField: updatePheromoneFieldByDepositMode,
  });
  memoryPeak = Math.max(memoryPeak, process.memoryUsage().rss / (1024 * 1024));
  const runtimeMsTotal = Number(process.hrtime.bigint() - started) / 1e6;
  const memoryEnd = process.memoryUsage().rss / (1024 * 1024);
  const { params, initialMetrics, finalMetrics, pheromoneStats } = run;
  const base = {
    conditionName: condition.conditionName,
    validationStage: 'surrogate-64 smoke fallback after real-runtime audit blocked',
    seed,
    requestedGridSize: REQUESTED_GRID_SIZE,
    actualGridSize: REQUESTED_GRID_SIZE,
    runType: 'surrogate-64',
    dynamicsType: 'diagnostic-surrogate',
    runtimeAvailable: false,
    GAMMA: config.gamma,
    MEMORY_ENABLED: Boolean(params.MEMORY_ENABLED),
    MEMORY_BLEND_VELOCITY: Boolean(params.MEMORY_BLEND_VELOCITY),
    HISTORY_ALPHA: safe(params.HISTORY_ALPHA),
    MEMORY_WEIGHT: safe(params.MEMORY_WEIGHT),
    MEMORY_WEIGHT_MODE: params.MEMORY_WEIGHT_MODE ?? null,
    MEMORY_VELOCITY_SCALE: safe(params.MEMORY_VELOCITY_SCALE),
    MEMORY_COUPLING_ENABLED: Boolean(params.MEMORY_COUPLING_ENABLED),
    MEMORY_COUPLING_FORMULA: params.MEMORY_COUPLING_FORMULA ?? null,
    MEMORY_COUPLING_ORDER: params.MEMORY_COUPLING_ORDER ?? null,
    MEMORY_COUPLING_WEIGHT: safe(params.MEMORY_COUPLING_WEIGHT),
    COUPLING_G: safe(params.COUPLING_G),
    COUPLING_TYPE: params.COUPLING_TYPE ?? null,
    PHEROMONE_ENABLED: Boolean(params.PHEROMONE_ENABLED),
    PHEROMONE_FEEDBACK_ENABLED: Boolean(params.PHEROMONE_FEEDBACK_ENABLED),
    PHEROMONE_DIFFUSION: safe(params.PHEROMONE_DIFFUSION),
    PHEROMONE_DEPOSIT_THRESHOLD_RATIO: safe(params.PHEROMONE_DEPOSIT_THRESHOLD_RATIO),
    PHEROMONE_DEPOSIT: safe(params.PHEROMONE_DEPOSIT),
    PHEROMONE_DEPOSIT_MODE: params.PHEROMONE_DEPOSIT_MODE ?? 'all-above-threshold',
    initialVortexCount: run.initialVortexCount,
    finalVortexCount: run.finalVortexCount,
    vortexLifetimeAverage: safe(finalMetrics.vortexLifetimeAverage),
    vortexLifetimeMax: safe(finalMetrics.vortexLifetimeMax),
    stepWhenVortexCountReachedZero: run.stepWhenVortexCountReachedZero,
    fieldABDistance_start: safe(initialMetrics.fieldABDistance),
    fieldABDistance_end: safe(finalMetrics.fieldABDistance),
    memoryABDistance_start: safe(initialMetrics.memoryABDistance),
    memoryABDistance_end: safe(finalMetrics.memoryABDistance),
    memoryFieldDifferenceA_end: safe(finalMetrics.memoryFieldDifferenceA),
    memoryFieldDifferenceB_end: safe(finalMetrics.memoryFieldDifferenceB),
    R_A_global_end: safe(finalMetrics.R_A_global),
    R_B_global_end: safe(finalMetrics.R_B_global),
    R_AB_orderDifferenceRatio_end: safe(finalMetrics.R_AB_orderDifferenceRatio),
    R_A_local_average_end: safe(finalMetrics.R_A_local_average),
    R_B_local_average_end: safe(finalMetrics.R_B_local_average),
    pheromoneActiveRatio_end: safe(pheromoneStats.pheromoneActiveRatio),
    pheromoneSpatialEntropy_end: safe(pheromoneStats.pheromoneSpatialEntropy),
    pheromoneEnergyL2_end: safe(pheromoneStats.pheromoneEnergyL2),
    pheromoneMax_end: safe(pheromoneStats.pheromoneMax),
    amplitudeMeanA_end: safe(finalMetrics.amplitudeMeanA),
    amplitudeMeanB_end: safe(finalMetrics.amplitudeMeanB),
    amplitudeStdA_end: safe(finalMetrics.amplitudeStdA),
    amplitudeStdB_end: safe(finalMetrics.amplitudeStdB),
    fieldEnergyProxy_start: safe(initialMetrics.fieldEnergyProxyCombined),
    fieldEnergyProxy_end: safe(finalMetrics.fieldEnergyProxyCombined),
    stepMsAverage: runtimeMsTotal / MAX_STEPS,
    stepMsMax: null,
    runtimeMsTotal,
    memoryMBStart: memoryStart,
    memoryMBEnd: memoryEnd,
    memoryMBPeak: memoryPeak,
    candidate: false,
    rejected: false,
    decision: 'pending',
    notes: run.nonFiniteDetected
      ? 'Non-finite values detected in sampled arrays. This is surrogate-64 only; real runtime is unavailable.'
      : `Surrogate-64 diagnostic smoke fallback completed. Real runtime blocked: ${runtimeAudit.limitations[0]}`,
  };
  base.fieldABDistanceDelta = safe(base.fieldABDistance_end - base.fieldABDistance_start);
  base.fieldABDistanceDeltaRatio = deltaRatio(base.fieldABDistance_start, base.fieldABDistance_end);
  base.memoryABDistanceDelta = safe(base.memoryABDistance_end - base.memoryABDistance_start);
  base.memoryABDistanceDeltaRatio = deltaRatio(base.memoryABDistance_start, base.memoryABDistance_end);
  base.fieldEnergyProxyDeltaRatio = deltaRatio(base.fieldEnergyProxy_start, base.fieldEnergyProxy_end);
  const reasons = rejectReasons(base);
  base.candidate = isSurrogateCandidate(base);
  base.rejected = !base.candidate && reasons.length > 0;
  base.decision = base.candidate ? 'surrogate-64 candidate only; real-64 still blocked' : `rejected: ${reasons.join('; ') || 'not a real-runtime row'}`;
  return base;
}

function createDecision(results, runtimeAudit) {
  const surrogateCandidates = results.filter(isSurrogateCandidate);
  const realCandidates = results.filter(isCandidate);
  const conditionDAllSurrogate = SEEDS.every((seed) => surrogateCandidates.some((result) => result.seed === seed && result.conditionName.startsWith('Condition D')));
  const blockingIssues = runtimeAudit.limitations.slice();
  if (!runtimeAudit.realRuntimeFound) blockingIssues.push('blocked: real runtime unavailable');
  return {
    real64CandidateFound: realCandidates.length > 0,
    surrogate64CandidateFound: conditionDAllSurrogate,
    canProceedToReal64Validation: conditionDAllSurrogate,
    canProceedToV22Planning: false,
    needsAdditionalV212Scan: !conditionDAllSurrogate,
    needsRealRuntimeImplementation: true,
    blockingIssues,
    recommendedNextStep: conditionDAllSurrogate
      ? 'Implement or connect the real A/B 64³ runtime and rerun this gate; do not start v2.2 planning yet.'
      : 'Continue v2.1.2 tuning or metrics work, then implement/connect real runtime before v2.2 planning.',
  };
}

function summarizeCondition(results, conditionName) {
  const rows = results.filter((result) => result.conditionName === conditionName);
  const mean = (key) => rows.length ? rows.reduce((sum, row) => sum + (Number.isFinite(row[key]) ? row[key] : 0), 0) / rows.length : null;
  return {
    conditionName,
    seeds: rows.map((row) => row.seed),
    fieldABDistance_start_mean: mean('fieldABDistance_start'),
    fieldABDistance_end_mean: mean('fieldABDistance_end'),
    memoryABDistance_end_mean: mean('memoryABDistance_end'),
    finalVortexCount_mean: mean('finalVortexCount'),
    pheromoneActiveRatio_end_mean: mean('pheromoneActiveRatio_end'),
    fieldEnergyProxyDeltaRatio_mean: mean('fieldEnergyProxyDeltaRatio'),
    decisions: rows.map((row) => row.decision),
  };
}

function writeDoc(output, summary) {
  const candidateRows = Object.entries(V212_CANDIDATE_PARAMS)
    .map(([key, value]) => `| ${key} | ${JSON.stringify(value)} |`).join('\n');
  const auditRows = Object.entries(output.runtimeAudit)
    .map(([key, value]) => `| ${key} | ${Array.isArray(value) ? value.join('<br>') : JSON.stringify(value)} |`).join('\n');
  const conditionRows = CONDITIONS.map((condition) => `| ${condition.conditionName} | ${Boolean(condition.params.MEMORY_ENABLED)} | ${Boolean(condition.params.MEMORY_COUPLING_ENABLED)} | ${Boolean(condition.params.PHEROMONE_ENABLED)} | ${condition.purpose} |`).join('\n');
  const resultRows = output.results.map((result) => `| ${result.conditionName} | ${result.seed} | ${result.actualGridSize} | ${result.runType} | ${result.fieldABDistance_start?.toFixed(6)} | ${result.fieldABDistance_end?.toFixed(6)} | ${result.memoryFieldDifferenceA_end?.toFixed(6)} / ${result.memoryFieldDifferenceB_end?.toFixed(6)} | ${result.finalVortexCount} | ${result.pheromoneActiveRatio_end?.toFixed(6)} | ${result.fieldEnergyProxyDeltaRatio?.toFixed(6)} | ${result.runtimeMsTotal.toFixed(1)} | ${result.decision} |`).join('\n');
  const conditionD = output.results.filter((result) => result.conditionName.startsWith('Condition D'));
  const fieldReduced = conditionD.every((result) => result.fieldABDistance_end < result.fieldABDistance_start);
  const memoryTrace = conditionD.every((result) => result.memoryFieldDifferenceA_end >= 0.05 && result.memoryFieldDifferenceA_end <= 0.35 && result.memoryFieldDifferenceB_end >= 0.05 && result.memoryFieldDifferenceB_end <= 0.35);
  const pheromoneLocal = conditionD.every((result) => result.pheromoneActiveRatio_end < 0.9 && result.pheromoneSpatialEntropy_end < 0.95);
  const vortexPersist = conditionD.every((result) => result.finalVortexCount > 0);
  const performanceHold = conditionD.every((result) => result.runtimeMsTotal < 300000);
  const markdown = `# AeternaLoop-Trinity v2.1.2 Real 64³ Validation

## Summary

Real 64³ validation is blocked because no production-equivalent real A/B runtime or browser/UI main simulation loop is present in this repository snapshot. The script therefore ran a clearly labeled \`surrogate-64\` diagnostic fallback and did not treat it as \`real-64\`.

## Why This Gate Was Needed

Experiment 018 found a stable v2.1.2 candidate in the combined diagnostic surrogate. This gate checks whether that candidate can be validated in a real 64³ runtime before any v2.2 planning begins.

## Candidate Params

| param | value |
|---|---:|
${candidateRows}

## Runtime Audit

| item | result |
|---|---|
${auditRows}

## Validation Mode

- surrogate-64 only

## Conditions

| condition | memory | coupling | pheromone | purpose |
|---|---|---|---|---|
${conditionRows}

## Results

| condition | seed | grid | runType | fieldABDistance start | fieldABDistance end | memoryTrace | vortex | pheromoneActiveRatio | energyDelta | runtime | decision |
|---|---:|---:|---|---:|---:|---:|---|---:|---:|---:|---|
${resultRows}

## Interpretation

### Did real 64³ runtime exist?

No. The audit did not find a real runtime file, real A/B main loop, or production-equivalent metrics connection outside diagnostic modules.

### Did A/B meet?

In surrogate-64 Condition D, A/B distance ${fieldReduced ? 'decreased for every seed' : 'did not decrease for every seed'}. This remains surrogate evidence only.

### Did A/B collapse?

Condition D rows were checked against field and memory identity-collapse thresholds. See the decisions table for any rejection reason.

### Did memory remain a trace?

Condition D memory traces ${memoryTrace ? 'stayed inside the requested 0.05-0.35 band' : 'did not stay inside the requested band for every seed'} in the surrogate-64 fallback.

### Did pheromone remain local?

Condition D pheromone locality ${pheromoneLocal ? 'stayed below fog/uniformization thresholds' : 'failed at least one locality threshold'} in the surrogate-64 fallback. Pheromone feedback remained OFF.

### Did vortices persist?

Condition D vortices ${vortexPersist ? 'persisted for every seed' : 'did not persist for every seed'} in the surrogate-64 fallback.

### Did performance hold?

Condition D performance ${performanceHold ? 'completed under the local 300s practicality threshold per seed' : 'exceeded the local practicality threshold for at least one seed'} in the surrogate-64 fallback. Real-runtime performance is still unknown.

## Recommended Params

\`${JSON.stringify(V212_CANDIDATE_PARAMS)}\`

## Decision

- Proceed to real 64³ validation

Real runtime implementation/connection is required first. Do not proceed to v2.2 planning from surrogate-64 evidence.

## Recommended Next Step

${summary.decision.recommendedNextStep}
`;
  fs.writeFileSync(DOC_PATH, markdown);
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  const createdAt = new Date().toISOString();
  const runtimeAudit = auditRuntime();
  const results = [];
  for (const condition of CONDITIONS) {
    for (const seed of SEEDS) {
      results.push(buildResult(condition, seed, runtimeAudit));
    }
  }
  const decision = createDecision(results, runtimeAudit);
  const runMeta = {
    experimentName: 'experiment:v212-real64-validation',
    version: 'v2.1.2',
    createdAt,
    commit: gitValue('git rev-parse HEAD', 'unknown'),
    branch: gitValue('git rev-parse --abbrev-ref HEAD', 'unknown'),
    seeds: SEEDS,
    maxSteps: MAX_STEPS,
    sampleInterval: SAMPLE_INTERVAL,
    requestedGridSize: REQUESTED_GRID_SIZE,
    actualGridSize: REQUESTED_GRID_SIZE,
    runType: 'surrogate-64',
    dynamicsType: 'diagnostic-surrogate',
    runtimeAvailable: false,
    validationStage: 'surrogate-64 smoke fallback; real-64 blocked by runtime audit',
    notes: 'No real runtime was found. Results are diagnostic-surrogate 64³ smoke fallback rows and must not be treated as real-64 validation. The fallback used a short staged maxSteps value for local practicality.',
  };
  const output = {
    runMeta,
    candidateParams: V212_CANDIDATE_PARAMS,
    runtimeAudit,
    conditions: CONDITIONS.map((condition) => ({
      conditionName: condition.conditionName,
      purpose: condition.purpose,
      params: condition.params,
    })),
    results,
    candidates: results.filter(isSurrogateCandidate),
    blockedReasons: runtimeAudit.limitations.concat(runtimeAudit.realRuntimeFound ? [] : ['blocked: real runtime unavailable']),
    rejectedPatterns: results.filter((result) => result.rejected).map((result) => ({
      conditionName: result.conditionName,
      seed: result.seed,
      decision: result.decision,
    })),
    decision,
  };
  const summary = {
    runMeta: {
      version: 'v2.1.2',
      createdAt,
      sourceExperiment: 'experiments/v2.1.2-real64-validation-results.json',
      interpretationRunType: 'real64-validation-gate',
    },
    runtimeAudit,
    topCandidates: CONDITIONS.map((condition) => summarizeCondition(results, condition.conditionName)),
    blockedReasons: output.blockedReasons,
    rejectedPatterns: output.rejectedPatterns,
    recommendedParams: V212_CANDIDATE_PARAMS,
    decision,
  };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(output, summary);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
  console.log(`Wrote ${DOC_PATH}`);
  console.log('Real 64³ runtime unavailable; completed surrogate-64 fallback only.');
}

main();
