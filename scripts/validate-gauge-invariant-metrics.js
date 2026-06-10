#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { computeFieldDistance } = require('../src/metrics/aeterna-metrics');
const { computeGaugeInvariantABMetrics } = require('../src/metrics/gauge-invariant-metrics');

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

console.log('Gauge-invariant metrics sanity checks passed.');
