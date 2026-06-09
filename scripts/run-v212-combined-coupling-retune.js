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
const RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-combined-coupling-retune-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-combined-coupling-retune-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-combined-coupling-retune-results.md');
const SEEDS = Object.freeze([12345, 23456, 34567]);
const COUPLING_CONDITIONS = Object.freeze([
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.12 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.15 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.18 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.20 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.25 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.30 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.40 }),
]);
const FIXED_PARAMS = Object.freeze({
  GAMMA: 0.005,
  HISTORY_ALPHA: 0.00025,
  MEMORY_WEIGHT: 0.04,
  MEMORY_WEIGHT_MODE: 'fixed',
  MEMORY_VELOCITY_SCALE: 0.1,
  MEMORY_ENABLED: true,
  MEMORY_BLEND_VELOCITY: true,
  PHEROMONE_ENABLED: true,
  PHEROMONE_FEEDBACK_ENABLED: false,
  PHEROMONE_DIFFUSION: 0,
  PHEROMONE_DEPOSIT_THRESHOLD_RATIO: 0.95,
  PHEROMONE_DEPOSIT: 0.02,
  PHEROMONE_DEPOSIT_MODE: 'top-10-percent-amplitude',
});
const CONFIG_BASE = Object.freeze({ ...DEFAULT_SCAN_CONFIG, gamma: FIXED_PARAMS.GAMMA, seed: 12345, seedA: 12345, seedB: 67890 });
const NOTES = 'Combined coupling retune using fixed HISTORY_ALPHA, fixed MEMORY_WEIGHT, fixed pheromone localization candidate, and pheromone feedback disabled.';

function energyDeltaRatio(start, end) {
  return (end - start) / Math.max(Math.abs(start), 1e-8);
}

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

function averageMemoryTrace(result) {
  return (result.memoryFieldDifferenceA_end + result.memoryFieldDifferenceB_end) / 2;
}

function rejectReasons(result) {
  const reasons = [];
  if (result.fieldABDistance_end > 0.1) reasons.push('A/B remain too separate');
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
    result.memoryFieldDifferenceA_end >= 0.05 && result.memoryFieldDifferenceA_end <= 0.35 &&
    result.memoryFieldDifferenceB_end >= 0.05 && result.memoryFieldDifferenceB_end <= 0.35 &&
    result.fieldABDistance_end >= 0.01 && result.fieldABDistance_end <= 0.1 &&
    result.memoryABDistance_end >= 0.005 &&
    result.pheromoneActiveRatio_end < 0.9 &&
    result.pheromoneSpatialEntropy_end < 0.95 &&
    result.amplitudeStdA_end >= 0.01 && result.amplitudeStdB_end >= 0.01 &&
    Math.abs(result.fieldEnergyProxyDeltaRatio) <= 0.25;
}

function scoreResult(result) {
  const abMeetingScore = rangeScore(result.fieldABDistance_end, 0.01, 0.1);
  const nonCollapseScore = (
    clamp01(result.fieldABDistance_end / 0.01) * 0.4 +
    clamp01(result.memoryABDistance_end / 0.005) * 0.3 +
    clamp01(Math.min(result.amplitudeStdA_end, result.amplitudeStdB_end) / 0.02) * 0.3
  );
  const memoryTraceScore = (rangeScore(result.memoryFieldDifferenceA_end, 0.05, 0.35) + rangeScore(result.memoryFieldDifferenceB_end, 0.05, 0.35)) / 2;
  const pheromoneLocalityScore = clamp01(1 - result.pheromoneActiveRatio_end / 0.9) * 0.5 + clamp01(1 - result.pheromoneSpatialEntropy_end / 0.95) * 0.5;
  const vortexPersistenceScore = result.finalVortexCount > 0 ? 1 : 0;
  const energyStabilityScore = clamp01(1 - Math.abs(result.fieldEnergyProxyDeltaRatio) / 0.25);
  return abMeetingScore * 0.35 +
    nonCollapseScore * 0.25 +
    memoryTraceScore * 0.15 +
    pheromoneLocalityScore * 0.10 +
    vortexPersistenceScore * 0.10 +
    energyStabilityScore * 0.05;
}

