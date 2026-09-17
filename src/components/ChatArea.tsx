import React, { useState, useRef, useEffect } from "react";
import { User, Contact, Message, MessageType } from "../types";
import { VoiceRecorder } from "./VoiceRecorder";
import { VideoMessageRecorder } from "./VideoMessageRecorder";
import { LocationPickerModal } from "./LocationPickerModal";
import {
  Video,
  Phone,
  Paperclip,
  Mic,
  Video as VideoIcon,
  MapPin,
  Send,
  Sparkles,
  FileText,
  Download,
  Play,
  Pause,
  Languages,
  CheckCheck,
  Check,
  Smile,
  ExternalLink,
  MoreVertical,
  Volume2,
  VolumeX,
  Maximize2,
  ArrowLeft,
  LogOut,
  Users,
  Copy,
  Share2,
  Trash2,
  Image as ImageIcon,
  Flame,
  Heart,
  X,
  Search,
} from "lucide-react";

interface ChatAreaProps {
  currentUser: User;
  activeContact: Contact | null;
  contacts?: Contact[];
  messages: Message[];
  onSendMessage: (
    type: MessageType,
    content: string,
    metadata?: any
  ) => void;
  onStartCall: (callType: "video" | "audio") => void;
  onOpenGeminiDrawer: () => void;
  onLogout?: () => void;
  onBack?: () => void;
  onRefreshMessages?: () => void;
  onToggleContactsSidebar?: () => void;
  isSplitView?: boolean;
}

