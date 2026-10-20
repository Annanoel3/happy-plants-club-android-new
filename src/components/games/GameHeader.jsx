import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle } from 'lucide-react';

// Top of every Garden Games screen: back to the games list, title, how-to, optional right side (timer)
export default function GameHeader({ title, emoji, subtitle, ui, onHelp, right }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => navigate('/Games')} className={`flex items-center gap-1.5 py-2 -ml-1 text-sm font-semibold ${ui.text}`}>
          <ArrowLeft className="w-5 h-5" /> Games
        </button>
        {onHelp && (
          <button onClick={onHelp} className={`flex items-center gap-1 text-sm font-semibold ${ui.text}`}>
            <HelpCircle className="w-4 h-4" /> How to play
          </button>
        )}
      </div>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className={`text-3xl font-bold ${ui.text}`}>{emoji} {title}</h1>
          {subtitle && <p className={`text-sm ${ui.sub}`}>{subtitle}</p>}
        </div>
        {right}
      </div>
    </>
  );
}
