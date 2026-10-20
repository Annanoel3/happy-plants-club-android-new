import React, { useEffect, useState } from 'react';

// Shows the small copy right away (usually already cached from the garden cards),
// then fades the full photo in over it once it has finished loading.
export default function ProgressiveImage({ src, thumb, alt, className = '' }) {
  const [fullReady, setFullReady] = useState(false);
  useEffect(() => { setFullReady(false); }, [src]);
  const hasThumb = !!thumb && thumb !== src;

  if (!hasThumb) return <img src={src} alt={alt} className={className} decoding="async" />;
  return (
    <span className="relative block w-full h-full">
      <img src={thumb} alt="" aria-hidden className={`absolute inset-0 ${className}`} />
      <img
        src={src}
        alt={alt}
        decoding="async"
        onLoad={() => setFullReady(true)}
        className={`absolute inset-0 transition-opacity duration-300 ${fullReady ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    </span>
  );
}
