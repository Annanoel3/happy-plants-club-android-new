import React, { useState, useEffect } from 'react';
import KawaiiMode from './themes/KawaiiMode';
import HalloweenMode from './themes/HalloweenMode';
import ChristmasMode from './themes/ChristmasMode';
import ValentinesMode from './themes/ValentinesMode';
import BotanicalMode from './themes/BotanicalMode';
import SummerMode from './themes/SummerMode';
import SpringMode from './themes/SpringMode';
import FallMode from './themes/FallMode';
import WinterMode from './themes/WinterMode';
import FourthJulyMode from './themes/FourthJulyMode';
import StPatricksMode from './themes/StPatricksMode';

export default function ThemeMode() {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored;
    // Auto-detect system dark mode if no user preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = localStorage.getItem('theme') || 'light';
      setTheme(currentTheme);
    };
    
    handleThemeChange();
    window.addEventListener('storage', handleThemeChange);
    const interval = setInterval(handleThemeChange, 100);
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      clearInterval(interval);
    };
  }, []);

  if (theme === 'kawaii') return <KawaiiMode />;
  if (theme === 'halloween') return <HalloweenMode />;
  if (theme === 'christmas') return <ChristmasMode />;
  if (theme === 'valentines') return <ValentinesMode />;
  if (theme === 'botanical') return <BotanicalMode />;
  if (theme === 'summer') return <SummerMode />;
  if (theme === 'spring') return <SpringMode />;
  if (theme === 'fall') return <FallMode />;
  if (theme === 'winter') return <WinterMode />;
  if (theme === 'fourthofjuly') return <FourthJulyMode />;
  if (theme === 'stpatricks') return <StPatricksMode />;
  
  return null;
}