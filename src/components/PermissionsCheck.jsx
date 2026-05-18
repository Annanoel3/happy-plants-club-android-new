import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Camera as CameraIcon, CheckCircle, X, AlertCircle } from "lucide-react";

// Access Capacitor plugins via window.Capacitor.Plugins to avoid build-time resolution errors
async function requestMicPermission() {
  try {
    const VoiceRecorder = window.Capacitor?.Plugins?.VoiceRecorder;
    if (!VoiceRecorder) return 'denied';
    const { value: hasPermission } = await VoiceRecorder.hasAudioRecordingPermission();
    if (hasPermission) return 'granted';
    const { value: granted } = await VoiceRecorder.requestAudioRecordingPermission();
    return granted ? 'granted' : 'denied';
  } catch (err) {
    console.error('Mic permission error:', err);
    return 'denied';
  }
}

async function requestCameraPermission() {
  try {
    const Camera = window.Capacitor?.Plugins?.Camera;
    if (!Camera) return 'denied';
    const status = await Camera.checkPermissions();
    if (status.camera === 'granted') return 'granted';
    const result = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    return result.camera === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    console.error('Camera permission error:', err);
    return 'denied';
  }
}

export default function PermissionsCheck({ user }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [micStatus, setMicStatus] = useState('idle');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    const alreadyAsked = localStorage.getItem('permissions_asked');
    if (alreadyAsked) return;
    const timer = setTimeout(() => setShowPrompt(true), 2000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleMic = async () => {
    setMicStatus('requesting');
    const result = await requestMicPermission();
    setMicStatus(result);
  };

  const handleCamera = async () => {
    setCameraStatus('requesting');
    const result = await requestCameraPermission();
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

  const bothHandled = micStatus !== 'idle' && micStatus !== 'requesting' &&
                      cameraStatus !== 'idle' && cameraStatus !== 'requesting';
  const anyDenied = micStatus === 'denied' || cameraStatus === 'denied';

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className={`relative w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden ${cardBg}`}>
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

        {allDone ? (
          <div className="px-6 pb-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className={`font-bold ${textColor}`}>All set! 🌿</p>
          </div>
        ) : (
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
                  <Button size="sm" onClick={handleMic} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4">Enable</Button>
                )}
                {micStatus === 'requesting' && (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
                {micStatus === 'granted' && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
                {micStatus === 'denied' && <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
              </div>
              {micStatus === 'denied' && (
                <p className="text-xs text-amber-600 mt-2 ml-14">
                  Go to <strong>Settings → Happy Plants → Microphone</strong> to enable.
                </p>
              )}
            </div>

            {/* Camera row */}
            <div className={`rounded-2xl p-4 ${rowBg}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CameraIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${textColor}`}>Camera & Gallery</p>
                    <p className={`text-xs ${subText}`}>Identify plants & health checks</p>
                  </div>
                </div>
                {cameraStatus === 'idle' && (
                  <Button size="sm" onClick={handleCamera} className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-4">Enable</Button>
                )}
                {cameraStatus === 'requesting' && (
                  <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
                {cameraStatus === 'granted' && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
                {cameraStatus === 'denied' && <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
              </div>
              {cameraStatus === 'denied' && (
                <p className="text-xs text-amber-600 mt-2 ml-14">
                  Go to <strong>Settings → Happy Plants → Camera</strong> to enable.
                </p>
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