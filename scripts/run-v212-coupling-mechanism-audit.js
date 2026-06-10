#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_SCAN_CONFIG,
  createRunMeta,
  runDualFieldCondition,
  updatePheromoneFieldByDepositMode,
} = require('./diagnostic-surrogate-utils');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-coupling-mechanism-audit-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-coupling-mechanism-audit-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-coupling-mechanism-audit.md');
const SEEDS = Object.freeze([12345, 23456, 34567]);
const CONFIG = Object.freeze({ ...DEFAULT_SCAN_CONFIG, gamma: 0.005, seed: 12345, seedA: 12345, seedB: 12900 });
const FIXED_PARAMS = Object.freeze({
  GAMMA: 0.005,
  MEMORY_ENABLED: true,
  MEMORY_BLEND_VELOCITY: true,
  HISTORY_ALPHA: 0.00025,
  MEMORY_WEIGHT: 0.04,
  MEMORY_WEIGHT_MODE: 'fixed',
  MEMORY_VELOCITY_SCALE: 0.1,
  PHEROMONE_ENABLED: true,
  PHEROMONE_FEEDBACK_ENABLED: false,
  PHEROMONE_DIFFUSION: 0,
  PHEROMONE_DEPOSIT_THRESHOLD_RATIO: 0.95,
  PHEROMONE_DEPOSIT: 0.02,
  PHEROMONE_DEPOSIT_MODE: 'top-10-percent-amplitude',
});
const COUPLING_CONDITIONS = Object.freeze([
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.03 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.05 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.075 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.10 }),
]);
const FORMULA_ORDER_CONDITIONS = Object.freeze([
  Object.freeze({ label: 'A', MEMORY_COUPLING_FORMULA: 'absolute-memory', MEMORY_COUPLING_ORDER: 'after-memory-update' }),
  Object.freeze({ label: 'B', MEMORY_COUPLING_FORMULA: 'absolute-memory', MEMORY_COUPLING_ORDER: 'before-memory-update' }),
  Object.freeze({ label: 'C', MEMORY_COUPLING_FORMULA: 'difference-attractor', MEMORY_COUPLING_ORDER: 'after-memory-update' }),
  Object.freeze({ label: 'D', MEMORY_COUPLING_FORMULA: 'difference-attractor', MEMORY_COUPLING_ORDER: 'before-memory-update' }),
]);
const HISTORY_ALPHA_VALUES = Object.freeze([0.00025, 0.0005, 0.001, 0.002, 0.004]);
const AUDIT_FINDINGS = Object.freeze({
  previousFormula: 'Code audit found the existing implementation uses a difference-to-other-memory pull: fieldA += G * W * (fieldB.memory - fieldA.phi), and fieldB uses a per-cell snapshot of fieldB.phi plus fieldA.memory. It is not an absolute-memory add in the current repository.',
  previousOrder: 'diagnostic-surrogate-utils runs field dynamics, then EWMA memory update and memory blend, then applySelectedCoupling/applyMemoryCoupling. Phase rotation is not applied in this surrogate runner.',
  newFormula: 'difference-attractor',
  newOrder: 'before-memory-update',
  usesBidirectionalSnapshot: true,
});

function round(value, digits = 6) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function rangeScore(value, min, max) {
  if (value < min || value > max) return 0;
  const center = (min + max) / 2;
  const half = (max - min) / 2;
  return clamp01(1 - Math.abs(value - center) / Math.max(half, 1e-8));
}

function energyDeltaRatio(start, end) {
  return (end - start) / Math.max(Math.abs(start), 1e-8);
}

function deltaRatio(start, end) {
  return (end - start) / Math.max(Math.abs(start), 1e-8);
}

function averageMemoryTrace(result) {
  return (result.memoryFieldDifferenceA_end + result.memoryFieldDifferenceB_end) / 2;
}