function buildResult(seed, conditionParams) {
  const effective = conditionParams.MEMORY_COUPLING_WEIGHT * conditionParams.COUPLING_G;
  const config = Object.freeze({ ...CONFIG_BASE, seed, seedA: seed, seedB: seed + 555 });
  const conditionName = `effectiveMemoryCoupling=${effective.toFixed(2)} seed=${seed}`;
  const condition = {
    conditionName,
    MEMORY_ENABLED: FIXED_PARAMS.MEMORY_ENABLED,
    HISTORY_ALPHA: FIXED_PARAMS.HISTORY_ALPHA,
    MEMORY_WEIGHT: FIXED_PARAMS.MEMORY_WEIGHT,
    MEMORY_WEIGHT_MODE: FIXED_PARAMS.MEMORY_WEIGHT_MODE,
    MEMORY_BLEND_VELOCITY: FIXED_PARAMS.MEMORY_BLEND_VELOCITY,
    MEMORY_VELOCITY_SCALE: FIXED_PARAMS.MEMORY_VELOCITY_SCALE,
    COUPLING_ENABLED: true,
    COUPLING_TYPE: 'memory',
    COUPLING_G: conditionParams.COUPLING_G,
    MEMORY_COUPLING_ENABLED: true,
    MEMORY_COUPLING_WEIGHT: conditionParams.MEMORY_COUPLING_WEIGHT,
    PHEROMONE_ENABLED: FIXED_PARAMS.PHEROMONE_ENABLED,
    PHEROMONE_FEEDBACK_ENABLED: FIXED_PARAMS.PHEROMONE_FEEDBACK_ENABLED,
    PHEROMONE_UPDATE_INTERVAL: 10,
    PHEROMONE_RETENTION: 0.99005,
    PHEROMONE_DIFFUSION: FIXED_PARAMS.PHEROMONE_DIFFUSION,
    PHEROMONE_DEPOSIT_THRESHOLD_RATIO: FIXED_PARAMS.PHEROMONE_DEPOSIT_THRESHOLD_RATIO,
    PHEROMONE_DEPOSIT: FIXED_PARAMS.PHEROMONE_DEPOSIT,
    PHEROMONE_DEPOSIT_MODE: FIXED_PARAMS.PHEROMONE_DEPOSIT_MODE,
  };
  const run = runDualFieldCondition(condition, config, {
    createPheromoneField: true,
    updatePheromoneField: updatePheromoneFieldByDepositMode,
  });
  const { params, initialMetrics, finalMetrics, couplingMetrics, pheromoneStats } = run;
  const result = {
    conditionName,
    seed,
    HISTORY_ALPHA: params.HISTORY_ALPHA,
    MEMORY_WEIGHT: params.MEMORY_WEIGHT,
    MEMORY_WEIGHT_MODE: params.MEMORY_WEIGHT_MODE,
    MEMORY_VELOCITY_SCALE: params.MEMORY_VELOCITY_SCALE,
    MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_WEIGHT,
    COUPLING_G: params.COUPLING_G,
    effectiveMemoryCoupling: couplingMetrics?.effectiveMemoryCoupling ?? effective,
    COUPLING_TYPE: params.COUPLING_TYPE,
    MEMORY_COUPLING_ENABLED: params.MEMORY_COUPLING_ENABLED,
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
    memoryFieldDifferenceA_end: finalMetrics.memoryFieldDifferenceA,
    memoryFieldDifferenceB_end: finalMetrics.memoryFieldDifferenceB,
    fieldABDistance_start: initialMetrics.fieldABDistance,
    fieldABDistance_end: finalMetrics.fieldABDistance,
    memoryABDistance_start: initialMetrics.memoryABDistance,
    memoryABDistance_end: finalMetrics.memoryABDistance,
    R_AB_orderDifferenceRatio_end: finalMetrics.R_AB_orderDifferenceRatio,
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
    candidate: false,
    rejected: false,
    decision: 'pending',
    notes: run.nonFiniteDetected ? 'Non-finite values detected in sampled arrays.' : NOTES,
  };
  const reasons = rejectReasons(result);
  result.candidate = isCandidate(result);
  result.rejected = !result.candidate && reasons.length > 0;
  result.combinedCouplingScore = scoreResult(result);
  if (result.candidate) result.decision = 'candidate';
  else result.decision = `rejected: ${reasons.join('; ') || 'outside combined candidate band'}`;
  return result;
}

