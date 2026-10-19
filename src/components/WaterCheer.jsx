import React, { useEffect, useMemo } from 'react';

// A little character pops up from the bottom after the first plant in a watering round,
// stays ~2 seconds, then drops back down. Original art (inline SVG): no files to load, no licensing.
// It never blocks taps (pointer-events: none), so people can keep checking plants.

const O = '#4a3728'; // outline
const LEAF = '#8fd17a';
const STEM = '#5aa84b';
const WATER = '#7cc8f0';
const POT = '#ee9a7e';
const RIM = '#e07a5f';
const CAN = '#ffd166';
const BLUSH = '#f7a1a1';

const drop = (x, y, s = 1) =>
  `M${x} ${y - 8 * s} C${x + 6 * s} ${y - 1 * s} ${x + 6 * s} ${y + 5 * s} ${x} ${y + 5 * s} C${x - 6 * s} ${y + 5 * s} ${x - 6 * s} ${y - 1 * s} ${x} ${y - 8 * s} Z`;
const sparkle = (x, y, r = 9) =>
  `M${x} ${y - r} Q${x + r / 6} ${y - r / 6} ${x + r} ${y} Q${x + r / 6} ${y + r / 6} ${x} ${y + r} Q${x - r / 6} ${y + r / 6} ${x - r} ${y} Q${x - r / 6} ${y - r / 6} ${x} ${y - r} Z`;
const heart = (x, y) => `M${x} ${y + 6} C${x - 9} ${y - 1} ${x - 6} ${y - 9} ${x} ${y - 4} C${x + 6} ${y - 9} ${x + 9} ${y - 1} ${x} ${y + 6} Z`;

