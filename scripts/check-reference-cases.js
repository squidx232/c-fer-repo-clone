'use strict';
/* Compare user-authorized reference outputs against the web engine.
 * Expected values must come from an independently captured reference run.
 * This tool does not execute the vendor engine or certify whole-app parity.
 */
const fs = require('node:fs');
const path = require('node:path');
const E = require('../js/engine.js');
const C = require('../js/catalog.js');

function readNumericPath(object, key) {
  if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(key)) throw new Error('Invalid result path');
  let result = object;
  for (const part of key.split('.')) {
    if (!result || !Object.prototype.hasOwnProperty.call(result, part)) throw new Error(`Unknown result path: ${key}`);
    result = result[part];
  }
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error(`Nonfinite numeric output: ${key}`);
  return result;
}

function evaluate(reference) {
  if (!reference || reference.source !== 'captured-reference' || typeof reference.id !== 'string' || !reference.id.trim()) {
    throw new Error('Reference requires id and source="captured-reference"');
  }
  if (!reference.provenance || !reference.provenance.applicationVersion || !reference.provenance.captureDescription) {
    throw new Error('Reference requires applicationVersion and captureDescription provenance');
  }
  if (!reference.project || !Array.isArray(reference.expectations) || !reference.expectations.length) {
    throw new Error('Reference requires a complete SI project and nonempty expectations');
  }
  const result = E.analyze(reference.project);
  if (!result.ok) throw new Error(`Invalid case inputs: ${result.errors.join('; ')}`);
  const checks = reference.expectations.map(check => {
    if (typeof check.expected !== 'number' || !Number.isFinite(check.expected)) throw new Error('Expected value must be finite');
    const absolute = check.absoluteTolerance === undefined ? 0 : check.absoluteTolerance;
    const relative = check.relativeTolerance === undefined ? 0 : check.relativeTolerance;
    for (const value of [absolute, relative]) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Tolerances must be finite and nonnegative');
    }
    const actual = readNumericPath(result, check.path);
    const tolerance = Math.max(absolute, Math.abs(check.expected) * relative);
    const difference = Math.abs(actual - check.expected);
    return {path: check.path, expected: check.expected, actual, difference, tolerance, passed: difference <= tolerance};
  });
  return {id: reference.id, provenance: reference.provenance, passed: checks.every(c => c.passed), checks,
    designErrors: result.errors, designWarnings: result.warnings};
}

function main(args) {
  if (args[0] === '--template') {
    const sample = {id: 'replace-with-reference-case-id', source: 'captured-reference',
      provenance: {applicationVersion: 'replace-with-reference-version', captureDescription: 'describe authorized input/output capture'},
      project: C.defaultProject(), expectations: [{path: 'surface.torque', expected: null, absoluteTolerance: 1, relativeTolerance: 0.03}]};
    console.log(JSON.stringify(sample, null, 2));
    return;
  }
  if (!args.length) throw new Error('Provide reference JSON files, or --template. No reference evidence is bundled.');
  const results = args.map(file => evaluate(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))));
  console.log(JSON.stringify({scope: 'only the supplied reference cases and outputs; not full-system certification', results}, null, 2));
  if (results.some(r => !r.passed)) process.exitCode = 1;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {evaluate, readNumericPath};
