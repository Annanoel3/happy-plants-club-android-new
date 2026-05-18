import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Camera, CheckCircle, X, AlertCircle } from "lucide-react";

// View states: 'permissions' | 'mic_denied' | 'camera_denied' | 'all_done'
export default function PermissionsCheck() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [view, setView] = useState('permissions');
  const [micStatus, setMicStatus] = useState('idle');
  const [cameraStatus, setCameraStatus] = useState('idle');

  useEffect(() => {
    const alreadyAsked = localStorage.getItem('permissions_asked');
    if (alreadyAsked) return;
    const timer = setTimeout(() => setShowPrompt(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicStatus('granted');
    } catch {
      setMicStatus('denied');
      setView('mic_denied');
    }
  };

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      setCameraStatus('granted');
    } catch {
      setCameraStatus('denied');
      setView('camera_denied');
    }
  };

  const handleClose = () => {
    setShowPrompt(false);
    localStorage.setItem('permissions_asked', 'true');
  };

  const backToPermissions = () => setView('permissions');

  const finishAndClose = () => {
    setView('all_done');
    setTimeout(handleClose, 1800);
  };

  // After dismissing a denial warning, check if both have been decided
  const afterDenialClose = () => {
    const mic = micStatus !== 'idle' ? micStatus : 'skipped';
    const cam = cameraStatus !== 'idle' ? cameraStatus : 'skipped';
    if (mic !== 'idle' && cam !== 'idle') {
      finishAndClose();
    } else {
      setView('permissions');
    }
  };

  if (!showPrompt) return null;

  const theme = localStorage.getItem('theme') || 'light';
  const isDark = ['dark', 'botanical', 'halloween', 'christmas', 'newyears', 'fourthofjuly', 'fall'].includes(theme);
  const cardBg = isDark ? 'bg-gray-900/95 border-gray-700' : 'bg-white border-gray-200';
  const textColor = isDark ? 'text-white' : 'text-gray-900';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const warnBg = isDark ? 'bg-amber-900/30 border-amber-700/50' : 'bg-amber-50 border-amber-200';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className={`relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${cardBg}`}>

        {/* ── All done ── */}
        {view === 'all_done' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className={`text-lg font-bold mb-1 ${textColor}`}>All set! 🌿</h3>
            <p className={`text-sm ${subText}`}>Happy Plants is ready to go</p>
          </div>
        )}

        {/* ── Mic denied warning ── */}
        {view === 'mic_denied' && (
          <>
            <div className={`rounded-xl border p-4 mb-5 ${warnBg}`}>
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className={`font-semibold text-sm mb-1 ${textColor}`}>Microphone Denied</p>
                  <p className={`text-sm ${subText}`}>
                    Without microphone access you won't be able to add plants by voice or update plant statuses by speaking — you'll need to type everything manually.
                  </p>
                  <p className={`text-xs mt-2 text-amber-500`}>You can allow this anytime in your device Settings.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={backToPermissions}>Back</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={afterDenialClose}>Got it</Button>
            </div>
          </>
        )}

        {/* ── Camera denied warning ── */}
        {view === 'camera_denied' && (
          <>
            <div className={`rounded-xl border p-4 mb-5 ${warnBg}`}>
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className={`font-semibold text-sm mb-1 ${textColor}`}>Camera & Gallery Denied</p>
                  <p className={`text-sm ${subText}`}>
                    Without camera or gallery access you won't be able to use AI plant health checks or upload/take photos for your virtual garden.
                  </p>
                  <p className={`text-xs mt-2 text-amber-500`}>You can allow this anytime in your device Settings.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={backToPermissions}>Back</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={afterDenialClose}>Got it</Button>
            </div>
          </>
        )}

        {/* ── Main permissions prompt ── */}
        {view === 'permissions' && (
          <>
            <button onClick={handleClose} className={`absolute top-4 right-4 ${subText} hover:opacity-70`}>
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <h2 className={`text-xl font-bold mb-1 ${textColor}`}>Enable Features 🌿</h2>
              <p className={`text-sm ${subText}`}>These are optional — but they unlock the best of Happy Plants</p>
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
                  <Button size="sm" onClick={requestMic} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3">Enable</Button>
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
                  <Button size="sm" onClick={requestCamera} className="bg-green-600 hover:bg-green-700 text-white text-xs px-3">Enable</Button>
                ) : (
                  <CheckCircle className={`w-5 h-5 ${cameraStatus === 'granted' ? 'text-green-500' : 'text-gray-400'}`} />
                )}
              </div>
            </div>

            <button onClick={finishAndClose} className={`text-xs ${subText} underline w-full text-center`}>
              Skip for now
            </button>
          </>
        )}

      </div>
    </div>
  );
}