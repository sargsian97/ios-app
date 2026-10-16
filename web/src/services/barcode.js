/* Штрихкоды товаров (EAN-13, EAN-8, UPC-A, UPC-E): проверка и распознавание кадра камеры или фото.
   Распознавание — zxing (Apache 2.0), только читатель EAN/UPC (vendor/zxing-upcean-*.mjs). */

let zx = null;
async function lib() {
  if (!zx) zx = await import('../../vendor/zxing-upcean-0.23.0.mjs');
  return zx;
}

/* Контрольная цифра EAN/UPC */
export function validBarcode(code) {
  const c = String(code || '');
  if (!/^\d+$/.test(c) || ![8, 12, 13].includes(c.length)) return false;
  const digits = c.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

/* Один и тот же товар может быть записан как UPC-A (12 цифр) или EAN-13 с ведущим нулём */
export function barcodeVariants(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (!c) return [];
  if (c.length === 12) return [c, '0' + c];
  if (c.length === 13 && c[0] === '0') return [c, c.slice(1)];
  return [c];
}

/* Яркость из RGBA (ImageData.data) */
export function toLuminance(rgba, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return out;
}

/* Распознать код на изображении яркости; null — не найден */
export async function decodeLuminance(lum, w, h, { tryHarder = true } = {}) {
  const { MultiFormatUPCEANReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource, DecodeHintType } = await lib();
  const hints = new Map();
  if (tryHarder) hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatUPCEANReader(hints);
  const bmp = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, w, h)));
  /* читаем несколько строк по высоте: код может быть не по центру */
  const rows = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const r of rows) {
    try {
      const y = Math.floor(h * r);
      const row = bmp.getBlackRow(y, null);
      const res = reader.decodeRow(y, row, hints);
      const text = res && res.getText();
      if (text && validBarcode(text)) return text;
    } catch (e) { /* в этой строке кода нет */ }
  }
  return null;
}

export async function decodeImageData(img) {
  return decodeLuminance(toLuminance(img.data, img.width, img.height), img.width, img.height);
}

/* Фото с кодом (файл из галереи или камеры) */
export async function decodeFile(file, { maxSide = 1600 } = {}) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  let code = await decodeImageData(ctx.getImageData(0, 0, w, h));
  if (!code) {
    /* повернуть на 90° — код мог быть снят вертикально */
    cv.width = h; cv.height = w;
    ctx.save(); ctx.translate(h, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(bmp, 0, 0, w, h); ctx.restore();
    code = await decodeImageData(ctx.getImageData(0, 0, h, w));
  }
  return code;
}
