'use strict';

const { index3D } = require('../runtime/create-aeterna-fields');
const { computeGaugeInvariantABMetrics } = require('./gauge-invariant-metrics');

const OBSERVER_VERSION = 'observer-v2.0';
const DEFAULT_VALIDITY_AMP_THRESHOLD = 0.1;
const DEFAULT_NEAR_PI_MARGIN = 0.3;
const DISTANCE_FORMULA = 'sqrt(mean |a-b|^2) over complex samples';
const THETA_STAR_SIGN_CONVENTION = 'thetaStar is the angle applied to b in exp(+i thetaStar) so b best aligns to a; inherited from gauge-invariant-metrics computeGaugeInvariantABMetrics';
const TARGET_AMPLITUDE_POLICY = 'stationary-amplitude-reference';

function phaseDelta(a, b) {
  let delta = b - a;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function arraysFor(fieldLike, source = 'field') {
  if (!fieldLike) throw new Error('fieldLike is required');
  if (fieldLike.re && fieldLike.im) return { re: fieldLike.re, im: fieldLike.im };
  if (source === 'memory') return { re: fieldLike.memoryRe, im: fieldLike.memoryIm };
  return { re: fieldLike.phiRe, im: fieldLike.phiIm };
}

function assertArrays(a, b) {
  if (!a.re || !a.im || !b.re || !b.im) throw new Error('complex arrays are required');
  if (a.re.length !== a.im.length || b.re.length !== b.im.length) throw new Error('complex arrays must have matching re/im lengths');
  if (a.re.length !== b.re.length) throw new Error('complex arrays must have matching sample counts');
}

function computeRawL2(aArrays, bArrays, thetaForB = 0) {
  assertArrays(aArrays, bArrays);
  const count = aArrays.re.length;
  if (count === 0) return null;
  const cosTheta = Math.cos(thetaForB);
  const sinTheta = Math.sin(thetaForB);
  let sumSq = 0;
  let finiteCount = 0;
  for (let i = 0; i < count; i += 1) {
    const ar = aArrays.re[i];
    const ai = aArrays.im[i];
    const br = bArrays.re[i];
    const bi = bArrays.im[i];
    if (!Number.isFinite(ar) || !Number.isFinite(ai) || !Number.isFinite(br) || !Number.isFinite(bi)) continue;
    const alignedBRe = br * cosTheta - bi * sinTheta;
    const alignedBIm = br * sinTheta + bi * cosTheta;
    const dr = ar - alignedBRe;
    const di = ai - alignedBIm;
    sumSq += dr * dr + di * di;
    finiteCount += 1;
  }
  return finiteCount ? Math.sqrt(sumSq / finiteCount) : null;
}

/** Compute raw or gauge-aligned L2 distance between complex field-like objects. */
function computeFieldDistance(a, b, { gridSize, source = 'field', alignment = 'raw' } = {}) {
  const aArrays = arraysFor(a, source);
  const bArrays = arraysFor(b, source);
  const rawDistance = computeRawL2(aArrays, bArrays);
  if (alignment === 'raw') {
    return { gridSize, source, alignment, distance: rawDistance, thetaStar: null, distanceFormula: DISTANCE_FORMULA };
  }
  if (alignment !== 'gauge-aligned') throw new Error(`Unsupported alignment: ${alignment}`);

  // Reuse the repository gauge alignment convention by adapting the requested arrays into phi arrays.
  const metrics = computeGaugeInvariantABMetrics(
    { phiRe: aArrays.re, phiIm: aArrays.im },
    { phiRe: bArrays.re, phiIm: bArrays.im },
  );
  return {
    gridSize,
    source,
    alignment,
    distance: metrics ? computeRawL2(aArrays, bArrays, metrics.thetaStar) : null,
    rawDistance,
    thetaStar: metrics ? metrics.thetaStar : null,
    gaugeOverlap: metrics ? metrics.gaugeOverlap : null,
    distanceFormula: DISTANCE_FORMULA,
  };
}

/** Return the discrete stationary amplitude used as the analytic target reference. */
function predictedStationaryAmplitude(winding, gridSize, { vev = 1.0, lambda = 1.0 } = {}) {
  const k = (Math.PI * 2 * winding) / gridSize;
  const curvatureCost = 2 - 2 * Math.cos(k);
  return Math.sqrt(Math.max(0, vev * vev - curvatureCost / lambda));
}

/** Build a manual x-axis analytic winding state using the v2.1.2 ramp convention. */
function makeAnalyticWindingState({ gridSize, winding, axis = 'x', amplitude } = {}) {
  if (axis !== 'x') throw new Error('Observer V2 calibration currently supports x-axis analytic winding states only');
  if (!Number.isFinite(gridSize) || gridSize <= 0) throw new Error('gridSize must be positive');
  if (!Number.isFinite(amplitude)) throw new Error('amplitude must be supplied explicitly');
  const n = gridSize ** 3;
  const phiRe = new Float64Array(n);
  const phiIm = new Float64Array(n);
  const memoryRe = new Float64Array(n);
  const memoryIm = new Float64Array(n);
  for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) for (let x = 0; x < gridSize; x += 1) {
    const i = index3D(x, y, z, gridSize);
    const phase = (Math.PI * 2 * winding * x) / gridSize;
    const re = amplitude * Math.cos(phase);
    const im = amplitude * Math.sin(phase);
    phiRe[i] = re; phiIm[i] = im; memoryRe[i] = re; memoryIm[i] = im;
  }
  return { phiRe, phiIm, memoryRe, memoryIm, analyticWinding: winding, amplitude, targetAmplitudePolicy: TARGET_AMPLITUDE_POLICY };
}

