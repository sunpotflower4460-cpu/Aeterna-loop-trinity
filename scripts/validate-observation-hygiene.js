#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { describePhysicsContext } = require('../src/runtime/physics-context');

const ROOT = path.join(__dirname, '..');
const HISTORICAL_JSON = new Set([
  'experiments/v2.1.2-randomized-vortex-controls-results.json',
  'experiments/v2.1.2-randomized-vortex-controls-summary.json',
  'experiments/v2.1.2-phase-detuning-scan-results.json',
  'experiments/v2.1.2-phase-detuning-scan-summary.json',
]);

function fail(message) {
  console.error(`[observation-hygiene] ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const base = describePhysicsContext();
assert(base.engineType === 'damped-nonlinear-klein-gordon', 'engineType must be damped-nonlinear-klein-gordon');
assert(base.integrator === 'semi-implicit-euler', 'integrator must be semi-implicit-euler');
assert(Array.isArray(base.phaseRotationAppliedTo), 'phaseRotationAppliedTo must be an array');

const phaseDriven = describePhysicsContext({ PHASE_ROTATION_ENABLED: true, PHASE_ROTATION_TARGET: 'field-and-memory' });
assert(phaseDriven.velocityRotated === false, 'phase-driven context must include velocityRotated=false');
assert(JSON.stringify(phaseDriven.phaseRotationAppliedTo) === JSON.stringify(['phi', 'memory']), 'field-and-memory target must map to phi and memory');

assert(describePhysicsContext({ COUPLING_ENABLED: false }).couplingApplication === 'none', 'disabled coupling must map to none');
const noOpCoupling = describePhysicsContext({ COUPLING_ENABLED: true, COUPLING_TYPE: 'phase' });
assert(noOpCoupling.couplingApplication === 'none-currently-no-op-for-selected-type', 'non-memory coupling must map to no-op label');
assert(!noOpCoupling.notes.some((note) => note.includes('Current memory coupling')), 'no-op coupling must not claim memory coupling is applied');
assert(describePhysicsContext({ COUPLING_ENABLED: true, COUPLING_TYPE: 'memory', MEMORY_COUPLING_ENABLED: false }).couplingApplication === 'none', 'disabled memory coupling must map to none');
assert(describePhysicsContext({ COUPLING_ENABLED: true, COUPLING_TYPE: 'memory', MEMORY_COUPLING_ENABLED: true, MEMORY_COUPLING_ORDER: 'before-memory-update' }).couplingApplication === 'pre-memory-update-state-update', 'before-memory-update must map to pre-memory-update-state-update');
assert(describePhysicsContext({ COUPLING_ENABLED: true, COUPLING_TYPE: 'memory', MEMORY_COUPLING_ENABLED: true }).couplingApplication === 'post-memory-update-state-update', 'default memory coupling must map to post-memory-update-state-update');

const atlas = read('docs/phenomenon-atlas-v0.1.md');
assert(atlas.includes('"physicsContext"'), 'Atlas schema must include physicsContext');
assert(atlas.includes('controlRunId'), 'Atlas mutual convergence rule must include controlRunId');
assert(atlas.includes('Any tag containing `mutual`'), 'Atlas must guard mutual tags with comparison evidence');

const scripts = [
  read('scripts/run-v212-phase-detuning-scan.js'),
  read('scripts/run-v212-randomized-vortex-controls.js'),
];
assert(scripts.every((content) => content.includes('physicsContext')), 'future-facing scripts must include physicsContext');
assert(scripts.every((content) => content.includes('structuralRegimeVerdict')), 'future-facing scripts must include structuralRegimeVerdict');
assert(scripts.every((content) => content.includes('phaseDynamicsVerdict')), 'future-facing scripts must include phaseDynamicsVerdict');
assert(scripts.every((content) => content.includes('phaseBehavior')), 'future-facing scripts must include phaseBehavior');

function gitLines(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function gitRefExists(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch (_error) {
    return false;
  }
}

const changed = [
  ...gitLines(['diff', '--name-only']),
  ...gitLines(['diff', '--cached', '--name-only']),
];

// Prefer a PR/base range when available so committed historical JSON changes are also caught.
// In local checkouts without origin/main or an explicit OBSERVATION_HYGIENE_BASE_REF, this remains a working-tree/staged guard.
const baseRef = [process.env.OBSERVATION_HYGIENE_BASE_REF, 'origin/main', 'origin/master', 'main', 'master']
  .filter(Boolean)
  .find(gitRefExists);
if (baseRef) changed.push(...gitLines(['diff', '--name-only', `${baseRef}...HEAD`]));

const touchedHistorical = Array.from(new Set(changed)).filter((file) => HISTORICAL_JSON.has(file));
assert(touchedHistorical.length === 0, `historical PR #28 JSON files must not be modified: ${touchedHistorical.join(', ')}`);

console.log('[observation-hygiene] validation passed');
