import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Mic, Square, Loader2, Check, AlertCircle, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { transcribeVoice } from "@/functions/transcribeVoice";
import { processVoiceWatering } from "@/functions/processVoiceWatering";

export default function VoiceLog() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [inputMode, setInputMode] = useState('voice');
  const [typedText, setTypedText] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    checkAuth();
  }, []);

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

  const checkAuth = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      navigate('/');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setAudioChunks(chunks);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob) => {
    setIsProcessing(true);
    try {
      // Create a File object from the blob
      const audioFile = new File([audioBlob], 'recording.webm', { 
        type: 'audio/webm' 
      });
      
      // Upload the audio file
      const uploadResult = await base44.integrations.Core.UploadFile({ 
        file: audioFile 
      });
      
      if (!uploadResult.file_url) {
        toast.error('Failed to upload audio');
        setIsProcessing(false);
        return;
      }

      console.log('📁 Audio uploaded to:', uploadResult.file_url);

      // Now transcribe using the file URL
      const { data } = await transcribeVoice({
        file_url: uploadResult.file_url
      });
      
      if (data.transcript) {
        setTranscript(data.transcript);
        await processTranscript(data.transcript);
      } else {
        toast.error('Could not transcribe audio');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast.error(`Transcription error: ${error.message || 'Unknown error'}`);
      setIsProcessing(false);
    }
  };

  const processTranscript = async (text) => {
    try {
      console.log('Processing transcript:', text);
      const response = await processVoiceWatering({
        transcript: text
      });
      
      console.log('Response:', response);
      const data = response?.data || response;

      if (data && data.success) {
        setResult(data);
        toast.success(data.notes || 'Logged successfully!');
      } else {
        console.warn('Unexpected response format:', data);
        toast.error('Could not process the log');
      }
    } catch (error) {
      console.error('Processing error:', error);
      toast.error(`Error: ${error.message || 'Failed to process'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTypeSubmit = async () => {
    if (!typedText.trim()) {
      toast.error('Please enter some text');
      return;
    }

    setTranscript(typedText);
    setIsProcessing(true);
    try {
      await processTranscript(typedText);
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to process text. Try again.');
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setTranscript("");
    setResult(null);
    setTypedText("");
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-green-950/50 backdrop-blur-md border border-green-900/50';
    if (theme === 'kawaii') return 'bg-pink-100/80 backdrop-blur-md border border-pink-200/50';
    if (theme === 'halloween') return 'bg-black/70 backdrop-blur-md border border-orange-500/30';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    return 'bg-black/5 backdrop-blur-md border border-gray-300/50';
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly') return 'text-white/80';
    return 'text-gray-600';
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg p-6 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className={`mb-8 rounded-2xl p-6 inline-block ${getThemedClasses()}`}>
          <h1 className={`text-4xl font-bold mb-2 ${getTextColor()}`}>Quick Log</h1>
          <p className={getSecondaryTextColor()}>Voice or type your plant care</p>
        </div>

        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => setInputMode('voice')}
            variant={inputMode === 'voice' ? 'default' : 'outline'}
            className={inputMode === 'voice' ? 'bg-green-600' : ''}
          >
            <Mic className="w-4 h-4 mr-2" />
            Voice
          </Button>
          <Button
            onClick={() => setInputMode('text')}
            variant={inputMode === 'text' ? 'default' : 'outline'}
            className={inputMode === 'text' ? 'bg-green-600' : ''}
          >
            <Keyboard className="w-4 h-4 mr-2" />
            Type
          </Button>
        </div>

        <Card className={getThemedClasses()}>
          <CardContent className="p-8">
            {inputMode === 'voice' ? (
              <>
                <div className="text-center mb-8">
                  <p className={`mb-4 ${getSecondaryTextColor()}`}>
                    Tap the microphone and say what you did
                  </p>
                  <p className={`text-sm ${getSecondaryTextColor()}`}>
                    Example: "I watered everything except the Monstera and need to bring the plants inside at 5pm"
                  </p>
                </div>

                <div className="flex justify-center mb-8">
                  {!isRecording && !isProcessing && !result && (
                    <button
                      onClick={startRecording}
                      className="w-32 h-32 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105"
                    >
                      <Mic className="w-16 h-16 text-white" />
                    </button>
                  )}

                  {isRecording && (
                    <button
                      onClick={stopRecording}
                      className="w-32 h-32 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-2xl transition-all animate-pulse"
                    >
                      <Square className="w-16 h-16 text-white" />
                    </button>
                  )}

                  {isProcessing && (
                    <div className="w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl">
                      <Loader2 className="w-16 h-16 text-white animate-spin" />
                    </div>
                  )}

                  {result && (
                    <div className="w-32 h-32 bg-green-600 rounded-full flex items-center justify-center shadow-2xl">
                      <Check className="w-16 h-16 text-white" />
                    </div>
                  )}
                </div>

                {transcript && (
                  <div className={`p-4 rounded-xl border mb-6 ${getThemedClasses()}`}>
                    <p className={`text-sm font-semibold mb-2 ${getTextColor()}`}>What I heard:</p>
                    <p className={getSecondaryTextColor()}>{transcript}</p>
                  </div>
                )}

                {result && (
                   <div className="space-y-4">
                     {result.watered_count > 0 && (
                       <div className={`p-4 rounded-xl border ${getThemedClasses()}`}>
                         <p className={`font-semibold ${getTextColor()}`}>
                           💧 Logged watering for {result.watered_count} plant{result.watered_count > 1 ? 's' : ''}
                         </p>
                       </div>
                     )}

                     {result.reminder_count > 0 && (
                       <div className={`p-4 rounded-xl border ${getThemedClasses()}`}>
                         <p className={`font-semibold ${getTextColor()}`}>
                           ⏰ Created {result.reminder_count} reminder{result.reminder_count > 1 ? 's' : ''}
                         </p>
                       </div>
                     )}

                     <div className="flex gap-3">
                       <Button
                         onClick={handleReset}
                         variant="outline"
                         className="flex-1"
                       >
                         Log Another
                       </Button>
                       <Button
                         onClick={() => navigate('/Dashboard')}
                         className="flex-1 bg-green-600 hover:bg-green-700"
                       >
                         Back to Garden
                       </Button>
                     </div>
                   </div>
                 )}
              </>
            ) : (
              <>
                <div className="text-center mb-6">
                  <p className={`mb-4 ${getSecondaryTextColor()}`}>
                    Type what you did with your plants
                  </p>
                  <p className={`text-sm ${getSecondaryTextColor()}`}>
                    Example: "I watered everything except the Monstera and need to bring the plants inside at 5pm"
                  </p>
                </div>

                <Textarea
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="I watered..."
                  className="min-h-32 mb-4 theme-input"
                  disabled={isProcessing}
                />

                {!result ? (
                  <Button
                    onClick={handleTypeSubmit}
                    disabled={isProcessing || !typedText.trim()}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Submit'
                    )}
                  </Button>
                ) : (
                   <>
                     <div className="space-y-4 mb-4">
                       {result.watered_count > 0 && (
                         <div className={`p-4 rounded-xl border ${getThemedClasses()}`}>
                           <p className={`font-semibold ${getTextColor()}`}>
                             💧 Logged watering for {result.watered_count} plant{result.watered_count > 1 ? 's' : ''}
                           </p>
                         </div>
                       )}

                       {result.reminder_count > 0 && (
                         <div className={`p-4 rounded-xl border ${getThemedClasses()}`}>
                           <p className={`font-semibold ${getTextColor()}`}>
                             ⏰ Created {result.reminder_count} reminder{result.reminder_count > 1 ? 's' : ''}
                           </p>
                         </div>
                       )}
                     </div>

                     <div className="flex gap-3">
                       <Button
                         onClick={handleReset}
                         variant="outline"
                         className="flex-1"
                       >
                         Log Another
                       </Button>
                       <Button
                         onClick={() => navigate('/Dashboard')}
                         className="flex-1 bg-green-600 hover:bg-green-700"
                       >
                         Back to Garden
                       </Button>
                     </div>
                   </>
                 )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}