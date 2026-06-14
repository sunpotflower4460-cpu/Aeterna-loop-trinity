#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createAeternaRuntimeV0, computeVortexCount } = require('../src/runtime/aeterna-runtime-v0');
const { stepAeternaRuntimeV0 } = require('../src/runtime/step-aeterna-runtime-v0');
const { createAeternaField, createRng, index3D } = require('../src/runtime/create-aeterna-fields');
const { computeTopologicalLedgerXY, compareLedgerMaps, computeLedgerDelta, makeTopologicalLedgerContext, phaseDelta } = require('../src/metrics/topological-ledger');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments/v2.2-topological-ledger-smoke-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments/v2.2-topological-ledger-smoke-summary.json');
const AUDIT = 'v2.2-topological-ledger-smoke';
const RUN_MODE = 'lightweight';
const GRID_SIZE = 16;

function gitHash() { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return 'git-hash-unavailable'; } }
function metadata() { const generatorGitHash = gitHash(); return { audit: AUDIT, runMode: RUN_MODE, generatorGitHash, artifactGeneratedFromReachableCommit: generatorGitHash !== 'git-hash-unavailable', artifactCommittedIn: 'pending merge commit containing v2.2 Topological Ledger smoke artifacts', observerPurpose: 'Topological Ledger smoke observer only', claimLevel: 'finite-horizon observer smoke' }; }
function makeField(gridSize, phaseFn, ampFn = () => 1) {
  const size = gridSize ** 3;
  const phiRe = new Float64Array(size); const phiIm = new Float64Array(size);
  const memoryRe = new Float64Array(size); const memoryIm = new Float64Array(size);
  for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) for (let x = 0; x < gridSize; x += 1) {
    const i = index3D(x, y, z, gridSize); const amp = ampFn(x, y, z); const phase = phaseFn(x, y, z);
    phiRe[i] = amp * Math.cos(phase); phiIm[i] = amp * Math.sin(phase); memoryRe[i] = phiRe[i]; memoryIm[i] = phiIm[i];
  }
  return { phiRe, phiIm, memoryRe, memoryIm };
}
function shifted(field, delta) {
  const phiRe = new Float64Array(field.phiRe.length); const phiIm = new Float64Array(field.phiIm.length);
  const c = Math.cos(delta); const s = Math.sin(delta);
  for (let i = 0; i < phiRe.length; i += 1) { phiRe[i] = field.phiRe[i] * c - field.phiIm[i] * s; phiIm[i] = field.phiRe[i] * s + field.phiIm[i] * c; }
  return { ...field, phiRe, phiIm };
}
function setGlobalWindingLocal(gridSize, winding) { return makeField(gridSize, (x) => (Math.PI * 2 * winding * x) / gridSize); }
function computeXLineWindingHistogramLocal(field, gridSize) {
  const histogram = {};
  for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) {
    let acc = 0;
    for (let x = 0; x < gridSize; x += 1) {
      const i = index3D(x, y, z, gridSize); const j = index3D((x + 1) % gridSize, y, z, gridSize);
      acc += phaseDelta(Math.atan2(field.phiIm[i], field.phiRe[i]), Math.atan2(field.phiIm[j], field.phiRe[j]));
    }
    const w = Math.round(acc / (Math.PI * 2)); histogram[w] = (histogram[w] || 0) + 1;
  }
  const entries = Object.entries(histogram).sort((a, b) => b[1] - a[1]);
  return { histogram, dominantW: Number(entries[0][0]), dominantCount: entries[0][1], dominantFraction: entries[0][1] / (gridSize * gridSize) };
}
function randomPeriodic(seed) { const rng = createRng(seed); return makeField(GRID_SIZE, () => (rng() * 2 - 1) * Math.PI); }
function knownPairedVortexFixture() {
  const phases = new Float64Array(GRID_SIZE ** 3);
  const set = (x, y, z, value) => { phases[index3D(x, y, z, GRID_SIZE)] = value; };
  set(3, 3, 4, 0); set(4, 3, 4, Math.PI / 2); set(4, 4, 4, Math.PI); set(3, 4, 4, -Math.PI / 2);
  set(10, 10, 4, 0); set(11, 10, 4, -Math.PI / 2); set(11, 11, 4, -Math.PI); set(10, 11, 4, Math.PI / 2);
  return makeField(GRID_SIZE, (x, y, z) => phases[index3D(x, y, z, GRID_SIZE)]);
}
function strictSyntheticPass(ledger) { return ledger.invalidPlaquetteCount === 0 && ledger.totalWinding === 0 && ledger.netCharge === 0 && ledger.perSliceTotalWinding.every((v) => v === 0) && ledger.perSliceNetCharge.every((v) => v === 0); }
function summarizeLedger(ledger) { return { positivePlaquetteCount: ledger.positivePlaquetteCount, negativePlaquetteCount: ledger.negativePlaquetteCount, totalWinding: ledger.totalWinding, netCharge: ledger.netCharge, invalidPlaquetteCount: ledger.invalidPlaquetteCount, nearPiEdgeCount: ledger.nearPiEdgeCount, closedPlaquetteFloatResidualMax: ledger.closedPlaquetteFloatResidualMax }; }

