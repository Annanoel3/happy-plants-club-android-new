import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Camera, Mic, Keyboard, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { identifyPlantWithExpert } from "@/functions/identifyPlantWithExpert";
import { transcribeVoice } from "@/functions/transcribeVoice";
import { processBulkPlants } from "@/functions/processBulkPlants";

export default function AddPlant() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('choice');
  const [isProcessing, setIsProcessing] = useState(false);
  const [plantNames, setPlantNames] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const fileInputRef = useRef(null);
  const [loadingIndex, setLoadingIndex] = useState(0);

  const loadingMessages = [
    "Identifying your plant...",
    "Counting leaves...",
    "Checking soil type...",
    "Consulting botanist database...",
    "Analyzing leaf patterns...",
    "Measuring sunlight needs...",
    "Calculating watering schedule...",
    "Almost there...",
  ];

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (!isProcessing) { setLoadingIndex(0); return; }
    const interval = setInterval(() => {
      setLoadingIndex(prev => (prev + 1) % loadingMessages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isProcessing]);

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

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      navigate('/');
    }
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-green-950/50 backdrop-blur-md border border-green-900/50';
    if (theme === 'kawaii') return 'bg-pink-100/80 backdrop-blur-md border border-pink-200/50';
    if (theme === 'halloween') return 'bg-black/70 backdrop-blur-md border border-orange-500/30';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    return 'bg-black/5 backdrop-blur-md border border-gray-300/50';
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween') return 'text-white/80';
    return 'text-gray-600';
  };

  const handleImageCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const data = await identifyPlantWithExpert({
        image_url: file_url
      });

      if (data.success) {
        const plantData = data.plantData;
        const today = new Date().toISOString().split('T')[0];
        const nextWatering = new Date();
        nextWatering.setDate(nextWatering.getDate() + (plantData.water_frequency_days || 7));

        await base44.entities.Plant.create({
          ...plantData,
          image_url: file_url,
          last_watered: today,
          next_watering_due: nextWatering.toISOString().split('T')[0]
        });

        toast.success(`${plantData.name} added! 🌿`);
        navigate('/Dashboard');
      } else {
        toast.error('Could not identify plant');
      }
    } catch (error) {
      toast.error('Error processing image: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await processVoiceRecording(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      toast.error('Could not access microphone');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const processVoiceRecording = async (audioBlob) => {
    setIsProcessing(true);
    try {
      // Upload audio file first, then send URL to transcribeVoice
      const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file: audioFile });

      const transcriptData = await transcribeVoice({ file_url });

      if (!transcriptData?.transcript) {
        toast.error('Could not transcribe audio');
        return;
      }

      const result = await processBulkPlants({
        plant_names: [transcriptData.transcript]
      });

      if (result.success) {
        toast.success(`Added ${result.count} plant${result.count > 1 ? 's' : ''}! 🌿`);
        navigate('/Dashboard');
      } else {
        toast.error('Could not add plants: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      toast.error('Error processing voice: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = async () => {
    if (!plantNames.trim()) {
      toast.error('Please enter plant names');
      return;
    }

    setIsProcessing(true);
    try {
      // Pass the raw text — processBulkPlants will extract plant names via AI
      const result = await processBulkPlants({
        plant_names: [plantNames.trim()]
      });

      if (result.success) {
        toast.success(`Added ${result.count} plant${result.count > 1 ? 's' : ''}! 🌿`);
        navigate('/Dashboard');
      } else {
        toast.error('Could not add plants: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      toast.error('Error adding plants: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="theme-text">Loading...</p>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <Card className={getThemedClasses()}>
          <CardContent className="p-12 text-center min-w-[260px]">
            <Loader2 className={`w-16 h-16 animate-spin mx-auto mb-6 ${getTextColor()}`} />
            <p className={`text-lg font-semibold transition-all duration-500 ${getTextColor()}`}>
              {loadingMessages[loadingIndex]}
            </p>
            <div className="flex justify-center gap-1.5 mt-5">
              {loadingMessages.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === loadingIndex ? 'bg-green-500 scale-125' : 'bg-gray-300'}`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'choice') {
    return (
      <div className="min-h-screen theme-bg p-6 pb-24">
        <div className="max-w-md mx-auto">
          <div className={`mb-8 rounded-2xl p-6 inline-block ${getThemedClasses()}`}>
            <h1 className={`text-4xl font-bold mb-2 ${getTextColor()}`}>Add Plants</h1>
            <p className={getSecondaryTextColor()}>Choose how you'd like to add your plants</p>
          </div>

          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageCapture}
              className="hidden"
            />
            <button className="w-full cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <Card className={`${getThemedClasses()} hover:scale-[1.02] transition-all`}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className={`text-xl font-bold ${getTextColor()}`}>Take a Photo</h3>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Snap a pic and we'll identify it</p>
                  </div>
                </CardContent>
              </Card>
            </button>

            <button onClick={() => setMode('voice')} className="w-full">
              <Card className={`${getThemedClasses()} hover:scale-[1.02] transition-all`}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
                    <Mic className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className={`text-xl font-bold ${getTextColor()}`}>Use Voice</h3>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Tell us what plants you have</p>
                  </div>
                </CardContent>
              </Card>
            </button>

            <button onClick={() => setMode('text')} className="w-full">
              <Card className={`${getThemedClasses()} hover:scale-[1.02] transition-all`}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center">
                    <Keyboard className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className={`text-xl font-bold ${getTextColor()}`}>Type Names</h3>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Enter plant names manually</p>
                  </div>
                </CardContent>
              </Card>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'voice') {
    return (
      <div className="min-h-screen theme-bg p-6 pb-24">
        <div className="max-w-md mx-auto">
          <div className={`mb-8 rounded-2xl p-6 inline-block ${getThemedClasses()}`}>
            <h1 className={`text-4xl font-bold mb-2 ${getTextColor()}`}>Voice Input</h1>
            <p className={getSecondaryTextColor()}>Tell us the names of your plants</p>
          </div>

          <Card className={getThemedClasses()}>
            <CardContent className="p-12 text-center">
              {!isRecording ? (
                <>
                  <button
                    onClick={startVoiceRecording}
                    className="w-32 h-32 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center mx-auto mb-6 transition-all hover:scale-110"
                  >
                    <Mic className="w-16 h-16 text-white" />
                  </button>
                  <p className={`text-lg ${getTextColor()}`}>Tap to start recording</p>
                  <p className={`text-sm mt-2 ${getSecondaryTextColor()}`}>
                    Say plant names separated by "and" or commas
                  </p>
                </>
              ) : (
                <>
                  <button
                    onClick={stopVoiceRecording}
                    className="w-32 h-32 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse"
                  >
                    <div className="w-8 h-8 bg-white rounded-sm"></div>
                  </button>
                  <p className={`text-lg font-semibold ${getTextColor()}`}>Recording...</p>
                  <p className={`text-sm mt-2 ${getSecondaryTextColor()}`}>Tap to stop</p>
                </>
              )}
            </CardContent>
          </Card>

          <Button
            onClick={() => setMode('choice')}
            variant="outline"
            className="w-full mt-4"
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'text') {
    return (
      <div className="min-h-screen theme-bg p-6 pb-24">
        <div className="max-w-md mx-auto">
          <div className={`mb-8 rounded-2xl p-6 inline-block ${getThemedClasses()}`}>
            <h1 className={`text-4xl font-bold mb-2 ${getTextColor()}`}>Type Plant Names</h1>
            <p className={getSecondaryTextColor()}>Enter your plant names</p>
          </div>

          <Card className={getThemedClasses()}>
            <CardContent className="p-6">
              <Input
                value={plantNames}
                onChange={(e) => setPlantNames(e.target.value)}
                placeholder="Monstera, Snake Plant, Pothos..."
                className={`mb-4 theme-input ${getTextColor()}`}
              />
              <p className={`text-sm mb-4 ${getSecondaryTextColor()}`}>
                Separate multiple plants with commas
              </p>
              <Button
                onClick={handleTextSubmit}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-5 h-5 mr-2" /> Add Plants
              </Button>
            </CardContent>
          </Card>

          <Button
            onClick={() => setMode('choice')}
            variant="outline"
            className="w-full mt-4"
          >
            Back
          </Button>
        </div>
      </div>
    );
  }
}