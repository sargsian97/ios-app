import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validBarcode, decodeLuminance, toLuminance, barcodeVariants } from '../web/src/services/barcode.js';

/* Рисуем EAN-13 в массив яркости: 1 модуль = m пикселей */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = L.map((p) => p.split('').map((b) => (b === '0' ? '1' : '0')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function ean13Bits(code) {
  const d = code.split('').map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + '101';
}
function image(code, { m = 3, quiet = 12, h = 60, noise = 0 } = {}) {
  const bits = '0'.repeat(quiet) + ean13Bits(code) + '0'.repeat(quiet);
  const w = bits.length * m;
  const lum = new Uint8ClampedArray(w * h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = bits[Math.floor(x / m)] === '1' ? 20 : 235;
    lum[y * w + x] = Math.max(0, Math.min(255, v + (rnd() - 0.5) * noise));
  }
  return { lum, w, h };
}

test('контрольная цифра', () => {
  assert.ok(validBarcode('4607001771562'));
  assert.ok(validBarcode('012345678905'), 'UPC-A');
  assert.ok(validBarcode('96385074'), 'EAN-8');
  assert.ok(!validBarcode('4607001771563'));
  assert.ok(!validBarcode('12345'));
  assert.ok(!validBarcode('abc'));
});

test('распознаёт EAN-13, в том числе с шумом', async () => {
  for (const code of ['4607001771562', '5901234123457', '0012345678905']) {
    const { lum, w, h } = image(code, { noise: 60 });
    const got = await decodeLuminance(lum, w, h);
    assert.ok(barcodeVariants(got).includes(code), got + ' ~ ' + code);
  }
});

test('пустое изображение — null', async () => {
  const w = 300, h = 50;
  assert.equal(await decodeLuminance(new Uint8ClampedArray(w * h).fill(200), w, h), null);
});

test('яркость из RGBA', () => {
  assert.deepEqual([...toLuminance(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1)], [255, 0]);
});

test('варианты кода UPC-A / EAN-13', () => {
  assert.deepEqual(barcodeVariants('012345678905'), ['012345678905', '0012345678905']);
  assert.deepEqual(barcodeVariants('0012345678905'), ['0012345678905', '012345678905']);
  assert.deepEqual(barcodeVariants('4607 0017 71562'), ['4607001771562']);
  assert.deepEqual(barcodeVariants(''), []);
});
