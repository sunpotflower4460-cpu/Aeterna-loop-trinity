'use strict';

const { index3D } = require('../runtime/create-aeterna-fields');

const OBSERVER_VERSION = 'topological-ledger-v0.1';
const DEFAULT_VALIDITY_AMP_THRESHOLD = 0.1;
const DEFAULT_NEAR_PI_MARGIN = 0.3;
const TWO_PI = Math.PI * 2;

function phaseDelta(a, b) {
  let delta = b - a;
  while (delta <= -Math.PI) delta += TWO_PI;
  while (delta > Math.PI) delta -= TWO_PI;
  return delta;
}

function arraysFor(fieldLike, source = 'field') {
  if (!fieldLike) throw new Error('fieldLike is required');
  if (fieldLike.re && fieldLike.im) return { re: fieldLike.re, im: fieldLike.im };
  if (source === 'memory') return { re: fieldLike.memoryRe, im: fieldLike.memoryIm };
  return { re: fieldLike.phiRe, im: fieldLike.phiIm };
}

function phaseAt(re, im, x, y, z, gridSize) {
  const i = index3D(x, y, z, gridSize);
  return Math.atan2(im[i], re[i]);
}

function ampAt(re, im, x, y, z, gridSize) {
  const i = index3D(x, y, z, gridSize);
  return Math.hypot(re[i], im[i]);
}

function makeTopologicalLedgerContext({ validityAmpThreshold = DEFAULT_VALIDITY_AMP_THRESHOLD, nearPiMargin = DEFAULT_NEAR_PI_MARGIN } = {}) {
  return {
    observerVersion: OBSERVER_VERSION,
    orientation: 'xy',
    supportedOrientations: ['xy'],
    sliceAxis: 'z',
    boundaryCondition: 'periodic',
    periodicAxes: ['x', 'y', 'z'],
    strictIntegerGateAppliesBecause: 'xy plaquette ledger is computed on periodic x/y slices',
    strictGatePolicy: 'strict integer gates apply only to all-valid synthetic periodic cases; runtime/noisy cases require reliability context',
    invalidPlaquettePolicy: 'plaquette is invalid if any of its four corner amplitudes are below validityAmpThreshold; invalid counts are reported separately and must not support strict topology claims',
    edgeSharingPolicy: 'shared periodic x/y edge phase differences are computed once per z-slice and reused with opposite signs for adjacent plaquettes',
    phaseDeltaConvention: 'principal-value (-π, π]',
    plaquetteIntegerPolicy: 'round(sumWrappedEdgeDeltas / 2π)',
    closedPlaquetteFloatResidualPolicy: 'floating-point sanity check only, not the main phenomenon metric',
    validityAmpThreshold,
    nearPiMargin,
  };
}

function computePlaquetteWindingXY(fieldLike, { gridSize, source = 'field', validityAmpThreshold = DEFAULT_VALIDITY_AMP_THRESHOLD, nearPiMargin = DEFAULT_NEAR_PI_MARGIN } = {}) {
  if (!Number.isFinite(gridSize) || gridSize <= 0) throw new Error('gridSize must be positive');
  const { re, im } = arraysFor(fieldLike, source);
  if (!re || !im || re.length !== im.length) throw new Error('complex arrays are required');
  const n = gridSize;
  const size = n * n * n;
  const xEdges = new Float64Array(size);
  const yEdges = new Float64Array(size);
  let nearPiEdgeCount = 0;
  const nearPiThreshold = Math.PI - nearPiMargin;

  for (let z = 0; z < n; z += 1) for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
    const i = index3D(x, y, z, n);
    const phase = phaseAt(re, im, x, y, z, n);
    const dx = phaseDelta(phase, phaseAt(re, im, (x + 1) % n, y, z, n));
    const dy = phaseDelta(phase, phaseAt(re, im, x, (y + 1) % n, z, n));
    xEdges[i] = dx;
    yEdges[i] = dy;
    if (Math.abs(dx) > nearPiThreshold) nearPiEdgeCount += 1;
    if (Math.abs(dy) > nearPiThreshold) nearPiEdgeCount += 1;
  }

  const values = new Int32Array(size);
  const residuals = [];
  let positivePlaquetteCount = 0;
  let negativePlaquetteCount = 0;
  let invalidPlaquetteCount = 0;
  let closedPlaquetteFloatResidualMax = 0;
  const perSliceTotalWinding = Array(n).fill(0);
  const perSliceNetCharge = Array(n).fill(0);
  const perSlicePositiveCount = Array(n).fill(0);
  const perSliceNegativeCount = Array(n).fill(0);

  for (let z = 0; z < n; z += 1) for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
    const xp = (x + 1) % n;
    const yp = (y + 1) % n;
    const i = index3D(x, y, z, n);
    const windingFloat = (xEdges[i] + yEdges[index3D(xp, y, z, n)] - xEdges[index3D(x, yp, z, n)] - yEdges[i]) / TWO_PI;
    const winding = Math.round(windingFloat);
    const residual = Math.abs(windingFloat - winding);
    residuals.push(residual);
    closedPlaquetteFloatResidualMax = Math.max(closedPlaquetteFloatResidualMax, residual);
    values[i] = winding;
    const minAmp = Math.min(ampAt(re, im, x, y, z, n), ampAt(re, im, xp, y, z, n), ampAt(re, im, xp, yp, z, n), ampAt(re, im, x, yp, z, n));
    if (minAmp < validityAmpThreshold) invalidPlaquetteCount += 1;
    if (winding > 0) { positivePlaquetteCount += winding; perSlicePositiveCount[z] += winding; }
    if (winding < 0) { negativePlaquetteCount += -winding; perSliceNegativeCount[z] += -winding; }
    perSliceTotalWinding[z] += winding;
    perSliceNetCharge[z] += winding;
  }

  return {
    values,
    shape: [n, n, n],
    layout: 'z-major/y/x',
    positivePlaquetteCount,
    negativePlaquetteCount,
    totalWinding: perSliceTotalWinding.reduce((sum, value) => sum + value, 0),
    netCharge: perSliceNetCharge.reduce((sum, value) => sum + value, 0),
    perSliceTotalWinding,
    perSliceNetCharge,
    perSlicePositiveCount,
    perSliceNegativeCount,
    invalidPlaquetteCount,
    invalidPlaquetteFraction: invalidPlaquetteCount / size,
    nearPiEdgeCount,
    nearPiEdgeFraction: nearPiEdgeCount / (size * 2),
    closedPlaquetteFloatResidualMax,
  };
}

