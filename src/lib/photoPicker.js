import { Capacitor } from '@capacitor/core';

// One place for "get me a photo" so every camera button in the app behaves the same.
//
// Camera: in the Android app this opens the real camera through the Camera plugin.
// A plain <input capture> only opened the gallery inside the app's WebView, which is
// why there was no way to take a picture.
// Gallery: uses the system photo picker through a normal file input. No storage
// permission is needed for either path, which is what Google Play now requires
// ("use the system picker" instead of READ_MEDIA_IMAGES).

function isNative() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

async function base64ToFile(b64, format = 'jpeg') {
  const mime = `image/${format === 'jpg' ? 'jpeg' : format}`;
  const res = await fetch(`data:${mime};base64,${b64}`);
  const blob = await res.blob();
  return new File([blob], `photo_${Date.now()}.${format === 'jpeg' ? 'jpg' : format}`, { type: mime });
}

function pickWithInput({ capture = false, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    if (multiple) input.multiple = true;
    input.style.display = 'none';
    let settled = false;
    const done = (files) => { if (settled) return; settled = true; input.remove(); resolve(files); };
    input.addEventListener('change', () => done(Array.from(input.files || [])));
    // Chrome/WebView fire 'cancel' when the picker is dismissed without a choice.
    input.addEventListener('cancel', () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * @param {'camera'|'gallery'} source
 * @param {{multiple?: boolean}} opts
 * @returns {Promise<File[]>} empty array if the person cancelled
 */
export async function pickPhotos(source, { multiple = false } = {}) {
  if (source === 'camera' && isNative()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Base64,
        quality: 85,
        width: 2000,
        correctOrientation: true,
        saveToGallery: false,
      });
      if (!photo?.base64String) return [];
      return [await base64ToFile(photo.base64String, photo.format || 'jpeg')];
    } catch (e) {
      const msg = String(e?.message || e || '').toLowerCase();
      if (msg.includes('cancel')) return [];
      if (msg.includes('denied') || msg.includes('permission')) {
        throw new Error('Camera permission is off. Turn it on in your phone\'s Settings → Apps → Happy Plants → Permissions.');
      }
      console.warn('[photoPicker] native camera failed, falling back to file input:', e);
      return pickWithInput({ capture: true });
    }
  }
  return pickWithInput({ capture: source === 'camera', multiple });
}

/** Wrap File[] so existing onChange-style handlers (e.target.files) keep working. */
export function asChangeEvent(files) {
  return { target: { files, value: '' }, currentTarget: { files, value: '' } };
}
