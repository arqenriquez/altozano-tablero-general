const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SEVERITY_THRESHOLDS,
  baselineDeviationDays,
  baselineSeverityClass,
  baselineSeverityLabel
} = require('../js/baseline.js');

const d = (s) => new Date(s + 'T00:00:00');

test('umbrales esperados', () => {
  assert.equal(SEVERITY_THRESHOLDS.leve, 7);
  assert.equal(SEVERITY_THRESHOLDS.moderado, 14);
});

test('deviationDays redondea diferencia en días', () => {
  assert.equal(baselineDeviationDays(d('2026-07-15'), d('2026-07-08')), 7);
  assert.equal(baselineDeviationDays(d('2026-07-08'), d('2026-07-08')), 0);
  assert.equal(baselineDeviationDays(d('2026-07-05'), d('2026-07-08')), -3);
});

test('deviationDays null si falta una fecha', () => {
  assert.equal(baselineDeviationDays(null, d('2026-07-08')), null);
  assert.equal(baselineDeviationDays(d('2026-07-08'), null), null);
});

test('severityClass por umbrales', () => {
  assert.equal(baselineSeverityClass(-3), 'sev-ontime');
  assert.equal(baselineSeverityClass(0), 'sev-ontime');
  assert.equal(baselineSeverityClass(1), 'sev-leve');
  assert.equal(baselineSeverityClass(7), 'sev-leve');
  assert.equal(baselineSeverityClass(8), 'sev-moderado');
  assert.equal(baselineSeverityClass(14), 'sev-moderado');
  assert.equal(baselineSeverityClass(15), 'sev-grave');
  assert.equal(baselineSeverityClass(null), null);
});

test('severityLabel por umbrales', () => {
  assert.equal(baselineSeverityLabel(-3), 'adelantada');
  assert.equal(baselineSeverityLabel(0), 'en tiempo');
  assert.equal(baselineSeverityLabel(5), 'atraso leve');
  assert.equal(baselineSeverityLabel(10), 'atraso moderado');
  assert.equal(baselineSeverityLabel(40), 'atraso grave');
  assert.equal(baselineSeverityLabel(null), '');
});
