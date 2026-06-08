#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const README_PATH = path.join(ROOT_DIR, 'README.md');

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readReadme() {
  if (!fs.existsSync(README_PATH)) {
    return 'Aeterna-loop-trinity';
  }

  return fs.readFileSync(README_PATH, 'utf8');
}

function buildHtml(markdown) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Aeterna-loop-trinity';

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #07111f;
      color: #e6f4ff;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at top left, #104b5f 0, transparent 36rem), #07111f;
    }

    main {
      box-sizing: border-box;
      margin: 0 auto;
      max-width: 72rem;
      padding: 4rem 1.5rem;
    }

    h1 {
      margin: 0 0 1rem;
      font-size: clamp(2.5rem, 8vw, 5rem);
      line-height: 1;
    }

    p {
      color: #b9d6e8;
      font-size: 1.1rem;
      line-height: 1.8;
    }

    pre {
      overflow: auto;
      margin-top: 2rem;
      padding: 1.5rem;
      border: 1px solid rgba(185, 214, 232, 0.2);
      border-radius: 1rem;
      background: rgba(3, 10, 20, 0.72);
      color: #d4ecff;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>A static Cloudflare deploy artifact generated from this repository's README.</p>
    <pre>${escapeHtml(markdown)}</pre>
  </main>
</body>
</html>
`;
}

function build() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const markdown = readReadme();
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildHtml(markdown));

  console.log('Built dist/index.html');
}

build();
