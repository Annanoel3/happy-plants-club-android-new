import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { setMicActive } from "@/lib/admob";

export default function QuickLogModal({ isOpen, onClose, theme }) {
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    // Request microphone permission on Android
    if (Capacitor.isNativePlatform()) {
      try {
        const { Permissions } = Capacitor.Plugins;
        Permissions.requestPermissions({
          permissions: ['microphone']
        });
      } catch (error) {
        console.log('Permission request error:', error);
      }
    }
  }, []);

  const handleVoiceRecord = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks = [];

        recorder.ondataavailable = (e) => {
          chunks.push(e.data);
        };

        recorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          await processAudio(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = chunks;
        setIsRecording(true);
        setMicActive(true);
        toast.success("Recording started...");
      } catch (error) {
        console.error("Recording error:", error);
        if (error.name === 'NotAllowedError') {
          toast.error('Microphone permission denied');
        } else {
          toast.error("Failed to start recording: " + error.message);
        }
      }
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setMicActive(false);
      }
    }
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    try {
      const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
      const { file_url } = await base44.integrations.Core.UploadFile({
        file: audioFile,
      });
      
      const transcribeResponse = await base44.functions.invoke("transcribeAudio", {
        file_url,
      });
      const transcript = transcribeResponse.data.transcript;
      const { data } = await base44.functions.invoke("processPlantCareLog", { transcript });
      toast.success(data?.summary || "Log saved!");
      setInputMessage("");
      onClose();
    } catch (error) {
      console.error("Error processing audio:", error);
      toast.error("Failed to process audio: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!inputMessage.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      await base44.functions.invoke("processPlantCareLog", {
        transcript: inputMessage,
      });
      toast.success("Log saved!");
      setInputMessage("");
      onClose();
    } catch (error) {
      console.error("Error saving log:", error);
      toast.error("Failed to save log");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const getThemedClasses = () => {
    if (theme === "botanical") return "bg-black/40 backdrop-blur-md border border-green-700/40";
    if (theme === "christmas") return "bg-black/40 backdrop-blur-md border border-red-700/50";
    if (theme === "dark") return "bg-black/40 backdrop-blur-md border border-gray-700/50";
    if (theme === "kawaii") return "bg-white/60 backdrop-blur-md border border-pink-200/50";
    return "bg-white/60 backdrop-blur-md border border-gray-300/50";
  };

  const getTextColor = () => {
    if (theme === "dark" || theme === "botanical") return "text-white";
    return "text-gray-900";
  };

  const getInputClasses = () => {
    if (theme === "dark" || theme === "botanical") {
      return "bg-white/10 text-white border-white/20 placeholder:text-white/50";
    }
    return "bg-white text-gray-900 border-gray-300";
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl p-6 shadow-xl border ${getThemedClasses()}`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${getTextColor()}`}>Quick Log</h2>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-opacity hover:opacity-70 ${getTextColor()}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <textarea
          value={inputMessage}
          onChange={e => setInputMessage(e.target.value)}
          placeholder="What would you like to log about your plants?"
          className={`w-full h-32 rounded-xl p-3 border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 ${getInputClasses()}`}
        />

        <div className="flex gap-2">
          <button
            onClick={handleVoiceRecord}
            disabled={isProcessing && !isRecording}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all disabled:opacity-50 ${
              isRecording
                ? "bg-red-500 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {isRecording ? (
              <Square className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
            {isRecording ? "Stop" : "Record"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isProcessing || !inputMessage.trim()}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-semibold transition-all"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Log"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}