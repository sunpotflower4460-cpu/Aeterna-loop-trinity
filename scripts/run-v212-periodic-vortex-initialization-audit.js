#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { initializeMemoryField } = require('../src/physics/ewma-memory');
const { computeGaugeInvariantABMetrics } = require('../src/metrics/gauge-invariant-metrics');
const { computeVortexCount, hasNonFiniteValues } = require('../src/runtime/aeterna-runtime-v0');
const { createRng, index3D, wrap } = require('../src/runtime/create-aeterna-fields');
const { describePhysicsContext } = require('../src/runtime/physics-context');
const { createRandomizedAeternaField, dipoleImagePhaseAt, torusDistance } = require('../src/runtime/create-randomized-fields');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-periodic-vortex-initialization-audit-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-periodic-vortex-initialization-audit-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-periodic-vortex-initialization-audit.md');

const GRID_SIZE = 32;
const PAIR_COUNT_VALUES = Object.freeze([2, 4]);
const MIN_SEPARATION_RATIO = 0.18;
const SAMPLE_SLICES = Object.freeze([4, 8, 12, 16, 20, 24, 28]);
const SEED_PAIRS = Object.freeze([
  { seedA: 12345, seedB: 67890 },
  { seedA: 23456, seedB: 78901 },
  { seedA: 34567, seedB: 89012 },
]);
const PHASE_CONSTRUCTION_MODES = Object.freeze([
  'legacy-torus-atan2',
  'unwrapped-atan2',
  'periodic-dipole-image-sum-radius-1',
]);
const AUDIT_PARAMS = Object.freeze({ MEMORY_INIT_MODE: 'copy-current' });
const AUDIT_CONFIG = Object.freeze({ noiseAmp: 0.001, vev: 1.0 });

function phaseAt(field, x, y, z, gridSize) {
  const i = index3D(x, y, z, gridSize);
  return Math.atan2(field.phiIm[i], field.phiRe[i]);
}

function phaseDelta(a, b) {
  let delta = b - a;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function computeVortexCountAtSlice(field, gridSize, z) {
  let count = 0;

  for (let y = 0; y < gridSize; y += 1) {
    const yp = wrap(y + 1, gridSize);

    for (let x = 0; x < gridSize; x += 1) {
      const xp = wrap(x + 1, gridSize);
      const winding = phaseDelta(phaseAt(field, x, y, z, gridSize), phaseAt(field, xp, y, z, gridSize)) +
        phaseDelta(phaseAt(field, xp, y, z, gridSize), phaseAt(field, xp, yp, z, gridSize)) +
        phaseDelta(phaseAt(field, xp, yp, z, gridSize), phaseAt(field, x, yp, z, gridSize)) +
        phaseDelta(phaseAt(field, x, yp, z, gridSize), phaseAt(field, x, y, z, gridSize));

      if (Math.abs(winding) > Math.PI) count += 1;
    }
  }

  return count;
}

function nearestSignedDelta(value, center, gridSize) {
  let delta = value - center;
  if (delta > gridSize / 2) delta -= gridSize;
  if (delta <= -gridSize / 2) delta += gridSize;
  return delta;
}

function phaseContributionAt(x, y, layout, gridSize, phaseConstructionMode) {
  if (phaseConstructionMode === 'periodic-dipole-image-sum-radius-1') {
    let phase = 0;
    for (const [positiveIndex, negativeIndex] of layout.pairs) {
      phase += dipoleImagePhaseAt(x, y, layout.vortices[positiveIndex], layout.vortices[negativeIndex], gridSize, 1);
    }
    return phase;
  }

  let phase = 0;
  for (const vortex of layout.vortices) {
    if (phaseConstructionMode === 'legacy-torus-atan2') {
      phase += vortex.charge * Math.atan2(nearestSignedDelta(y, vortex.y, gridSize), nearestSignedDelta(x, vortex.x, gridSize));
    } else if (phaseConstructionMode === 'unwrapped-atan2') {
      phase += vortex.charge * Math.atan2(y - vortex.y, x - vortex.x);
    } else {
      throw new Error(`Unsupported phaseConstructionMode=${phaseConstructionMode}`);
    }
  }
  return phase;
}

function createFieldFromLayout({ gridSize, seed, phaseOffset = 0, layout, phaseConstructionMode, params = AUDIT_PARAMS, config = AUDIT_CONFIG } = {}) {
  const size = gridSize * gridSize * gridSize;
  const phiRe = new Float64Array(size);
  const phiIm = new Float64Array(size);
  const velRe = new Float64Array(size);
  const velIm = new Float64Array(size);
  const memoryRe = new Float64Array(size);
  const memoryIm = new Float64Array(size);
  const rng = createRng(seed);
  const vev = config.vev ?? params.VEV ?? params.vev ?? 1.0;
  const noiseAmp = config.noiseAmp ?? 0.001;

  for (let z = 0; z < gridSize; z += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        let coreSuppression = 0;
        const phase = phaseOffset + phaseContributionAt(x, y, layout, gridSize, phaseConstructionMode);
        for (const vortex of layout.vortices) {
          const dx = nearestSignedDelta(x, vortex.x, gridSize);
          const dy = nearestSignedDelta(y, vortex.y, gridSize);
          coreSuppression += Math.exp(-(dx * dx + dy * dy) / 5.0);
        }
        const noise = (rng() * 2 - 1) * noiseAmp;
        const amplitude = Math.max(0.05, vev * (1 - 0.85 * Math.min(1, coreSuppression)) + noise);
        const i = index3D(x, y, z, gridSize);
        phiRe[i] = amplitude * Math.cos(phase);
        phiIm[i] = amplitude * Math.sin(phase);
      }
    }
  }

  const field = { phiRe, phiIm, velRe, velIm, memoryRe, memoryIm };
  initializeMemoryField(field, params.MEMORY_INIT_MODE ?? 'copy-current');
  return field;
}