function rejectReasons(result) {
  const reasons = [];
  if (result.fieldABDistance_end > result.fieldABDistance_start) reasons.push('fieldABDistance increased; coupling may be repulsive');
  if (result.fieldABDistance_end < 0.005) reasons.push('A/B too close; identity collapse risk');
  if (result.memoryABDistance_end < 0.005) reasons.push('memory A/B too identical');
  if (result.memoryFieldDifferenceA_end < 0.05 || result.memoryFieldDifferenceB_end < 0.05) reasons.push('memory trace too close to current field');
  if (result.memoryFieldDifferenceA_end > 0.35 || result.memoryFieldDifferenceB_end > 0.35) reasons.push('memory trace too far from current field');
  if (result.pheromoneActiveRatio_end >= 0.9) reasons.push('pheromone background fog');
  if (result.pheromoneSpatialEntropy_end >= 0.95) reasons.push('pheromone too uniform');
  if (result.amplitudeStdA_end < 0.01 || result.amplitudeStdB_end < 0.01) reasons.push('field too flat');
  if (result.finalVortexCount === 0) reasons.push('vortex disappeared');
  if (Math.abs(result.fieldEnergyProxyDeltaRatio) > 0.25) reasons.push('field energy proxy changed too much');
  return reasons;
}

function isCandidate(result) {
  return result.finalVortexCount > 0 &&
    result.fieldABDistance_end < result.fieldABDistance_start &&
    result.fieldABDistanceDeltaRatio < 0 &&
    result.fieldABDistance_end >= 0.01 && result.fieldABDistance_end <= 0.1 &&
    result.memoryABDistance_end >= 0.005 &&
    result.memoryFieldDifferenceA_end >= 0.05 && result.memoryFieldDifferenceA_end <= 0.35 &&
    result.memoryFieldDifferenceB_end >= 0.05 && result.memoryFieldDifferenceB_end <= 0.35 &&
    result.pheromoneActiveRatio_end < 0.9 &&
    result.pheromoneSpatialEntropy_end < 0.95 &&
    result.amplitudeStdA_end >= 0.01 && result.amplitudeStdB_end >= 0.01 &&
    Math.abs(result.fieldEnergyProxyDeltaRatio) <= 0.25;
}

function isDirectionCandidate(result) {
  return !result.candidate &&
    result.fieldABDistanceDeltaRatio < -0.01 &&
    result.fieldABDistance_end >= 0.005 &&
    result.memoryABDistance_end >= 0.005 &&
    result.memoryFieldDifferenceA_end >= 0.05 && result.memoryFieldDifferenceA_end <= 0.35 &&
    result.memoryFieldDifferenceB_end >= 0.05 && result.memoryFieldDifferenceB_end <= 0.35 &&
    result.pheromoneActiveRatio_end < 0.9 &&
    result.pheromoneSpatialEntropy_end < 0.95 &&
    result.amplitudeStdA_end >= 0.01 && result.amplitudeStdB_end >= 0.01 &&
    result.finalVortexCount > 0 &&
    Math.abs(result.fieldEnergyProxyDeltaRatio) <= 0.25;
}

function scoreResult(result) {
  const reductionRatio = result.fieldABDistance_start > 0 ? (result.fieldABDistance_start - result.fieldABDistance_end) / result.fieldABDistance_start : 0;
  const abDistanceReductionScore = clamp01(reductionRatio);
  const targetBandScore = rangeScore(result.fieldABDistance_end, 0.01, 0.1);
  const nonCollapseScore = (
    clamp01(result.fieldABDistance_end / 0.01) * 0.35 +
    clamp01(result.memoryABDistance_end / 0.005) * 0.30 +
    clamp01(Math.min(result.amplitudeStdA_end, result.amplitudeStdB_end) / 0.02) * 0.35
  );
  const memoryTraceScore = (rangeScore(result.memoryFieldDifferenceA_end, 0.05, 0.35) + rangeScore(result.memoryFieldDifferenceB_end, 0.05, 0.35)) / 2;
  const vortexPersistenceScore = result.finalVortexCount > 0 ? 1 : 0;
  const energyStabilityScore = clamp01(1 - Math.abs(result.fieldEnergyProxyDeltaRatio) / 0.25);
  return abDistanceReductionScore * 0.35 +
    targetBandScore * 0.20 +
    nonCollapseScore * 0.20 +
    memoryTraceScore * 0.10 +
    vortexPersistenceScore * 0.10 +
    energyStabilityScore * 0.05;
}