// Telegram-Style Interactive Circular Video Note Component
const VideoNoteBubble: React.FC<{
  src: string;
  duration?: number;
  isMe: boolean;
}> = ({ src, duration = 1, isMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  return (
    <div className="flex flex-col items-center select-none py-1">
      <div
        onClick={togglePlay}
        className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full overflow-hidden border-3 border-white shadow-xl bg-black cursor-pointer group shrink-0"
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          onTimeUpdate={() => {
            if (videoRef.current && videoRef.current.duration) {
              setProgress(
                (videoRef.current.currentTime / videoRef.current.duration) * 100
              );
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(0);
          }}
          className="w-full h-full object-cover"
        />

        {/* Circular SVG Progress Ring */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="48%"
            fill="none"
            stroke="#f97316"
            strokeWidth="4"
            strokeDasharray="300"
            strokeDashoffset={300 - (progress / 100) * 300}
            className="transition-all duration-150"
          />
        </svg>

        {/* Play/Pause Center Overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs group-hover:bg-black/50 transition-all">
            <div className="w-12 h-12 rounded-full bg-orange-500/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-6 h-6 fill-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Controls on hover / active */}
        <div className="absolute bottom-2.5 inset-x-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-full bg-black/70 text-white hover:bg-black/90 cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(true);
            }}
            className="p-1.5 rounded-full bg-black/70 text-white hover:bg-black/90 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <span className="text-[10px] mt-1.5 opacity-80 font-medium">
        Video Clip ({duration}s)
      </span>

      {/* Expanded Modal View if user clicks expand */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setIsFullscreen(false);
          }}
        >
          <div className="relative max-w-lg w-full rounded-2xl overflow-hidden bg-black shadow-2xl">
            <video
              src={src}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};

const POPULAR_GIFS = [
  { id: "g1", title: "Thumbs Up", category: "Agree", url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif" },
  { id: "g2", title: "Party Celebration", category: "Party", url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif" },
  { id: "g3", title: "Applause Clapping", category: "Applause", url: "https://media.giphy.com/media/ytTYwIlWYnm6Y/giphy.gif" },
  { id: "g4", title: "Laughing Cat", category: "Funny", url: "https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif" },
  { id: "g5", title: "Mind Blown", category: "Shocked", url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif" },
  { id: "g6", title: "Heart Love", category: "Love", url: "https://media.giphy.com/media/uw0KqTWZPAhu0/giphy.gif" },
  { id: "g7", title: "Dancing Dog", category: "Dance", url: "https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif" },
  { id: "g8", title: "Popcorn Watching", category: "Relax", url: "https://media.giphy.com/media/t3dLl0TGHCxTG/giphy.gif" },
  { id: "g9", title: "Yes Absolutely", category: "Agree", url: "https://media.giphy.com/media/nXxOjZrbnbRxS/giphy.gif" },
  { id: "g10", title: "Facepalm", category: "Funny", url: "https://media.giphy.com/media/WrNfErAnGV7lm/giphy.gif" },
  { id: "g11", title: "High Five", category: "Party", url: "https://media.giphy.com/media/pHb82xtBPfqEg/giphy.gif" },
  { id: "g12", title: "Fire Awesome", category: "Cool", url: "https://media.giphy.com/media/3o72FfM5HJydzafgUE/giphy.gif" },
  { id: "g13", title: "Crying Laughing", category: "Funny", url: "https://media.giphy.com/media/ltIFdjNAasOwVvKhvx/giphy.gif" },
  { id: "g14", title: "Great Job", category: "Applause", url: "https://media.giphy.com/media/3oEjI5VtIhHvK37WYo/giphy.gif" },
  { id: "g15", title: "Coffee Sip", category: "Relax", url: "https://media.giphy.com/media/hPTZgtzfRIB5Nfb5rL/giphy.gif" },
  { id: "g16", title: "Shocked Face", category: "Shocked", url: "https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif" },
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentUser,
  activeContact,
  contacts = [],
  messages = [],
  onSendMessage,
  onStartCall,
  onOpenGeminiDrawer,
  onLogout,
  onBack,
  onRefreshMessages,
  onToggleContactsSidebar,
  isSplitView = false,
}) => {
  const safeMessages = messages || [];
  const [inputText, setInputText] = useState("");
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [isTranslating, setIsTranslating] = useState<string | null>(null);
  const [translatedMap, setTranslatedMap] = useState<Record<string, string>>({});
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // Message Actions state (Long hold / Right-click)
  const [selectedMessageForAction, setSelectedMessageForAction] = useState<Message | null>(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardSearch, setForwardSearch] = useState("");
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [gifCategory, setGifCategory] = useState("All");
  const [copiedToast, setCopiedToast] = useState(false);
  const longPressTimerRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Long press detection handlers
  const handleTouchStart = (msg: Message) => {
    if (msg.isDeletedForEveryone) return;
    longPressTimerRef.current = setTimeout(() => {
      setSelectedMessageForAction(msg);
      if ("vibrate" in navigator) {
        try {
          navigator.vibrate(50);
        } catch (e) {}
      }
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMessageReaction = async (msgId: string, emoji: string) => {
    try {
      await fetch(`/api/messages/${msgId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, emoji }),
      });
      setSelectedMessageForAction(null);
      if (onRefreshMessages) onRefreshMessages();
    } catch (e) {
      console.warn("Reaction error:", e);
    }
  };

  const handleCopyMessage = (content: string) => {
    try {
      navigator.clipboard.writeText(content);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    } catch (e) {}
    setSelectedMessageForAction(null);
  };

  const handleDeleteForMe = async (msgId: string) => {
    try {
      await fetch(`/api/messages/${msgId}/delete-me`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      setSelectedMessageForAction(null);
      if (onRefreshMessages) onRefreshMessages();
    } catch (e) {}
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    try {
      await fetch(`/api/messages/${msgId}?userId=${currentUser.id}`, {
        method: "DELETE",
      });
      setSelectedMessageForAction(null);
      if (onRefreshMessages) onRefreshMessages();
    } catch (e) {}
  };

  const handleForwardTo = async (target: Contact) => {
    if (!selectedMessageForAction) return;
    try {
      await fetch("/api/messages/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalMessageId: selectedMessageForAction.id,
          senderId: currentUser.id,
          targetUserId: target.isGroup ? undefined : target.id,
          targetGroupId: target.isGroup ? target.id : undefined,
        }),
      });
      setIsForwardModalOpen(false);
      setSelectedMessageForAction(null);
      if (onRefreshMessages) onRefreshMessages();
    } catch (e) {}
  };

  const handleSendGif = (gifUrl: string, title: string) => {
    onSendMessage("file", gifUrl, {
      fileName: `${title}.gif`,
      fileType: "image/gif",
    });
    setIsGifPickerOpen(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Audio Playback Helper
  const handleTogglePlayAudio = (msgId: string, audioUrl: string) => {
    if (playingAudioId === msgId) {
      audioPlayerRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => setPlayingAudioId(null);
      audio.play();
      setPlayingAudioId(msgId);
    }
  };

  // Send Text Message
  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage("text", inputText.trim());
    setInputText("");
  };

  // Handle File Attachment
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onSendMessage("file", reader.result, {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Translate Message with Gemini AI
  const handleTranslateMessage = async (msgId: string, text: string) => {
    setIsTranslating(msgId);
    try {
      const resp = await fetch("/api/gemini/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage: "Spanish" }),
      });
      const data = await resp.json();
      setTranslatedMap((prev) => ({ ...prev, [msgId]: data.translated }));
    } catch (e) {
      // Failed translation
    } finally {
      setIsTranslating(null);
    }
  };

  if (!activeContact) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50/20 via-orange-50/20 to-white p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 p-5 text-white shadow-xl shadow-orange-500/20 flex items-center justify-center mb-6">
          <Sparkles className="w-10 h-10 animate-pulse" />
        </div>
        <h2 className="text-2xl font-extrabold text-neutral-900 font-['Outfit',sans-serif]">
          Select a Conversation or Add a Contact
        </h2>
        <p className="mt-2 text-sm text-neutral-600 max-w-md">
          Connect directly via high definition WebRTC video calls, voice messages, screen sharing, and in-built Gemini AI assistance.
        </p>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <button
            onClick={onOpenGeminiDrawer}
            className="px-5 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-xs shadow-md shadow-orange-500/20 hover:bg-orange-600 cursor-pointer flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Talk with Gemini AI</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="active-chat-area" className="flex-1 h-full flex flex-col bg-white overflow-hidden">
      {/* Active Contact Header */}
      <div className="p-3 sm:p-3.5 border-b border-orange-100 flex items-center justify-between bg-white z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              id="chat-back-to-contacts-btn"
              type="button"
              onClick={onBack}
              title="Back to contacts list"
              className="md:hidden p-2 -ml-1 rounded-xl text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="relative shrink-0">
            <img
              src={activeContact.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
              alt={activeContact.fullName}
              className="w-10 h-10 rounded-full object-cover border-2 border-orange-400"
            />
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                activeContact.status === "online"
                  ? "bg-emerald-500"
                  : activeContact.status === "in-call"
                  ? "bg-amber-500"
                  : "bg-neutral-300"
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-neutral-900">{activeContact.fullName}</h3>
              <span className="text-xs font-semibold text-orange-600">
                {activeContact.isGroup ? "Group" : `@${activeContact.username}`}
              </span>
            </div>
            <p className="text-[11px] text-neutral-600 flex items-center gap-1.5">
              {activeContact.isGroup ? (
                <>
                  <Users className="w-3.5 h-3.5 text-orange-500" />
                  <span>{activeContact.groupData?.memberIds?.length || 3} members in group</span>
                </>
              ) : (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      activeContact.status === "online" ? "bg-emerald-500" : "bg-neutral-400"
                    }`}
                  />
                  <span className="capitalize">{activeContact.status}</span>
                  <span>• WebRTC Ready</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Call & AI Action Buttons */}
        <div className="flex items-center gap-2">
          {onToggleContactsSidebar && (
            <button
              id="chat-toggle-contacts-btn"
              type="button"
              onClick={onToggleContactsSidebar}
              title="Toggle Contacts List"
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <Users className="w-4 h-4 text-orange-600" />
              <span className="hidden sm:inline">Contacts</span>
            </button>
          )}

          {!activeContact.isGroup && (
            <>
              {/* Voice Call Button */}
              <button
                id="start-voice-call-btn"
                onClick={() => onStartCall("audio")}
                title="Start P2P Voice Call"
                className="p-2 sm:px-3 sm:py-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-700 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <Phone className="w-4 h-4 text-orange-600" />
                <span className="hidden sm:inline">Call</span>
              </button>

              {/* Video Call Button */}
              <button
                id="start-video-call-btn"
                onClick={() => onStartCall("video")}
                title="Start P2P Video Call"
                className="p-2 sm:px-3 sm:py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <Video className="w-4 h-4" />
                <span className="hidden sm:inline">Video</span>
              </button>
            </>
          )}

          {/* Gemini AI Assistant Drawer Toggle */}
          <button
            id="chat-gemini-assistant-btn"
            onClick={onOpenGeminiDrawer}
            title="Open Gemini AI Assistant"
            className="p-2.5 rounded-xl bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-orange-500" />
          </button>

          {/* Optional Direct Log Out button */}
          {onLogout && (
            <button
              onClick={onLogout}
              title="Sign out of account"
              className="p-2.5 rounded-xl border border-neutral-200 text-neutral-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message Stream */}
      <div
        id="messages-viewport"
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-orange-50/10 via-amber-50/5 to-white"
      >
        {safeMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-neutral-400 p-6">
            <div className="w-12 h-12 rounded-2xl bg-orange-100/60 text-orange-500 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-neutral-600">No messages yet</p>
            <p className="text-[11px] text-neutral-400 mt-1 max-w-xs">
              Send a text, record a voice clip, snap a video message, send a GIF, or start a direct WebRTC call!
            </p>
          </div>
        ) : (
          safeMessages.map((msg) => {
            const isMe = msg.senderId === currentUser.id;
            const translatedText = translatedMap[msg.id];
            const isDeleted = !!msg.isDeletedForEveryone;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"} select-none`}
              >
                <div
                  onTouchStart={() => handleTouchStart(msg)}
                  onTouchEnd={handleTouchEnd}
                  onMouseDown={() => handleTouchStart(msg)}
                  onMouseUp={handleTouchEnd}
                  onMouseLeave={handleTouchEnd}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isDeleted) setSelectedMessageForAction(msg);
                  }}
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 shadow-xs relative group cursor-pointer transition-shadow hover:shadow-md ${
                    isDeleted
                      ? "bg-neutral-100 text-neutral-500 border border-neutral-200"
                      : isMe
                      ? "bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 text-white rounded-tr-none"
                      : "bg-white border border-orange-100/90 text-neutral-900 rounded-tl-none"
                  }`}
                >
                  {/* Action 3-dots button on hover */}
                  {!isDeleted && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMessageForAction(msg);
                      }}
                      title="Message options (hold or click)"
                      className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 right-2 p-1 rounded-full bg-white text-neutral-700 shadow-md border border-neutral-200 hover:bg-orange-50 hover:text-orange-600 cursor-pointer z-10"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Forwarded Header Indicator */}
                  {msg.isForwarded && (
                    <div className="text-[10px] italic opacity-85 mb-1 flex items-center gap-1 font-semibold">
                      <Share2 className="w-2.5 h-2.5" />
                      <span>Forwarded</span>
                    </div>
                  )}

                  {/* DELETED MESSAGE PLACEHOLDER */}
                  {isDeleted ? (
                    <div className="text-xs italic py-1 flex items-center gap-1.5 opacity-80">
                      <Trash2 className="w-3.5 h-3.5 text-neutral-400" />
                      <span>This message was deleted</span>
                    </div>
                  ) : (
                    <>
                      {/* TEXT MESSAGE */}
                      {msg.type === "text" && (
                        <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.content}
                        </div>
                      )}

                      {/* VOICE MESSAGE */}
                      {msg.type === "voice" && (
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePlayAudio(msg.id, msg.content);
                            }}
                            className={`p-2.5 rounded-full transition-transform cursor-pointer ${
                              isMe ? "bg-white text-orange-600 hover:scale-105" : "bg-orange-500 text-white hover:bg-orange-600"
                            }`}
                          >
                            {playingAudioId === msg.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" />
                            )}
                          </button>

                          <div className="flex-1">
                            {/* Audio waveform mockup */}
                            <div className="flex items-center gap-1 h-6">
                              {[30, 80, 45, 90, 60, 100, 75, 40, 85, 50, 95, 65, 30].map((h, idx) => (
                                <div
                                  key={idx}
                                  className={`w-1 rounded-full ${
                                    isMe ? "bg-white/80" : "bg-orange-500"
                                  } ${playingAudioId === msg.id ? "animate-pulse" : ""}`}
                                  style={{ height: `${h}%` }}
                                />
                              ))}
                            </div>
                            <div className="flex items-center justify-between text-[10px] mt-1 opacity-80">
                              <span>Voice Message</span>
                              <span>{msg.metadata?.duration || 1}s</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* VIDEO MESSAGE NOTE */}
                      {msg.type === "video" && (
                        <VideoNoteBubble
                          src={msg.content}
                          duration={msg.metadata?.duration}
                          isMe={isMe}
                        />
                      )}

                      {/* FILE / GIF ATTACHMENT */}
                      {msg.type === "file" && (
                        msg.metadata?.fileType?.startsWith("image/") ||
                        msg.content.startsWith("data:image/") ||
                        msg.content.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) ? (
                          <div className="rounded-xl overflow-hidden max-w-[280px]">
                            <img
                              src={msg.content}
                              alt={msg.metadata?.fileName || "Media GIF"}
                              className="w-full max-h-64 object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity bg-neutral-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(msg.content, "_blank");
                              }}
                            />
                            {msg.metadata?.fileName && (
                              <p className="text-[10px] mt-1 opacity-75 truncate">
                                {msg.metadata.fileName}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 min-w-[200px]">
                            <div
                              className={`p-2.5 rounded-xl ${
                                isMe ? "bg-white/20 text-white" : "bg-orange-100 text-orange-600"
                              }`}
                            >
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">
                                {msg.metadata?.fileName || "Attached File"}
                              </p>
                              <p className="text-[10px] opacity-75">
                                {msg.metadata?.fileSize
                                  ? `${(msg.metadata.fileSize / (1024 * 1024)).toFixed(2)} MB`
                                  : "File document"}
                              </p>
                            </div>
                            <a
                              href={msg.content}
                              download={msg.metadata?.fileName || "attachment"}
                              onClick={(e) => e.stopPropagation()}
                              className={`p-2 rounded-lg transition-colors ${
                                isMe ? "hover:bg-white/20 text-white" : "hover:bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        )
                      )}

                      {/* LOCATION ATTACHMENT */}
                      {msg.type === "location" && (
                        <div className="min-w-[230px] rounded-xl overflow-hidden">
                          <div className="h-28 bg-neutral-200 relative overflow-hidden rounded-lg">
                            <iframe
                              title="Location View"
                              width="100%"
                              height="100%"
                              frameBorder="0"
                              scrolling="no"
                              src={`https://www.openstreetmap.org/export/embed.html?bbox=${(msg.metadata?.longitude || 0) - 0.008}%2C${(msg.metadata?.latitude || 0) - 0.008}%2C${(msg.metadata?.longitude || 0) + 0.008}%2C${(msg.metadata?.latitude || 0) + 0.008}&layer=mapnik&marker=${msg.metadata?.latitude}%2C${msg.metadata?.longitude}`}
                              className="w-full h-full pointer-events-none"
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-red-400" />
                                <span>{msg.metadata?.address || "Shared Location"}</span>
                              </p>
                              <p className="text-[10px] opacity-75">
                                {msg.metadata?.latitude?.toFixed(4)}, {msg.metadata?.longitude?.toFixed(4)}
                              </p>
                            </div>
                            <a
                              href={`https://www.google.com/maps?q=${msg.metadata?.latitude},${msg.metadata?.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-md hover:bg-black/10 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Translated view if triggered */}
                      {translatedText && (
                        <div className="mt-2 pt-2 border-t border-white/20 text-xs italic">
                          <span className="text-[10px] uppercase font-bold text-amber-200 block mb-0.5">
                            Spanish (Gemini AI):
                          </span>
                          {translatedText}
                        </div>
                      )}
                    </>
                  )}

                  {/* Message Footer: Time + Read Checkmarks */}
                  <div
                    className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${
                      isMe ? "text-white/80" : "text-neutral-400"
                    }`}
                  >
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isMe && !isDeleted && (
                      <span>
                        {msg.read ? (
                          <CheckCheck className="w-3 h-3 text-emerald-300" />
                        ) : (
                          <Check className="w-3 h-3 text-white/60" />
                        )}
                      </span>
                    )}

                    {/* Gemini Translate Quick Action button on hover */}
                    {msg.type === "text" && !isDeleted && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTranslateMessage(msg.id, msg.content);
                        }}
                        title="Translate with Gemini AI"
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 cursor-pointer hover:text-amber-300"
                      >
                        <Languages className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Message Reactions Display */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-white/15">
                      {Object.entries(
                        Object.values(msg.reactions).reduce((acc: Record<string, number>, em: string) => {
                          acc[em] = (acc[em] || 0) + 1;
                          return acc;
                        }, {})
                      ).map(([em, cnt]) => {
                        const isMyReaction = msg.reactions?.[currentUser.id] === em;
                        return (
                          <button
                            key={em}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMessageReaction(msg.id, em);
                            }}
                            className={`px-1.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 cursor-pointer transition-transform active:scale-90 ${
                              isMyReaction
                                ? "bg-white text-neutral-900 font-bold shadow-xs ring-1 ring-orange-400"
                                : isMe
                                ? "bg-black/20 text-white"
                                : "bg-orange-100 text-orange-800"
                            }`}
                          >
                            <span>{em}</span>
                            <span className="text-[10px]">{cnt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Action Panel */}
      <div className="p-3 bg-white border-t border-orange-100">
        {/* Voice Recorder Active Bar */}
        {isRecordingVoice ? (
          <VoiceRecorder
            onSendVoiceMessage={(audioData, duration) => {
              onSendMessage("voice", audioData, { duration });
              setIsRecordingVoice(false);
            }}
            onCancel={() => setIsRecordingVoice(false)}
          />
        ) : (
          <form onSubmit={handleSendText} className="flex items-center gap-2">
            {/* Attachment Actions Menu */}
            <div className="flex items-center gap-1">
              {/* File Attachment */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach Document / Media"
                className="p-2 rounded-xl text-neutral-500 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* GIF Picker Button */}
              <button
                id="open-gif-picker-btn"
                type="button"
                onClick={() => setIsGifPickerOpen(true)}
                title="Send Animated GIF"
                className="p-1.5 px-2 rounded-xl text-neutral-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer flex items-center gap-1"
              >
                <span className="font-extrabold text-[11px] tracking-tight px-1 py-0.5 rounded bg-amber-100 text-amber-800">
                  GIF
                </span>
              </button>

              {/* Location Attachment */}
              <button
                type="button"
                onClick={() => setIsPickingLocation(true)}
                title="Attach GPS Location"
                className="p-2 rounded-xl text-neutral-500 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <MapPin className="w-4 h-4" />
              </button>

              {/* Video Message Recorder */}
              <button
                type="button"
                onClick={() => setIsRecordingVideo(true)}
                title="Record Video Message"
                className="p-2 rounded-xl text-neutral-500 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <VideoIcon className="w-4 h-4" />
              </button>

              {/* Voice Message Recorder */}
              <button
                type="button"
                onClick={() => setIsRecordingVoice(true)}
                title="Record Voice Message"
                className="p-2 rounded-xl text-neutral-500 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>

            {/* Text Message Input */}
            <input
              id="message-input-field"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Message @${activeContact.username}...`}
              className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 text-xs sm:text-sm text-neutral-900 outline-hidden transition-all"
            />

            {/* Send Button */}
            <button
              id="send-message-btn"
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-90 disabled:opacity-40 text-white shadow-xs cursor-pointer active:scale-95 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Video Message Modal */}
      {isRecordingVideo && (
        <VideoMessageRecorder
          onSendVideoMessage={(videoData, duration) => {
            onSendMessage("video", videoData, { duration });
            setIsRecordingVideo(false);
          }}
          onCancel={() => setIsRecordingVideo(false)}
        />
      )}

      {/* Location Picker Modal */}
      {isPickingLocation && (
        <LocationPickerModal
          onSendLocation={(loc) => {
            onSendMessage("location", "Shared Location", {
              latitude: loc.latitude,
              longitude: loc.longitude,
              address: loc.address,
            });
            setIsPickingLocation(false);
          }}
          onClose={() => setIsPickingLocation(false)}
        />
      )}

      {/* Message Action Sheet / Context Menu Modal */}
      {selectedMessageForAction && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-3 animate-in fade-in"
          onClick={() => setSelectedMessageForAction(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-4 shadow-2xl border border-orange-100 animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quick Emoji Reactions Bar */}
            <div className="flex items-center justify-between p-2 rounded-2xl bg-orange-50/70 border border-orange-100 mb-3 overflow-x-auto">
              {["❤️", "👍", "😂", "😮", "😢", "🙏", "🔥", "🎉"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleMessageReaction(selectedMessageForAction.id, emoji)}
                  className="text-2xl p-1.5 rounded-xl hover:scale-125 transition-transform cursor-pointer active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Action Items */}
            <div className="space-y-1">
              {/* Copy Message */}
              <button
                type="button"
                onClick={() => handleCopyMessage(selectedMessageForAction.content)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-neutral-100 text-neutral-800 text-sm font-semibold cursor-pointer transition-colors"
              >
                <Copy className="w-4 h-4 text-neutral-500" />
                <span>Copy Message</span>
              </button>

              {/* Forward Message */}
              <button
                type="button"
                onClick={() => setIsForwardModalOpen(true)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-neutral-100 text-neutral-800 text-sm font-semibold cursor-pointer transition-colors"
              >
                <Share2 className="w-4 h-4 text-orange-500" />
                <span>Forward Message</span>
              </button>

              {/* Delete for Myself */}
              <button
                type="button"
                onClick={() => handleDeleteForMe(selectedMessageForAction.id)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-neutral-100 text-neutral-800 text-sm font-semibold cursor-pointer transition-colors"
              >
                <Trash2 className="w-4 h-4 text-neutral-500" />
                <span>Delete for Myself</span>
              </button>

              {/* Delete for Everyone (Sender or Super Admin) */}
              {(selectedMessageForAction.senderId === currentUser.id ||
                currentUser.role === "superadmin" ||
                currentUser.email.toLowerCase() === "hashir0047@gmail.com") && (
                <button
                  type="button"
                  onClick={() => handleDeleteForEveryone(selectedMessageForAction.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-red-50 text-red-600 text-sm font-semibold cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                  <span>Delete for Everyone</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {isForwardModalOpen && selectedMessageForAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setIsForwardModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-orange-100 flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-orange-100">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-orange-500" />
                <span>Forward Message</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsForwardModalOpen(false)}
                className="p-1 rounded-xl text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                placeholder="Search contacts & groups..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-neutral-100 text-xs text-neutral-900 border border-transparent focus:border-orange-400 focus:bg-white outline-hidden"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 divide-y divide-neutral-100">
              {contacts
                .filter((c) =>
                  c.fullName.toLowerCase().includes(forwardSearch.toLowerCase()) ||
                  c.username.toLowerCase().includes(forwardSearch.toLowerCase())
                )
                .map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleForwardTo(contact)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-orange-50 transition-colors text-left cursor-pointer"
                  >
                    <img
                      src={contact.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
                      alt={contact.fullName}
                      className="w-10 h-10 rounded-full object-cover border border-orange-200"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-neutral-900 truncate">{contact.fullName}</p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {contact.isGroup ? "Group" : `@${contact.username}`}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-orange-500 text-white text-[11px] font-bold shadow-xs">
                      Send
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* GIF Picker Modal */}
      {isGifPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-3 animate-in fade-in"
          onClick={() => setIsGifPickerOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-4 shadow-2xl border border-orange-100 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-orange-100">
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 rounded bg-amber-500 text-white font-extrabold text-xs">
                  GIF
                </div>
                <h3 className="text-sm font-bold text-neutral-900">Send Animated GIF</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGifPickerOpen(false)}
                className="p-1 rounded-xl text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="my-3 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={gifSearchQuery}
                onChange={(e) => setGifSearchQuery(e.target.value)}
                placeholder="Search GIFs (e.g. party, cat, dance, laugh)..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-neutral-100 text-xs text-neutral-900 border border-transparent focus:border-orange-400 focus:bg-white outline-hidden"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {["All", "Agree", "Party", "Applause", "Funny", "Love", "Dance", "Relax", "Shocked", "Cool"].map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setGifCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      gifCategory === cat
                        ? "bg-orange-500 text-white shadow-xs"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>

            {/* GIF Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 p-1 max-h-80">
              {POPULAR_GIFS.filter((g) => {
                const matchCat = gifCategory === "All" || g.category.toLowerCase() === gifCategory.toLowerCase();
                const matchQuery =
                  !gifSearchQuery ||
                  g.title.toLowerCase().includes(gifSearchQuery.toLowerCase()) ||
                  g.category.toLowerCase().includes(gifSearchQuery.toLowerCase());
                return matchCat && matchQuery;
              }).map((gif) => (
                <div
                  key={gif.id}
                  onClick={() => handleSendGif(gif.url, gif.title)}
                  className="group relative rounded-2xl overflow-hidden cursor-pointer border border-neutral-100 hover:border-orange-400 hover:shadow-md transition-all aspect-video bg-neutral-100"
                >
                  <img
                    src={gif.url}
                    alt={gif.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-[10px] font-bold text-white truncate">{gif.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Copied Toast */}
      {copiedToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold shadow-xl animate-in fade-in slide-in-from-bottom-2">
          Message copied to clipboard!
        </div>
      )}
    </div>
  );
};
