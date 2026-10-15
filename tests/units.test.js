import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDisplay, fromDisplay, normalizeUnits, cmToFtIn, ftInToCm, formatClock, unitKey, DEFAULT_UNITS, IMPERIAL } from '../web/src/domain/units.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' ≈ ' + b);

test('units: по умолчанию метрические', () => {
  assert.deepEqual(normalizeUnits(null), DEFAULT_UNITS);
  assert.deepEqual(normalizeUnits({ weight: 'lb', energy: 'бред' }), { ...DEFAULT_UNITS, weight: 'lb' });
});

test('units: туда и обратно без потерь', () => {
  for (const kind of ['weight', 'length', 'energy', 'distance']) {
    const d = toDisplay(kind, 80, IMPERIAL.weight === 'lb' ? { ...IMPERIAL, energy: 'kj' } : IMPERIAL);
    close(fromDisplay(kind, d, { ...IMPERIAL, energy: 'kj' }), 80);
  }
  close(toDisplay('weight', 1, IMPERIAL), 2.20462262, 1e-6);
  close(toDisplay('energy', 100, { energy: 'kj' }), 418.4);
  assert.equal(toDisplay('weight', 80, DEFAULT_UNITS), 80);
});

test('units: пустые и неверные значения', () => {
  assert.equal(toDisplay('weight', null, IMPERIAL), null);
  assert.equal(toDisplay('weight', '', IMPERIAL), null);
  assert.equal(fromDisplay('weight', 'abc', IMPERIAL), null);
  close(fromDisplay('weight', '84,5', DEFAULT_UNITS), 84.5);
  assert.throws(() => toDisplay('time', 1, DEFAULT_UNITS));
});

test('units: футы и дюймы', () => {
  assert.deepEqual(cmToFtIn(180), { ft: 5, inch: 11 });
  close(ftInToCm(5, 11), 180.34);
  assert.equal(cmToFtIn(0), null);
  assert.equal(ftInToCm(0, 0), null);
});

test('units: часы 12/24', () => {
  assert.equal(formatClock(7, 5, '24h'), '07:05');
  assert.equal(formatClock(0, 0, '12h'), '12:00 AM');
  assert.equal(formatClock(13, 30, '12h'), '1:30 PM');
  assert.equal(unitKey('weight', IMPERIAL), 'unit.lb');
});