function buildCondition({ seed, formula, order, couplingG, historyAlpha, conditionName }) {
  return {
    conditionName,
    ...FIXED_PARAMS,
    HISTORY_ALPHA: historyAlpha,
    COUPLING_ENABLED: true,
    COUPLING_TYPE: 'memory',
    COUPLING_G: couplingG,
    MEMORY_COUPLING_ENABLED: true,
    MEMORY_COUPLING_WEIGHT: 1.0,
    MEMORY_COUPLING_FORMULA: formula,
    MEMORY_COUPLING_ORDER: order,
    PHEROMONE_UPDATE_INTERVAL: 10,
    PHEROMONE_RETENTION: 0.99005,
    seed,
  };
}

function buildResult({ seed, formula, order, couplingG, historyAlpha = FIXED_PARAMS.HISTORY_ALPHA, phase = 'sweep' }) {
  const effective = couplingG;
  const config = Object.freeze({ ...CONFIG, seed, seedA: seed, seedB: seed + 555 });
  const conditionName = `${phase} ${formula} ${order} COUPLING_G=${couplingG} HISTORY_ALPHA=${historyAlpha} seed=${seed}`;
  const condition = buildCondition({ seed, formula, order, couplingG, historyAlpha, conditionName });
  const run = runDualFieldCondition(condition, config, {
    createPheromoneField: true,
    updatePheromoneField: updatePheromoneFieldByDepositMode,
  });
  const { params, initialMetrics, finalMetrics, couplingMetrics, pheromoneStats } = run;
  const result = {
    conditionName,
    seed,
    MEMORY_COUPLING_FORMULA: params.MEMORY_COUPLING_FORMULA,
    MEMORY_COUPLING_ORDER: params.MEMORY_COUPLING_ORDER,
    MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_WEIGHT,
    COUPLING_G: params.COUPLING_G,
    effectiveMemoryCoupling: couplingMetrics?.effectiveMemoryCoupling ?? effective,
    COUPLING_TYPE: params.COUPLING_TYPE,
    MEMORY_COUPLING_ENABLED: params.MEMORY_COUPLING_ENABLED,
    HISTORY_ALPHA: params.HISTORY_ALPHA,
    MEMORY_WEIGHT: params.MEMORY_WEIGHT,
    MEMORY_WEIGHT_MODE: params.MEMORY_WEIGHT_MODE,
    MEMORY_VELOCITY_SCALE: params.MEMORY_VELOCITY_SCALE,
    PHEROMONE_ENABLED: params.PHEROMONE_ENABLED,
    PHEROMONE_FEEDBACK_ENABLED: params.PHEROMONE_FEEDBACK_ENABLED,
    PHEROMONE_DIFFUSION: params.PHEROMONE_DIFFUSION,
    PHEROMONE_DEPOSIT_THRESHOLD_RATIO: params.PHEROMONE_DEPOSIT_THRESHOLD_RATIO,
    PHEROMONE_DEPOSIT: params.PHEROMONE_DEPOSIT,
    PHEROMONE_DEPOSIT_MODE: params.PHEROMONE_DEPOSIT_MODE,
    initialVortexCount: run.initialVortexCount,
    finalVortexCount: run.finalVortexCount,
    vortexLifetimeAverage: finalMetrics.vortexLifetimeAverage,
    vortexLifetimeMax: finalMetrics.vortexLifetimeMax,
    fieldABDistance_start: initialMetrics.fieldABDistance,
    fieldABDistance_end: finalMetrics.fieldABDistance,
    fieldABDistanceDelta: finalMetrics.fieldABDistance - initialMetrics.fieldABDistance,
    fieldABDistanceDeltaRatio: deltaRatio(initialMetrics.fieldABDistance, finalMetrics.fieldABDistance),
    memoryABDistance_start: initialMetrics.memoryABDistance,
    memoryABDistance_end: finalMetrics.memoryABDistance,
    memoryABDistanceDelta: finalMetrics.memoryABDistance - initialMetrics.memoryABDistance,
    memoryABDistanceDeltaRatio: deltaRatio(initialMetrics.memoryABDistance, finalMetrics.memoryABDistance),
    memoryFieldDifferenceA_end: finalMetrics.memoryFieldDifferenceA,
    memoryFieldDifferenceB_end: finalMetrics.memoryFieldDifferenceB,
    R_AB_orderDifferenceRatio_end: finalMetrics.R_AB_orderDifferenceRatio,
    R_A_global_end: finalMetrics.R_A_global,
    R_B_global_end: finalMetrics.R_B_global,
    R_A_local_average_end: finalMetrics.R_A_local_average,
    R_B_local_average_end: finalMetrics.R_B_local_average,
    pheromoneActiveRatio_end: pheromoneStats.pheromoneActiveRatio,
    pheromoneSpatialEntropy_end: pheromoneStats.pheromoneSpatialEntropy,
    pheromoneEnergyL2_end: pheromoneStats.pheromoneEnergyL2,
    pheromoneMax_end: pheromoneStats.pheromoneMax,
    amplitudeMeanA_end: finalMetrics.amplitudeMeanA,
    amplitudeMeanB_end: finalMetrics.amplitudeMeanB,
    amplitudeStdA_end: finalMetrics.amplitudeStdA,
    amplitudeStdB_end: finalMetrics.amplitudeStdB,
    fieldEnergyProxy_start: initialMetrics.fieldEnergyProxyCombined,
    fieldEnergyProxy_end: finalMetrics.fieldEnergyProxyCombined,
    fieldEnergyProxyDeltaRatio: energyDeltaRatio(initialMetrics.fieldEnergyProxyCombined, finalMetrics.fieldEnergyProxyCombined),
    score: 0,
    candidate: false,
    directionCandidate: false,
    rejected: false,
    decision: 'pending',
    notes: run.nonFiniteDetected ? 'Non-finite values detected in sampled arrays.' : 'Coupling mechanism audit surrogate run completed.',
  };
  const reasons = rejectReasons(result);
  result.candidate = isCandidate(result);
  result.directionCandidate = isDirectionCandidate(result);
  result.rejected = !result.candidate && !result.directionCandidate && reasons.length > 0;
  result.score = scoreResult(result);
  if (result.candidate) result.decision = 'candidate';
  else if (result.directionCandidate) result.decision = 'direction candidate';
  else result.decision = `rejected: ${reasons.join('; ') || 'outside audit candidate band'}`;
  return result;
}