// Stem with an outline: thick dark line under a thinner green one
function Stem({ d }) {
  return (
    <>
      <path d={d} fill="none" stroke={O} strokeWidth="9" strokeLinecap="round" />
      <path d={d} fill="none" stroke={STEM} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function Face({ lx, rx, y, happy = false, open = false }) {
  const cx = (lx + rx) / 2;
  return (
    <g>
      {happy ? (
        <>
          <path d={`M${lx - 6} ${y + 2} Q${lx} ${y - 5} ${lx + 6} ${y + 2}`} fill="none" stroke={O} strokeWidth="3.5" strokeLinecap="round" />
          <path d={`M${rx - 6} ${y + 2} Q${rx} ${y - 5} ${rx + 6} ${y + 2}`} fill="none" stroke={O} strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={lx} cy={y} r="3.8" fill={O} />
          <circle cx={rx} cy={y} r="3.8" fill={O} />
          <circle cx={lx + 1.2} cy={y - 1.3} r="1.1" fill="#fff" />
          <circle cx={rx + 1.2} cy={y - 1.3} r="1.1" fill="#fff" />
        </>
      )}
      {open ? (
        <path d={`M${cx - 8} ${y + 9} Q${cx} ${y + 19} ${cx + 8} ${y + 9} Z`} fill="#c9504a" stroke={O} strokeWidth="3" strokeLinejoin="round" />
      ) : (
        <path d={`M${cx - 6} ${y + 8} Q${cx} ${y + 14} ${cx + 6} ${y + 8}`} fill="none" stroke={O} strokeWidth="3" strokeLinecap="round" />
      )}
      <ellipse cx={lx - 8} cy={y + 9} rx="5.5" ry="3.2" fill={BLUSH} opacity="0.85" />
      <ellipse cx={rx + 8} cy={y + 9} rx="5.5" ry="3.2" fill={BLUSH} opacity="0.85" />
    </g>
  );
}

// 1) A watering can buddy pours on a sprout
function CanScene() {
  return (
    <svg viewBox="0 0 240 200" className="hpwc-svg">
      <g fill={WATER} stroke={O} strokeWidth="2.5">
        <path className="hpwc-drop" style={{ '--dx': '14px', '--dy': '34px', animationDelay: '0s' }} d={drop(160, 104)} />
        <path className="hpwc-drop" style={{ '--dx': '18px', '--dy': '36px', animationDelay: '.3s' }} d={drop(165, 101)} />
        <path className="hpwc-drop" style={{ '--dx': '10px', '--dy': '32px', animationDelay: '.6s' }} d={drop(155, 108)} />
      </g>
      <g className="hpwc-wiggle">
        <Stem d="M192 150 L192 116" />
        <path d="M192 124 C180 106 162 110 165 121 C168 131 184 131 192 124 Z" fill={LEAF} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M192 117 C202 98 221 101 219 112 C217 122 202 124 192 117 Z" fill={LEAF} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
      </g>
      <path d="M166 160 H218 L210 194 H174 Z" fill={POT} stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <rect x="160" y="146" width="64" height="15" rx="5" fill={RIM} stroke={O} strokeWidth="4" />
      <g className="hpwc-tilt">
        <g transform="rotate(18 80 92)">
          <path d="M52 72 C52 38 108 38 108 72" fill="none" stroke={O} strokeWidth="13" strokeLinecap="round" />
          <path d="M52 72 C52 38 108 38 108 72" fill="none" stroke={CAN} strokeWidth="6" strokeLinecap="round" />
          <path d="M110 98 L150 70 L157 79 L114 112 Z" fill={CAN} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
          <ellipse cx="155" cy="73" rx="7" ry="12" transform="rotate(-35 155 73)" fill={CAN} stroke={O} strokeWidth="3.5" />
          <rect x="42" y="66" width="74" height="60" rx="17" fill={CAN} stroke={O} strokeWidth="4" />
          <Face lx={68} rx={92} y={92} />
        </g>
      </g>
    </svg>
  );
}

// 2) A rain cloud buddy waters a pot, and a flower opens
function CloudScene() {
  const parts = (
    <>
      <circle cx="88" cy="62" r="24" />
      <circle cx="119" cy="46" r="32" />
      <circle cx="151" cy="59" r="26" />
      <rect x="64" y="56" width="112" height="30" rx="15" />
    </>
  );
  return (
    <svg viewBox="0 0 240 200" className="hpwc-svg">
      <g fill={WATER} stroke={O} strokeWidth="2.5">
        <path className="hpwc-drop" style={{ '--dy': '34px', animationDelay: '0s' }} d={drop(92, 98)} />
        <path className="hpwc-drop" style={{ '--dy': '30px', animationDelay: '.45s' }} d={drop(110, 96)} />
        <path className="hpwc-drop" style={{ '--dy': '34px', animationDelay: '.2s' }} d={drop(130, 98)} />
        <path className="hpwc-drop" style={{ '--dy': '32px', animationDelay: '.65s' }} d={drop(148, 96)} />
      </g>
      <g className="hpwc-bob">
        <g fill={O} stroke={O} strokeWidth="8" strokeLinejoin="round">{parts}</g>
        <g fill="#f8fbff">{parts}</g>
        <Face lx={107} rx={133} y={64} />
      </g>
      <g className="hpwc-wiggle">
        <Stem d="M120 152 L120 112" />
        <path d="M120 140 C110 127 97 131 99 139 C101 148 114 148 120 140 Z" fill={LEAF} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M120 133 C130 120 143 124 141 132 C139 141 126 141 120 133 Z" fill={LEAF} stroke={O} strokeWidth="3.5" strokeLinejoin="round" />
        <g className="hpwc-bloom">
          <g fill="#ff9fb2" stroke={O} strokeWidth="3">
            <circle cx="120" cy="101" r="7" />
            <circle cx="128.5" cy="107.2" r="7" />
            <circle cx="125.3" cy="117.2" r="7" />
            <circle cx="114.7" cy="117.2" r="7" />
            <circle cx="111.5" cy="107.2" r="7" />
          </g>
          <circle cx="120" cy="110" r="5.5" fill={CAN} stroke={O} strokeWidth="3" />
        </g>
      </g>
      <path d="M96 163 H144 L137 196 H103 Z" fill={POT} stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <rect x="90" y="150" width="60" height="14" rx="5" fill={RIM} stroke={O} strokeWidth="4" />
    </svg>
  );
}

// 3) A happy pot catches a big drop, squishes, and sparkles
function PotScene() {
  const leaf = (sx, sy, cx, cy, r, delay) => (
    <g className="hpwc-sway" style={{ animationDelay: delay }}>
      <Stem d={`M120 114 Q${(120 + sx) / 2} ${sy + 20} ${sx} ${sy}`} />
      <circle cx={cx} cy={cy} r={r} fill={LEAF} stroke={O} strokeWidth="3.5" />
      <circle cx={cx} cy={cy + 2} r="2.2" fill={STEM} />
    </g>
  );
  return (
    <svg viewBox="0 0 240 200" className="hpwc-svg">
      <g fill="#ffd166" stroke={O} strokeWidth="2">
        <path className="hpwc-spark" style={{ animationDelay: '1.05s' }} d={sparkle(48, 96)} />
        <path className="hpwc-spark" style={{ animationDelay: '1.2s' }} d={sparkle(194, 88, 10)} />
        <path className="hpwc-spark" style={{ animationDelay: '1.35s' }} d={sparkle(58, 152, 7)} />
        <path className="hpwc-spark" style={{ animationDelay: '1.15s' }} d={sparkle(186, 150, 7)} />
      </g>
      <g fill="#ff8fa3" stroke={O} strokeWidth="2">
        <path className="hpwc-spark" style={{ animationDelay: '1.25s' }} d={heart(204, 120)} />
        <path className="hpwc-spark" style={{ animationDelay: '1.4s' }} d={heart(36, 126)} />
      </g>
      <g className="hpwc-squish">
        {leaf(92, 76, 88, 68, 15, '0s')}
        {leaf(150, 72, 154, 64, 15, '.25s')}
        {leaf(120, 62, 120, 46, 17, '.5s')}
        <path d="M78 126 H162 L151 194 H89 Z" fill={POT} stroke={O} strokeWidth="4" strokeLinejoin="round" />
        <rect x="70" y="108" width="100" height="19" rx="7" fill={RIM} stroke={O} strokeWidth="4" />
        <Face lx={107} rx={133} y={150} happy open />
      </g>
      <path className="hpwc-bigdrop" d={drop(120, 98, 1.7)} fill={WATER} stroke={O} strokeWidth="3" />
    </svg>
  );
}

const SCENES = [CanScene, CloudScene, PotScene];

function pickScene() {
  let last = -1;
  try { last = Number(localStorage.getItem('hp_cheer_last') ?? -1); } catch { /* storage off */ }
  let i = Math.floor(Math.random() * SCENES.length);
  if (i === last) i = (i + 1) % SCENES.length;
  try { localStorage.setItem('hp_cheer_last', String(i)); } catch { /* storage off */ }
  return i;
}

const CSS = `
.hpwc-wrap{position:fixed;left:50%;bottom:0;z-index:320;width:210px;margin-left:-105px;pointer-events:none;
  padding-bottom:env(safe-area-inset-bottom,0px);animation:hpwc-pop 3.1s both;will-change:transform}
.hpwc-svg{display:block;width:100%;height:auto;overflow:visible;filter:drop-shadow(0 6px 10px rgba(0,0,0,.18))}
.hpwc-svg *{transform-box:fill-box}
@keyframes hpwc-pop{
  0%{transform:translateY(110%);animation-timing-function:cubic-bezier(.34,1.5,.64,1)}
  16%{transform:translateY(0);animation-timing-function:linear}
  84%{transform:translateY(0);animation-timing-function:cubic-bezier(.5,0,.75,0)}
  100%{transform:translateY(115%)}}
.hpwc-bob{animation:hpwc-bob 1.2s ease-in-out infinite;transform-origin:50% 50%}
@keyframes hpwc-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.hpwc-tilt{animation:hpwc-tilt 1.4s ease-in-out infinite;transform-origin:50% 50%}
@keyframes hpwc-tilt{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(5deg)}}
.hpwc-wiggle{animation:hpwc-wiggle 1s ease-in-out infinite;transform-origin:50% 100%}
.hpwc-sway{animation:hpwc-wiggle 1.6s ease-in-out infinite;transform-origin:50% 100%}
@keyframes hpwc-wiggle{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
.hpwc-drop{animation:hpwc-drop .9s ease-in infinite both}
@keyframes hpwc-drop{0%{transform:translate(0,0);opacity:0}15%{opacity:1}85%{opacity:1}
  100%{transform:translate(var(--dx,0px),var(--dy,40px));opacity:0}}
.hpwc-bloom{animation:hpwc-bloom .6s cubic-bezier(.34,1.6,.64,1) 1s both;transform-origin:50% 50%}
@keyframes hpwc-bloom{0%{transform:scale(.15)}100%{transform:scale(1)}}
.hpwc-bigdrop{animation:hpwc-bigdrop .55s cubic-bezier(.55,0,1,.45) .45s both;transform-origin:50% 100%}
@keyframes hpwc-bigdrop{0%{transform:translateY(-110px);opacity:1}90%{transform:translateY(0);opacity:1}
  100%{transform:translateY(4px) scale(1.4,.35);opacity:0}}
.hpwc-squish{animation:hpwc-squish .5s ease-out 1s both;transform-origin:50% 100%}
@keyframes hpwc-squish{0%{transform:scale(1,1)}30%{transform:scale(1.08,.9)}65%{transform:scale(.96,1.05)}100%{transform:scale(1,1)}}
.hpwc-spark{animation:hpwc-spark 1.1s ease-out infinite both;transform-origin:50% 50%}
@keyframes hpwc-spark{0%{transform:scale(0) rotate(0);opacity:0}35%{transform:scale(1.15) rotate(15deg);opacity:1}
  100%{transform:scale(.8) rotate(40deg) translateY(-4px);opacity:0}}
@media (prefers-reduced-motion: reduce){
  .hpwc-wrap{animation-name:hpwc-fade}
  .hpwc-wrap *{animation:none!important}
  @keyframes hpwc-fade{0%{opacity:0}10%{opacity:1}85%{opacity:1}100%{opacity:0}}}
`;

export default function WaterCheer({ onDone }) {
  const Scene = useMemo(() => SCENES[pickScene()], []);
  useEffect(() => {
    // Backup in case animationend never fires (tab hidden, motion turned off)
    const t = setTimeout(() => onDone?.(), 3600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="hpwc-wrap" aria-hidden="true"
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) onDone?.(); }}>
      <style>{CSS}</style>
      <Scene />
    </div>
  );
}