function main() {
  const base = { ...metadata(), ledgerContext: makeTopologicalLedgerContext() };
  const clean = makeField(GRID_SIZE, (x, y, z) => 0.17 * x + 0.11 * y + 0.03 * z);
  const phaseA = computeTopologicalLedgerXY(clean, { gridSize: GRID_SIZE });
  const phaseB = computeTopologicalLedgerXY(shifted(clean, Math.PI / 5), { gridSize: GRID_SIZE });
  const c1 = { caseId: 'C-1-global-phase-shift-invariance', ...base, comparison: compareLedgerMaps(phaseA, phaseB), before: summarizeLedger(phaseA), after: summarizeLedger(phaseB), pass: compareLedgerMaps(phaseA, phaseB).equal };
  const randoms = [101, 202, 303].map((seed) => { const ledger = computeTopologicalLedgerXY(randomPeriodic(seed), { gridSize: GRID_SIZE }); return { seed, strictSyntheticPass: strictSyntheticPass(ledger), ledger: summarizeLedger(ledger), perSliceTotalWinding: ledger.perSliceTotalWinding, perSliceNetCharge: ledger.perSliceNetCharge }; });
  const knownLedger = computeTopologicalLedgerXY(knownPairedVortexFixture(), { gridSize: GRID_SIZE });
  const known = { caseId: 'known-paired-vortex-layout', ...base, construction: 'branch-cut-safe local plaquette fixture; count/net-charge check only, not exact torus vortex-core location proof', expected: { positivePlaquetteCount: 2, negativePlaquetteCount: 2, netCharge: 0, totalWinding: 0 }, measured: summarizeLedger(knownLedger), pass: knownLedger.positivePlaquetteCount === 2 && knownLedger.negativePlaquetteCount === 2 && knownLedger.netCharge === 0 && knownLedger.totalWinding === 0, downgraded: false };
  const invalidField = makeField(GRID_SIZE, () => 0, (x, y, z) => (z === 2 && x >= 4 && x <= 5 && y >= 4 && y <= 5 ? 0.05 : 1));
  const invalidLedger = computeTopologicalLedgerXY(invalidField, { gridSize: GRID_SIZE });
  const invalid = { caseId: 'low-amplitude-invalid-plaquette-case', ...base, measured: summarizeLedger(invalidLedger), strictTopologyClaimsMade: false, pass: invalidLedger.invalidPlaquetteCount > 0 };
  const runtimeClean = createAeternaField({ gridSize: GRID_SIZE, seed: 12345, config: { noiseAmp: 0 } });
  const compatLedger = computeTopologicalLedgerXY(runtimeClean, { gridSize: GRID_SIZE });
  const center = Math.floor(GRID_SIZE / 2);
  const centerLedgerCount = compatLedger.perSlicePositiveCount[center] + compatLedger.perSliceNegativeCount[center];
  const legacyCount = computeVortexCount(runtimeClean, GRID_SIZE);
  const windingField = setGlobalWindingLocal(GRID_SIZE, 1);
  const windingHist = computeXLineWindingHistogramLocal(windingField, GRID_SIZE);
  const windingLedger = computeTopologicalLedgerXY(windingField, { gridSize: GRID_SIZE });
  const metricRelationship = { caseId: 'existing-metric-distinction-and-compatibility', ...base, legacyComputeVortexCountComparison: { centerSliceLedgerCount: centerLedgerCount, legacyComputeVortexCount: legacyCount, allValid: compatLedger.invalidPlaquetteCount === 0, pass: centerLedgerCount === legacyCount }, globalXWindingDistinction: { xLineHistogramDominantW: windingHist.dominantW, xLineHistogramDominantFraction: windingHist.dominantFraction, xyPlaquettePositiveCount: windingLedger.positivePlaquetteCount, xyPlaquetteNegativeCount: windingLedger.negativePlaquetteCount, pass: windingHist.dominantW === 1 && windingLedger.positivePlaquetteCount === 0 && windingLedger.negativePlaquetteCount === 0 }, pass: centerLedgerCount === legacyCount && windingHist.dominantW === 1 && windingLedger.positivePlaquetteCount === 0 && windingLedger.negativePlaquetteCount === 0 };
  const fieldA = knownPairedVortexFixture(); const fieldB = shifted(fieldA, Math.PI / 5);
  const equivariance = { caseId: 'u1-equivariance-regression', ...base, comparison: compareLedgerMaps(computeTopologicalLedgerXY(fieldA, { gridSize: GRID_SIZE }), computeTopologicalLedgerXY(fieldB, { gridSize: GRID_SIZE })), policy: 'identical layout plus global phase offset only; not a universal G8 identity gate', pass: compareLedgerMaps(computeTopologicalLedgerXY(fieldA, { gridSize: GRID_SIZE }), computeTopologicalLedgerXY(fieldB, { gridSize: GRID_SIZE })).equal };
  const runtime = createAeternaRuntimeV0({ gridSize: 8, seedA: 12345, seedB: 67890, config: { noiseAmp: 0.001, sampleInterval: 2, metricsSampleInterval: 2 } });
  const samples = [];
  let previous = null;
  for (let step = 0; step <= 4; step += 2) {
    if (step > 0) for (let i = 0; i < 2; i += 1) stepAeternaRuntimeV0(runtime);
    const ledger = computeTopologicalLedgerXY(runtime.fieldA, { gridSize: 8, step: runtime.stepCount });
    samples.push({ step: runtime.stepCount, ...summarizeLedger(ledger), ledgerDelta: previous ? computeLedgerDelta(previous, ledger) : null });
    previous = ledger;
  }
  const runtimeSmoke = { caseId: 'limited-runtime-smoke', ...base, runMode: RUN_MODE, gridSize: 8, ledgerDeltaPolicy: 'diagnostic event signal only; not a strict invariant', samples, pass: samples.every((s) => s.ledgerDelta === null || s.ledgerDelta.policy.includes('diagnostic')) };
  const results = [c1, { caseId: 'random-periodic-phase-fields', ...base, seeds: randoms, pass: randoms.every((r) => r.strictSyntheticPass) }, known, invalid, metricRelationship, equivariance, runtimeSmoke];
  const summary = { ...base, resultCount: results.length, allStrictSyntheticIntegerGatesPass: c1.pass && randoms.every((r) => r.strictSyntheticPass) && known.pass, c1GlobalPhaseShiftInvariancePass: c1.pass, randomPeriodicPass: randoms.every((r) => r.strictSyntheticPass), knownPairedVortexLayoutPass: known.pass, invalidPlaquettePass: invalid.pass, computeVortexCountCompatibilityPass: metricRelationship.legacyComputeVortexCountComparison.pass, computeWindingHistogramDistinctionPass: metricRelationship.globalXWindingDistinction.pass, u1EquivarianceRegressionPass: equivariance.pass, runtimeSmokeIncluded: true, runtimeSmokePass: runtimeSmoke.pass, prohibitedClaimPolicy: 'observer-only; no biological life, consciousness, agency, permanent survival, or exact full 3D topology claims' };
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)} and ${path.relative(ROOT, SUMMARY_PATH)}`);
}

if (require.main === module) main();
module.exports = { computeXLineWindingHistogramLocal, setGlobalWindingLocal };
