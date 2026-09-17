import React, { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video, Volume2 } from "lucide-react";

interface IncomingCallModalProps {
  caller: {
    id: string;
    username: string;
    fullName: string;
    avatar: string;
  };
  callType: "video" | "audio";
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  caller,
  callType,
  onAccept,
  onDecline,
}) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<any>(null);

  // Synthesize realistic phone ring sound with Web Audio API
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const playRingBeep = () => {
          if (ctx.state === "suspended") {
            ctx.resume();
          }
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.frequency.value = 440; // A4
          osc2.frequency.value = 480; // Standard US ringtone frequencies

          osc1.type = "sine";
          osc2.type = "sine";

          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.6);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start();
          osc2.start();
          osc1.stop(ctx.currentTime + 1.6);
          osc2.stop(ctx.currentTime + 1.6);
        };

        playRingBeep();
        ringIntervalRef.current = setInterval(playRingBeep, 3500);
      }
    } catch (e) {
      // Audio autoplay may require user interaction
    }

    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div
        id="incoming-call-dialog"
        className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-orange-500/50 p-6 flex flex-col items-center text-center shadow-2xl text-white"
      >
        <div className="relative mb-5">
          {/* Pulsing ring */}
          <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 opacity-75 blur-md animate-ping" />
          <img
            src={caller.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
            alt={caller.fullName}
            className="w-24 h-24 rounded-full object-cover border-4 border-orange-500 shadow-xl relative z-10"
          />
        </div>

        <h3 className="text-xl font-bold text-white">{caller.fullName}</h3>
        <p className="text-xs text-orange-400 font-semibold mt-0.5">@{caller.username}</p>

        <p className="mt-3 text-xs text-neutral-300 flex items-center gap-1.5 font-medium">
          {callType === "video" ? <Video className="w-4 h-4 text-amber-400" /> : <Phone className="w-4 h-4 text-orange-400" />}
          <span>Incoming WebRTC {callType === "video" ? "Video" : "Voice"} Call...</span>
        </p>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-6 mt-8 w-full">
          {/* Decline */}
          <button
            id="decline-call-btn"
            onClick={onDecline}
            title="Decline Call"
            className="flex flex-col items-center gap-1.5 cursor-pointer group"
          >
            <div className="w-14 h-14 rounded-full bg-red-600 group-hover:bg-red-700 flex items-center justify-center text-white shadow-lg shadow-red-600/30 transition-all active:scale-95">
              <PhoneOff className="w-6 h-6" />
            </div>
            <span className="text-[11px] text-neutral-400 group-hover:text-red-400 font-medium">
              Decline
            </span>
          </button>

          {/* Accept */}
          <button
            id="accept-call-btn"
            onClick={onAccept}
            title="Accept Call"
            className="flex flex-col items-center gap-1.5 cursor-pointer group"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-500 group-hover:bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 transition-all active:scale-95 animate-pulse">
              {callType === "video" ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </div>
            <span className="text-[11px] text-emerald-400 font-bold">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};
