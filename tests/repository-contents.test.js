'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('repository manifest lists existing distributable files and excludes local investigation dependencies', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'repository-contents.json'), 'utf8'));
  assert.equal(manifest.product, 'Sno-P');
  for (const files of Object.values(manifest.trackedDeliverables)) {
    for (const file of files) {
      assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
      assert.ok(!file.startsWith('.local-analysis/'));
    }
  }
  const ignored = execFileSync('git', ['check-ignore', '.local-analysis/probe'], {cwd: root, encoding: 'utf8'});
  assert.match(ignored, /\.local-analysis\/probe/);
  assert.equal(manifest.localOnly.availableAfterFreshClone, false);
  assert.equal(manifest.implementationStatus.manufacturerRecordsImported, 0);
  assert.equal(manifest.implementationStatus.enterpriseBackend, 'proposed architecture only');
});

test('blueprint distinguishes clean-room target from earlier investigation and provides six sections', () => {
  const text = fs.readFileSync(path.join(root, 'sno-p-architecture.txt'), 'utf8');
  const headings = [...text.matchAll(/^([1-6])\. .+$/gm)];
  assert.equal(headings.length, 6);
  assert.match(text, /cannot\n  be retroactively certified/);
  assert.match(text, /\| route \| core components \| local lifecycle \| global\/server lifecycle \|/);
  assert.match(text, /network\n  edge latency and numerical simulation duration must be benchmarked separately/);
});
