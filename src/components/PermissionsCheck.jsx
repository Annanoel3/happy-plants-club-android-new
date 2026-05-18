import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Camera, CheckCircle, X } from "lucide-react";

export default function PermissionsCheck() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [micStatus, setMicStatus] = useState('idle'); // idle | granted | denied
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    const alreadyAsked = localStorage.getItem('permissions_asked');
    if (alreadyAsked) return;
    const timer = setTimeout(() => setShowPrompt(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (micStatus !== 'idle' && cameraStatus !== 'idle') {
      setAllDone(true);
      setTimeout(() => {
        setShowPrompt(false);
        localStorage.setItem('permissions_asked', 'true');
      }, 1800);
    }
  }, [micStatus, cameraStatus]);

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicStatus('granted');
    } catch {
      setMicStatus('denied');
    }
  };

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      setCameraStatus('granted');
    } catch {
      // Gallery still works even if camera denied — mark as done
      setCameraStatus('denied');
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('permissions_asked', 'dismissed');
  };

  if (!showPrompt) return null;

  const theme = localStorage.getItem('theme') || 'light';
  const isDark = ['dark', 'botanical', 'halloween', 'christmas', 'newyears', 'fourthofjuly', 'fall'].includes(theme);

  const cardBg = isDark ? 'bg-gray-900/95 border-gray-700' : 'bg-white border-gray-200';
  const textColor = isDark ? 'text-white' : 'text-gray-900';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleDismiss} />

      <div className={`relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${cardBg}`}>
        <button onClick={handleDismiss} className={`absolute top-4 right-4 ${subText} hover:opacity-70`}>
          <X className="w-5 h-5" />
        </button>

        {allDone ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className={`text-lg font-bold mb-1 ${textColor}`}>All set! 🌿</h3>
            <p className={`text-sm ${subText}`}>Happy Plants is ready to go</p>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <h2 className={`text-xl font-bold mb-1 ${textColor}`}>Enable Features</h2>
              <p className={`text-sm ${subText}`}>Happy Plants needs a couple of permissions to work its best</p>
            </div>

            {/* Microphone */}
            <div className={`rounded-xl p-4 mb-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Mic className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${textColor}`}>Microphone</p>
                    <p className={`text-xs ${subText}`}>Voice logging & plant chat</p>
                  </div>
                </div>
                {micStatus === 'idle' ? (
                  <Button size="sm" onClick={requestMic} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3">
                    Enable
                  </Button>
                ) : (
                  <CheckCircle className={`w-5 h-5 ${micStatus === 'granted' ? 'text-green-500' : 'text-gray-400'}`} />
                )}
              </div>
            </div>

            {/* Camera / Gallery */}
            <div className={`rounded-xl p-4 mb-5 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Camera className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${textColor}`}>Camera & Gallery</p>
                    <p className={`text-xs ${subText}`}>Identify plants & health checks</p>
                  </div>
                </div>
                {cameraStatus === 'idle' ? (
                  <Button size="sm" onClick={requestCamera} className="bg-green-600 hover:bg-green-700 text-white text-xs px-3">
                    Enable
                  </Button>
                ) : (
                  <CheckCircle className={`w-5 h-5 ${cameraStatus === 'granted' ? 'text-green-500' : 'text-gray-400'}`} />
                )}
              </div>
            </div>

            <button onClick={handleDismiss} className={`text-xs ${subText} underline w-full text-center`}>
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}