function computeTopologicalLedgerXY(fieldLike, options = {}) {
  const gridSize = options.gridSize;
  const plaquettes = computePlaquetteWindingXY(fieldLike, options);
  const context = makeTopologicalLedgerContext(options);
  return {
    ...context,
    gridSize,
    step: options.step ?? null,
    sliceCount: gridSize,
    plaquetteCount: gridSize * gridSize * gridSize,
    positivePlaquetteCount: plaquettes.positivePlaquetteCount,
    negativePlaquetteCount: plaquettes.negativePlaquetteCount,
    totalWinding: plaquettes.totalWinding,
    netCharge: plaquettes.netCharge,
    perSliceTotalWinding: plaquettes.perSliceTotalWinding,
    perSliceNetCharge: plaquettes.perSliceNetCharge,
    perSlicePositiveCount: plaquettes.perSlicePositiveCount,
    perSliceNegativeCount: plaquettes.perSliceNegativeCount,
    invalidPlaquetteCount: plaquettes.invalidPlaquetteCount,
    invalidPlaquetteFraction: plaquettes.invalidPlaquetteFraction,
    nearPiEdgeCount: plaquettes.nearPiEdgeCount,
    nearPiEdgeFraction: plaquettes.nearPiEdgeFraction,
    closedPlaquetteFloatResidualMax: plaquettes.closedPlaquetteFloatResidualMax,
    legacyComputeVortexCountComparison: options.legacyComputeVortexCountComparison ?? null,
    plaquetteWinding: { values: Array.from(plaquettes.values), shape: plaquettes.shape, layout: plaquettes.layout },
  };
}

function compareLedgerMaps(a, b) {
  const av = a?.plaquetteWinding?.values || a?.values || [];
  const bv = b?.plaquetteWinding?.values || b?.values || [];
  if (av.length !== bv.length) return { equal: false, distance: Infinity, differingPlaquetteCount: Infinity };
  let distance = 0;
  let differingPlaquetteCount = 0;
  for (let i = 0; i < av.length; i += 1) {
    const delta = Math.abs(av[i] - bv[i]);
    distance += delta;
    if (delta !== 0) differingPlaquetteCount += 1;
  }
  return { equal: differingPlaquetteCount === 0, distance, differingPlaquetteCount };
}

function computeLedgerDelta(previous, next) {
  const comparison = compareLedgerMaps(previous, next);
  return { ...comparison, policy: 'diagnostic event signal only; not a strict invariant' };
}

module.exports = {
  OBSERVER_VERSION,
  DEFAULT_NEAR_PI_MARGIN,
  DEFAULT_VALIDITY_AMP_THRESHOLD,
  computeLedgerDelta,
  computePlaquetteWindingXY,
  computeTopologicalLedgerXY,
  compareLedgerMaps,
  makeTopologicalLedgerContext,
  phaseDelta,
};