function summarizePatterns(results) {
  const keys = [...new Set(results.map((result) => `${result.MEMORY_COUPLING_FORMULA}|${result.MEMORY_COUPLING_ORDER}|${result.HISTORY_ALPHA}|${result.COUPLING_G}`))];
  return keys.map((key) => {
    const rows = results.filter((result) => `${result.MEMORY_COUPLING_FORMULA}|${result.MEMORY_COUPLING_ORDER}|${result.HISTORY_ALPHA}|${result.COUPLING_G}` === key);
    const mean = (field) => rows.reduce((sum, row) => sum + row[field], 0) / Math.max(rows.length, 1);
    const candidates = rows.filter((row) => row.candidate);
    const directionCandidates = rows.filter((row) => row.directionCandidate || row.candidate);
    const first = rows[0];
    return {
      MEMORY_COUPLING_FORMULA: first.MEMORY_COUPLING_FORMULA,
      MEMORY_COUPLING_ORDER: first.MEMORY_COUPLING_ORDER,
      HISTORY_ALPHA: first.HISTORY_ALPHA,
      MEMORY_COUPLING_WEIGHT: first.MEMORY_COUPLING_WEIGHT,
      COUPLING_G: first.COUPLING_G,
      effectiveMemoryCoupling: first.effectiveMemoryCoupling,
      seeds: rows.map((row) => row.seed),
      candidateSeeds: candidates.map((row) => row.seed),
      directionCandidateSeeds: directionCandidates.map((row) => row.seed),
      allSeedsCandidate: candidates.length === rows.length,
      anySeedCandidate: candidates.length > 0,
      allSeedsDirectionCandidate: directionCandidates.length === rows.length,
      anySeedDirectionCandidate: directionCandidates.length > 0,
      meanScore: mean('score'),
      meanFieldABDistance_start: mean('fieldABDistance_start'),
      meanFieldABDistance_end: mean('fieldABDistance_end'),
      meanFieldABDistanceDeltaRatio: mean('fieldABDistanceDeltaRatio'),
      meanMemoryABDistance_end: mean('memoryABDistance_end'),
      meanMemoryTrace_end: rows.reduce((sum, row) => sum + averageMemoryTrace(row), 0) / Math.max(rows.length, 1),
      minFinalVortexCount: Math.min(...rows.map((row) => row.finalVortexCount)),
      maxAbsEnergyDeltaRatio: Math.max(...rows.map((row) => Math.abs(row.fieldEnergyProxyDeltaRatio))),
      decision: candidates.length === rows.length ? 'candidate across all seeds' : (directionCandidates.length > 0 ? 'direction candidate observed' : 'rejected'),
    };
  }).sort((a, b) => b.meanScore - a.meanScore);
}

