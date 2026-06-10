#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { computeFieldDistance } = require('../src/metrics/aeterna-metrics');
const {
  classifyPhaseStructureRegime,
  computeGaugeInvariantABMetrics,
  findPhaseLockOnsetStep,
  findRawDistanceCollapseOnsetStep,
  findStructuralCollapseOnsetStep,
} = require('../src/metrics/gauge-invariant-metrics');

function rotateField(field, theta) {
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const phiRe = new Float64Array(field.phiRe.length);
  const phiIm = new Float64Array(field.phiIm.length);

  for (let i = 0; i < field.phiRe.length; i += 1) {
    const re = field.phiRe[i];
    const im = field.phiIm[i];
    phiRe[i] = re * cosTheta - im * sinTheta;
    phiIm[i] = re * sinTheta + im * cosTheta;
  }

  return { phiRe, phiIm };
}

function nearlyEqual(a, b, epsilon, label) {
  assert(Number.isFinite(a), `${label}: left side is not finite`);
  assert(Number.isFinite(b), `${label}: right side is not finite`);
  assert(Math.abs(a - b) <= epsilon, `${label}: expected ${a} ~= ${b}`);
}

const fieldA = {
  phiRe: Float64Array.from([1.0, 0.5, -0.75, 0.25, 1.2]),
  phiIm: Float64Array.from([0.0, 0.8, 0.4, -1.1, -0.2]),
};
const theta = Math.PI / 5;
const fieldB = rotateField(fieldA, theta);
const rawDistance = computeFieldDistance(fieldA, fieldB);
const metrics = computeGaugeInvariantABMetrics(fieldA, fieldB);

nearlyEqual(metrics.rawFieldABDistance, rawDistance, 1e-9, 'raw distance convention');
nearlyEqual(metrics.thetaStar, -theta, 1e-12, 'thetaStar sign convention');
assert(metrics.alignedFieldABDistance < 1e-12, `alignedFieldABDistance should be near zero, got ${metrics.alignedFieldABDistance}`);
assert(metrics.D_inv < 1e-7, `D_inv should be near zero, got ${metrics.D_inv}`);

const commonRotation = -0.37;
const rotatedA = rotateField(fieldA, commonRotation);
const rotatedB = rotateField(fieldB, commonRotation);
const rotatedMetrics = computeGaugeInvariantABMetrics(rotatedA, rotatedB);

nearlyEqual(rotatedMetrics.alignedFieldABDistance, metrics.alignedFieldABDistance, 1e-12, 'aligned distance common-rotation invariance');
nearlyEqual(rotatedMetrics.D_inv, metrics.D_inv, 1e-7, 'D_inv common-rotation invariance');

const nonFiniteField = {
  phiRe: Float64Array.from([Number.NaN, Number.POSITIVE_INFINITY]),
  phiIm: Float64Array.from([0, 1]),
};
assert.strictEqual(
  computeGaugeInvariantABMetrics(nonFiniteField, nonFiniteField),
  null,
  'all non-finite cells should return invalid gauge metrics',
);

const partiallyNonFiniteA = {
  phiRe: Float64Array.from([1, 2]),
  phiIm: Float64Array.from([0, 0]),
};
const partiallyNonFiniteB = {
  phiRe: Float64Array.from([2, Number.NaN]),
  phiIm: Float64Array.from([0, 0]),
};
const partiallyNonFiniteMetrics = computeGaugeInvariantABMetrics(partiallyNonFiniteA, partiallyNonFiniteB);
nearlyEqual(
  partiallyNonFiniteMetrics.rawFieldABDistance,
  1,
  1e-12,
  'partial non-finite cells should use finite-count denominator',
);

const unknownRegime = classifyPhaseStructureRegime({
  alignedFieldABDistanceSeries: [null, undefined, Number.NaN],
  unwrappedThetaStarSeries: [0, Number.NaN, Number.NaN],
});
assert.strictEqual(
  unknownRegime,
  'indeterminate',
  'non-finite structural/theta series should not be misclassified as collapse, near-identical, or phase-locking',
);

const missingRawOnset = findRawDistanceCollapseOnsetStep([
  { step: 0, rawFieldABDistance: null, fieldABDistance: undefined },
  { step: 10, rawFieldABDistance: Number.NaN, fieldABDistance: 0.02 },
]);
assert.strictEqual(
  missingRawOnset,
  null,
  'null/undefined/non-finite raw distances should not trigger raw-distance collapse onset',
);

const missingStructuralOnset = findStructuralCollapseOnsetStep([
  { step: 0, alignedFieldABDistance: 0.03 },
  { step: 10, alignedFieldABDistance: null },
  { step: 20, alignedFieldABDistance: Number.NaN },
]);
assert.strictEqual(
  missingStructuralOnset,
  null,
  'non-finite aligned distances should not trigger structural-collapse onset',
);

const insufficientThetaWindowSamples = [
  { step: 0, thetaStar: 0.001 },
  { step: 10, thetaStar: Number.NaN },
  { step: 20, thetaStar: 0.0015 },
  { step: 30, thetaStar: Number.NaN },
];
const insufficientThetaLockOnset = findPhaseLockOnsetStep(insufficientThetaWindowSamples, { windowSize: 4 });
assert.strictEqual(
  insufficientThetaLockOnset,
  null,
  'insufficient finite theta samples in the lock window should not trigger phase-locking onset',
);

console.log('Gauge-invariant metrics sanity checks passed.');
