import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Camera, CheckCircle, X, AlertCircle } from "lucide-react";

const isNative = () => window.Capacitor?.isNativePlatform?.() ?? false;

async function checkAndRequestMic() {
  if (isNative()) {
    const MicPlugin = window.Capacitor?.Plugins?.Microphone;
    if (MicPlugin) {
      const status = await MicPlugin.checkPermissions();
      if (status?.microphone === 'granted') return 'granted';
      if (status?.microphone === 'denied') return 'denied';
      const result = await MicPlugin.requestPermissions();
      return result?.microphone === 'granted' ? 'granted' : 'denied';
    }
  }
  // Web fallback
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return 'granted';
  } catch (_) {
    return 'denied';
  }
}

async function checkAndRequestCamera() {
  if (isNative()) {
    const CameraPlugin = window.Capacitor?.Plugins?.Camera;
    if (CameraPlugin) {
      const status = await CameraPlugin.checkPermissions();
      if (status?.camera === 'granted') return 'granted';
      if (status?.camera === 'denied') return 'denied';
      const result = await CameraPlugin.requestPermissions({ permissions: ['camera', 'photos'] });
      return result?.camera === 'granted' ? 'granted' : 'denied';
    }
  }
  // Web fallback
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return 'granted';
  } catch (_) {
    return 'denied';
  }
}

export default function PermissionsCheck() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [micStatus, setMicStatus] = useState('idle');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    const alreadyAsked = localStorage.getItem('permissions_asked');
    if (alreadyAsked) return;
    const timer = setTimeout(() => setShowPrompt(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const requestMic = async () => {
    setMicStatus('requesting');
    const result = await checkAndRequestMic();
    setMicStatus(result);
  };

  const requestCamera = async () => {
    setCameraStatus('requesting');
    const result = await checkAndRequestCamera();
    setCameraStatus(result);
  };

  const handleClose = () => {
    setShowPrompt(false);
    localStorage.setItem('permissions_asked', 'true');
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

  const bothHandled = micStatus !== 'idle' && micStatus !== 'requesting' &&
                      cameraStatus !== 'idle' && cameraStatus !== 'requesting';
  const anyDenied = micStatus === 'denied' || cameraStatus === 'denied';

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

        {/* Permission rows */}
        {!allDone && (
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
                {micStatus === 'granted' && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
                {micStatus === 'denied' && <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
              </div>
              {micStatus === 'denied' && (
                <p className="text-xs text-amber-500 mt-2 ml-14">To enable, go to your device Settings → Happy Plants → Microphone.</p>
              )}
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
                {cameraStatus === 'granted' && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
                {cameraStatus === 'denied' && <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
              </div>
              {cameraStatus === 'denied' && (
                <p className="text-xs text-amber-500 mt-2 ml-14">To enable, go to your device Settings → Happy Plants → Camera.</p>
              )}
            </div>

            {bothHandled && anyDenied && (
              <Button className="w-full bg-green-600 hover:bg-green-700 rounded-2xl h-11" onClick={handleClose}>
                Got it
              </Button>
            )}

            {!bothHandled && (
              <button onClick={handleClose} className={`text-xs ${subText} underline w-full text-center pt-1`}>
                Skip for now
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}