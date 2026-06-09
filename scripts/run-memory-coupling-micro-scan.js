#!/usr/bin/env node
'use strict';

const { writeScanManifest } = require('./v2.1.2-scan-definitions');

const outputPath = writeScanManifest('memory-coupling-micro-scan');
console.log(`Wrote v2.1.2 Memory Coupling micro-scan manifest: ${outputPath}`);
