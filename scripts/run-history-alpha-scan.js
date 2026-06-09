#!/usr/bin/env node
'use strict';

const { writeScanManifest } = require('./v2.1.2-scan-definitions');

const outputPath = writeScanManifest('history-alpha-scan');
console.log(`Wrote v2.1.2 HISTORY_ALPHA scan manifest: ${outputPath}`);