/** Compute a dimensionless coefficient-times-distance pull proxy; not physical energy. */
function computeEffectivePullWork({ coefficient, distance } = {}) {
  const workProxy = Number.isFinite(coefficient) && Number.isFinite(distance) ? coefficient * distance : null;
  return {
    coefficient,
    distance,
    workProxy,
    basis: 'dimensionless per-step pull coefficient times target L2 distance for updates of form phi += k * (target - phi); not physical energy',
  };
}

/** Summarize x-line winding confidence from amplitude and near-pi phase-step reliability metrics. */
function computeWindingValidity(fieldLike, { gridSize, axis = 'x', source = 'field', validityAmpThreshold = DEFAULT_VALIDITY_AMP_THRESHOLD, nearPiMargin = DEFAULT_NEAR_PI_MARGIN } = {}) {
  if (axis !== 'x') throw new Error('Observer V2 winding validity currently supports x-axis lines only');
  const { re, im } = arraysFor(fieldLike, source);
  if (!re || !im) throw new Error('complex arrays are required');
  const validLineWindingHistogram = {};
  const rawWindingHistogram = {};
  const lineMinAmps = [];
  const lineMaxAbsPhaseSteps = [];
  const lineMeanAbsPhaseSteps = [];
  const closedLoopFloatResiduals = [];
  const nearPiStepCounts = [];
  let invalidLineCount = 0;
  let validLineCount = 0;
  let totalNearPiStepCount = 0;
  let maxNearPiStepCount = 0;
  const nearPiThreshold = Math.PI - nearPiMargin;
  for (let z = 0; z < gridSize; z += 1) for (let y = 0; y < gridSize; y += 1) {
    let acc = 0;
    let lineMinAmp = Infinity;
    let lineMaxAbsPhaseStep = 0;
    let lineAbsPhaseStepSum = 0;
    let nearPiStepCount = 0;
    for (let x = 0; x < gridSize; x += 1) {
      const i = index3D(x, y, z, gridSize);
      const j = index3D((x + 1) % gridSize, y, z, gridSize);
      lineMinAmp = Math.min(lineMinAmp, Math.hypot(re[i], im[i]));
      const delta = phaseDelta(Math.atan2(im[i], re[i]), Math.atan2(im[j], re[j]));
      const absDelta = Math.abs(delta);
      acc += delta;
      lineMaxAbsPhaseStep = Math.max(lineMaxAbsPhaseStep, absDelta);
      lineAbsPhaseStepSum += absDelta;
      if (absDelta > nearPiThreshold) nearPiStepCount += 1;
    }
    const rawWinding = acc / (Math.PI * 2);
    const nearestIntegerWinding = Math.round(rawWinding);
    const closedLoopFloatResidual = Math.abs(rawWinding - nearestIntegerWinding);
    const rawKey = String(nearestIntegerWinding);
    rawWindingHistogram[rawKey] = (rawWindingHistogram[rawKey] || 0) + 1;
    lineMinAmps.push(lineMinAmp);
    lineMaxAbsPhaseSteps.push(lineMaxAbsPhaseStep);
    lineMeanAbsPhaseSteps.push(lineAbsPhaseStepSum / gridSize);
    closedLoopFloatResiduals.push(closedLoopFloatResidual);
    nearPiStepCounts.push(nearPiStepCount);
    totalNearPiStepCount += nearPiStepCount;
    maxNearPiStepCount = Math.max(maxNearPiStepCount, nearPiStepCount);
    if (lineMinAmp < validityAmpThreshold) {
      invalidLineCount += 1;
    } else {
      validLineCount += 1;
      validLineWindingHistogram[rawKey] = (validLineWindingHistogram[rawKey] || 0) + 1;
    }
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const lineCount = gridSize * gridSize;
  return {
    axis,
    source,
    validityAmpThreshold,
    nearPiMargin,
    nearPiThreshold,
    invalidLineCount,
    validLineCount,
    lineMinAmpMin: Math.min(...lineMinAmps),
    lineMinAmpMean: mean(lineMinAmps),
    lineMaxAbsPhaseStepMean: mean(lineMaxAbsPhaseSteps),
    lineMaxAbsPhaseStepMax: Math.max(...lineMaxAbsPhaseSteps),
    lineMeanAbsPhaseStepMean: mean(lineMeanAbsPhaseSteps),
    lineMeanAbsPhaseStepMax: Math.max(...lineMeanAbsPhaseSteps),
    nearPiStepCount: totalNearPiStepCount,
    nearPiStepFraction: totalNearPiStepCount / (lineCount * gridSize),
    maxNearPiStepCount,
    totalNearPiStepCount,
    closedLoopFloatResidualMean: mean(closedLoopFloatResiduals),
    closedLoopFloatResidualMax: Math.max(...closedLoopFloatResiduals),
    closedLoopFloatResidualPolicy: 'floating-point sanity check only, not a reliability signal',
    validLineWindingHistogram,
    rawWindingHistogram,
  };
}

/** Describe Observer V2 policies, supported axes, and limitations for artifacts. */
function makeObserverContextV2({ validityAmpThreshold = DEFAULT_VALIDITY_AMP_THRESHOLD, nearPiMargin = DEFAULT_NEAR_PI_MARGIN } = {}) {
  return {
    observerVersion: OBSERVER_VERSION,
    distanceFormula: DISTANCE_FORMULA,
    alignmentPolicy: 'raw and gauge-aligned L2 distances; gauge-aligned uses shared gauge-invariant-metrics thetaStar convention',
    thetaStarSignConvention: THETA_STAR_SIGN_CONVENTION,
    normalizationPolicy: 'L2 distances are normalized by finite complex sample count; mode powers remain v2.1.2 observer-normalized where reported',
    validityAmpThreshold,
    nearPiMargin,
    reliabilityMetrics: ['lineMinAmp', 'invalidLineCount', 'lineMaxAbsPhaseStep', 'lineMeanAbsPhaseStep', 'nearPiStepCount', 'nearPiStepFraction'],
    closedLoopFloatResidualPolicy: 'floating-point sanity check only, not a reliability signal',
    targetAmplitudePolicy: TARGET_AMPLITUDE_POLICY,
    supportedAxes: ['x'],
    limitations: [
      'x-axis line winding only',
      'no full 3D vortex-core observer',
      'no exact topology proof',
      'no biological life / consciousness / agency / permanent survival claim',
      'Closed-loop float residual is not a winding reliability signal. Reliability is estimated from low-amplitude lines and near-π phase steps.',
    ],
  };
}

module.exports = {
  DEFAULT_VALIDITY_AMP_THRESHOLD,
  DEFAULT_NEAR_PI_MARGIN,
  OBSERVER_VERSION,
  computeFieldDistance,
  makeAnalyticWindingState,
  predictedStationaryAmplitude,
  computeEffectivePullWork,
  computeWindingValidity,
  makeObserverContextV2,
};