function buildDecision(patterns) {
  const candidates = patterns.filter((pattern) => pattern.allSeedsCandidate || pattern.anySeedCandidate);
  const directionCandidates = patterns.filter((pattern) => pattern.allSeedsDirectionCandidate || pattern.anySeedDirectionCandidate);
  const best = candidates[0] ?? directionCandidates[0] ?? patterns[0] ?? null;
  const formulaDirectionImproved = patterns.some((pattern) => pattern.MEMORY_COUPLING_FORMULA === 'difference-attractor' && pattern.meanFieldABDistanceDeltaRatio < 0);
  const blockingIssues = [];
  if (candidates.length === 0) blockingIssues.push('No condition entered the 0.01-0.1 target fieldABDistance band while passing all guardrails.');
  if (directionCandidates.length === 0) blockingIssues.push('No condition produced a stable fieldABDistance reduction.');
  return {
    formulaDirectionImproved,
    candidateFound: candidates.length > 0,
    directionCandidateFound: directionCandidates.length > 0,
    recommendedParams: best && (candidates.length > 0 || directionCandidates.length > 0) ? {
      MEMORY_COUPLING_FORMULA: best.MEMORY_COUPLING_FORMULA,
      MEMORY_COUPLING_ORDER: best.MEMORY_COUPLING_ORDER,
      MEMORY_COUPLING_WEIGHT: best.MEMORY_COUPLING_WEIGHT,
      COUPLING_G: best.COUPLING_G,
      effectiveMemoryCoupling: best.effectiveMemoryCoupling,
      HISTORY_ALPHA: best.HISTORY_ALPHA,
      MEMORY_WEIGHT: FIXED_PARAMS.MEMORY_WEIGHT,
      MEMORY_WEIGHT_MODE: FIXED_PARAMS.MEMORY_WEIGHT_MODE,
      MEMORY_VELOCITY_SCALE: FIXED_PARAMS.MEMORY_VELOCITY_SCALE,
      PHEROMONE_DIFFUSION: FIXED_PARAMS.PHEROMONE_DIFFUSION,
      PHEROMONE_DEPOSIT_THRESHOLD_RATIO: FIXED_PARAMS.PHEROMONE_DEPOSIT_THRESHOLD_RATIO,
      PHEROMONE_DEPOSIT: FIXED_PARAMS.PHEROMONE_DEPOSIT,
      PHEROMONE_DEPOSIT_MODE: FIXED_PARAMS.PHEROMONE_DEPOSIT_MODE,
      PHEROMONE_FEEDBACK_ENABLED: FIXED_PARAMS.PHEROMONE_FEEDBACK_ENABLED,
    } : {},
    canProceedToReal64Validation: candidates.length > 0,
    canProceedToV22Planning: false,
    needsAdditionalV212Scan: candidates.length === 0,
    needsCouplingModelRework: directionCandidates.length === 0,
    blockingIssues,
    recommendedNextStep: candidates.length > 0 ? 'Use the candidate params for a real 64^3 validation gate before any v2.2 planning.' : (directionCandidates.length > 0 ? 'Continue v2.1.2 parameter tuning around the direction candidate before real 64^3 validation.' : 'Rework or rescan the coupling model before real 64^3 validation or v2.2 planning.'),
  };
}

