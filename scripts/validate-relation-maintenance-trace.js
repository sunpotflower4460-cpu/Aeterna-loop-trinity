#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = 'experiments/v2.2-relation-maintenance-trace-results.json';
const SUMMARY_PATH = 'experiments/v2.2-relation-maintenance-trace-summary.json';
const DOC_PATH = 'docs/v2.2-relation-maintenance-trace.md';
const PREREG_PATH = 'docs/v2.2-relation-maintenance-trace-preregistration.md';
const CLAIM_LEVEL = 'finite-horizon operational trace';
const MEASURABLE_EFFECT_EPSILON = { value: 0.000001, sourceStatus: 'heuristic band, not yet calibrated', reason: 'reused from G8 smoke no-op guard' };
const ALLOWED_OUTCOMES = new Set(['no_meeting_observed', 'meeting_without_maintenance', 'meeting_then_identity_collapse', 'meeting_then_memory_copy_collapse', 'meeting_then_memory_detachment', 'meeting_then_field_flattening', 'meeting_then_energy_instability', 'meeting_then_ledger_reliability_limit', 'meeting_then_winding_reliability_limit', 'meeting_then_pheromone_fog', 'control_separated_but_reliability_limited', 'short_horizon_maintenance_candidate', 'boundary', 'indeterminate']);
const PROTECTED_FILES = ['experiments/v2.2-structurally-distinct-beings-interaction-smoke-results.json', 'experiments/v2.2-structurally-distinct-beings-interaction-smoke-summary.json', 'experiments/v2.2-topological-ledger-smoke-results.json', 'experiments/v2.2-topological-ledger-smoke-summary.json', 'experiments/v2.2-observer-v2-calibration-results.json', 'experiments/v2.2-observer-v2-calibration-summary.json', 'experiments/v2.1.2-winding-memory-phase-slip-audit-results.json', 'experiments/v2.1.2-winding-memory-phase-slip-audit-summary.json'];
const PACKAGE_FILES = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
const FIRST_FIELDS = ['firstMeetingBandEntryStep', 'firstControlSeparatedStep', 'firstMaintenanceExitStep', 'firstIdentityCollapseGuardrailStep', 'firstNearIdentityCollapseGuardrailStep', 'firstMemoryCopyCollapseGuardrailStep', 'firstMemoryDetachedGuardrailStep', 'firstFieldFlatteningGuardrailStep', 'firstEnergyInstabilityGuardrailStep', 'firstLedgerReliabilityLimitedStep', 'firstWindingReliabilityLimitedStep', 'firstPheromoneFogGuardrailStep'];
const GUARDRAIL_PRECEDENCE = ['identityCollapse', 'nearIdentityCollapse', 'memoryCopyCollapse', 'memoryDetached', 'fieldFlattened', 'energyUnstable', 'ledgerReliabilityLimited', 'windingReliabilityLimited', 'pheromoneFog'];

