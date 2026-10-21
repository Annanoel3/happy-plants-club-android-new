import React, { useState, useEffect, useRef } from "react";
import { usePhotoSource } from "@/components/PhotoSourceSheet";
import { asChangeEvent, pickPhotos } from "@/lib/photoPicker";
import { base44 } from "@/api/base44Client";
import { transcribe } from "@/lib/transcribe";
import { handleAiLimit } from "@/lib/premium";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Sparkles, Camera, Mic, Square, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from 'framer-motion';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import PlantdokuEgg from "@/components/PlantdokuEgg";

// chatWithExpert answers 200 with this apology when the AI call itself fails
const EXPERT_FAILED = /^Sorry, I encountered an error/i;
// Sent when someone shares a photo without typing anything
const PHOTO_ONLY_QUESTION = 'What can you tell me about the plant in this photo?';
const EXPERT_DOWN = "The plant expert couldn't answer just now. Please try again.";

export default function PlantChat() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [currentGif, setCurrentGif] = useState(0);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [reportingIdx, setReportingIdx] = useState(null);
  const imageInputRef = useRef(null);
  const handleImageUploadRef = useRef(null);
  
  const easterEggGifs = [
    'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif',
    'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
    'https://media.giphy.com/media/26FmQ6EOvLxp6cWyY/giphy.gif',
  ];

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = localStorage.getItem('theme') || 'light';
      setTheme(currentTheme);
    };
    
    handleThemeChange();
    window.addEventListener('storage', handleThemeChange);
    window.addEventListener('hp-theme-change', handleThemeChange); // was a 100ms poll
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      window.removeEventListener('hp-theme-change', handleThemeChange);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setMessages([{
        role: 'assistant',
        content: "👋 Hi! I'm your plant expert. I can help you identify plants, give care advice, troubleshoot problems, and answer any plant questions. What would you like to know?"
      }]);
    } catch (error) {
      navigate('/');
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedImage(file_url);
      toast.success('Image uploaded!');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setIsUploadingImage(false);
    }
  };
  handleImageUploadRef.current = handleImageUpload;

  const handleVoiceRecord = async () => {
    if (!isRecording) {
      try {
        await VoiceRecorder.startRecording();
        setIsRecording(true);
        toast.success('Recording... tap the button again to stop.');
      } catch (error) {
        console.warn('Recording did not start:', error?.message || error);
        toast.error("Couldn't start recording. Check that Happy Plants can use your microphone.");
      }
    } else {
      let toastId;
      try {
        const result = await VoiceRecorder.stopRecording();
        setIsRecording(false);

        if (result?.value?.recordDataBase64) {
          setIsProcessing(true);
          toastId = toast.loading('Processing voice...');
          const mime = result.value.mimeType || 'audio/aac';
          const audioBlob = new Blob([Uint8Array.from(atob(result.value.recordDataBase64), c => c.charCodeAt(0))], { type: mime });
          // Our own transcription, sent inline (Base44's upload + TranscribeAudio cost credits)
          const transcript = await transcribe(audioBlob, mime);
          if (transcript) {
            setInputMessage(transcript);
            toast.success('Got it! Check the text, then send.', { id: toastId });
          } else {
            toast.error("We didn't catch that. Please try again.", { id: toastId });
          }
        } else {
          toast.error("We didn't catch any audio. Please try again.");
        }
      } catch (error) {
        console.warn('Voice processing failed:', error?.message || error);
        setIsRecording(false);
        // Replaces the "Processing voice..." toast so it never hangs around
        toast.error("Couldn't turn that recording into text. Please try again.", toastId ? { id: toastId } : undefined);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleSend = async () => {
    const text = inputMessage.trim();
    const image = uploadedImage;
    // A photo on its own is a fine question too
    if ((!text && !image) || isProcessing || isUploadingImage) return;

    const newUserMessage = { role: 'user', content: text, image_url: image };
    const question = text || PHOTO_ONLY_QUESTION;

    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage("");
    setUploadedImage(null);
    setIsProcessing(true);

    // When it doesn't go through, take the bubble back out and put the question
    // back in the box so nothing typed is lost
    const undo = () => {
      setMessages(prev => prev.filter(m => m !== newUserMessage));
      setInputMessage(text);
      setUploadedImage(image);
    };

    try {
      const response = await base44.functions.invoke('chatWithExpert', {
        message: question,
        image_url: image,
        conversation_id: conversationId
      });
      const data = response?.data || response;

      if (data?.error) {
        toast.error(typeof data.error === 'string' && data.error.includes(' ') ? data.error : EXPERT_DOWN);
        undo();
        return;
      }
      // Never show the server's failure apology as if the expert said it
      if (typeof data?.message !== 'string' || !data.message.trim() || EXPERT_FAILED.test(data.message)) {
        toast.error(EXPERT_DOWN);
        undo();
        return;
      }

      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        // kept so "Report this answer" can send what was asked
        question,
        question_image: image || null,
      }]);
    } catch (error) {
      console.warn('Plant expert request failed:', error?.response?.status || error?.message);
      if (!(await handleAiLimit(error, navigate))) {
        const status = error?.response?.status;
        const serverMsg = error?.response?.data?.error;
        // A 4xx refusal (e.g. "Please keep it family friendly") is written for people: show it
        const refused = status >= 400 && status < 500 && ![401, 403, 429].includes(status);
        toast.error(refused && typeof serverMsg === 'string' && serverMsg ? serverMsg : EXPERT_DOWN);
      }
      undo();
    } finally {
      setIsProcessing(false);
    }
  };

  // Google Play asks for a way to flag AI answers. Sends the reply and its question to us.
  const handleReport = async (idx) => {
    const msg = messages[idx];
    if (!msg || msg.role !== 'assistant' || !msg.question || msg.reported || reportingIdx !== null) return;
    setReportingIdx(idx);
    try {
      const res = await base44.functions.invoke('sendFeedback', {
        kind: 'ai_answer',
        question: msg.question,
        answer: msg.content,
        image_url: msg.question_image || undefined,
      });
      const data = res?.data ?? res;
      if (!data?.success) throw new Error('not_sent');
      setMessages(prev => prev.map((m, i) => (i === idx ? { ...m, reported: true } : m)));
      toast.success("Thanks for flagging this. We'll take a look.");
    } catch (error) {
      const serverMsg = error?.response?.data?.error;
      toast.error(typeof serverMsg === 'string' && serverMsg ? serverMsg : "Couldn't send your report. Please try again later.");
    } finally {
      setReportingIdx(null);
    }
  };

  const handleEasterEggClick = () => {
    setShowEasterEgg(true);
    setCurrentGif((prev) => (prev + 1) % easterEggGifs.length);
    setTimeout(() => setShowEasterEgg(false), 3000);
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-black/40 backdrop-blur-md border border-green-700/40';
    if (theme === 'christmas') return 'bg-black/40 backdrop-blur-md border border-red-700/50';
    if (theme === 'valentines') return 'bg-black/40 backdrop-blur-md border border-pink-500/30';
    if (theme === 'newyears') return 'bg-black/40 backdrop-blur-md border border-purple-500/30';
    if (theme === 'stpatricks') return 'bg-black/40 backdrop-blur-md border border-green-500/30';
    if (theme === 'fall') return 'bg-black/40 backdrop-blur-md border border-orange-700/50';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    if (theme === 'halloween') return 'bg-black/40 backdrop-blur-md border border-orange-500/30';
    if (theme === 'fourthofjuly') return 'bg-black/45 backdrop-blur-md border border-red-500/30';
    
    if (theme === 'kawaii') return 'bg-white/60 backdrop-blur-md border border-pink-200/50';
    if (theme === 'summer') return 'bg-white/60 backdrop-blur-md border border-orange-300/50';
    if (theme === 'spring') return 'bg-white/60 backdrop-blur-md border border-purple-300/50';
    if (theme === 'winter') return 'bg-white/60 backdrop-blur-md border border-blue-300/50';
    return 'bg-white/60 backdrop-blur-md border border-gray-300/50';
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') return 'text-white/80';
    return 'text-gray-600';
  };

  const getPrimaryButtonClasses = () => {
    if (theme === 'botanical') return 'bg-green-700 hover:bg-green-800 text-white';
    if (theme === 'kawaii') return 'bg-pink-500 hover:bg-pink-600 text-white';
    if (theme === 'halloween') return 'bg-orange-600 hover:bg-orange-700 text-white';
    if (theme === 'christmas') return 'bg-red-700 hover:bg-red-800 text-white';
    if (theme === 'valentines') return 'bg-pink-600 hover:bg-pink-700 text-white';
    if (theme === 'newyears') return 'bg-purple-600 hover:bg-purple-700 text-white';
    if (theme === 'stpatricks') return 'bg-green-600 hover:bg-green-700 text-white';
    if (theme === 'fourthofjuly') return 'bg-red-600 hover:bg-red-700 text-white';
    if (theme === 'summer') return 'bg-orange-500 hover:bg-orange-600 text-white';
    if (theme === 'spring') return 'bg-purple-500 hover:bg-purple-600 text-white';
    if (theme === 'fall') return 'bg-orange-600 hover:bg-orange-700 text-white';
    if (theme === 'winter') return 'bg-blue-600 hover:bg-blue-700 text-white';
    if (theme === 'dark') return 'bg-green-600 hover:bg-green-700 text-white';
    return 'bg-green-600 hover:bg-green-700 text-white';
  };

  const getInputClasses = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'christmas' || theme === 'newyears' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') {
      return 'bg-white/10 text-white border-white/20 placeholder:text-white/50';
    }
    if (theme === 'halloween' || theme === 'fourthofjuly') {
      return 'bg-white/10 text-white border-white/20 placeholder:text-white/50';
    }
    return 'bg-white text-gray-900 border-gray-300';
  };

  const chatPhoto = usePhotoSource((files) => handleImageUploadRef.current?.(asChangeEvent(files)), { title: 'Show the expert a photo' });

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center theme-bg">
        <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg p-6 flex flex-col pb-24">
      <AnimatePresence>
        {showEasterEgg && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <img 
              src={easterEggGifs[currentGif]} 
              alt="Celebration" 
              className="max-w-md max-h-96 rounded-2xl shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`border-b theme-border p-3 flex-shrink-0 ${getThemedClasses()} relative`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* The app header above already has the menu button */}
          <div className="flex items-center gap-2">
            <div>
              <h1 className={`text-xl font-bold flex items-center gap-2 ${getTextColor()}`}>
                <Sparkles className="w-5 h-5 text-green-600" />
                Plant Expert
              </h1>
              <p className={`text-xs ${getSecondaryTextColor()}`}>Ask me anything about plants!</p>
            </div>
          </div>
          
          <button
            onClick={handleEasterEggClick}
            className="text-[8px] opacity-20 hover:opacity-40 transition-opacity"
          >
            🌱
          </button>
        </div>
      </div>
      <PlantdokuEgg page="expert" className="py-1" />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl p-3 ${
                msg.role === 'user' 
                  ? getPrimaryButtonClasses() + ' text-white'
                  : getThemedClasses()
              }`}>
                {msg.image_url && (
                  <img src={msg.image_url} alt="Uploaded" className={`max-w-full h-auto rounded-lg ${msg.content ? 'mb-2' : ''}`} />
                )}
                {msg.content && (
                  <p className={`text-sm whitespace-pre-wrap ${
                    msg.role === 'user' ? 'text-white' : getTextColor()
                  }`}>
                    {msg.content}
                  </p>
                )}
                {msg.role === 'assistant' && msg.question && (
                  <div className="mt-2 flex justify-end">
                    {msg.reported ? (
                      <span className={`text-[11px] opacity-70 ${getSecondaryTextColor()}`}>Reported. Thanks!</span>
                    ) : (
                      <button
                        onClick={() => handleReport(idx)}
                        disabled={reportingIdx !== null}
                        className={`inline-flex items-center gap-1 text-[11px] opacity-70 hover:opacity-100 disabled:opacity-40 ${getSecondaryTextColor()}`}
                      >
                        <Flag className="w-3 h-3" />
                        {reportingIdx === idx ? 'Sending...' : 'Report this answer'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className={`rounded-2xl p-3 ${getThemedClasses()}`}>
                <Loader2 className="w-5 h-5 animate-spin text-green-600" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className={`border-t theme-border p-3 flex-shrink-0 ${getThemedClasses()}`}>
         <div className="max-w-4xl mx-auto">
           {uploadedImage && (
             <div className="mb-3 relative inline-block">
               <img src={uploadedImage} alt="Preview" className="h-20 rounded-lg" />
               <button
                 onClick={() => setUploadedImage(null)}
                 className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
               >
                 ×
               </button>
             </div>
           )}
           <div className="flex gap-2">
             {chatPhoto.sheet}
             {/* Solid buttons with white icons: the old outline buttons took the
                 card's translucent color and the icon nearly vanished on most themes. */}
             <Button
               size="icon"
               onClick={chatPhoto.openPicker}
               disabled={isUploadingImage}
               aria-label="Add a photo"
               className="bg-green-600 hover:bg-green-700 text-white shrink-0"
             >
               {isUploadingImage ? (
                 <Loader2 className="w-5 h-5 animate-spin" />
               ) : (
                 <Camera className="w-5 h-5" strokeWidth={2.25} />
               )}
             </Button>
             <Button
               size="icon"
               onClick={handleVoiceRecord}
               disabled={isProcessing}
               aria-label={isRecording ? 'Stop recording' : 'Record a question'}
               className={`shrink-0 text-white ${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'}`}
             >
               {isRecording ? (
                 <Square className="w-5 h-5" fill="currentColor" />
               ) : (
                 <Mic className="w-5 h-5" strokeWidth={2.25} />
               )}
             </Button>
             <Input
               value={inputMessage}
               onChange={(e) => setInputMessage(e.target.value)}
               onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
               placeholder="Ask about a plant..."
               disabled={isProcessing}
               className={getInputClasses()}
             />
             <Button
               onClick={handleSend}
               disabled={isProcessing || isUploadingImage || (!inputMessage.trim() && !uploadedImage)}
               aria-label="Send"
               className={getPrimaryButtonClasses()}
             >
               <Send className="w-4 h-4" />
             </Button>
           </div>
         </div>
       </div>
    </div>
  );
}