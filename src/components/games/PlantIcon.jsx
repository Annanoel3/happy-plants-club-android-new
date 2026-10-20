import React from 'react';

// Original plant art used by the Garden Games. index 0-8, each its own plant and color.
export const PLANTS = [
  { kind: 'blossom', color: '#e11d48', name: 'red flower' },
  { kind: 'daisy', color: '#facc15', center: '#92400e', name: 'sunflower' },
  { kind: 'tulip', color: '#2563eb', name: 'blue tulip' },
  { kind: 'cactus', color: '#16a34a', name: 'cactus' },
  { kind: 'blossom', color: '#8b5cf6', name: 'purple flower' },
  { kind: 'tulip', color: '#f97316', name: 'orange tulip' },
  { kind: 'rosette', color: '#0d9488', name: 'succulent' },
  { kind: 'daisy', color: '#ffffff', center: '#facc15', name: 'daisy' },
  { kind: 'tulip', color: '#db2777', name: 'pink tulip' },
];

const O = '#4a3728';
function Stem() {
  return (
    <>
      <path d="M20 38 V21" stroke={O} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M20 38 V21" stroke="#5aa84b" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 32 C14 26 8 29 10 33 C12 37 18 35 20 32 Z" fill="#8fd17a" stroke={O} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20 29 C26 23 32 26 30 30 C28 34 22 32 20 29 Z" fill="#8fd17a" stroke={O} strokeWidth="1.6" strokeLinejoin="round" />
    </>
  );
}

export default function PlantIcon({ index = 0, className = 'w-[82%] h-[82%]' }) {
  const p = PLANTS[((index % PLANTS.length) + PLANTS.length) % PLANTS.length];
  let art;
  if (p.kind === 'blossom') {
    const pts = [[20, 7.6], [25.9, 11.9], [23.7, 18.9], [16.3, 18.9], [14.1, 11.9]];
    art = (<><Stem />{pts.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="5.2" fill={p.color} stroke={O} strokeWidth="1.5" />)}<circle cx="20" cy="14" r="3.4" fill="#fde047" stroke={O} strokeWidth="1.3" /></>);
  } else if (p.kind === 'tulip') {
    art = (<><Stem /><path d="M12.5 7.5 L16 11.5 L20 6.5 L24 11.5 L27.5 7.5 C28.5 16 26 21.5 20 21.5 C14 21.5 11.5 16 12.5 7.5 Z" fill={p.color} stroke={O} strokeWidth="1.6" strokeLinejoin="round" /></>);
  } else if (p.kind === 'daisy') {
    art = (<><Stem />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <ellipse key={a} cx="20" cy="7.6" rx="2.7" ry="5" transform={`rotate(${a} 20 14)`} fill={p.color} stroke={O} strokeWidth="1.2" />)}<circle cx="20" cy="14" r="4" fill={p.center} stroke={O} strokeWidth="1.3" /></>);
  } else if (p.kind === 'cactus') {
    art = (
      <>
        <path d="M15 27 H12 C10 27 9 26 9 24 V19 C9 17.3 11.8 17.3 11.8 19 V23.5 H15" fill={p.color} stroke={O} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M25 23 H28 V17 C28 15.3 30.8 15.3 30.8 17 V22 C30.8 24 29.8 25 28 25 H25" fill={p.color} stroke={O} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M15 37 V14 C15 8 25 8 25 14 V37 Z" fill={p.color} stroke={O} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M20 13 V35" stroke="#0f5132" strokeWidth="1" opacity="0.5" />
        <circle cx="20" cy="9.2" r="2.6" fill="#f9a8d4" stroke={O} strokeWidth="1.2" />
      </>
    );
  } else {
    const leaf = 'M20 23 C16.5 18 17.5 9 20 6 C22.5 9 23.5 18 20 23 Z';
    art = (
      <>
        {[0, 60, 120, 180, 240, 300].map((a) => <path key={a} d={leaf} transform={`rotate(${a} 20 23)`} fill={p.color} stroke={O} strokeWidth="1.3" strokeLinejoin="round" />)}
        {[30, 150, 270].map((a) => <path key={a} d={leaf} transform={`rotate(${a} 20 23) translate(20 23) scale(0.6) translate(-20 -23)`} fill="#5eead4" stroke={O} strokeWidth="1.6" strokeLinejoin="round" />)}
      </>
    );
  }
  return <svg viewBox="0 0 40 40" className={`${className} pointer-events-none`} aria-hidden>{art}</svg>;
}
