// Client-side photo resizing. Phone cameras produce 3-5 MB, 4000px JPEGs; the
// app never needs more than ~1600px for identification (Pl@ntNet itself
// downsizes to 1280) and ~720px for cards. Resizing before upload makes
// uploads 5-10x faster and keeps the garden grid from decoding huge images.

async function loadBitmap(file) {
  // imageOrientation honours the EXIF rotation tag so portrait shots stay upright
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

function drawScaled(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

function canvasToFile(canvas, name, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('toBlob failed'));
      resolve(new File([blob], name, { type: 'image/jpeg' }));
    }, 'image/jpeg', quality);
  });
}

/**
 * Returns { main, thumb } Files. `main` is at most `mainSide` px on the long
 * side (default 1600), `thumb` at most `thumbSide` (default 720). Falls back to
 * the original file for `main` if anything goes wrong, so uploads never break.
 */
export async function prepareImageForUpload(file, { mainSide = 1600, thumbSide = 720 } = {}) {
  const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
  try {
    const bitmap = await loadBitmap(file);
    const main = await canvasToFile(drawScaled(bitmap, mainSide), `${base}.jpg`, 0.86);
    const thumb = await canvasToFile(drawScaled(bitmap, thumbSide), `${base}_thumb.jpg`, 0.8);
    bitmap.close?.();
    return { main, thumb };
  } catch (e) {
    console.warn('[imageResize] fell back to original file:', e?.message || e);
    return { main: file, thumb: null };
  }
}
