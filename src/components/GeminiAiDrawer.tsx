import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Mic, MicOff, Volume2, VolumeX, Send, X, Bot, RefreshCw, MessageSquare } from "lucide-react";

interface GeminiAiDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertToChat?: (text: string) => void;
  isSplitView?: boolean;
}

interface AIMessage {
  id: string;
  sender: "user" | "gemini";
  text: string;
  timestamp: number;
}

export const GeminiAiDrawer: React.FC<GeminiAiDrawerProps> = ({
  isOpen,
  onClose,
  onInsertToChat,
  isSplitView = false,
}) => {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: "ai_init",
      sender: "gemini",
      text: "Hello! I am your in-built Gemini AI assistant inside Z-messenger. You can chat with me, ask questions, or toggle voice mode so we can talk out loud! How can I assist you today?",
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedChips, setSuggestedChips] = useState<string[]>([
    "How does WebRTC work in Z-messenger?",
    "Help me draft a friendly catch-up message",
    "Explain screen sharing & host camera mode",
  ]);

  // Voice Interaction Mode ("Ai can talk with us")
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Init Speech Recognition if available in browser
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          handleSendMessage(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      stopSpeaking();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startVoiceInput = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please type your message.");
      return;
    }
    stopSpeaking();
    try {
      setIsListening(true);
      recognitionRef.current.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const speakText = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    stopSpeaking();

    // Clean markdown asterisks or code formatting for cleaner speech
    const cleanSpeech = text.replace(/[*_#`]/g, "").substring(0, 350);
    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || inputText;
    if (!promptToSend.trim() || isLoading) return;

    const userMsg: AIMessage = {
      id: "u_" + Date.now(),
      sender: "user",
      text: promptToSend.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);

    try {
      const resp = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToSend.trim(),
          voiceMode: isVoiceMode,
        }),
      });

      const data = await resp.json();
      const replyText = data.reply || "I am here to help!";

      const aiMsg: AIMessage = {
        id: "ai_" + Date.now(),
        sender: "gemini",
        text: replyText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (data.suggestedReplies && Array.isArray(data.suggestedReplies)) {
        setSuggestedChips(data.suggestedReplies);
      }

      // If voice mode is on or user spoke, speak response aloud!
      if (isVoiceMode || isListening) {
        speakText(replyText);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: "err_" + Date.now(),
          sender: "gemini",
          text: "I encountered an issue connecting. Please ensure your Gemini API key is configured.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="gemini-ai-drawer"
      className={
        isSplitView
          ? "w-full md:w-1/2 h-full bg-white border-l border-orange-200 flex flex-col shrink-0 z-30 shadow-sm"
          : "fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-white border-l border-orange-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      }
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-orange-100 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 p-2 text-white shadow-xs flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
              <span>Z-Assistant</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">
                Gemini 3.8
              </span>
            </h3>
            <p className="text-[11px] text-neutral-500">In-built AI Companion & Voice Talk</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Voice Mode Toggle Button */}
          <button
            id="gemini-voice-mode-toggle"
            type="button"
            onClick={() => {
              const nextMode = !isVoiceMode;
              setIsVoiceMode(nextMode);
              if (!nextMode) stopSpeaking();
            }}
            title={isVoiceMode ? "Disable Voice Talk" : "Enable Voice Talk (Speaks Aloud)"}
            className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              isVoiceMode
                ? "bg-orange-500 text-white shadow-xs"
                : "bg-white border border-orange-200 text-neutral-600 hover:text-orange-600"
            }`}
          >
            {isVoiceMode ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              stopSpeaking();
              onClose();
            }}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Voice Talk banner if enabled */}
      {isVoiceMode && (
        <div className="px-4 py-2 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-200/60 flex items-center justify-between text-xs text-orange-800">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isSpeaking ? "bg-amber-500 animate-ping" : "bg-emerald-500"}`} />
            <span className="font-semibold">
              {isSpeaking ? "Gemini is speaking out loud..." : "Voice Talk active • Tap mic to speak"}
            </span>
          </div>
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="text-[10px] uppercase font-bold text-orange-600 hover:underline cursor-pointer"
            >
              Mute
            </button>
          )}
        </div>
      )}

      {/* Chat Messages Stream */}
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-neutral-50/50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                msg.sender === "user"
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-tr-none"
                  : "bg-white border border-orange-100 text-neutral-800 rounded-tl-none"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>

              {msg.sender === "gemini" && (
                <div className="mt-2 pt-1.5 border-t border-neutral-100 flex items-center justify-between gap-2 text-[10px] text-neutral-400">
                  <button
                    onClick={() => speakText(msg.text)}
                    className="hover:text-orange-600 flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>Speak</span>
                  </button>
                  {onInsertToChat && (
                    <button
                      onClick={() => onInsertToChat(msg.text)}
                      className="hover:text-orange-600 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Use in Chat</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-white border border-orange-100 w-fit text-xs text-neutral-500">
            <Sparkles className="w-4 h-4 text-orange-500 animate-spin" />
            <span>Gemini AI is thinking...</span>
          </div>
        )}
      </div>

      {/* Suggested Follow-up chips */}
      {suggestedChips.length > 0 && (
        <div className="p-2.5 bg-white border-t border-orange-100 flex gap-1.5 overflow-x-auto no-scrollbar">
          {suggestedChips.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSendMessage(chip)}
              className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-800 hover:bg-orange-100 transition-colors cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input controls */}
      <div className="p-3 bg-white border-t border-orange-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          {/* Microphone speech input */}
          <button
            type="button"
            onClick={startVoiceInput}
            title={isListening ? "Listening..." : "Speak to Gemini AI"}
            className={`p-2.5 rounded-xl transition-all cursor-pointer ${
              isListening
                ? "bg-red-500 text-white animate-pulse"
                : "bg-orange-100 text-orange-700 hover:bg-orange-200"
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>

          <input
            id="gemini-input-text"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isListening ? "Listening to your voice..." : "Ask Gemini AI anything..."}
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-neutral-200 focus:border-orange-500 text-xs text-neutral-900 outline-hidden"
          />

          <button
            id="gemini-submit-btn"
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="p-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white transition-all cursor-pointer shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
