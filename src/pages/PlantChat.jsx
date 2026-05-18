import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Sparkles, Camera, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from 'framer-motion';
import { VoiceRecorder } from 'capacitor-voice-recorder';

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
  const imageInputRef = useRef(null);
  
  const easterEggGifs = [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWp5dzh5dGJ4dHFyZGRsMzZyMzJwOGJyZGRsMzZyMzJwOGJy/giphy.gif',
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
    const interval = setInterval(handleThemeChange, 100);
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      clearInterval(interval);
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

  const handleVoiceRecord = async () => {
    if (!isRecording) {
      try {
        console.log('🎤 Starting recording...');
        await VoiceRecorder.startRecording();
        setIsRecording(true);
        toast.success('Recording started...');
      } catch (error) {
        console.error('❌ Recording error:', error);
        toast.error('Failed to start recording: ' + error.message);
      }
    } else {
      try {
        console.log('⏹️ Stopping recording...');
        const result = await VoiceRecorder.stopRecording();
        setIsRecording(false);
        console.log('📦 Recording result:', result);

        if (result.value?.recordDataBase64) {
          setIsProcessing(true);
          toast.loading('Processing voice...');
          const audioBlob = new Blob([Uint8Array.from(atob(result.value.recordDataBase64), c => c.charCodeAt(0))], { type: 'audio/wav' });
          const { file_url } = await base44.integrations.Core.UploadFile({ file: audioBlob });
          const transcript = await base44.integrations.Core.TranscribeAudio({ audio_url: file_url });
          setInputMessage(transcript);
          setIsProcessing(false);
          toast.success('Voice transcribed!');
        } else {
          toast.error('No audio recorded');
        }
      } catch (error) {
        console.error('❌ Stop recording error:', error);
        setIsRecording(false);
        setIsProcessing(false);
        toast.error('Failed to process voice: ' + error.message);
      }
    }
  };

  const handleSend = async () => {
    console.log('🔵 handleSend called, input:', inputMessage, 'isProcessing:', isProcessing);
    if (!inputMessage.trim() || isProcessing) {
      console.log('❌ Early return - input empty or already processing');
      return;
    }

    const userMessage = inputMessage.trim();

    const newUserMessage = {
      role: 'user',
      content: userMessage,
      image_url: uploadedImage
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage("");
    setUploadedImage(null);
    setIsProcessing(true);
    console.log('📤 Sending message:', { userMessage, image_url: uploadedImage, conversationId });

    try {
       console.log('🔄 Invoking chatWithExpert...');
       const response = await base44.functions.invoke('chatWithExpert', {
         message: userMessage,
         image_url: newUserMessage.image_url,
         conversation_id: conversationId
       });
       console.log('✅ Response received:', response);

       // Extract the actual response data
       const data = response?.data || response;
       console.log('📦 Extracted data:', data);

       if (data?.error) {
         toast.error(data.error);
         setMessages(prev => prev.slice(0, -1));
         return;
       }

       if (data?.message) {
         if (data.conversation_id && !conversationId) {
           setConversationId(data.conversation_id);
         }

         setMessages(prev => [...prev, {
           role: 'assistant',
           content: data.message
         }]);
       } else {
         console.error('❌ No message in response:', data);
         toast.error('No response from expert');
         setMessages(prev => prev.slice(0, -1));
       }
     } catch (error) {
       console.error('❌ Error in chat:', error);
       toast.error(error.message || "Failed to send message");
       setMessages(prev => prev.slice(0, -1));
     } finally {
       setIsProcessing(false);
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
        <div className="max-w-4xl mx-auto">
          <h1 className={`text-xl font-bold flex items-center gap-2 ${getTextColor()}`}>
            <Sparkles className="w-5 h-5 text-green-600" />
            Plant Expert
          </h1>
          <p className={`text-xs ${getSecondaryTextColor()}`}>Ask me anything about plants!</p>
        </div>
        
        <button
          onClick={handleEasterEggClick}
          className="absolute bottom-2 right-2 text-[8px] opacity-20 hover:opacity-40 transition-opacity"
        >
          🌱
        </button>
      </div>

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
                  <img src={msg.image_url} alt="Uploaded" className="max-w-full h-auto rounded-lg mb-2" />
                )}
                <p className={`text-sm whitespace-pre-wrap ${
                  msg.role === 'user' ? 'text-white' : getTextColor()
                }`}>
                  {msg.content}
                </p>
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
             <input
               ref={imageInputRef}
               type="file"
               accept="image/*"
               onChange={handleImageUpload}
               className="hidden"
             />
             <Button
               variant="outline"
               size="icon"
               onClick={() => imageInputRef.current?.click()}
               disabled={isUploadingImage}
               className={`${getThemedClasses()}`}
             >
               {isUploadingImage ? (
                 <Loader2 className="w-4 h-4 animate-spin" />
               ) : (
                 <Camera className="w-4 h-4" />
               )}
             </Button>
             <Button
               variant="outline"
               size="icon"
               onClick={handleVoiceRecord}
               disabled={isProcessing}
               className={`${getThemedClasses()} ${isRecording ? 'animate-pulse' : ''}`}
             >
               {isRecording ? (
                 <Square className="w-4 h-4 text-red-500" />
               ) : (
                 <Mic className="w-4 h-4" />
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
               disabled={isProcessing || !inputMessage.trim()}
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