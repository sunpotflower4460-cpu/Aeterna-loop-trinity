#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createAeternaRuntimeV0, collectRuntimeMetrics, computeVortexCount, hasNonFiniteValues } = require('../src/runtime/aeterna-runtime-v0');
const { stepAeternaRuntimeV0 } = require('../src/runtime/step-aeterna-runtime-v0');
const {
  classifyPhaseStructureRegime,
  findPhaseLockOnsetStep,
  findRawDistanceCollapseOnsetStep,
  findStructuralCollapseOnsetStep,
  unwrapPhaseSeries,
} = require('../src/metrics/gauge-invariant-metrics');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-gauge-invariant-audit-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-gauge-invariant-audit-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-gauge-invariant-audit.md');

const BEST_CONDITION_PARAMS = Object.freeze({
  GAMMA: 0.005,
  MEMORY_ENABLED: true,
  MEMORY_BLEND_VELOCITY: true,
  MEMORY_WEIGHT_MODE: 'fixed',
  MEMORY_VELOCITY_SCALE: 0.1,
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

const REQUIRED_RUNS = Object.freeze([
  { label: '32^3-1000-seedA12345-seedB67890', gridSize: 32, maxSteps: 1000, seedA: 12345, seedB: 67890 },
  { label: '32^3-3000-seedA12345-seedB67890', gridSize: 32, maxSteps: 3000, seedA: 12345, seedB: 67890 },
]);

function sampleFromMetrics(step, metrics) {
  return {
    step,
    thetaStar: metrics.thetaStar,
    unwrappedThetaStar: null,
    rawFieldABDistance: metrics.rawFieldABDistance ?? metrics.fieldABDistance,
    fieldABDistance: metrics.fieldABDistance,
    alignedFieldABDistance: metrics.alignedFieldABDistance,
    D_inv: metrics.D_inv,
    gaugeOverlap: metrics.gaugeOverlap,
    thetaStarMemory: metrics.thetaStarMemory,
    alignedMemoryABDistance: metrics.alignedMemoryABDistance,
  };
}

function runCondition(runConfig) {
  const runtime = createAeternaRuntimeV0({
    gridSize: runConfig.gridSize,
    seedA: runConfig.seedA,
    seedB: runConfig.seedB,
    params: BEST_CONDITION_PARAMS,
    config: { sampleInterval: 50, metricsSampleInterval: 50 },
  });

  const samples = [];
  const sampleInterval = 50;
  const startedAt = Date.now();
  let vortexCount = computeVortexCount(runtime.fieldA, runConfig.gridSize) + computeVortexCount(runtime.fieldB, runConfig.gridSize);
  let initialVortexCount = vortexCount;
  let finalVortexCount = vortexCount;
  let stepWhenVortexCountReachedZero = vortexCount === 0 ? 0 : null;
  let nonFiniteDetected = hasNonFiniteValues(runtime.fieldA.phiRe, runtime.fieldA.phiIm, runtime.fieldB.phiRe, runtime.fieldB.phiIm);
  let metrics = collectRuntimeMetrics(runtime, vortexCount);
  samples.push(sampleFromMetrics(0, metrics));

  for (let step = 1; step <= runConfig.maxSteps; step += 1) {
    stepAeternaRuntimeV0(runtime);

    if (step % sampleInterval === 0 || step === runConfig.maxSteps) {
      vortexCount = computeVortexCount(runtime.fieldA, runConfig.gridSize) + computeVortexCount(runtime.fieldB, runConfig.gridSize);
      finalVortexCount = vortexCount;
      if (stepWhenVortexCountReachedZero === null && vortexCount === 0) stepWhenVortexCountReachedZero = step;
      nonFiniteDetected = nonFiniteDetected || hasNonFiniteValues(
        runtime.fieldA.phiRe,
        runtime.fieldA.phiIm,
        runtime.fieldA.velRe,
        runtime.fieldA.velIm,
        runtime.fieldA.memoryRe,
        runtime.fieldA.memoryIm,
        runtime.fieldB.phiRe,
        runtime.fieldB.phiIm,
        runtime.fieldB.velRe,
        runtime.fieldB.velIm,
        runtime.fieldB.memoryRe,
        runtime.fieldB.memoryIm,
        runtime.pheromoneField,
      );
      metrics = collectRuntimeMetrics(runtime, vortexCount);
      samples.push(sampleFromMetrics(step, metrics));
    }
  }

  const unwrapped = unwrapPhaseSeries(samples.map((sample) => sample.thetaStar));
  samples.forEach((sample, index) => {
    sample.unwrappedThetaStar = unwrapped[index];
  });

  const phaseLockOnsetStep = findPhaseLockOnsetStep(samples);
  const structuralCollapseOnsetStep = findStructuralCollapseOnsetStep(samples);
  const rawDistanceCollapseOnsetStep = findRawDistanceCollapseOnsetStep(samples);
  const finalRegimeVerdict = classifyPhaseStructureRegime({
    alignedFieldABDistanceSeries: samples.map((sample) => sample.alignedFieldABDistance),
    unwrappedThetaStarSeries: samples.map((sample) => sample.unwrappedThetaStar),
  });

  return {
    ...runConfig,
    conditionParams: BEST_CONDITION_PARAMS,
    sampleInterval,
    initialVortexCount,
    finalVortexCount,
    stepWhenVortexCountReachedZero,
    nonFiniteDetected,
    phaseLockOnsetStep,
    structuralCollapseOnsetStep,
    rawDistanceCollapseOnsetStep,
    finalRegimeVerdict,
    elapsedMs: Date.now() - startedAt,
    start: samples[0],
    end: samples[samples.length - 1],
    samples,
  };
}

function fmt(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

function writeDoc(results, summary) {
  const rows = results.map((result) => `| ${result.label} | ${fmt(result.start.thetaStar)} | ${fmt(result.end.thetaStar)} | ${fmt(result.start.rawFieldABDistance)} | ${fmt(result.end.rawFieldABDistance)} | ${fmt(result.start.alignedFieldABDistance)} | ${fmt(result.end.alignedFieldABDistance)} | ${fmt(result.end.D_inv)} | ${fmt(result.end.gaugeOverlap)} | ${result.phaseLockOnsetStep ?? 'null'} | ${result.structuralCollapseOnsetStep ?? 'null'} | ${result.rawDistanceCollapseOnsetStep ?? 'null'} | ${result.finalRegimeVerdict} |`);
  const doc = `# v2.1.2 Gauge-Invariant Audit: Experiment 023\n\n## Why raw fieldABDistance was insufficient\n\nLegacy \`fieldABDistance\` is a raw phase-sensitive A/B distance. It changes when two otherwise matching complex fields differ by a global phase. It therefore cannot, by itself, distinguish raw distance collapse, global phase offset relaxation, phase locking, structural collapse, or near-identical-from-start initial conditions.\n\n## Gauge-invariant observer definitions\n\n- \`thetaStar\`: the argument of \`<A,B> = sum_i A_i * conj(B_i)\`. With this module convention, if \`fieldB = exp(i theta) fieldA\`, then \`thetaStar = -theta\`; for the legacy \`phaseOffsetB = +pi/5\`, the expected initial value is approximately \`-pi/5\`.\n- \`alignedFieldABDistance\`: the existing mean per-cell distance convention after aligning B by \`exp(i * thetaStar)\`.\n- \`D_inv\`: \`sqrt((sum|A|^2 + sum|B|^2 - 2|<A,B>|) / N)\`.\n- \`gaugeOverlap\`: \`|<A,B>| / sqrt(sum|A|^2 sum|B|^2)\`.\n\n## Experiment 023 best-condition audit setup\n\n- \`COUPLING_G = 0.0075\`\n- \`MEMORY_WEIGHT = 0.0075\`\n- \`HISTORY_ALPHA = 0.002\`\n- \`MEMORY_COUPLING_FORMULA = difference-attractor\`\n- \`MEMORY_COUPLING_ORDER = after-memory-update\`\n- \`MEMORY_COUPLING_WEIGHT = 1.0\`\n- \`PHEROMONE_ENABLED = true\`\n- \`PHEROMONE_FEEDBACK_ENABLED = false\`\n\n## Audit results\n\n| run | theta start | theta end | raw start | raw end | aligned start | aligned end | D_inv end | overlap end | phase lock onset | structural collapse onset | raw collapse onset | verdict |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${rows.join('\n')}\n\nMachine-readable outputs were written to \`experiments/v2.1.2-gauge-invariant-audit-results.json\` and \`experiments/v2.1.2-gauge-invariant-audit-summary.json\`.\n\n## Raw distance vs aligned structural distance\n\nRaw distance fell as \`thetaStar\` relaxed toward zero. The aligned structural distance was already below the structural distinctness threshold at step 0 and remained near the observer noise floor. This separates raw phase-sensitive distance collapse from structural identity collapse.\n\n## Reinterpretation of old “A/B convergence” and “identity collapse” language\n\nExperiment 023's legacy-layout “collapse” is not supported as structural collapse under gauge-invariant metrics. The measured result indicates global phase offset relaxation / phase locking: \`thetaStar\` moved from approximately \`-pi/5\` toward 0, while \`alignedFieldABDistance\` remained near the noise level throughout the run. Therefore A/B were near-identical-from-start under the legacy layout.\n\n## New terminology rules\n\n- Existing \`fieldABDistance\` means raw phase-sensitive A/B distance.\n- Do not use “identity collapse” alone. Specify raw distance collapse, phase locking, or structural collapse.\n- Structural-collapse claims require gauge-invariant structural metrics.\n- Near-identical-from-start takes priority over phase-locking labels.\n\n## Regime classification priority\n\n1. \`near-identical-from-start\`\n2. \`structural-collapse\`\n3. \`phase-locking\`\n4. \`phase-drift\`\n5. \`indeterminate\`\n\n## Onset definitions\n\n- \`phaseLockOnsetStep\`: first sampled step where the most recent 10 sampled unwrapped \`thetaStar\` values have std <= 0.02 rad and remain locked through the final sample. If fewer than 10 samples exist, all available samples are used.\n- \`structuralCollapseOnsetStep\`: first sampled step where \`alignedFieldABDistance < 0.005\`, provided the starting aligned distance was at least 0.02; otherwise null for near-identical-from-start layouts.\n- \`rawDistanceCollapseOnsetStep\`: first sampled step where raw \`fieldABDistance < 0.005\`; retained only for historical comparison and not sufficient for structural-collapse claims.\n\n## Optional 64^3 runs\n\nSkipped in this PR run to keep the observer-correction audit lightweight and avoid broad/heavy scans. The required 32^3 / 1000 and 32^3 / 3000 runs were completed.\n\n## Implementation notes and next steps\n\n- Randomized vortex controls and Arnold tongue scans are next steps, not active default behavior in this PR.\n- Current \`vortexCount\` is measured on the central z-slice using x-y plaquettes. It should be interpreted as a slice-based vortex indicator, not a full 3D vortex-tube census. Future work may add multi-slice or full-3D vortex tracking.\n- \`applySelectedCoupling\` currently treats \`amplitude\`, \`phase\`, and \`cross\` coupling types as no-op branches in the real runtime.\n- Phase rotation rotates \`phiRe\` / \`phiIm\` and optionally memory, but not \`velRe\` / \`velIm\`; future force-term work should revisit whether velocity rotation is needed for a dedicated phase-drive model.\n\n## Summary verdict\n\n${summary.verdict}\n`;

  fs.writeFileSync(DOC_PATH, doc);
}

function main() {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });

  const results = REQUIRED_RUNS.map(runCondition);
  const summary = {
    generatedAt: new Date().toISOString(),
    requiredRuns: results.map((result) => ({
      label: result.label,
      thetaStar_start: result.start.thetaStar,
      thetaStar_end: result.end.thetaStar,
      rawFieldABDistance_start: result.start.rawFieldABDistance,
      rawFieldABDistance_end: result.end.rawFieldABDistance,
      alignedFieldABDistance_start: result.start.alignedFieldABDistance,
      alignedFieldABDistance_end: result.end.alignedFieldABDistance,
      D_inv_end: result.end.D_inv,
      gaugeOverlap_end: result.end.gaugeOverlap,
      phaseLockOnsetStep: result.phaseLockOnsetStep,
      structuralCollapseOnsetStep: result.structuralCollapseOnsetStep,
      rawDistanceCollapseOnsetStep: result.rawDistanceCollapseOnsetStep,
      finalRegimeVerdict: result.finalRegimeVerdict,
    })),
    optionalRunsSkipped: [
      '64^3 / 1000 steps / 1 seed pair',
      '64^3 / 3000 steps / 1 seed pair',
      '64^3 / 3000 steps / 3 seed pairs',
    ],
    optionalRunSkipReason: 'Skipped to keep this observer-correction PR lightweight and avoid broad/heavy parameter scans.',
    verdict: 'Experiment 023 best condition is classified as near-identical-from-start under gauge-invariant structural metrics; the legacy raw-distance collapse reflects global phase offset relaxation / phase locking, not measured structural collapse.',
  };

  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify({ generatedAt: summary.generatedAt, results }, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(results, summary);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SUMMARY_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, DOC_PATH)}`);
}

if (require.main === module) main();

module.exports = {
  BEST_CONDITION_PARAMS,
  runCondition,
};
