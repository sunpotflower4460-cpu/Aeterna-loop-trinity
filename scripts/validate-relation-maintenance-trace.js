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

function computeExpectedEvent(run, controlRun) {
  const samples = run.samples;
  const firstMeeting = firstStep(samples, (s) => s.observerV2.fieldABDistanceAligned >= 0.01 && s.observerV2.fieldABDistanceAligned <= 0.15);
  const firstControlSeparated = firstControlSeparatedStep(run, controlRun);
  const relationStartCandidates = [firstMeeting, firstControlSeparated].filter((value) => value !== null);
  const relationRelevantScanStartStep = relationStartCandidates.length > 0 ? Math.min(...relationStartCandidates) : null;
  const baselineGuardrailState = guardrailState(samples[0]);
  const preRelationSamples = relationRelevantScanStartStep === null ? samples.filter((s) => s.step > 0) : samples.filter((s) => s.step > 0 && s.step < relationRelevantScanStartStep);
  const preRelationGuardrailState = Object.fromEntries(GUARDRAIL_PRECEDENCE.map((name) => [name, preRelationSamples.some((s) => s.guardrails[name] === true)]));
  const relationSamples = relationRelevantScanStartStep === null ? [] : samples.filter((s) => s.step >= relationRelevantScanStartStep);
  const guardrailFirst = Object.fromEntries(GUARDRAIL_PRECEDENCE.map((name) => [name, firstStep(relationSamples, (s) => s.guardrails[name] === true)]));
  const firstGuardrailStep = Math.min(...Object.values(guardrailFirst).filter((value) => value !== null));
  const normalizedFirstGuardrailStep = Number.isFinite(firstGuardrailStep) ? firstGuardrailStep : null;
  const firstFailedGuardrailsAtStep = normalizedFirstGuardrailStep === null ? [] : GUARDRAIL_PRECEDENCE.filter((name) => guardrailFirst[name] === normalizedFirstGuardrailStep);
  const firstFailedGuardrail = firstFailedGuardrailsAtStep[0] || null;
  const firstMaintenanceExit = firstMeeting === null ? null : firstStep(samples, (s) => s.step >= firstMeeting && (!(s.observerV2.fieldABDistanceAligned >= 0.01 && s.observerV2.fieldABDistanceAligned <= 0.15) || GUARDRAIL_PRECEDENCE.some((name) => s.guardrails[name])));
  const coupled = samples.some((s) => s.coupling.couplingG > 0);
  const couplingNotApplied = coupled && !samples.some((s) => s.step > 0 && couplingHasMeasuredDelta(s));
  let terminalOutcome = 'boundary';
  if (couplingNotApplied) terminalOutcome = 'indeterminate';
  else if (firstMeeting === null && firstControlSeparated === null) terminalOutcome = 'no_meeting_observed';
  else if ((guardrailFirst.ledgerReliabilityLimited !== null || guardrailFirst.windingReliabilityLimited !== null) && firstControlSeparated !== null) terminalOutcome = 'control_separated_but_reliability_limited';
  else if (firstMeeting !== null && firstFailedGuardrail) {
    const map = { identityCollapse: 'meeting_then_identity_collapse', nearIdentityCollapse: 'meeting_then_identity_collapse', memoryCopyCollapse: 'meeting_then_memory_copy_collapse', memoryDetached: 'meeting_then_memory_detachment', fieldFlattened: 'meeting_then_field_flattening', energyUnstable: 'meeting_then_energy_instability', ledgerReliabilityLimited: 'meeting_then_ledger_reliability_limit', windingReliabilityLimited: 'meeting_then_winding_reliability_limit', pheromoneFog: 'meeting_then_pheromone_fog' };
    terminalOutcome = map[firstFailedGuardrail];
  } else if (firstMeeting !== null && firstMaintenanceExit !== null) terminalOutcome = 'meeting_without_maintenance';
  else if (firstMeeting !== null) terminalOutcome = 'short_horizon_maintenance_candidate';
  return { firstMeeting, firstControlSeparated, relationRelevantScanStartStep, baselineGuardrailState, preRelationGuardrailState, guardrailFirst, normalizedFirstGuardrailStep, firstFailedGuardrailsAtStep, firstFailedGuardrail, firstMaintenanceExit, couplingNotApplied, terminalOutcome };
}
function validateCadence(run) {
  const e = run.eventSummary;
  const expected = [];
  for (let step = 0; step <= e.traceHorizon; step += e.sampleInterval) expected.push(step);
  assert(sameJson(run.samples.map((sample) => sample.step), expected), `${run.runId} sample cadence does not match 0..traceHorizon by sampleInterval`);
}
function recomputeSummary(results) {
  const runs = results.runs;
  const nonControls = runs.filter((run) => run.controlRunId !== null);
  const couplingRuns = nonControls;
  return {
    runCount: runs.length,
    controlCount: runs.filter((run) => run.controlRunId === null).length,
    nonControlCount: nonControls.length,
    outcomeCounts: countBy(runs.map((run) => run.eventSummary.terminalOutcome)),
    firstFailedGuardrailCounts: countBy(runs.map((run) => run.eventSummary.firstFailedGuardrail || 'none')),
    couplingEffectivenessSummary: {
      coupledRunCount: couplingRuns.length,
      coupledRunsWithAppliedMemoryCoupling: couplingRuns.filter((run) => !run.eventSummary.couplingNotApplied).length,
      couplingNotAppliedRunIds: couplingRuns.filter((run) => run.eventSummary.couplingNotApplied).map((run) => run.runId),
      appliedCouplingRequiresMeasuredDelta: true,
    },
  };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function readJson(relativePath) { const absolutePath = path.join(ROOT, relativePath); assert(fs.existsSync(absolutePath), `${relativePath} missing`); return JSON.parse(fs.readFileSync(absolutePath, 'utf8')); }
function walk(value, visitor, pointer = '$') { visitor(value, pointer); if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => walk(child, visitor, `${pointer}.${key}`)); }
function assertFiniteOrNull(value, pointer) { if (typeof value === 'number') assert(Number.isFinite(value), `non-finite number at ${pointer}`); assert(value !== undefined, `undefined at ${pointer}`); }
function firstStep(samples, predicate) { const hit = samples.find(predicate); return hit ? hit.step : null; }
function countBy(values) { return values.reduce((counts, value) => { counts[value] = (counts[value] || 0) + 1; return counts; }, {}); }
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function gitClean(files) {
  const refs = ['origin/main', 'main', 'master', 'HEAD^'];
  for (const ref of refs) {
    try {
      execFileSync('git', ['rev-parse', '--verify', ref], { cwd: ROOT, stdio: 'pipe' });
      execFileSync('git', ['diff', '--exit-code', ref, '--', ...files], { cwd: ROOT, stdio: 'pipe' });
      return true;
    } catch (_) {}
  }
  const status = execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).trim();
  return status.length === 0;
}
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
  validateCadence(run);
  const steps = new Set(run.samples.map((s) => s.step)); for (const key of FIRST_FIELDS) assert(e[key] === null || steps.has(e[key]), `${run.runId} ${key} is not a sampled step`);
  const expected = computeExpectedEvent(run, controlRun);
  assert(e.firstMeetingBandEntryStep === expected.firstMeeting, `${run.runId} meeting-band first step mismatch`);
  assert(e.firstControlSeparatedStep === expected.firstControlSeparated, `${run.runId} control separation recompute mismatch`);
  assert(e.relationRelevantScanStartStep === expected.relationRelevantScanStartStep, `${run.runId} relationRelevantScanStartStep mismatch`);
  assert(sameJson(e.baselineGuardrailState, expected.baselineGuardrailState), `${run.runId} baselineGuardrailState mismatch`);
  assert(sameJson(e.preRelationGuardrailState, expected.preRelationGuardrailState), `${run.runId} preRelationGuardrailState mismatch`);
  assert(e.firstIdentityCollapseGuardrailStep === expected.guardrailFirst.identityCollapse, `${run.runId} identity guardrail mismatch`);
  assert(e.firstNearIdentityCollapseGuardrailStep === expected.guardrailFirst.nearIdentityCollapse, `${run.runId} near-identity guardrail mismatch`);
  assert(e.firstMemoryCopyCollapseGuardrailStep === expected.guardrailFirst.memoryCopyCollapse, `${run.runId} memory copy guardrail mismatch`);
  assert(e.firstMemoryDetachedGuardrailStep === expected.guardrailFirst.memoryDetached, `${run.runId} memory detached guardrail mismatch`);
  assert(e.firstFieldFlatteningGuardrailStep === expected.guardrailFirst.fieldFlattened, `${run.runId} field flattening guardrail mismatch`);
  assert(e.firstEnergyInstabilityGuardrailStep === expected.guardrailFirst.energyUnstable, `${run.runId} energy guardrail mismatch`);
  assert(e.firstLedgerReliabilityLimitedStep === expected.guardrailFirst.ledgerReliabilityLimited, `${run.runId} ledger guardrail mismatch`);
  assert(e.firstWindingReliabilityLimitedStep === expected.guardrailFirst.windingReliabilityLimited, `${run.runId} winding guardrail mismatch`);
  assert(e.firstPheromoneFogGuardrailStep === expected.guardrailFirst.pheromoneFog, `${run.runId} pheromone guardrail mismatch`);
  assert(sameJson(e.firstFailedGuardrailsAtStep, expected.firstFailedGuardrailsAtStep), `${run.runId} firstFailedGuardrailsAtStep mismatch`); assert(e.firstFailedGuardrail === expected.firstFailedGuardrail, `${run.runId} firstFailedGuardrail mismatch`);
  assert(e.firstMaintenanceExitStep === expected.firstMaintenanceExit, `${run.runId} firstMaintenanceExitStep mismatch`);
  assert(e.couplingNotApplied === expected.couplingNotApplied, `${run.runId} couplingNotApplied mismatch`);
  assert(e.terminalOutcome === expected.terminalOutcome, `${run.runId} terminalOutcome recompute mismatch`);
  const coupled = run.samples.some((s) => s.coupling.couplingG > 0); const applied = run.samples.some((s) => s.step > 0 && couplingHasMeasuredDelta(s));
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
  const recomputed = recomputeSummary(results);
  for (const key of ['runCount', 'controlCount', 'nonControlCount', 'outcomeCounts', 'firstFailedGuardrailCounts', 'couplingEffectivenessSummary']) assert(sameJson(summary[key], recomputed[key]), `summary ${key} does not match results recomputation`);
  assert(summary.overallRmtPassMeaning.includes('schema/runner/validator completeness only'), 'overall pass meaning must be operational only'); assert(summary.primaryMetricSource === 'collectAeternaMetrics', 'primary metric source mismatch'); assert(summary.allTerminalOutcomesAllowed === true, 'terminal outcome summary flag false'); assert(summary.allGuardrailThresholdsHeuristic === true, 'guardrail heuristic flag false'); assert(summary.matchedControlCoveragePass === true, 'matched control coverage failed');
  const text = [JSON.stringify(results), JSON.stringify(summary), fs.readFileSync(path.join(ROOT, DOC_PATH), 'utf8')].join('\n'); assert(!textHasForbiddenPositiveClaim(text), 'forbidden positive claim language found');
  assert(gitClean(PROTECTED_FILES), 'protected historical artifacts changed'); assert(gitClean(PACKAGE_FILES), 'package or lockfile changed');
  console.log('RMT validation passed.');
}
if (require.main === module) main();
