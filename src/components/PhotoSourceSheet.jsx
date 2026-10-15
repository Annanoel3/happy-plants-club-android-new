import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { pickPhotos } from '@/lib/photoPicker';

// Bottom sheet: "Take photo" or "Choose from gallery".
// Solid, high-contrast colors on purpose so it reads on every theme
// (the old camera buttons blended into dark/seasonal backgrounds).
export function PhotoSourceSheet({ open, onClose, onChoose, title = 'Add a photo' }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-md bg-white text-gray-900 rounded-t-3xl p-5 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-lg font-bold">{title}</p>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-gray-100 text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onChoose('camera')}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-green-600 active:bg-green-700 text-white py-6 font-bold"
          >
            <Camera className="w-8 h-8" strokeWidth={2.25} />
            Take photo
          </button>
          <button
            onClick={() => onChoose('gallery')}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-gray-900 active:bg-black text-white py-6 font-bold"
          >
            <ImageIcon className="w-8 h-8" strokeWidth={2.25} />
            From gallery
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * const { openPicker, sheet } = usePhotoSource(files => ..., { multiple, title });
 * Render {sheet} anywhere in the component and call openPicker() from the button.
 */
export function usePhotoSource(onFiles, { multiple = false, title } = {}) {
  const [open, setOpen] = useState(false);
  const choose = useCallback(async (source) => {
    setOpen(false);
    try {
      const files = await pickPhotos(source, { multiple });
      if (files.length) onFiles(files);
    } catch (e) {
      toast.error(e?.message || 'Could not open the camera');
    }
  }, [onFiles, multiple]);
  const sheet = <PhotoSourceSheet open={open} onClose={() => setOpen(false)} onChoose={choose} title={title} />;
  return { openPicker: () => setOpen(true), sheet };
}
