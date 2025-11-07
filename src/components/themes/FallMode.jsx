import React from 'react';

export default function FallMode() {
  return (
    <>
      <style>{`
        .fall-card,
        .theme-card {
          background: rgba(40, 30, 20, 0.85) !important;
          border: 2px solid #D2691E !important;
          box-shadow: 0 4px 20px rgba(210, 105, 30, 0.3) !important;
        }
        
        .fall-card *,
        .theme-text {
          color: #ffffff !important;
        }
        
        .theme-text-secondary {
          color: #f0f0f0 !important;
        }
        
        .fall-card h1,
        .fall-card h2,
        .fall-card h3,
        .fall-card h4,
        h1, h2, h3, h4 {
          color: #ffcc99 !important;
        }
      `}</style>
    </>
  );
}