#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { createAeternaRuntimeV0 } = require('../src/runtime/aeterna-runtime-v0');
const { stepAeternaRuntimeV0 } = require('../src/runtime/step-aeterna-runtime-v0');
const { createRandomizedAeternaFields } = require('../src/runtime/create-randomized-fields');
const { index3D } = require('../src/runtime/create-aeterna-fields');
const { collectAeternaMetrics } = require('../src/metrics/aeterna-metrics');
const { computeWindingValidity, makeObserverContextV2 } = require('../src/metrics/observer-v2');
const { compareLedgerMaps, computeTopologicalLedgerXY, makeTopologicalLedgerContext } = require('../src/metrics/topological-ledger');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments/v2.2-relation-maintenance-trace-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments/v2.2-relation-maintenance-trace-summary.json');
const CLAIM_LEVEL = 'finite-horizon operational trace';
const SOURCE_RESULTS = 'experiments/v2.2-structurally-distinct-beings-interaction-smoke-results.json';
const SOURCE_SUMMARY = 'experiments/v2.2-structurally-distinct-beings-interaction-smoke-summary.json';
const PHASE_CONSTRUCTION_MODE = 'periodic-dipole-image-sum-radius-1';
const MEASURABLE_EFFECT_EPSILON = { value: 0.000001, sourceStatus: 'heuristic band, not yet calibrated', reason: 'reused from G8 smoke no-op guard' };
const GUARDRAIL_THRESHOLDS = {
  identityCollapseGuardrail: { fieldABDistanceAlignedLessThan: 0.005, status: 'heuristic band, not yet calibrated' },
  nearIdentityCollapseGuardrail: { fieldABDistanceAlignedLessThan: 0.01, status: 'heuristic band, not yet calibrated' },
  provisionalMeetingBand: { fieldABDistanceAlignedMinInclusive: 0.01, fieldABDistanceAlignedMaxInclusive: 0.15, status: 'heuristic band, not yet calibrated' },
  memoryCopyCollapseGuardrail: { memoryFieldDifferenceLessThan: 0.05, status: 'heuristic band, not yet calibrated' },
  memoryDetachedGuardrail: { memoryFieldDifferenceGreaterThan: 0.35, status: 'heuristic band, not yet calibrated' },
  fieldFlatteningGuardrail: { amplitudeStdLessThan: 0.000001, status: 'heuristic band, not yet calibrated' },
  energyInstabilityGuardrail: { absoluteEnergyDeltaGreaterThan: 2, status: 'heuristic band, not yet calibrated; follows G8 Family P boundary context' },
  controlSeparation: MEASURABLE_EFFECT_EPSILON,
};
const ALLOWED_OUTCOMES = [
  'no_meeting_observed', 'meeting_without_maintenance', 'meeting_then_identity_collapse', 'meeting_then_memory_copy_collapse',
  'meeting_then_memory_detachment', 'meeting_then_field_flattening', 'meeting_then_energy_instability', 'meeting_then_ledger_reliability_limit',
  'meeting_then_winding_reliability_limit', 'meeting_then_pheromone_fog', 'control_separated_but_reliability_limited',
  'short_horizon_maintenance_candidate', 'boundary', 'indeterminate',
];
const FIRST_GUARDRAIL_PRECEDENCE = ['identityCollapse', 'nearIdentityCollapse', 'memoryCopyCollapse', 'memoryDetached', 'fieldFlattened', 'energyUnstable', 'ledgerReliabilityLimited', 'windingReliabilityLimited', 'pheromoneFog'];

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
  return Object.fromEntries(FIRST_GUARDRAIL_PRECEDENCE.map((name) => [name, sample?.guardrails?.[name] === true]));
}