function couplingHasMeasuredDelta(sample) {
  const coupling = sample.coupling || {};
  return coupling.memoryCouplingApplied === true && (
    coupling.memoryCouplingAppliedCells > 0
    || coupling.memoryCouplingAverageDeltaA > 0
    || coupling.memoryCouplingAverageDeltaB > 0
    || coupling.memoryCouplingDeltaA > 0
    || coupling.memoryCouplingDeltaB > 0
  );
}
function guardrailState(sample) {
  return Object.fromEntries(GUARDRAIL_PRECEDENCE.map((name) => [name, sample?.guardrails?.[name] === true]));
}
function firstControlSeparatedStep(run, controlRun) {
  if (!controlRun) return null;
  for (const sample of run.samples) {
    const control = controlRun.samples.find((candidate) => candidate.step === sample.step);
    if (!control) continue;
    const fieldDelta = Math.abs(sample.observerV2.fieldABDistanceAligned - control.observerV2.fieldABDistanceAligned);
    const memoryDelta = Math.abs(sample.observerV2.memoryABDistanceAligned - control.observerV2.memoryABDistanceAligned);
    if (fieldDelta > MEASURABLE_EFFECT_EPSILON.value || memoryDelta > MEASURABLE_EFFECT_EPSILON.value) return sample.step;
  }
  return null;
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function readJson(relativePath) { const absolutePath = path.join(ROOT, relativePath); assert(fs.existsSync(absolutePath), `${relativePath} missing`); return JSON.parse(fs.readFileSync(absolutePath, 'utf8')); }
function walk(value, visitor, pointer = '$') { visitor(value, pointer); if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => walk(child, visitor, `${pointer}.${key}`)); }
function assertFiniteOrNull(value, pointer) { if (typeof value === 'number') assert(Number.isFinite(value), `non-finite number at ${pointer}`); assert(value !== undefined, `undefined at ${pointer}`); }
function firstStep(samples, predicate) { const hit = samples.find(predicate); return hit ? hit.step : null; }
function gitClean(files) { try { execFileSync('git', ['rev-parse', '--verify', 'origin/main'], { cwd: ROOT, stdio: 'pipe' }); execFileSync('git', ['diff', '--exit-code', 'origin/main...HEAD', '--', ...files], { cwd: ROOT, stdio: 'pipe' }); return true; } catch (_) { const status = execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).trim(); return status.length === 0; } }
function textHasForbiddenPositiveClaim(text) {
  const stripped = text.replace(/no [^\n.]*?(relation|maintenance|persistence|biological life|consciousness|agency|subjectivity|s-o-u-l|permanent survival|origin of time|origin of memory) claim/gi, '')
    .replace(/not evidence of [^\n.]*/gi, '')
    .replace(/do not prove [^\n.]*/gi, '')
    .replace(/does not prove [^\n.]*/gi, '')
    .replace(/no relation proof|no maintenance proof|no biological life claim|no consciousness claim|no agency claim|no permanent survival claim/gi, '');
  return [/life appeared/i, /consciousness emerged/i, /agency emerged/i, /\bs-o-u-l\b/i, /permanent survival proven/i, /\beternal\b/i, /proof of maintenance/i, /relation success/i, /maintenance success/i, /true being/i, /biological life appeared/i, /Mori-Zwanzig realized/i, /fluctuation-dissipation theorem confirmed/i, /origin of time/i, /origin of memory/i].some((pattern) => pattern.test(stripped));
}
function validateSample(run, sample) {
  for (const section of ['observerV2', 'topology', 'topologicalLedger', 'fieldHealth', 'energy', 'pheromone', 'coupling', 'guardrails']) assert(sample[section], `${run.runId} sample ${sample.step} missing ${section}`);
  for (const key of ['fieldABDistanceRaw', 'fieldABDistanceAligned', 'D_inv', 'thetaStarFieldAB', 'gaugeOverlap', 'memoryABDistanceRaw', 'memoryABDistanceAligned', 'D_inv_memory', 'thetaStarMemoryAB', 'memoryFieldDifferenceA', 'memoryFieldDifferenceB']) assert(key in sample.observerV2, `${run.runId} sample ${sample.step} observer missing ${key}`);
  assert(sample.pheromone.enabled === false && sample.pheromone.fogGuardrail === false, `${run.runId} pheromone must remain disabled`);
  assert(!('fieldMemoryDistanceA' in sample) && !('fieldMemoryDistanceB' in sample), `${run.runId} must not emit fieldMemoryDistanceA/B`);
}
function validateEvents(run, controlRun) {
  const e = run.eventSummary; for (const key of ['runId', 'conditionId', 'sourceArtifact', 'sourceConditionId', 'conditionSelectionStrategy', 'traceHorizon', 'sampleInterval', 'controlRunId', 'relationRelevantScanStartStep', 'baselineGuardrailState', 'preRelationGuardrailState', 'couplingNotApplied', 'firstFailedGuardrail', 'firstFailedGuardrailsAtStep', 'terminalOutcome', 'terminalOutcomeReason', 'limitations', 'claimLevel']) assert(key in e, `${run.runId} eventSummary missing ${key}`); for (const key of FIRST_FIELDS) assert(key in e, `${run.runId} eventSummary missing ${key}`);
  assert(e.claimLevel === CLAIM_LEVEL, `${run.runId} claim level mismatch`); assert(ALLOWED_OUTCOMES.has(e.terminalOutcome), `${run.runId} invalid terminal outcome`);
  const steps = new Set(run.samples.map((s) => s.step)); for (const key of FIRST_FIELDS) assert(e[key] === null || steps.has(e[key]), `${run.runId} ${key} is not a sampled step`);
  const expectedMeeting = firstStep(run.samples, (s) => s.observerV2.fieldABDistanceAligned >= 0.01 && s.observerV2.fieldABDistanceAligned <= 0.15);
  const expectedControlSeparated = firstControlSeparatedStep(run, controlRun);
  assert(e.firstMeetingBandEntryStep === expectedMeeting, `${run.runId} meeting-band first step mismatch`);
  assert(e.firstControlSeparatedStep === expectedControlSeparated, `${run.runId} control separation recompute mismatch`);
  const relationStartCandidates = [expectedMeeting, expectedControlSeparated].filter((value) => value !== null);
  const expectedRelationStart = relationStartCandidates.length > 0 ? Math.min(...relationStartCandidates) : null;
  assert(e.relationRelevantScanStartStep === expectedRelationStart, `${run.runId} relationRelevantScanStartStep mismatch`);
  assert(JSON.stringify(e.baselineGuardrailState) === JSON.stringify(guardrailState(run.samples[0])), `${run.runId} baselineGuardrailState mismatch`);
  const preRelationSamples = expectedRelationStart === null ? run.samples.filter((s) => s.step > 0) : run.samples.filter((s) => s.step > 0 && s.step < expectedRelationStart);
  const expectedPreRelationState = Object.fromEntries(GUARDRAIL_PRECEDENCE.map((name) => [name, preRelationSamples.some((s) => s.guardrails[name] === true)]));
  assert(JSON.stringify(e.preRelationGuardrailState) === JSON.stringify(expectedPreRelationState), `${run.runId} preRelationGuardrailState mismatch`);
  const relationSamples = expectedRelationStart === null ? [] : run.samples.filter((s) => s.step >= expectedRelationStart);
  assert(e.firstIdentityCollapseGuardrailStep === firstStep(relationSamples, (s) => s.guardrails.identityCollapse), `${run.runId} identity guardrail mismatch`);
  assert(e.firstNearIdentityCollapseGuardrailStep === firstStep(relationSamples, (s) => s.guardrails.nearIdentityCollapse), `${run.runId} near-identity guardrail mismatch`);
  assert(e.firstMemoryCopyCollapseGuardrailStep === firstStep(relationSamples, (s) => s.guardrails.memoryCopyCollapse), `${run.runId} memory copy guardrail mismatch`);
  assert(e.firstMemoryDetachedGuardrailStep === firstStep(relationSamples, (s) => s.guardrails.memoryDetached), `${run.runId} memory detached guardrail mismatch`);
  assert(e.firstLedgerReliabilityLimitedStep === firstStep(relationSamples, (s) => s.guardrails.ledgerReliabilityLimited), `${run.runId} ledger guardrail mismatch`);
  assert(e.firstWindingReliabilityLimitedStep === firstStep(relationSamples, (s) => s.guardrails.windingReliabilityLimited), `${run.runId} winding guardrail mismatch`);
  const firsts = { identityCollapse: e.firstIdentityCollapseGuardrailStep, nearIdentityCollapse: e.firstNearIdentityCollapseGuardrailStep, memoryCopyCollapse: e.firstMemoryCopyCollapseGuardrailStep, memoryDetached: e.firstMemoryDetachedGuardrailStep, fieldFlattened: e.firstFieldFlatteningGuardrailStep, energyUnstable: e.firstEnergyInstabilityGuardrailStep, ledgerReliabilityLimited: e.firstLedgerReliabilityLimitedStep, windingReliabilityLimited: e.firstWindingReliabilityLimitedStep, pheromoneFog: e.firstPheromoneFogGuardrailStep };
  const firstStepValue = Math.min(...Object.values(firsts).filter((v) => v !== null)); const expectedAtStep = Number.isFinite(firstStepValue) ? GUARDRAIL_PRECEDENCE.filter((name) => firsts[name] === firstStepValue) : [];
  assert(JSON.stringify(e.firstFailedGuardrailsAtStep) === JSON.stringify(expectedAtStep), `${run.runId} firstFailedGuardrailsAtStep mismatch`); assert(e.firstFailedGuardrail === (expectedAtStep[0] || null), `${run.runId} firstFailedGuardrail mismatch`);
  const coupled = run.samples.some((s) => s.coupling.couplingG > 0); const applied = run.samples.some((s) => s.step > 0 && couplingHasMeasuredDelta(s));
  assert(e.couplingNotApplied === (coupled && !applied), `${run.runId} couplingNotApplied mismatch`);
  if (coupled) { assert(run.samples.every((s) => s.coupling.couplingType === 'memory' && s.coupling.memoryCouplingEnabled === true), `${run.runId} coupled run did not use memory coupling`); assert(applied || (e.couplingNotApplied && e.terminalOutcome === 'indeterminate'), `${run.runId} silently accepted no-op coupling`); }
  else { assert(e.controlRunId === null, `${run.runId} control must not have controlRunId`); assert(e.couplingNotApplied === false, `${run.runId} control couplingNotApplied must be false`); }
  if (controlRun) { assert(run.controlRunId === controlRun.runId, `${run.runId} controlRunId missing or invalid`); assert(e.firstControlSeparatedStep === null || steps.has(e.firstControlSeparatedStep), `${run.runId} invalid control separation step`); }
}
function main() {
  const results = readJson(RESULTS_PATH); const summary = readJson(SUMMARY_PATH);
  for (const p of [PREREG_PATH, DOC_PATH]) assert(fs.existsSync(path.join(ROOT, p)), `${p} missing`);
  for (const key of ['schemaVersion', 'artifactType', 'claimLevel', 'preregistrationPath', 'sourceArtifacts', 'guardrailThresholds', 'runs']) assert(key in results, `results missing ${key}`);
  assert(results.schemaVersion === 'v2.2-rmt-1' && summary.schemaVersion === 'v2.2-rmt-1', 'schemaVersion mismatch'); assert(results.claimLevel === CLAIM_LEVEL && summary.claimLevel === CLAIM_LEVEL, 'claimLevel mismatch'); assert(results.preregistrationPath === PREREG_PATH, 'preregistrationPath mismatch');
  walk(results, assertFiniteOrNull); walk(summary, assertFiniteOrNull);
  const runs = new Map(results.runs.map((run) => [run.runId, run])); assert(runs.size === results.runs.length, 'duplicate runId');
  for (const run of results.runs) { for (const key of ['runId', 'conditionId', 'samples', 'eventSummary']) assert(key in run, `run missing ${key}`); assert(Array.isArray(run.samples) && run.samples.length > 1, `${run.runId} missing samples`); assert(run.samples[0].step === 0, `${run.runId} missing step 0`); assert(run.samples[run.samples.length - 1].step === run.eventSummary.traceHorizon, `${run.runId} missing final step`); run.samples.forEach((sample) => validateSample(run, sample)); validateEvents(run, run.controlRunId ? runs.get(run.controlRunId) : null); }
  assert(summary.overallRmtPassMeaning.includes('schema/runner/validator completeness only'), 'overall pass meaning must be operational only'); assert(summary.primaryMetricSource === 'collectAeternaMetrics', 'primary metric source mismatch'); assert(summary.allTerminalOutcomesAllowed === true, 'terminal outcome summary flag false'); assert(summary.allGuardrailThresholdsHeuristic === true, 'guardrail heuristic flag false'); assert(summary.matchedControlCoveragePass === true, 'matched control coverage failed');
  const text = [JSON.stringify(results), JSON.stringify(summary), fs.readFileSync(path.join(ROOT, DOC_PATH), 'utf8')].join('\n'); assert(!textHasForbiddenPositiveClaim(text), 'forbidden positive claim language found');
  assert(gitClean(PROTECTED_FILES), 'protected historical artifacts changed'); assert(gitClean(PACKAGE_FILES), 'package or lockfile changed');
  console.log('RMT validation passed.');
}
if (require.main === module) main();
