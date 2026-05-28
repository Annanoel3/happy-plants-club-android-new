import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { VoiceRecorder } from "capacitor-voice-recorder";

export default function QuickLogModal({ isOpen, onClose, theme }) {
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const handleVoiceRecord = async () => {
    console.log("🎤 handleVoiceRecord called, isRecording:", isRecording);
    if (!isRecording) {
      try {
        // Request microphone permission on native mobile
        if (typeof window.Capacitor !== 'undefined') {
          console.log("📱 Running on Capacitor, requesting microphone permission");
          try {
            const permission = await window.Capacitor.Plugins.Microphone.requestPermissions();
            console.log("✅ Permission result:", permission);
          } catch (permError) {
            console.error("⚠️ Permission request failed:", permError.message);
          }
        }
        
        console.log("🎤 Calling VoiceRecorder.startRecording()");
        await VoiceRecorder.startRecording();
        console.log("✅ Recording started successfully");
        setIsRecording(true);
        toast.success("Recording started...");
      } catch (error) {
        console.error("❌ Recording error:", error);
        console.error("Error details:", error.message, error.stack);
        toast.error("Failed to start recording: " + error.message);
      }
    } else {
      try {
        console.log("🎤 Calling VoiceRecorder.stopRecording()");
        const result = await VoiceRecorder.stopRecording();
        console.log("✅ Recording stopped, result:", result);
        setIsRecording(false);

        if (result.value?.recordDataBase64) {
          setIsProcessing(true);
          try {
            console.log("📦 Base64 data length:", result.value.recordDataBase64.length);
            // Convert base64 to blob
            const binaryString = atob(result.value.recordDataBase64);
            console.log("🔄 Binary string length:", binaryString.length);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: 'audio/webm' });
            console.log("💾 Blob created, size:", audioBlob.size);
            
            // Create File object and upload
            const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
            const { file_url } = await base44.integrations.Core.UploadFile({
              file: audioFile,
            });
            
            // Transcribe from stored file (backend will transcode)
            const transcribeResponse = await base44.functions.invoke("transcribeAudio", {
              file_url,
            });
            const transcript = transcribeResponse.data.transcript;
            const { data } = await base44.functions.invoke("processPlantCareLog", { transcript });
            toast.success(data?.summary || "Log saved!");
            setInputMessage("");
            onClose();
          } catch (error) {
            console.error("❌ Error processing audio:", error.message);
            toast.error("Failed to process audio: " + error.message);
            setIsProcessing(false);
          }
        } else {
          toast.error("No audio recorded");
        }
      } catch (error) {
        console.error("❌ Stop recording error:", error.message);
        setIsRecording(false);
        setIsProcessing(false);
        toast.error("Failed to process voice: " + error.message);
      }
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
            disabled={isProcessing || typeof window.Capacitor === 'undefined'}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
              isRecording
                ? "bg-red-500 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            } ${typeof window.Capacitor === 'undefined' ? 'opacity-50 cursor-not-allowed' : ''}`}
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