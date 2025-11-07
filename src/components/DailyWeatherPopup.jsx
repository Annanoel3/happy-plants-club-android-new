
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Cloud } from "lucide-react";

export default function DailyWeatherPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [weatherMessage, setWeatherMessage] = useState("");
  const [location, setLocation] = useState("");
  const [weatherImage, setWeatherImage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    checkAndShowWeather();
  }, []);

  const getWeatherImage = (message) => {
    const lowerMessage = message.toLowerCase();
    
    // Check for positive sunny/clear weather first (before hot/warm warnings)
    if (lowerMessage.includes('sunny') || lowerMessage.includes('clear') || lowerMessage.includes('bright')) {
      return 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/12741cb53_ChatGPTImageOct10202511_31_18PM.png';
    } else if (lowerMessage.includes('rain') || lowerMessage.includes('shower') || lowerMessage.includes('drizzle')) {
      return 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/772d99a1d_ChatGPTImageOct10202511_35_42PM.png';
    } else if (lowerMessage.includes('cold') || lowerMessage.includes('frost') || lowerMessage.includes('freez') || lowerMessage.includes('chilly') || lowerMessage.includes('snow') || lowerMessage.includes('ice')) {
      return 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/6ce45d571_ChatGPTImageOct10202511_45_49PM.png';
    } else if (lowerMessage.includes('extreme heat') || lowerMessage.includes('drought') || lowerMessage.includes('very hot') || lowerMessage.includes('heat warning')) {
      return 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/d3e5d9915_ChatGPTImageOct10202511_36_56PM.png';
    } else if (lowerMessage.includes('wind') || lowerMessage.includes('breez')) {
      return 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/128002f4c_ChatGPTImageOct10202511_46_31PM.png';
    } else if (lowerMessage.includes('cloud') || lowerMessage.includes('overcast') || lowerMessage.includes('grey') || lowerMessage.includes('gray')) {
      return 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/429970c64_ChatGPTImageOct10202511_50_13PM.png';
    }
    
    return 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/12741cb53_ChatGPTImageOct10202511_31_18PM.png';
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-green-950 border-green-900';
    if (theme === 'kawaii') return 'bg-pink-50 border-pink-200';
    if (theme === 'halloween') return 'bg-orange-950 border-orange-800';
    if (theme === 'christmas') return 'bg-red-950 border-red-900';
    if (theme === 'valentines') return 'bg-rose-50 border-rose-200';
    if (theme === 'newyears') return 'bg-purple-950 border-purple-900';
    if (theme === 'stpatricks') return 'bg-green-50 border-green-200';
    if (theme === 'fourthofjuly') return 'bg-blue-950 border-red-800';
    if (theme === 'summer') return 'bg-orange-50 border-orange-200';
    if (theme === 'spring') return 'bg-blue-50 border-blue-200';
    if (theme === 'fall') return 'bg-amber-50 border-amber-200';
    if (theme === 'winter') return 'bg-blue-50 border-blue-200';
    if (theme === 'dark') return 'bg-gray-900 border-gray-700';
    return 'bg-white border-gray-200';
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly') return 'text-white/80';
    return 'text-gray-600';
  };

  const getButtonClasses = () => {
    switch (theme) {
      case 'botanical':
        return 'bg-green-700 hover:bg-green-800 text-white';
      case 'kawaii':
        return 'bg-pink-400 hover:bg-pink-500 text-white';
      case 'halloween':
        return 'bg-orange-600 hover:bg-orange-700 text-white';
      case 'christmas':
        return 'bg-red-700 hover:bg-red-800 text-white';
      case 'valentines':
        return 'bg-rose-500 hover:bg-rose-600 text-white';
      case 'newyears':
        return 'bg-purple-600 hover:bg-purple-700 text-white';
      case 'stpatricks':
        return 'bg-green-600 hover:bg-green-700 text-white';
      case 'fourthofjuly':
        return 'bg-blue-700 hover:bg-blue-800 text-white';
      case 'summer':
        return 'bg-orange-500 hover:bg-orange-600 text-white';
      case 'spring':
        return 'bg-green-500 hover:bg-green-600 text-white';
      case 'fall':
        return 'bg-amber-600 hover:bg-amber-700 text-white';
      case 'winter':
        return 'bg-blue-600 hover:bg-blue-700 text-white';
      case 'dark':
        return 'bg-gray-700 hover:bg-gray-800 text-white';
      default:
        return 'bg-green-600 hover:bg-green-700 text-white';
    }
  };

  const checkAndShowWeather = async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastShown = localStorage.getItem('lastWeatherShown');

    if (lastShown === today) {
      return;
    }

    setIsLoading(true);
    try {
      const user = await base44.auth.me();
      
      // Check if user has weather notifications enabled
      if (user?.notifications_weather === false) {
        return;
      }

      const { data } = await base44.functions.invoke('getDailyPlantWeather');
      
      if (data.message) {
        const currentHour = new Date().getHours();
        const isMorning = currentHour >= 6 && currentHour < 12;
        const isNight = currentHour >= 18 || currentHour < 6;

        let cleanMessage = data.message
          .replace(/\[?\(?https?:\/\/[^\s\)]+\)?[\]\)]?/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        const lowerCleanMessage = cleanMessage.toLowerCase();

        const isWeatherWarning = 
          lowerCleanMessage.includes('frost') || 
          lowerCleanMessage.includes('freeze') || 
          lowerCleanMessage.includes('cold') || 
          lowerCleanMessage.includes('snow') || 
          lowerCleanMessage.includes('heavy rain') ||
          lowerCleanMessage.includes('hail') ||
          lowerCleanMessage.includes('storm') ||
          lowerCleanMessage.includes('extreme heat') ||
          lowerCleanMessage.includes('drought warning');

        if (isMorning || isWeatherWarning) {
            if (isNight && isWeatherWarning) {
                cleanMessage = `Tonight's urgent warning: ${cleanMessage}`;
            } else if (isNight) {
                cleanMessage = `Tonight: ${cleanMessage}`;
            } else if (isWeatherWarning) {
                cleanMessage = `Urgent warning: ${cleanMessage}`;
            }
            
            setWeatherMessage(cleanMessage);
            setLocation(data.location);
            setWeatherImage(getWeatherImage(cleanMessage));
            setIsOpen(true);
            localStorage.setItem('lastWeatherShown', today);
        }
      }
    } catch (error) {
      console.error('Error fetching weather:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (isLoading || !isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={`max-w-md border-2 ${getThemedClasses()}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 text-xl ${getTextColor()}`}>
            <Cloud className="w-6 h-6 text-blue-500" />
            Today's Plant Weather
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          {weatherImage && (
            <div className="flex justify-center mb-6">
              <img 
                src={weatherImage} 
                alt="Weather illustration" 
                className="w-48 h-48 object-contain"
              />
            </div>
          )}
          <p className={`text-sm mb-3 text-center font-semibold ${getSecondaryTextColor()}`}>{location}</p>
          <p className={`text-base leading-relaxed text-center ${getTextColor()}`}>{weatherMessage}</p>
        </div>

        <Button 
          onClick={handleClose}
          className={`w-full ${getButtonClasses()}`}
        >
          Got it! 🌿
        </Button>
      </DialogContent>
    </Dialog>
  );
}
