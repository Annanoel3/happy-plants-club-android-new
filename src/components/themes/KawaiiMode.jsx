import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function KawaiiMode() {
  const [stars, setStars] = useState([]);

  useEffect(() => {
    const handleClick = (e) => {
      // Only trigger on button clicks
      const target = e.target.closest('button');
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      // Create multiple stars
      const newStars = Array.from({ length: 5 }, (_, i) => ({
        id: Math.random(),
        x,
        y,
        angle: (i * 72) // Distribute stars in a circle
      }));

      setStars(prev => [...prev, ...newStars]);

      // Remove stars after animation
      setTimeout(() => {
        setStars(prev => prev.filter(star => !newStars.find(s => s.id === star.id)));
      }, 1000);
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <>
      <style>{`
        .theme-card,
        .kawaii-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #FF69B4 !important;
          box-shadow: 0 4px 20px rgba(255, 105, 180, 0.3) !important;
        }
        
        .theme-text,
        .kawaii-card * {
          color: #FF1493 !important;
        }
        
        .theme-text-secondary {
          color: #FF69B4 !important;
        }
        
        h1, h2, h3, h4 {
          color: #FF69B4 !important;
        }
      `}</style>

      <AnimatePresence>
        {stars.map(star => (
          <motion.div
            key={star.id}
            initial={{ 
              x: star.x, 
              y: star.y, 
              scale: 0, 
              opacity: 1,
              rotate: 0
            }}
            animate={{ 
              x: star.x + Math.cos(star.angle * Math.PI / 180) * 60,
              y: star.y + Math.sin(star.angle * Math.PI / 180) * 60,
              scale: [0, 1.5, 0],
              opacity: [1, 1, 0],
              rotate: 360
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              position: 'fixed',
              fontSize: '24px',
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            ⭐
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}