function fmt(value, digits = 6) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '') : String(value);
}

function writeDoc(summary) {
  const rows = [...summary.topCandidates, ...summary.topDirectionCandidates]
    .filter((row, index, allRows) => allRows.findIndex((candidate) => `${candidate.MEMORY_COUPLING_FORMULA}|${candidate.MEMORY_COUPLING_ORDER}|${candidate.HISTORY_ALPHA}|${candidate.COUPLING_G}` === `${row.MEMORY_COUPLING_FORMULA}|${row.MEMORY_COUPLING_ORDER}|${row.HISTORY_ALPHA}|${row.COUPLING_G}`) === index)
    .slice(0, 12);
  const tableRows = rows.map((row, index) => `| ${index + 1} | ${row.MEMORY_COUPLING_FORMULA} | ${row.MEMORY_COUPLING_ORDER} | ${fmt(row.HISTORY_ALPHA)} | ${fmt(row.COUPLING_G)} | ${fmt(row.meanFieldABDistance_start)} | ${fmt(row.meanFieldABDistance_end)} | ${fmt(row.meanFieldABDistanceDeltaRatio)} | ${fmt(row.meanMemoryABDistance_end)} | ${fmt(row.meanMemoryTrace_end)} | ${row.minFinalVortexCount} | ${fmt(row.maxAbsEnergyDeltaRatio)} | ${row.decision} |`).join('\n') || '| - | - | - | - | - | - | - | - | - | - | - | - | No rows recorded. |';
  const recommended = Object.keys(summary.recommendedParams).length > 0 ? `\`${JSON.stringify(summary.recommendedParams)}\`` : 'None.';
  const markdown = `# AeternaLoop-Trinity v2.1.2 Coupling Mechanism Audit

## Summary

Experiment 018 audited the v2.1.2 Memory Coupling implementation and compared formula/order variants in the combined diagnostic surrogate. The audit found that the repository's existing coupling implementation is already a difference-to-other-memory pull, applied after EWMA memory update/blend. This experiment added an explicit \`absolute-memory\` comparison mode and an experimental \`before-memory-update\` order without replacing the existing behavior.

## Why This Audit Was Needed

Experiment 017 showed that increasing effectiveMemoryCoupling moved A/B farther apart in the combined surrogate. That made the coupling formula and application order the next suspected causes.

## Previous Result

Experiment 017 showed that increasing effectiveMemoryCoupling moved A/B farther apart.

## Current Coupling Formula Audit

### Previous Formula

${AUDIT_FINDINGS.previousFormula}

### Previous Step Order

${AUDIT_FINDINGS.previousOrder}

### Risks Found

- The current implementation is bidirectional and uses per-cell snapshots for \`fieldA.phi\`, \`fieldB.phi\`, and the memory targets before assigning either field.
- The previous PR #20 / Experiment 017 order coupled after \`applyEWMAMemory\`, meaning the memory EWMA update and memory-to-field blend had already occurred before cross-field memory coupling.
- The surrogate runner does not currently call phase rotation, so the audited order is field dynamics -> memory update/blend -> memory coupling -> pheromone/metrics.

## New Experimental Formula

### Difference-Attractor Coupling

The explicit \`difference-attractor\` formula keeps the current pull form: \`fieldA += G * W * (fieldB.memory - fieldA.phi)\` and \`fieldB += G * W * (fieldA.memory - fieldB.phi)\`.

### Bidirectional Snapshot Rule

Both directions read \`fieldA.phi\`, \`fieldB.phi\`, \`fieldA.memory\`, and \`fieldB.memory\` before writing the updated fields for each cell, avoiding update-order bias within the A/B pair.

### Experimental Step Order

The script tests \`MEMORY_COUPLING_ORDER = "before-memory-update"\`, which runs coupling after field dynamics and before EWMA memory update/blend.

## Experiment Plan

### Step 1: Smoke Test

Smoke test: \`difference-attractor\` + \`before-memory-update\`, \`COUPLING_G = 0.05\`, seed \`12345\`.

### Step 2: Difference-Attractor Sweep

Compared \`COUPLING_G\` values 0.03, 0.05, 0.075, and 0.10 across seeds 12345, 23456, and 34567, including formula/order controls A-D.

### Step 3: HISTORY_ALPHA Rescan

Run only if a stable difference-attractor direction candidate is detected. This run used the best detected \`COUPLING_G\` and HISTORY_ALPHA values 0.00025, 0.0005, 0.001, 0.002, and 0.004.

## Results

| rank | formula | order | HISTORY_ALPHA | COUPLING_G | fieldABDistance start | fieldABDistance end | deltaRatio | memoryABDistance | memoryTrace | vortex | energyDelta | decision |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
${tableRows}

## Interpretation

### Did the formula direction improve?

${summary.decision.formulaDirectionImproved ? 'Yes. At least one difference-attractor row reduced fieldABDistance from start to end.' : 'No. Difference-attractor rows did not produce a stable reduction in this run.'}

### Did A/B meet?

${summary.decision.candidateFound ? 'Yes. At least one row met the target band and guardrails.' : 'No. No row reached all candidate guardrails.'}

### Did A/B collapse?

Rows with fieldABDistance below 0.005 or memoryABDistance below 0.005 were rejected as collapse risks.

### Did memory remain a trace?

Accepted and direction-candidate rows must keep memoryFieldDifferenceA/B inside 0.05-0.35.

### Did pheromone remain local?

Rows are rejected if pheromoneActiveRatio reaches 0.9 or pheromoneSpatialEntropy reaches 0.95.

### Did step order matter?

The summary compares after-memory-update and before-memory-update rows. See the JSON results for per-seed formula/order deltas.

## Recommended Params

${recommended}

## Decision

${summary.decision.candidateFound ? 'Proceed to real 64³ validation' : (summary.decision.directionCandidateFound ? 'Continue v2.1.2 parameter tuning' : 'Rework coupling model before continuing')}

- Continue v2.1.2 parameter tuning: ${summary.decision.needsAdditionalV212Scan ? 'Yes' : 'No'}
- Proceed to real 64³ validation: ${summary.decision.canProceedToReal64Validation ? 'Yes' : 'No'}
- Proceed to v2.2 planning: ${summary.decision.canProceedToV22Planning ? 'Yes' : 'No'}
- Rework coupling model before continuing: ${summary.decision.needsCouplingModelRework ? 'Yes' : 'No'}
- Rework metrics before continuing: No.

## Recommended Next Step

${summary.decision.recommendedNextStep}
`;
  fs.writeFileSync(DOC_PATH, markdown);
}

