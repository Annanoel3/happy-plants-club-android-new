import React, { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { setMicActive } from "@/lib/admob";

export default function QuickLogModal({ isOpen, onClose, theme }) {
  const queryClient = useQueryClient();
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [clarificationMode, setClarificationMode] = useState(null); // { prompt, partial_result }
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Permissions } = Capacitor.Plugins;
        Permissions.requestPermissions({ permissions: ['microphone'] });
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

        recorder.ondataavailable = (e) => { chunks.push(e.data); };

        recorder.onstop = async () => {
          const mimeType = recorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(chunks, { type: mimeType });
          stream.getTracks().forEach(track => track.stop());
          await processAudio(audioBlob, mimeType);
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

  const processAudio = async (audioBlob, mimeType = 'audio/webm') => {
    setIsProcessing(true);
    setInputMessage("🎙️ Transcribing...");
    try {
      const ext = (mimeType.includes('mp4') || mimeType.includes('aac')) ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const filename = 'recording.' + ext;
      const audioFile = new File([audioBlob], filename, { type: mimeType });
      const { file_url } = await base44.integrations.Core.UploadFile({ file: audioFile });

      const transcribeResponse = await base44.functions.invoke("transcribeAudio", { file_url, filename });
      const transcript = transcribeResponse.data.transcript;
      // Optimistic: show transcript immediately before processing
      setInputMessage(transcript);
      await submitTranscript(transcript);
    } catch (error) {
      console.error("Error processing audio:", error);
      setInputMessage("");
      toast.error("Failed to process audio: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const submitTranscript = async (transcript) => {
    const { data } = await base44.functions.invoke("processPlantCareLog", { transcript });
    console.log('[QuickLogModal] processPlantCareLog result:', JSON.stringify(data || 'no data').substring(0, 200));

    if (data?.needs_clarification) {
      // AI needs to ask for a time
      setClarificationMode({ prompt: data.clarification_prompt, partial_result: data.partial_result, original_transcript: transcript });
      setInputMessage("");
    } else {
       toast.success(data?.summary || "Log saved!");
       queryClient.invalidateQueries({ queryKey: ['plants'] });
       setInputMessage("");
       onClose();
     }
  };

  const handleSubmit = async () => {
    if (!inputMessage.trim() || isProcessing) return;
    setIsProcessing(true);
    try {
      await submitTranscript(inputMessage);
    } catch (error) {
      console.error("Error saving log:", error);
      toast.error("Failed to save log");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClarificationSubmit = async () => {
    if (!clarificationAnswer.trim() || isProcessing) return;
    setIsProcessing(true);
    try {
      // Re-submit combined transcript with the time answer
      const combined = `${clarificationMode.original_transcript}. The time for the reminder is: ${clarificationAnswer}`;
      await submitTranscript(combined);
      setClarificationMode(null);
      setClarificationAnswer("");
    } catch (error) {
      console.error("Clarification error:", error);
      toast.error("Failed to process: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setClarificationMode(null);
    setClarificationAnswer("");
    setInputMessage("");
    onClose();
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
      onClick={handleClose}
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
          <h2 className={`text-xl font-bold ${getTextColor()}`}>
            {clarificationMode ? "One more thing..." : "Quick Log"}
          </h2>
          <button onClick={handleClose} className={`p-1 rounded-lg transition-opacity hover:opacity-70 ${getTextColor()}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {clarificationMode ? (
          <>
            <p className={`text-sm mb-3 ${getTextColor()}`}>{clarificationMode.prompt}</p>
            <input
              type="text"
              value={clarificationAnswer}
              onChange={e => setClarificationAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClarificationSubmit()}
              placeholder="e.g. 5pm, 3:30pm, tomorrow at 9am"
              autoFocus
              className={`w-full rounded-xl p-3 border text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 ${getInputClasses()}`}
            />
            <button
              onClick={handleClarificationSubmit}
              disabled={isProcessing || !clarificationAnswer.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-semibold transition-all"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Set Reminder"}
            </button>
          </>
        ) : (
          <>
            <textarea
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              placeholder="What would you like to log? (e.g. 'I watered the tulips' or 'Remind me to fertilize at 5pm')"
              className={`w-full h-32 rounded-xl p-3 border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 ${getInputClasses()}`}
            />

            <div className="flex gap-2">
              <button
                onClick={handleVoiceRecord}
                disabled={isProcessing && !isRecording}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all disabled:opacity-50 ${
                  isRecording ? "bg-red-500 text-white" : "bg-green-600 hover:bg-green-700 text-white"
                }`}
              >
                {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isRecording ? "Stop" : "Record"}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isProcessing || !inputMessage.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-semibold transition-all"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Log"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}