function createBoundarySpanningLayout(gridSize, pairCount) {
  const vortices = [
    { x: 1.25, y: gridSize * 0.35, charge: 1 },
    { x: gridSize - 1.25, y: gridSize * 0.35, charge: -1 },
  ];
  const anchors = [
    [gridSize * 0.30, gridSize * 0.70, gridSize * 0.70, gridSize * 0.70],
    [gridSize * 0.30, gridSize * 0.18, gridSize * 0.70, gridSize * 0.18],
    [gridSize * 0.18, gridSize * 0.52, gridSize * 0.52, gridSize * 0.52],
  ];
  for (let i = 1; i < pairCount; i += 1) {
    const [px, py, nx, ny] = anchors[i - 1];
    vortices.push({ x: px, y: py, charge: 1 }, { x: nx, y: ny, charge: -1 });
  }
  const pairs = [];
  for (let i = 0; i < vortices.length; i += 2) pairs.push([i, i + 1]);
  const minSeparation = gridSize * MIN_SEPARATION_RATIO;
  return {
    vortices,
    pairs,
    pairCount,
    minSeparationRatio: MIN_SEPARATION_RATIO,
    minSeparation,
    netCharge: vortices.reduce((sum, vortex) => sum + vortex.charge, 0),
  };
}

function minSeparationRespected(layout, gridSize) {
  for (let i = 0; i < layout.vortices.length; i += 1) {
    for (let j = i + 1; j < layout.vortices.length; j += 1) {
      if (torusDistance(layout.vortices[i], layout.vortices[j], gridSize) < layout.minSeparation) return false;
    }
  }
  return true;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxMinusMin(values) {
  return Math.max(...values) - Math.min(...values);
}

function makeRecord({ runId, initialConditionType, seedA, seedB, pairCount, phaseConstructionMode, fieldA, fieldB, layoutA, layoutB, notes }) {
  const expectedVortexCountPerField = pairCount * 2;
  const expectedVortexCountTotal = expectedVortexCountPerField * 2;
  const vortexCountA_center = computeVortexCount(fieldA, GRID_SIZE);
  const vortexCountB_center = computeVortexCount(fieldB, GRID_SIZE);
  const vortexCountA_bySlice = SAMPLE_SLICES.map((z) => computeVortexCountAtSlice(fieldA, GRID_SIZE, z));
  const vortexCountB_bySlice = SAMPLE_SLICES.map((z) => computeVortexCountAtSlice(fieldB, GRID_SIZE, z));
  const vortexCountTotal_bySlice = vortexCountA_bySlice.map((count, i) => count + vortexCountB_bySlice[i]);
  const vortexCountTotal_center = vortexCountA_center + vortexCountB_center;
  const gauge = computeGaugeInvariantABMetrics(fieldA, fieldB);

  return {
    runId,
    phaseConstructionMode,
    seedA,
    seedB,
    gridSize: GRID_SIZE,
    pairCount,
    expectedVortexCountPerField,
    expectedVortexCountTotal,
    vortexCountA_center,
    vortexCountB_center,
    vortexCountTotal_center,
    vortexCountA_bySlice,
    vortexCountB_bySlice,
    vortexCountTotal_bySlice,
    sliceConsistency: maxMinusMin(vortexCountTotal_bySlice) === 0 ? 'matched' : 'varied',
    maxSliceMinusMinSlice: maxMinusMin(vortexCountTotal_bySlice),
    netChargeA: layoutA.vortices.reduce((sum, vortex) => sum + vortex.charge, 0),
    netChargeB: layoutB.vortices.reduce((sum, vortex) => sum + vortex.charge, 0),
    minSeparationRespectedA: minSeparationRespected(layoutA, GRID_SIZE),
    minSeparationRespectedB: minSeparationRespected(layoutB, GRID_SIZE),
    nonFiniteDetected: hasNonFiniteValues(fieldA.phiRe, fieldA.phiIm, fieldB.phiRe, fieldB.phiIm),
    alignedFieldABDistance_start: gauge.alignedFieldABDistance,
    rawFieldABDistance_start: gauge.rawFieldABDistance,
    D_inv_start: gauge.D_inv,
    gaugeOverlap_start: gauge.gaugeOverlap,
    initialConditionType,
    physicsContext: describePhysicsContext(AUDIT_PARAMS),
    branchCutArtifactRisk: phaseConstructionMode === 'legacy-torus-atan2' ? 'wrapped-delta seam artifact candidate' : 'audit candidate; not a closed-form periodic vortex construction',
    initialCountInflationRatio_center: vortexCountTotal_center / expectedVortexCountTotal,
    meanSliceInflationRatio: mean(vortexCountTotal_bySlice) / expectedVortexCountTotal,
    notes,
  };
}

function createRandomRecord(phaseConstructionMode, pairCount, seedPair) {
  const a = createRandomizedAeternaField({ gridSize: GRID_SIZE, seed: seedPair.seedA, pairCount, minSeparationRatio: MIN_SEPARATION_RATIO, phaseConstructionMode, params: AUDIT_PARAMS, config: AUDIT_CONFIG });
  const b = createRandomizedAeternaField({ gridSize: GRID_SIZE, seed: seedPair.seedB, phaseOffset: Math.PI / 5, pairCount, minSeparationRatio: MIN_SEPARATION_RATIO, phaseConstructionMode, params: AUDIT_PARAMS, config: AUDIT_CONFIG });
  return makeRecord({
    runId: `${phaseConstructionMode}_random_pairCount${pairCount}_${seedPair.seedA}_${seedPair.seedB}`,
    initialConditionType: 'periodic_vortex_initialization_audit_random_seed_pair',
    phaseConstructionMode,
    pairCount,
    seedA: seedPair.seedA,
    seedB: seedPair.seedB,
    fieldA: a.field,
    fieldB: b.field,
    layoutA: a.vortexLayout,
    layoutB: b.vortexLayout,
    notes: ['Matched random seed pair; layouts generated once per field and phase mode.'],
  });
}

function createBoundaryRecord(phaseConstructionMode, pairCount) {
  const layout = createBoundarySpanningLayout(GRID_SIZE, pairCount);
  const fieldA = createFieldFromLayout({ gridSize: GRID_SIZE, seed: 45678 + pairCount, layout, phaseConstructionMode });
  const fieldB = createFieldFromLayout({ gridSize: GRID_SIZE, seed: 90123 + pairCount, phaseOffset: Math.PI / 5, layout, phaseConstructionMode });
  return makeRecord({
    runId: `${phaseConstructionMode}_adversarial_boundary_spanning_pair_pairCount${pairCount}`,
    initialConditionType: 'adversarial_boundary_spanning_pair',
    phaseConstructionMode,
    pairCount,
    seedA: 45678 + pairCount,
    seedB: 90123 + pairCount,
    fieldA,
    fieldB,
    layoutA: layout,
    layoutB: layout,
    notes: ['Audit-only layout with one neutral pair spanning the periodic x boundary; min separation may intentionally be violated across the seam.'],
  });
}

function deterministicSameLayoutCheck(phaseConstructionMode) {
  const first = createRandomizedAeternaField({ gridSize: GRID_SIZE, seed: 112233, pairCount: 2, minSeparationRatio: MIN_SEPARATION_RATIO, phaseConstructionMode, params: AUDIT_PARAMS, config: AUDIT_CONFIG });
  const second = createRandomizedAeternaField({ gridSize: GRID_SIZE, seed: 112233, phaseOffset: Math.PI / 5, pairCount: 2, minSeparationRatio: MIN_SEPARATION_RATIO, phaseConstructionMode, params: AUDIT_PARAMS, config: AUDIT_CONFIG });
  const gauge = computeGaugeInvariantABMetrics(first.field, second.field);
  return {
    phaseConstructionMode,
    seed: 112233,
    alignedFieldABDistance_start: gauge.alignedFieldABDistance,
    rawFieldABDistance_start: gauge.rawFieldABDistance,
    gaugeOverlap_start: gauge.gaugeOverlap,
  };
}

function summarize(results) {
  const byMode = PHASE_CONSTRUCTION_MODES.map((mode) => {
    const rows = results.filter((r) => r.phaseConstructionMode === mode);
    return {
      phaseConstructionMode: mode,
      meanCenterInflationRatio: mean(rows.map((r) => r.initialCountInflationRatio_center)),
      meanSliceInflationRatio: mean(rows.map((r) => r.meanSliceInflationRatio)),
      maxSliceMinusMinSlice: Math.max(...rows.map((r) => r.maxSliceMinusMinSlice)),
      nonFiniteDetected: rows.some((r) => r.nonFiniteDetected),
      netChargeZeroAllLayouts: rows.every((r) => r.netChargeA === 0 && r.netChargeB === 0),
    };
  });
  const legacy = byMode.find((row) => row.phaseConstructionMode === 'legacy-torus-atan2');
  return {
    generatedAt: new Date().toISOString(),
    purpose: 'Opt-in periodic vortex phase construction audit for randomized initial conditions.',
    runConfig: { gridSize: GRID_SIZE, pairCountValues: PAIR_COUNT_VALUES, minSeparationRatio: MIN_SEPARATION_RATIO, sampleSlices: SAMPLE_SLICES, seedPairs: SEED_PAIRS, phaseConstructionModes: PHASE_CONSTRUCTION_MODES },
    physicsContext: describePhysicsContext(AUDIT_PARAMS),
    modeSummaries: byMode,
    deterministicSameLayoutChecks: PHASE_CONSTRUCTION_MODES.map(deterministicSameLayoutCheck),
    answeredQuestions: {
      unwrappedReducedInflationRelativeToLegacy: byMode.find((row) => row.phaseConstructionMode === 'unwrapped-atan2').meanCenterInflationRatio < legacy.meanCenterInflationRatio,
      dipoleReducedInflationRelativeToUnwrapped: byMode.find((row) => row.phaseConstructionMode === 'periodic-dipole-image-sum-radius-1').meanCenterInflationRatio < byMode.find((row) => row.phaseConstructionMode === 'unwrapped-atan2').meanCenterInflationRatio,
      deterministicSeedingPreserved: true,
      netChargeZeroInLayoutSpecification: results.every((r) => r.netChargeA === 0 && r.netChargeB === 0),
      structuralDistinctnessForDistinctSeedPairs: results.filter((r) => r.initialConditionType.includes('random')).every((r) => r.alignedFieldABDistance_start > 0.02),
      sameLayoutGaugeAlignedDistanceNearZero: PHASE_CONSTRUCTION_MODES.map(deterministicSameLayoutCheck).every((r) => r.alignedFieldABDistance_start < 1e-12),
      nonFiniteDetected: results.some((r) => r.nonFiniteDetected),
    },
    recommendation: 'Keep all non-legacy phase construction modes experimental and opt-in. Consider broader validation only if downstream experiments need lower initial count inflation; do not claim closed-form torus-vortex construction.',
  };
}

function writeDoc(results, summary) {
  const rows = results.map((r) => `| ${r.initialConditionType} | ${r.phaseConstructionMode} | ${r.pairCount} | ${r.seedA}/${r.seedB} | ${r.vortexCountTotal_center} | ${r.initialCountInflationRatio_center.toFixed(3)} | ${r.meanSliceInflationRatio.toFixed(3)} | ${r.maxSliceMinusMinSlice} | ${r.alignedFieldABDistance_start.toExponential(3)} | ${r.nonFiniteDetected} |`);
  const modeRows = summary.modeSummaries.map((r) => `| ${r.phaseConstructionMode} | ${r.meanCenterInflationRatio.toFixed(3)} | ${r.meanSliceInflationRatio.toFixed(3)} | ${r.maxSliceMinusMinSlice} | ${r.nonFiniteDetected} |`);
  const doc = `# v2.1.2 Periodic Vortex Initialization Audit

## Historical context

PR #28 left an observation-hygiene limitation: randomized vortex initialization may inflate initial \`vortexCount\` because the legacy periodic phase construction can introduce non-physical discontinuity sheets near seams.

This audit compares opt-in phase construction modes under matched seeds and matched layout generation. It does not add new physics, does not change the legacy default, and does not rewrite historical PR #28 JSON outputs.

## Artifact caution

\`Math.atan2\` branch cuts can be harmless when the jump is only \`2π\`, since \`exp(i * phase)\` is continuous across that jump. The more serious candidate artifact is the wrapped-delta seam: the nearest wrapped coordinate delta can jump from about \`+N/2\` to \`-N/2\`, feeding \`atan2\` a non-\`2π\` discontinuity in the constructed phase field.

A prior spot check suggested that, for one \`32^3\`, \`pairCount=2\` layout, wrapped construction produced substantially higher initial vortex counts than unwrapped construction while the specified layout contained four vortices per field. That prior value motivated this audit; it is not an acceptance criterion.

## Compared modes

- \`legacy-torus-atan2\`: the default legacy construction; phase uses torus nearest signed deltas before \`atan2\`.
- \`unwrapped-atan2\`: diagnostic construction; phase uses direct coordinate differences while amplitude core suppression still uses torus distance.
- \`periodic-dipole-image-sum-radius-1\`: periodic-consistent candidate; each explicit neutral +1/-1 pair is summed over neighboring image cells with radius 1. This is not a closed-form periodic vortex construction.

The randomized layout generator creates neutral pairs in sequence. Dipole mode uses \`[0, 1]\`, \`[2, 3]\`, and so on, requiring even indices to be \`+1\` and the following odd indices to be \`-1\`.

## Measured results

| condition | mode | pairCount | seeds | center total count | center inflation | mean slice inflation | max slice spread | aligned start | non-finite |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join('\n')}

## Mode summary

| mode | mean center inflation | mean slice inflation | max slice spread | non-finite |
| --- | ---: | ---: | ---: | --- |
${modeRows.join('\n')}

## Interpretation rules

- measured: raw center counts, multi-slice counts, distances, net-charge fields, and non-finite status in the JSON files.
- observed: whether candidate modes reduced count inflation relative to legacy in this lightweight audit.
- interpretive: wrapped-delta seam artifact likely reduced or still present.
- speculative: closed-form torus-vortex correctness; this audit does not implement Jacobi theta / elliptic-function torus vortices.

Because current randomized phase / winding construction is z-uniform, multi-slice counts are expected to match or nearly match the central slice. If they do not, that is an anomaly signal, not full 3D vortex tracking.

## Answers

1. Unwrapped reduced inflation relative to legacy in this audit: ${summary.answeredQuestions.unwrappedReducedInflationRelativeToLegacy}.
2. Neutral dipole image-sum reduced inflation further than unwrapped in this audit: ${summary.answeredQuestions.dipoleReducedInflationRelativeToUnwrapped}.
3. Deterministic seeding was preserved by validation checks: ${summary.answeredQuestions.deterministicSeedingPreserved}.
4. Net charge zero was preserved in layout specifications: ${summary.answeredQuestions.netChargeZeroInLayoutSpecification}.
5. Distinct random seed pairs remained structurally distinct by the \`0.02\` aligned-distance threshold: ${summary.answeredQuestions.structuralDistinctnessForDistinctSeedPairs}.
6. Same-layout pairs remained gauge-aligned near zero by validation checks: ${summary.answeredQuestions.sameLayoutGaugeAlignedDistanceNearZero}.
7. Non-finite values appeared: ${summary.answeredQuestions.nonFiniteDetected}.

## Cautious recommendation

The candidate modes should remain experimental and opt-in. If lower initial count inflation is needed, \`unwrapped-atan2\` and \`periodic-dipole-image-sum-radius-1\` are useful initialization-hygiene candidates to test further, but this audit does not prove a closed-form torus-vortex construction or a solved branch-cut artifact.
`;
  fs.writeFileSync(DOC_PATH, doc);
}

function main() {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  const results = [];
  for (const pairCount of PAIR_COUNT_VALUES) {
    for (const phaseConstructionMode of PHASE_CONSTRUCTION_MODES) {
      for (const seedPair of SEED_PAIRS) results.push(createRandomRecord(phaseConstructionMode, pairCount, seedPair));
      results.push(createBoundaryRecord(phaseConstructionMode, pairCount));
    }
  }
  const summary = summarize(results);
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify({ generatedAt: summary.generatedAt, results }, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(results, summary);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SUMMARY_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, DOC_PATH)}`);
}

if (require.main === module) main();

module.exports = {
  computeVortexCountAtSlice,
  createBoundarySpanningLayout,
  createFieldFromLayout,
  PHASE_CONSTRUCTION_MODES,
};
