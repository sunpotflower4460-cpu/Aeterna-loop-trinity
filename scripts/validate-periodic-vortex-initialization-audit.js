#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { computeGaugeInvariantABMetrics } = require('../src/metrics/gauge-invariant-metrics');
const { createRandomizedAeternaField, createRandomizedAeternaFields } = require('../src/runtime/create-randomized-fields');

const ROOT = path.join(__dirname, '..');
const HISTORICAL_JSON = Object.freeze([
  'experiments/v2.1.2-randomized-vortex-controls-results.json',
  'experiments/v2.1.2-randomized-vortex-controls-summary.json',
  'experiments/v2.1.2-phase-detuning-scan-results.json',
  'experiments/v2.1.2-phase-detuning-scan-summary.json',
]);
const NEW_OUTPUTS = Object.freeze([
  'experiments/v2.1.2-periodic-vortex-initialization-audit-results.json',
  'experiments/v2.1.2-periodic-vortex-initialization-audit-summary.json',
  'docs/v2.1.2-periodic-vortex-initialization-audit.md',
]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function maxAbsDifference(a, b) {
  let max = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

function layoutSignature(layout) {
  return JSON.stringify(layout.vortices.map((vortex) => [vortex.x, vortex.y, vortex.charge]));
}

function gitStatusPaths(paths) {
  const output = execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: ROOT, encoding: 'utf8' });
  return output.trim();
}

function main() {
  const source = read('src/runtime/create-randomized-fields.js');
  const audit = read('scripts/run-v212-periodic-vortex-initialization-audit.js');
  const doc = fs.existsSync(path.join(ROOT, 'docs/v2.1.2-periodic-vortex-initialization-audit.md')) ? read('docs/v2.1.2-periodic-vortex-initialization-audit.md') : '';
  const summary = fs.existsSync(path.join(ROOT, 'experiments/v2.1.2-periodic-vortex-initialization-audit-summary.json')) ? read('experiments/v2.1.2-periodic-vortex-initialization-audit-summary.json') : '';

  assert(source.includes("phaseConstructionMode = 'legacy-torus-atan2'"), 'Legacy default phaseConstructionMode is missing');
  assert(source.includes('periodic-dipole-image-sum-radius-1'), 'Dipole radius-1 mode is missing');
  assert(source.includes('unwrapped-atan2'), 'Unwrapped diagnostic mode is missing');

  const defaultFields = createRandomizedAeternaFields({ gridSize: 16, seedA: 123, seedB: 456 });
  const explicitLegacyFields = createRandomizedAeternaFields({ gridSize: 16, seedA: 123, seedB: 456, phaseConstructionMode: 'legacy-torus-atan2' });
  assert(maxAbsDifference(defaultFields.fieldA.phiRe, explicitLegacyFields.fieldA.phiRe) <= 1e-12, 'Default mode differs from explicit legacy mode');
  assert(maxAbsDifference(defaultFields.fieldB.phiIm, explicitLegacyFields.fieldB.phiIm) <= 1e-12, 'Default B field differs from explicit legacy mode');

  const first = createRandomizedAeternaField({ gridSize: 16, seed: 789, phaseConstructionMode: 'periodic-dipole-image-sum-radius-1' });
  const second = createRandomizedAeternaField({ gridSize: 16, seed: 789, phaseConstructionMode: 'periodic-dipole-image-sum-radius-1' });
  const different = createRandomizedAeternaField({ gridSize: 16, seed: 790, phaseConstructionMode: 'periodic-dipole-image-sum-radius-1' });
  assert(maxAbsDifference(first.field.phiRe, second.field.phiRe) <= 1e-12, 'Same seed does not reproduce field within tolerance');
  assert(layoutSignature(first.vortexLayout) === layoutSignature(second.vortexLayout), 'Same seed does not reproduce layout');
  assert(layoutSignature(first.vortexLayout) !== layoutSignature(different.vortexLayout), 'Different seeds did not produce different layouts');
  assert(first.vortexLayout.netCharge === 0, 'Layout net charge is not zero');

  const sameLayout = createRandomizedAeternaField({ gridSize: 16, seed: 789, phaseOffset: Math.PI / 5, phaseConstructionMode: 'periodic-dipole-image-sum-radius-1' });
  const gauge = computeGaugeInvariantABMetrics(first.field, sameLayout.field);
  assert(gauge.alignedFieldABDistance < 1e-12, 'Same-layout gauge-aligned distance is not near zero');

  assert(source.includes('phase += posPhase - negPhase'), 'Dipole mode does not use neutral pair contribution');
  assert(!source.includes('for each vortex independently'), 'Source includes forbidden independent image-sum pseudocode');
  assert(source.includes('coreSuppression += Math.exp(-(dx * dx + dy * dy) / 5.0)'), 'Core suppression expression is missing');
  assert(source.includes('nearestSignedDelta(x, vortex.x, n)') && source.includes('nearestSignedDelta(y, vortex.y, n)'), 'Amplitude core suppression does not visibly use torus wrapped distance');

  assert(gitStatusPaths(HISTORICAL_JSON) === '', `Historical PR #28 JSON files are modified:\n${gitStatusPaths(HISTORICAL_JSON)}`);
  for (const newOutput of NEW_OUTPUTS) assert(!HISTORICAL_JSON.includes(newOutput), `New output path overlaps historical path: ${newOutput}`);
  assert(`${doc}\n${summary}`.includes('wrapped-delta seam'), 'Summary/doc does not mention wrapped-delta seam artifact risk');
  assert(!/exact torus vortex solution|mathematically exact periodic vortex/.test(`${doc}\n${summary}`), 'Docs claim exact torus solution');

  console.log('Periodic vortex initialization audit validation passed.');
}

if (require.main === module) main();