function main() {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const results = [];

  results.push(buildResult({ seed: 12345, formula: 'difference-attractor', order: 'before-memory-update', couplingG: 0.05, phase: 'smoke' }));

  for (const formulaOrder of FORMULA_ORDER_CONDITIONS) {
    for (const condition of COUPLING_CONDITIONS) {
      for (const seed of SEEDS) {
        results.push(buildResult({
          seed,
          formula: formulaOrder.MEMORY_COUPLING_FORMULA,
          order: formulaOrder.MEMORY_COUPLING_ORDER,
          couplingG: condition.COUPLING_G,
          phase: `step2-${formulaOrder.label}`,
        }));
      }
    }
  }

  let patterns = summarizePatterns(results);
  const bestDirection = patterns.find((pattern) => pattern.MEMORY_COUPLING_FORMULA === 'difference-attractor' && pattern.MEMORY_COUPLING_ORDER === 'before-memory-update' && pattern.anySeedDirectionCandidate);
  if (bestDirection) {
    for (const historyAlpha of HISTORY_ALPHA_VALUES) {
      for (const seed of SEEDS) {
        results.push(buildResult({
          seed,
          formula: 'difference-attractor',
          order: 'before-memory-update',
          couplingG: bestDirection.COUPLING_G,
          historyAlpha,
          phase: 'step3-history-alpha',
        }));
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  patterns = summarizePatterns(results);
  const topCandidates = patterns.filter((pattern) => pattern.anySeedCandidate).slice(0, 10);
  const topDirectionCandidates = patterns.filter((pattern) => pattern.anySeedDirectionCandidate).slice(0, 10);
  const rejectedPatterns = patterns.filter((pattern) => !pattern.anySeedCandidate && !pattern.anySeedDirectionCandidate);
  const decision = buildDecision(patterns);
  const runMeta = {
    ...createRunMeta({
      experimentName: 'experiment:v212-coupling-mechanism-audit',
      config: CONFIG,
      notes: 'Coupling mechanism audit comparing absolute-memory and difference-attractor coupling formulas with coupling-order variants.',
    }),
    seeds: SEEDS,
  };
  const output = {
    runMeta,
    startedAt,
    finishedAt: new Date().toISOString(),
    fixedParams: FIXED_PARAMS,
    auditFindings: AUDIT_FINDINGS,
    results,
    directionCandidates: results.filter((result) => result.directionCandidate),
    candidates: results.filter((result) => result.candidate),
    rejectedPatterns,
    decision,
  };
  const summary = {
    runMeta: {
      version: 'v2.1.2',
      createdAt: new Date().toISOString(),
      sourceExperiment: 'experiments/v2.1.2-coupling-mechanism-audit-results.json',
      interpretationRunType: 'surrogate-headless-coupling-mechanism-audit',
    },
    auditFindings: AUDIT_FINDINGS,
    topDirectionCandidates,
    topCandidates,
    rejectedPatterns,
    recommendedParams: decision.recommendedParams,
    decision,
  };

  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(summary);
  console.log(`Wrote ${RESULTS_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
  console.log(`Wrote ${DOC_PATH}`);
  console.table(patterns.slice(0, 12).map((row) => ({
    formula: row.MEMORY_COUPLING_FORMULA,
    order: row.MEMORY_COUPLING_ORDER,
    alpha: row.HISTORY_ALPHA,
    g: row.COUPLING_G,
    score: round(row.meanScore),
    fieldABStart: round(row.meanFieldABDistance_start),
    fieldABEnd: round(row.meanFieldABDistance_end),
    deltaRatio: round(row.meanFieldABDistanceDeltaRatio),
    candidate: row.anySeedCandidate,
    direction: row.anySeedDirectionCandidate,
    decision: row.decision,
  })));
}

main();