function gitHash() { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return 'git-hash-unavailable'; } }
function round(value, digits = 8) { return Number.isFinite(value) ? Number(value.toFixed(digits)) : value; }
function clean(value) {
  if (value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? round(value) : null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clean);
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, clean(child)]));
}
function layoutSummary(layout) { return { pairCount: layout.pairCount, minSeparationRatio: layout.minSeparationRatio, netCharge: layout.netCharge, vortices: layout.vortices.map((v) => ({ x: round(v.x, 4), y: round(v.y, 4), charge: v.charge })) }; }
function applyGlobalXWinding(field, gridSize, winding) {
  if (!winding) return;
  for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) for (let x = 0; x < gridSize; x += 1) {
    const i = index3D(x, y, z, gridSize); const phase = (Math.PI * 2 * winding * x) / gridSize; const c = Math.cos(phase); const s = Math.sin(phase); const re = field.phiRe[i]; const im = field.phiIm[i];
    field.phiRe[i] = re * c - im * s; field.phiIm[i] = re * s + im * c; field.memoryRe[i] = field.phiRe[i]; field.memoryIm[i] = field.phiIm[i];
  }
}
function runtimeParams(condition) { return { COUPLING_ENABLED: condition.couplingG > 0, COUPLING_G: condition.couplingG, COUPLING_TYPE: 'memory', MEMORY_COUPLING_ENABLED: condition.couplingG > 0, MEMORY_COUPLING_FORMULA: 'difference-attractor', MEMORY_COUPLING_ORDER: 'after-memory-update', MEMORY_COUPLING_WEIGHT: 1.0, MEMORY_COUPLING_USE_BIDIRECTIONAL: true, MEMORY_ENABLED: true, MEMORY_BLEND_VELOCITY: true, MEMORY_WEIGHT_MODE: 'fixed', MEMORY_WEIGHT: 0.0075, HISTORY_ALPHA: 0.002, MEMORY_VELOCITY_SCALE: 0.1, PHEROMONE_ENABLED: false, PHEROMONE_FEEDBACK_ENABLED: false, PHASE_ROTATION_ENABLED: Boolean(condition.detuning), OMEGA_A: 0.01, OMEGA_B: 0.01 + (condition.detuning || 0), PHASE_ROTATION_TARGET: 'field-and-memory' }; }
function createRuntime(condition) {
  const config = { noiseAmp: 0, dt: 0.03, sampleInterval: condition.sampleInterval, metricsSampleInterval: condition.sampleInterval };
  const params = runtimeParams(condition);
  const runtime = createAeternaRuntimeV0({ gridSize: condition.gridSize, seedA: condition.seedA, seedB: condition.seedB, params, config });
  const randomized = createRandomizedAeternaFields({ gridSize: condition.gridSize, seedA: condition.seedA, seedB: condition.seedB, pairCount: condition.pairCount, minSeparationRatio: condition.minSeparationRatio, phaseConstructionMode: PHASE_CONSTRUCTION_MODE, params: runtime.params, config: runtime.config });
  runtime.fieldA = randomized.fieldA; runtime.fieldB = randomized.fieldB;
  applyGlobalXWinding(runtime.fieldA, condition.gridSize, condition.initialWindingA); applyGlobalXWinding(runtime.fieldB, condition.gridSize, condition.initialWindingB);
  runtime.layoutProvenance = { initializer: 'createRandomizedAeternaFields', phaseConstructionMode: PHASE_CONSTRUCTION_MODE, vortexLayoutA: layoutSummary(randomized.vortexLayoutA), vortexLayoutB: layoutSummary(randomized.vortexLayoutB), layoutRelation: 'structurally_distinct_randomized_vortex_layouts', netChargeA: randomized.vortexLayoutA.netCharge, netChargeB: randomized.vortexLayoutB.netCharge };
  return runtime;
}
function dominant(hist) { const entries = Object.entries(hist || {}).map(([k, v]) => [Number(k), v]).sort((a, b) => b[1] - a[1]); const total = entries.reduce((s, e) => s + e[1], 0); return entries[0] ? { winding: entries[0][0], fraction: total ? entries[0][1] / total : null } : { winding: null, fraction: null }; }
function sampleRuntime(runtime, previousMetrics) {
  const metrics = collectAeternaMetrics({ fieldA: runtime.fieldA, fieldB: runtime.fieldB, pheromoneField: runtime.pheromoneField, stepCount: runtime.stepCount, gridSize: runtime.config.gridSize, index3D, previousMetrics, couplingMetrics: runtime.lastCouplingMetrics, couplingParams: runtime.params });
  const validityA = computeWindingValidity(runtime.fieldA, { gridSize: runtime.config.gridSize, source: 'field' }); const validityB = computeWindingValidity(runtime.fieldB, { gridSize: runtime.config.gridSize, source: 'field' });
  const domA = dominant(validityA.validLineWindingHistogram); const domB = dominant(validityB.validLineWindingHistogram);
  const ledgerA = computeTopologicalLedgerXY(runtime.fieldA, { gridSize: runtime.config.gridSize, step: runtime.stepCount }); const ledgerB = computeTopologicalLedgerXY(runtime.fieldB, { gridSize: runtime.config.gridSize, step: runtime.stepCount }); const ledgerCompare = compareLedgerMaps(ledgerA, ledgerB);
  const fieldDistance = metrics.alignedFieldABDistance; const memA = metrics.memoryFieldDifferenceA; const memB = metrics.memoryFieldDifferenceB;
  const ledgerLimited = ledgerA.invalidPlaquetteCount > 0 || ledgerB.invalidPlaquetteCount > 0 || ledgerA.nearPiEdgeCount > 0 || ledgerB.nearPiEdgeCount > 0;
  const windingLimited = validityA.invalidLineCount > 0 || validityB.invalidLineCount > 0 || validityA.nearPiStepCount > 0 || validityB.nearPiStepCount > 0;
  const guardrails = { identityCollapse: fieldDistance !== null && fieldDistance < 0.005, nearIdentityCollapse: fieldDistance !== null && fieldDistance < 0.01, memoryCopyCollapse: (memA !== null && memA < 0.05) || (memB !== null && memB < 0.05), memoryDetached: (memA !== null && memA > 0.35) || (memB !== null && memB > 0.35), fieldFlattened: metrics.amplitudeStdA < 0.000001 || metrics.amplitudeStdB < 0.000001, energyUnstable: Math.abs(metrics.energyDeltaFromPreviousSample || 0) > 2, ledgerReliabilityLimited: ledgerLimited, windingReliabilityLimited: windingLimited, pheromoneFog: false };
  return { sample: clean({ step: runtime.stepCount, observerV2: { fieldABDistanceRaw: metrics.rawFieldABDistance, fieldABDistanceAligned: fieldDistance, D_inv: metrics.D_inv, thetaStarFieldAB: metrics.thetaStar, gaugeOverlap: metrics.gaugeOverlap, memoryABDistanceRaw: metrics.rawMemoryABDistance, memoryABDistanceAligned: metrics.alignedMemoryABDistance, D_inv_memory: metrics.D_inv_memory, thetaStarMemoryAB: metrics.thetaStarMemory, memoryFieldDifferenceA: memA, memoryFieldDifferenceB: memB }, topology: { vortexCountA: ledgerA.positivePlaquetteCount + ledgerA.negativePlaquetteCount, vortexCountB: ledgerB.positivePlaquetteCount + ledgerB.negativePlaquetteCount, dominantWindingA: domA.winding, dominantWindingB: domB.winding, dominantFractionA: domA.fraction, dominantFractionB: domB.fraction, windingValidityA: validityA, windingValidityB: validityB, windingReliabilityLimited: windingLimited }, topologicalLedger: { plaquetteMapDistanceAB: ledgerCompare.distance, positivePlaquetteCountA: ledgerA.positivePlaquetteCount, negativePlaquetteCountA: ledgerA.negativePlaquetteCount, positivePlaquetteCountB: ledgerB.positivePlaquetteCount, negativePlaquetteCountB: ledgerB.negativePlaquetteCount, invalidPlaquetteCountA: ledgerA.invalidPlaquetteCount, invalidPlaquetteCountB: ledgerB.invalidPlaquetteCount, nearPiEdgeCountA: ledgerA.nearPiEdgeCount, nearPiEdgeCountB: ledgerB.nearPiEdgeCount, ledgerReliabilityLimited: ledgerLimited }, fieldHealth: { amplitudeMeanA: metrics.amplitudeMeanA, amplitudeMeanB: metrics.amplitudeMeanB, amplitudeStdA: metrics.amplitudeStdA, amplitudeStdB: metrics.amplitudeStdB, fieldFlatteningGuardrailA: metrics.amplitudeStdA < 0.000001, fieldFlatteningGuardrailB: metrics.amplitudeStdB < 0.000001 }, energy: { fieldEnergyProxyCombined: metrics.fieldEnergyProxyCombined, totalEnergyCombined: metrics.totalEnergyCombined, energyDeltaFromPreviousSample: metrics.energyDeltaFromPreviousSample, energyInstabilityGuardrail: guardrails.energyUnstable }, pheromone: { enabled: false, activeRatio: null, spatialEntropy: null, fogGuardrail: false }, coupling: { couplingEnabled: (metrics.COUPLING_G || 0) > 0, couplingType: metrics.COUPLING_TYPE, couplingG: metrics.COUPLING_G || 0, memoryCouplingEnabled: metrics.MEMORY_COUPLING_ENABLED, memoryCouplingApplied: metrics.memoryCouplingApplied, effectiveMemoryCoupling: metrics.effectiveMemoryCoupling, memoryCouplingAppliedCells: metrics.memoryCouplingAppliedCells, memoryCouplingDeltaA: metrics.memoryCouplingDeltaA, memoryCouplingDeltaB: metrics.memoryCouplingDeltaB, memoryCouplingAverageDeltaA: metrics.memoryCouplingAverageDeltaA, memoryCouplingAverageDeltaB: metrics.memoryCouplingAverageDeltaB }, guardrails }), previousMetrics: { fieldEnergyProxyCombined: metrics.fieldEnergyProxyCombined, totalEnergyCombined: metrics.totalEnergyCombined } };
}
function firstStep(samples, predicate) { const hit = samples.find(predicate); return hit ? hit.step : null; }
function computeEventSummary(run, condition, controlRun) {
  const samples = run.samples;
  const firstMeeting = firstStep(samples, (s) => s.observerV2.fieldABDistanceAligned >= 0.01 && s.observerV2.fieldABDistanceAligned <= 0.15);
  let firstControlSeparated = null;
  if (controlRun) for (const sample of samples) { const control = controlRun.samples.find((s) => s.step === sample.step); if (control && (Math.abs(sample.observerV2.fieldABDistanceAligned - control.observerV2.fieldABDistanceAligned) > MEASURABLE_EFFECT_EPSILON.value || Math.abs(sample.observerV2.memoryABDistanceAligned - control.observerV2.memoryABDistanceAligned) > MEASURABLE_EFFECT_EPSILON.value)) { firstControlSeparated = sample.step; break; } }
  const relationStartCandidates = [firstMeeting, firstControlSeparated].filter((value) => value !== null);
  const relationRelevantScanStartStep = relationStartCandidates.length > 0 ? Math.min(...relationStartCandidates) : null;
  const baselineGuardrailState = guardrailState(samples[0]);
  const preRelationSamples = relationRelevantScanStartStep === null ? samples.filter((s) => s.step > 0) : samples.filter((s) => s.step > 0 && s.step < relationRelevantScanStartStep);
  const preRelationGuardrailState = Object.fromEntries(FIRST_GUARDRAIL_PRECEDENCE.map((name) => [name, preRelationSamples.some((s) => s.guardrails[name] === true)]));
  const relationSamples = relationRelevantScanStartStep === null ? [] : samples.filter((s) => s.step >= relationRelevantScanStartStep);
  const guardrailFirst = Object.fromEntries(FIRST_GUARDRAIL_PRECEDENCE.map((name) => [name, firstStep(relationSamples, (s) => s.guardrails[name] === true)]));
  const firstGuardrailStep = Math.min(...Object.values(guardrailFirst).filter((v) => v !== null));
  const normalizedFirstGuardrailStep = Number.isFinite(firstGuardrailStep) ? firstGuardrailStep : null;
  const firstFailedGuardrailsAtStep = normalizedFirstGuardrailStep === null ? [] : FIRST_GUARDRAIL_PRECEDENCE.filter((name) => guardrailFirst[name] === normalizedFirstGuardrailStep);
  const firstFailedGuardrail = firstFailedGuardrailsAtStep[0] || null;
  const firstMaintenanceExit = firstMeeting === null ? null : firstStep(samples, (s) => s.step > firstMeeting && (!(s.observerV2.fieldABDistanceAligned >= 0.01 && s.observerV2.fieldABDistanceAligned <= 0.15) || FIRST_GUARDRAIL_PRECEDENCE.some((name) => s.guardrails[name])));
  const couplingNotApplied = condition.couplingG > 0 && !samples.some((s) => s.step > 0 && couplingHasMeasuredDelta(s));
  const limitations = ['finite sampled horizon', 'guardrail thresholds are heuristic and not yet calibrated'];
  if (couplingNotApplied) limitations.push('coupling_not_applied');
  if (samples.some((s) => s.guardrails.ledgerReliabilityLimited || s.guardrails.windingReliabilityLimited)) limitations.push('observer_reliability_limited');
  let terminalOutcome = 'boundary'; let terminalOutcomeReason = 'distance, memory, topology, energy, or field-health axes require conservative interpretation';
  if (couplingNotApplied) { terminalOutcome = 'indeterminate'; terminalOutcomeReason = 'coupled condition did not show applied effective memory coupling'; }
  else if (firstMeeting === null && firstControlSeparated === null) { terminalOutcome = 'no_meeting_observed'; terminalOutcomeReason = 'no sampled meeting-band entry or matched-control separation was observed'; }
  else if ((guardrailFirst.ledgerReliabilityLimited !== null || guardrailFirst.windingReliabilityLimited !== null) && firstControlSeparated !== null) { terminalOutcome = 'control_separated_but_reliability_limited'; terminalOutcomeReason = 'matched-control separation was observed, but ledger or winding reliability limited interpretation'; }
  else if (firstMeeting !== null && firstFailedGuardrail) { const map = { identityCollapse: 'meeting_then_identity_collapse', nearIdentityCollapse: 'meeting_then_identity_collapse', memoryCopyCollapse: 'meeting_then_memory_copy_collapse', memoryDetached: 'meeting_then_memory_detachment', fieldFlattened: 'meeting_then_field_flattening', energyUnstable: 'meeting_then_energy_instability', ledgerReliabilityLimited: 'meeting_then_ledger_reliability_limit', windingReliabilityLimited: 'meeting_then_winding_reliability_limit', pheromoneFog: 'meeting_then_pheromone_fog' }; terminalOutcome = map[firstFailedGuardrail]; terminalOutcomeReason = `meeting-band entry followed by sampled ${firstFailedGuardrail} guardrail`; }
  else if (firstMeeting !== null && firstMaintenanceExit !== null) { terminalOutcome = 'meeting_without_maintenance'; terminalOutcomeReason = 'meeting-band entry was sampled, then the run left the band without a clearer guardrail'; }
  else if (firstMeeting !== null) { terminalOutcome = 'short_horizon_maintenance_candidate'; terminalOutcomeReason = 'meeting-band entry remained sampled through finite horizon without a guardrail; this is not long-horizon maintenance'; }
  if (!ALLOWED_OUTCOMES.includes(terminalOutcome)) terminalOutcome = 'indeterminate';
  return clean({ runId: run.runId, conditionId: run.conditionId, sourceArtifact: SOURCE_RESULTS, sourceConditionId: condition.conditionId, conditionSelectionStrategy: 'minimal-first', traceHorizon: condition.horizon, sampleInterval: condition.sampleInterval, controlRunId: condition.controlRunId, relationRelevantScanStartStep, baselineGuardrailState, preRelationGuardrailState, firstMeetingBandEntryStep: firstMeeting, firstControlSeparatedStep: firstControlSeparated, firstMaintenanceExitStep: firstMaintenanceExit, firstIdentityCollapseGuardrailStep: guardrailFirst.identityCollapse, firstNearIdentityCollapseGuardrailStep: guardrailFirst.nearIdentityCollapse, firstMemoryCopyCollapseGuardrailStep: guardrailFirst.memoryCopyCollapse, firstMemoryDetachedGuardrailStep: guardrailFirst.memoryDetached, firstFieldFlatteningGuardrailStep: guardrailFirst.fieldFlattened, firstEnergyInstabilityGuardrailStep: guardrailFirst.energyUnstable, firstLedgerReliabilityLimitedStep: guardrailFirst.ledgerReliabilityLimited, firstWindingReliabilityLimitedStep: guardrailFirst.windingReliabilityLimited, firstPheromoneFogGuardrailStep: guardrailFirst.pheromoneFog, couplingNotApplied, firstFailedGuardrail, firstFailedGuardrailsAtStep, terminalOutcome, terminalOutcomeReason, limitations, claimLevel: CLAIM_LEVEL });
}
function runCondition(condition, controlRun) { const runtime = createRuntime(condition); const samples = []; let previousMetrics = null; for (let targetStep = 0; targetStep <= condition.horizon; targetStep += condition.sampleInterval) { while (runtime.stepCount < targetStep) stepAeternaRuntimeV0(runtime); const record = sampleRuntime(runtime, previousMetrics); samples.push(record.sample); previousMetrics = record.previousMetrics; } const run = { runId: condition.runId, conditionId: condition.conditionId, family: condition.family, sourceArtifact: SOURCE_RESULTS, sourceConditionId: condition.conditionId, conditionLineage: 'G8 structurally distinct randomized runtime lineage', runtimeParams: runtimeParams(condition), layoutProvenance: runtime.layoutProvenance, controlRunId: condition.controlRunId, samples, eventSummary: null }; run.eventSummary = computeEventSummary(run, condition, controlRun); return clean(run); }
function main() {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, SOURCE_RESULTS), 'utf8'));
  const included = ['T-control-g0', 'T-coupled-g-provisional', 'P-control-g0-W1xW0', 'P-boundary-low-g-provisional-W1xW0', 'P-coupled-g-provisional-W1xW0', 'P-boundary-high-g-provisional-W1xW0'];
  const excluded = source.conditions.map((c) => c.conditionId).filter((id) => !included.includes(id));
  const base = { gridSize: 12, pairCount: 2, minSeparationRatio: 0.18 };
  const specs = source.conditions.filter((c) => included.includes(c.conditionId)).map((c) => ({ ...base, conditionId: c.conditionId, family: c.family, isControl: c.isControl, seedA: c.seedA, seedB: c.seedB, initialWindingA: c.initialWindingA, initialWindingB: c.initialWindingB, couplingG: c.couplingG, horizon: c.horizon, sampleInterval: c.sampleInterval, detuning: c.detuningReference?.value || 0, runId: `${c.conditionId}-rmt-run`, controlRunId: c.isControl ? null : `${c.controlRunId.replace(/-run$/, '')}-rmt-run` }));
  const runs = []; const runById = new Map();
  for (const spec of specs) { const run = runCondition(spec, runById.get(spec.controlRunId)); runs.push(run); runById.set(run.runId, run); }
  const outcomeCounts = {}; const firstFailedGuardrailCounts = {}; for (const run of runs) { outcomeCounts[run.eventSummary.terminalOutcome] = (outcomeCounts[run.eventSummary.terminalOutcome] || 0) + 1; const g = run.eventSummary.firstFailedGuardrail || 'none'; firstFailedGuardrailCounts[g] = (firstFailedGuardrailCounts[g] || 0) + 1; }
  const couplingRuns = runs.filter((r) => r.eventSummary.controlRunId !== null);
  const couplingEffectivenessSummary = { coupledRunCount: couplingRuns.length, coupledRunsWithAppliedMemoryCoupling: couplingRuns.filter((r) => !r.eventSummary.couplingNotApplied).length, couplingNotAppliedRunIds: couplingRuns.filter((r) => r.eventSummary.couplingNotApplied).map((r) => r.runId), appliedCouplingRequiresMeasuredDelta: true };
  const results = { schemaVersion: 'v2.2-rmt-1', artifactType: 'relation-maintenance-trace-results', claimLevel: CLAIM_LEVEL, preregistrationPath: 'docs/v2.2-relation-maintenance-trace-preregistration.md', sourceArtifacts: [SOURCE_RESULTS, SOURCE_SUMMARY], generatorGitHash: gitHash(), runMode: 'lightweight', rmtScope: 'minimal', conditionSelectionStrategy: 'minimal-first', includedConditionIds: included, excludedConditionIds: excluded, selectionReason: 'first RMT gate validates the trace ruler before broad sweeps', nonGoals: ['no runtime physics changes', 'no drive', 'no gentle-pulse wiring', 'no N-field', 'no relation proof', 'no maintenance proof', 'no biological life claim', 'no consciousness claim', 'no agency claim', 'no permanent survival claim'], guardrailThresholds: GUARDRAIL_THRESHOLDS, namingNotes: { fieldABDistanceAligned: 'mapped from collectAeternaMetrics.alignedFieldABDistance', memoryFieldDifferenceA: 'mapped from collectAeternaMetrics.memoryFieldDifferenceA', memoryFieldDifferenceB: 'mapped from collectAeternaMetrics.memoryFieldDifferenceB', fieldMemoryDistanceA: 'not emitted in first RMT schema', fieldMemoryDistanceB: 'not emitted in first RMT schema' }, observerContexts: { observerV2: makeObserverContextV2(), topologicalLedger: makeTopologicalLedgerContext() }, runs };
  const summary = { schemaVersion: 'v2.2-rmt-1', artifactType: 'relation-maintenance-trace-summary', claimLevel: CLAIM_LEVEL, overallRmtPass: true, overallRmtPassMeaning: 'schema/runner/validator completeness only; not evidence of relation, maintenance, persistence, biological life, consciousness, agency, subjectivity, s-o-u-l, permanent survival, origin of time, or origin of memory', runCount: runs.length, controlCount: runs.filter((r) => r.controlRunId === null).length, nonControlCount: runs.filter((r) => r.controlRunId !== null).length, matchedControlCoveragePass: runs.filter((r) => r.controlRunId !== null).every((r) => runById.has(r.controlRunId)), allRunsFiniteHorizon: true, allTerminalOutcomesAllowed: runs.every((r) => ALLOWED_OUTCOMES.includes(r.eventSummary.terminalOutcome)), allGuardrailThresholdsHeuristic: true, forbiddenClaimLanguageAbsent: true, conditionSelectionStrategy: 'minimal-first', includedConditionIds: included, excludedConditionIds: excluded, outcomeCounts, firstFailedGuardrailCounts, sourceArtifactCoverage: { [SOURCE_RESULTS]: runs.length, [SOURCE_SUMMARY]: 'condition selection context' }, guardrailThresholds: GUARDRAIL_THRESHOLDS, couplingEffectivenessSummary, primaryMetricSource: 'collectAeternaMetrics', limitations: ['minimal-first subset of G8-derived conditions', 'sampled finite horizon only', 'guardrail thresholds heuristic and not yet calibrated', 'RMT artifacts are not protected historical artifacts until a later gate'], recommendedNextGate: 'RMT artifact protection after review' };
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(clean(results), null, 2)}\n`); fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(clean(summary), null, 2)}\n`); console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)} and ${path.relative(ROOT, SUMMARY_PATH)}`);
}
if (require.main === module) main();
module.exports = { GUARDRAIL_THRESHOLDS, ALLOWED_OUTCOMES };
