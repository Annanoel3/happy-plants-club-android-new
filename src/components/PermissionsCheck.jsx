import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Camera, CheckCircle, X, AlertCircle } from "lucide-react";

const isNative = () => window.Capacitor?.isNativePlatform?.() ?? false;

async function requestMicPermission() {
  if (isNative()) {
    // On native, trigger the OS dialog via getUserMedia — this is the most reliable cross-platform approach
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (_) {
      return false;
    }
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach(t => t.stop());
  return true;
}

async function requestCameraPermission() {
  if (isNative()) {
    const Camera = window.Capacitor?.Plugins?.Camera;
    if (Camera) {
      // Request first (shows OS dialog)
      try { await Camera.requestPermissions({ permissions: ['camera', 'photos'] }); } catch (_) {}
      // Then check the real status — don't trust the request result directly
      try {
        const check = await Camera.checkPermissions();
        return check?.camera === 'granted' || check?.photos === 'granted';
      } catch (_) {}
    }
    return false;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  stream.getTracks().forEach(t => t.stop());
  return true;
}

export default function PermissionsCheck() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [micStatus, setMicStatus] = useState('idle');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [deniedWarning, setDeniedWarning] = useState(null);
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    const alreadyAsked = localStorage.getItem('permissions_asked');
    if (alreadyAsked) return;
    const timer = setTimeout(() => setShowPrompt(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const requestMic = async () => {
    setMicStatus('requesting');
    try {
      const granted = await requestMicPermission();
      if (granted) {
        setMicStatus('granted');
      } else {
        setMicStatus('denied');
        setDeniedWarning('mic');
      }
    } catch (err) {
      console.log('[Permissions] mic error:', err?.name, err?.message);
      setMicStatus('denied');
      setDeniedWarning('mic');
    }
  };

  const requestCamera = async () => {
    setCameraStatus('requesting');
    try {
      const granted = await requestCameraPermission();
      if (granted) {
        setCameraStatus('granted');
      } else {
        setCameraStatus('denied');
        setDeniedWarning('camera');
      }
    } catch (err) {
      console.log('[Permissions] camera error:', err?.name, err?.message);
      setCameraStatus('denied');
      setDeniedWarning('camera');
    }
  };

  const handleClose = () => {
    setShowPrompt(false);
    localStorage.setItem('permissions_asked', 'true');
  };

  const dismissDeniedWarning = () => {
    setDeniedWarning(null);
    const micDone = micStatus !== 'idle' && micStatus !== 'requesting';
    const camDone = cameraStatus !== 'idle' && cameraStatus !== 'requesting';
    if (micDone && camDone) {
      setAllDone(true);
      setTimeout(handleClose, 1500);
    }
  };

  useEffect(() => {
    if (micStatus === 'granted' && cameraStatus === 'granted') {
      setAllDone(true);
      setTimeout(handleClose, 1500);
    }
  }, [micStatus, cameraStatus]);

  if (!showPrompt) return null;

  const theme = localStorage.getItem('theme') || 'light';
  const isDark = ['dark', 'botanical', 'halloween', 'christmas', 'newyears', 'fourthofjuly', 'fall'].includes(theme);
  const cardBg = isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200';
  const textColor = isDark ? 'text-white' : 'text-gray-900';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const rowBg = isDark ? 'bg-white/5' : 'bg-gray-50';
  const warnBg = isDark ? 'bg-amber-900/30 border-amber-700/50' : 'bg-amber-50 border-amber-200';

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className={`relative w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden ${cardBg}`}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className={`text-xl font-bold mb-1 ${textColor}`}>Enable Features 🌿</h2>
              <p className={`text-sm ${subText}`}>These are optional — tap Enable to allow access</p>
            </div>
            <button onClick={handleClose} className={`ml-3 mt-0.5 ${subText} hover:opacity-60 transition-opacity`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* All done state */}
        {allDone && (
          <div className="px-6 pb-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className={`font-bold ${textColor}`}>All set! 🌿</p>
          </div>
        )}

        {/* Denied warning */}
        {!allDone && deniedWarning && (
          <div className="px-6 pb-6">
            <div className={`rounded-2xl border p-4 mb-4 ${warnBg}`}>
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className={`font-semibold text-sm mb-1 ${textColor}`}>
                    {deniedWarning === 'mic' ? 'Microphone Denied' : 'Camera & Gallery Denied'}
                  </p>
                  <p className={`text-sm ${subText}`}>
                    {deniedWarning === 'mic'
                      ? "You won't be able to add plants or log watering by voice."
                      : "You won't be able to identify plants or do health checks with photos."}
                  </p>
                  <p className="text-xs mt-2 text-amber-500 font-medium">You can allow this anytime in your device Settings.</p>
                </div>
              </div>
            </div>
            <Button className="w-full bg-green-600 hover:bg-green-700 rounded-2xl h-11" onClick={dismissDeniedWarning}>
              Got it
            </Button>
          </div>
        )}

        {/* Permission rows */}
        {!allDone && !deniedWarning && (
          <div className="px-6 pb-6 space-y-3">
            {/* Microphone row */}
            <div className={`rounded-2xl p-4 ${rowBg}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Mic className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${textColor}`}>Microphone</p>
                    <p className={`text-xs ${subText}`}>Voice logging & plant chat</p>
                  </div>
                </div>
                {micStatus === 'idle' && (
                  <Button size="sm" onClick={requestMic} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4">
                    Enable
                  </Button>
                )}
                {micStatus === 'requesting' && (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                )}
                {(micStatus === 'granted' || micStatus === 'denied') && (
                  <CheckCircle className={`w-5 h-5 flex-shrink-0 ${micStatus === 'granted' ? 'text-green-500' : 'text-gray-400'}`} />
                )}
              </div>
            </div>

            {/* Camera row */}
            <div className={`rounded-2xl p-4 ${rowBg}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Camera className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${textColor}`}>Camera & Gallery</p>
                    <p className={`text-xs ${subText}`}>Identify plants & health checks</p>
                  </div>
                </div>
                {cameraStatus === 'idle' && (
                  <Button size="sm" onClick={requestCamera} className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-4">
                    Enable
                  </Button>
                )}
                {cameraStatus === 'requesting' && (
                  <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                )}
                {(cameraStatus === 'granted' || cameraStatus === 'denied') && (
                  <CheckCircle className={`w-5 h-5 flex-shrink-0 ${cameraStatus === 'granted' ? 'text-green-500' : 'text-gray-400'}`} />
                )}
              </div>
            </div>

            <button onClick={handleClose} className={`text-xs ${subText} underline w-full text-center pt-1`}>
              Skip for now
            </button>
          </div>
        )}

      </div>
    </div>
  );
}