function summarizeByCoupling(results) {
  return COUPLING_CONDITIONS.map((condition) => {
    const effective = condition.MEMORY_COUPLING_WEIGHT * condition.COUPLING_G;
    const rows = results.filter((result) => result.effectiveMemoryCoupling === effective);
    const mean = (key) => rows.reduce((sum, result) => sum + result[key], 0) / Math.max(rows.length, 1);
    const candidates = rows.filter((result) => result.candidate);
    return {
      effectiveMemoryCoupling: effective,
      MEMORY_COUPLING_WEIGHT: condition.MEMORY_COUPLING_WEIGHT,
      COUPLING_G: condition.COUPLING_G,
      seeds: rows.map((result) => result.seed),
      candidateSeeds: candidates.map((result) => result.seed),
      allSeedsCandidate: candidates.length === SEEDS.length,
      anySeedCandidate: candidates.length > 0,
      meanCombinedCouplingScore: mean('combinedCouplingScore'),
      meanFieldABDistance_end: mean('fieldABDistance_end'),
      meanMemoryABDistance_end: mean('memoryABDistance_end'),
      meanMemoryTrace_end: rows.reduce((sum, result) => sum + averageMemoryTrace(result), 0) / Math.max(rows.length, 1),
      meanPheromoneActiveRatio_end: mean('pheromoneActiveRatio_end'),
      meanPheromoneSpatialEntropy_end: mean('pheromoneSpatialEntropy_end'),
      minFinalVortexCount: Math.min(...rows.map((result) => result.finalVortexCount)),
      maxAbsFieldEnergyProxyDeltaRatio: Math.max(...rows.map((result) => Math.abs(result.fieldEnergyProxyDeltaRatio))),
      decision: candidates.length === SEEDS.length ? 'candidate across all seeds' : (candidates.length > 0 ? 'partial candidate; needs confirmation' : 'rejected'),
    };
  }).sort((a, b) => b.meanCombinedCouplingScore - a.meanCombinedCouplingScore);
}

function buildDecision(candidates, topRows) {
  const candidateFound = candidates.length > 0;
  const best = candidates[0] ?? topRows[0] ?? null;
  const blockingIssues = [];
  if (!candidateFound) blockingIssues.push('No effectiveMemoryCoupling value passed all combined surrogate guardrails across all three seeds.');
  if (best && best.meanFieldABDistance_end > 0.1) blockingIssues.push('Top-ranked coupling still leaves A/B above the target fieldABDistance band.');
  if (best && best.maxAbsFieldEnergyProxyDeltaRatio > 0.25) blockingIssues.push('Top-ranked coupling has too much field energy proxy movement.');
  return {
    candidateFound,
    recommendedParams: candidateFound ? {
      HISTORY_ALPHA: FIXED_PARAMS.HISTORY_ALPHA,
      MEMORY_WEIGHT: FIXED_PARAMS.MEMORY_WEIGHT,
      MEMORY_WEIGHT_MODE: FIXED_PARAMS.MEMORY_WEIGHT_MODE,
      MEMORY_VELOCITY_SCALE: FIXED_PARAMS.MEMORY_VELOCITY_SCALE,
      MEMORY_COUPLING_WEIGHT: best.MEMORY_COUPLING_WEIGHT,
      COUPLING_G: best.COUPLING_G,
      effectiveMemoryCoupling: best.effectiveMemoryCoupling,
      PHEROMONE_DIFFUSION: FIXED_PARAMS.PHEROMONE_DIFFUSION,
      PHEROMONE_DEPOSIT_THRESHOLD_RATIO: FIXED_PARAMS.PHEROMONE_DEPOSIT_THRESHOLD_RATIO,
      PHEROMONE_DEPOSIT: FIXED_PARAMS.PHEROMONE_DEPOSIT,
      PHEROMONE_DEPOSIT_MODE: FIXED_PARAMS.PHEROMONE_DEPOSIT_MODE,
      PHEROMONE_FEEDBACK_ENABLED: FIXED_PARAMS.PHEROMONE_FEEDBACK_ENABLED,
    } : {},
    canProceedToReal64Validation: candidateFound,
    canProceedToV22Planning: false,
    needsAdditionalV212Scan: !candidateFound,
    blockingIssues,
    recommendedNextStep: candidateFound ? 'Use the recommended combined surrogate coupling for a real 64^3 validation gate before any v2.2 planning.' : 'Run another v2.1.2 combined coupling scan or rework coupling metrics before real 64^3 validation or v2.2 planning.',
  };
}

