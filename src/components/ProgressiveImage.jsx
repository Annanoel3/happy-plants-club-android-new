import React, { useCallback, useState } from 'react';

// Shows the small copy right away (usually already cached from the garden cards),
// then fades the full photo in over it once it has finished loading.
export default function ProgressiveImage({ src, thumb, alt, className = '' }) {
  // Which full photo has finished loading (so a new photo starts hidden again)
  const [readySrc, setReadySrc] = useState(null);
  const fullReady = readySrc === src;
  // A photo that's already cached can finish before React hears its load event
  const fullRef = useCallback((el) => {
    if (el && el.complete && el.naturalWidth > 0) setReadySrc(src);
  }, [src]);
  const hasThumb = !!thumb && thumb !== src;

  if (!hasThumb) return <img src={src} alt={alt} className={className} decoding="async" />;
  return (
    <span className="relative block w-full h-full">
      <img src={thumb} alt="" aria-hidden className={`absolute inset-0 ${className}`} />
      <img
        ref={fullRef}
        src={src}
        alt={alt}
        decoding="async"
        onLoad={() => setReadySrc(src)}
        className={`absolute inset-0 transition-opacity duration-300 ${fullReady ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    </span>
  );
}