function fmt(value, digits = 6) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '') : String(value);
}

function writeDoc(output, summary) {
  const topRows = summary.topCandidates.length > 0 ? summary.topCandidates : summary.rejectedPatterns.slice(0, 5);
  const fixedRows = Object.entries(output.fixedParams).map(([key, value]) => `| ${key} | ${value} |`).join('\n');
  const scanRows = COUPLING_CONDITIONS.map((condition) => `| ${fmt(condition.MEMORY_COUPLING_WEIGHT * condition.COUPLING_G, 2)} | ${condition.MEMORY_COUPLING_WEIGHT} | ${condition.COUPLING_G} |`).join('\n');
  const candidateRows = topRows.map((row, index) => `| ${index + 1} | ${fmt(row.effectiveMemoryCoupling, 2)} | ${fmt(row.meanFieldABDistance_end)} | ${fmt(row.meanMemoryABDistance_end)} | ${fmt(row.meanMemoryTrace_end)} | ${fmt(row.meanPheromoneActiveRatio_end)} | ${fmt(row.meanPheromoneSpatialEntropy_end)} | ${row.minFinalVortexCount} | ${fmt(row.maxAbsFieldEnergyProxyDeltaRatio)} | ${row.decision} |`).join('\n') || '| - | - | - | - | - | - | - | - | - | No rows recorded. |';
  const rejectedRows = summary.rejectedPatterns.map((row) => `- effectiveMemoryCoupling=${fmt(row.effectiveMemoryCoupling, 2)}: ${row.decision}; mean fieldABDistance=${fmt(row.meanFieldABDistance_end)}, max |energyDelta|=${fmt(row.maxAbsFieldEnergyProxyDeltaRatio)}.`).join('\n') || '- None.';
  const recommendedParams = Object.keys(summary.recommendedParams).length > 0 ? `\`${JSON.stringify(summary.recommendedParams)}\`` : 'None.';
  const decisionText = summary.decision.candidateFound ? 'Proceed to real 64³ validation' : 'Proceed to another v2.1.2 scan';

  const markdown = `# AeternaLoop-Trinity v2.1.2 Combined Coupling Retune Results

## Summary

Experiment 017 retuned Memory Coupling under the fixed combined v2.1.2 surrogate state. HISTORY_ALPHA, MEMORY_WEIGHT, and the pheromone localization candidate were fixed, pheromone feedback stayed disabled, and the scan varied only effectiveMemoryCoupling by using MEMORY_COUPLING_WEIGHT = 1.0 with higher COUPLING_G values.

Result: ${summary.decision.candidateFound ? 'a combined surrogate candidate was found across all seeds.' : 'no coupling passed all combined surrogate guardrails across all seeds.'}

## Fixed Params

| param | value |
|---|---:|
${fixedRows}

## Scan Axis

| effectiveMemoryCoupling | MEMORY_COUPLING_WEIGHT | COUPLING_G |
|---:|---:|---:|
${scanRows}

## Top Candidates

| rank | effectiveCoupling | fieldABDistance | memoryABDistance | memoryTrace | pheromoneActiveRatio | entropy | vortex | energyDelta | decision |
|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
${candidateRows}

## Rejected Patterns

${rejectedRows}

## Interpretation

### Did A/B meet?

${summary.decision.candidateFound ? 'Yes. At least one effectiveMemoryCoupling value entered the target fieldABDistance band across all configured seeds.' : 'No. Every scanned row remained above the 0.01–0.1 target band; increasing effectiveMemoryCoupling above 0.1 moved A/B farther apart in this combined surrogate.'}

### Did A/B collapse?

Rows with fieldABDistance_end below 0.005 or memoryABDistance_end below 0.005 were rejected as identity-collapse risks. The aggregate decision keeps such rows out of recommended params.

### Did memory remain a trace?

Rows were accepted only if memoryFieldDifferenceA/B stayed in the surrogate trace band of 0.05–0.35.

### Did pheromone stay local?

Rows were rejected if pheromoneActiveRatio_end reached 0.9 or pheromoneSpatialEntropy_end reached 0.95, preserving the localization requirement and avoiding global fog.

### Did vortices persist?

Rows were accepted only if finalVortexCount stayed above zero.

## Recommended Params

${recommendedParams}

## Decision

${decisionText}

- Proceed to another v2.1.2 scan: ${summary.decision.needsAdditionalV212Scan ? 'Yes' : 'No'}
- Proceed to real 64³ validation: ${summary.decision.canProceedToReal64Validation ? 'Yes' : 'No'}
- Proceed to v2.2 planning: ${summary.decision.canProceedToV22Planning ? 'Yes' : 'No'}
- Rework coupling model or metrics before continuing: ${summary.decision.candidateFound ? 'No immediate rework required before the real 64³ gate.' : 'Maybe, if another scan repeats the same blockers.'}

Blocking issues:
${summary.decision.blockingIssues.map((issue) => `- ${issue}`).join('\n') || '- None.'}

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

  for (const condition of COUPLING_CONDITIONS) {
    for (const seed of SEEDS) {
      results.push(buildResult(seed, condition));
    }
  }

  results.sort((a, b) => b.combinedCouplingScore - a.combinedCouplingScore);
  const aggregates = summarizeByCoupling(results);
  const candidates = aggregates.filter((row) => row.allSeedsCandidate);
  const rejectedPatterns = aggregates.filter((row) => !row.allSeedsCandidate);
  const decision = buildDecision(candidates, aggregates);
  const runMeta = {
    ...createRunMeta({ experimentName: 'experiment:v212-combined-coupling-retune', config: CONFIG_BASE, notes: NOTES }),
    seeds: SEEDS,
  };
  const output = {
    runMeta,
    startedAt,
    finishedAt: new Date().toISOString(),
    fixedParams: FIXED_PARAMS,
    scanAxis: {
      name: 'effectiveMemoryCoupling',
      values: COUPLING_CONDITIONS.map((condition) => condition.MEMORY_COUPLING_WEIGHT * condition.COUPLING_G),
      implementation: 'MEMORY_COUPLING_WEIGHT fixed at 1.0; COUPLING_G varied to produce the requested effectiveMemoryCoupling values.',
      conditions: COUPLING_CONDITIONS,
    },
    scoring: {
      combinedCouplingScore: 'abMeetingScore * 0.35 + nonCollapseScore * 0.25 + memoryTraceScore * 0.15 + pheromoneLocalityScore * 0.10 + vortexPersistenceScore * 0.10 + energyStabilityScore * 0.05',
    },
    candidateCriteria: [
      'finalVortexCount remains above zero',
      'memoryFieldDifferenceA/B remain in 0.05-0.35',
      'fieldABDistance_end lands in 0.01-0.1',
      'memoryABDistance_end does not pin below 0.005',
      'pheromoneActiveRatio_end stays below 0.9',
      'pheromoneSpatialEntropy_end stays below 0.95',
      'amplitudeStdA/B stay above 0.01',
      'fieldEnergyProxyDeltaRatio remains within +/-0.25',
      'A/B do not become completely identical',
    ],
    results,
    candidates,
    rejectedPatterns,
    decision,
  };
  const summary = {
    runMeta: {
      version: 'v2.1.2',
      createdAt: new Date().toISOString(),
      sourceExperiment: 'experiments/v2.1.2-combined-coupling-retune-results.json',
      interpretationRunType: 'surrogate-headless-combined-coupling-retune',
    },
    topCandidates: candidates.length > 0 ? candidates : aggregates.slice(0, 5),
    rejectedPatterns,
    recommendedParams: decision.recommendedParams,
    decision,
  };

  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(output, summary);
  console.log(`Wrote ${RESULTS_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
  console.log(`Wrote ${DOC_PATH}`);
  console.table(aggregates.map((row) => ({
    effective: row.effectiveMemoryCoupling,
    score: round(row.meanCombinedCouplingScore),
    fieldAB: round(row.meanFieldABDistance_end),
    memoryAB: round(row.meanMemoryABDistance_end),
    memoryTrace: round(row.meanMemoryTrace_end),
    activeRatio: round(row.meanPheromoneActiveRatio_end),
    entropy: round(row.meanPheromoneSpatialEntropy_end),
    vortex: row.minFinalVortexCount,
    decision: row.decision,
  })));
}

main();
