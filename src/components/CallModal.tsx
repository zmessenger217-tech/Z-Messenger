import React, { useState, useEffect, useRef } from "react";
import { CallSession, User } from "../types";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MonitorUp,
  Maximize2,
  Minimize2,
  Users,
  Eye,
  EyeOff,
  Sparkles,
  Volume2,
  VolumeX,
  Radio,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface CallModalProps {
  session: CallSession;
  currentUser: User;
  onEndCall: (durationSeconds: number) => void;
  onSendSignal: (type: string, data?: any) => void;
  incomingSignal?: { type: string; data?: any; fromUserId?: string } | null;
  peerStatus?: "online" | "offline" | "in-call";
}


const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

// Safely adds Opus FEC and high-fidelity bitrate without corrupting SDP
function enhanceOpusVoiceQuality(sdp: string): string {
  if (!sdp) return sdp;
  try {
    const lines = sdp.split("\r\n");
    const mAudioIndex = lines.findIndex((l) => l.startsWith("m=audio"));
    if (mAudioIndex === -1) return sdp;

    // Find opus payload number
    let opusPt = "";
    for (let i = mAudioIndex; i < lines.length; i++) {
      if (lines[i].startsWith("m=video")) break;
      const match = lines[i].match(/^a=rtpmap:(\d+)\s+opus\/48000\/2/i);
      if (match) {
        opusPt = match[1];
        break;
      }
    }

    if (opusPt) {
      const fmtpPrefix = `a=fmtp:${opusPt} `;
      let fmtpFound = false;
      for (let i = mAudioIndex; i < lines.length; i++) {
        if (lines[i].startsWith("m=video")) break;
        if (lines[i].startsWith(fmtpPrefix)) {
          fmtpFound = true;
          let params = lines[i].substring(fmtpPrefix.length);
          if (!params.includes("useinbandfec=1")) params += ";useinbandfec=1";
          if (!params.includes("stereo=1")) params += ";stereo=1";
          if (!params.includes("maxaveragebitrate=")) params += ";maxaveragebitrate=64000";
          lines[i] = `${fmtpPrefix}${params}`;
          break;
        }
      }
      if (!fmtpFound) {
        lines.splice(mAudioIndex + 2, 0, `a=fmtp:${opusPt} minptime=10;useinbandfec=1;stereo=1;maxaveragebitrate=64000`);
      }
    }
    return lines.join("\r\n");
  } catch (e) {
    return sdp;
  }
}

export const CallModal: React.FC<CallModalProps> = ({
  session,
  currentUser,
  onEndCall,
  onSendSignal,
  incomingSignal,
  peerStatus,
}) => {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(session.type === "audio");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteSharingScreen, setIsRemoteSharingScreen] = useState(false);
  const [isHostCameraOnly, setIsHostCameraOnly] = useState(session.isHostCameraOnly);
  const [connectionStatus, setConnectionStatus] = useState<string>("Initializing secure connection...");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [hasRemoteAudio, setHasRemoteAudio] = useState(false);
  const [audioVolumeBars, setAudioVolumeBars] = useState<number[]>([20, 45, 30, 70, 50, 85, 40, 95, 60, 40, 30, 20]);

  // Call status: "calling" (if offline), "ringing" (if online), "connected" (when call is picked up)
  const [isAnswered, setIsAnswered] = useState<boolean>(!session.isInitiator);

  const effectivePeerStatus = peerStatus || session.peerUser.status || "offline";
  const callStateLabel = isAnswered
    ? "Connected"
    : effectivePeerStatus === "online"
    ? "Ringing..."
    : "Calling...";

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<any>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    initCall();

    return () => {
      cleanup();
    };
  }, []);

  // Duration timer runs ONLY after the call is connected/answered
  useEffect(() => {
    if (!isAnswered) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAnswered]);


  // Handle incoming signals (Offer, Answer, ICE candidates, Screen-share, etc.)
  useEffect(() => {
    if (!incomingSignal || !pcRef.current) return;
    const { type, data } = incomingSignal;

    const handleSignal = async () => {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (type === "call-accepted" && session.isInitiator) {
          // If offer was already created, immediately re-send to ensure receiver gets it
          if (pc.localDescription && pc.signalingState === "have-local-offer") {
            onSendSignal("offer", { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
          } else if (pc.signalingState === "stable") {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: session.type === "video",
            });
            const enhancedSdp = enhanceOpusVoiceQuality(offer.sdp || "");
            const finalOffer = { type: offer.type, sdp: enhancedSdp };
            await pc.setLocalDescription(finalOffer);
            onSendSignal("offer", finalOffer);
          }
        } else if (type === "offer" && !session.isInitiator) {
          await pc.setRemoteDescription(new RTCSessionDescription(data));

          // Drain queued ICE candidates
          await drainPendingIceCandidates(pc);

          const answer = await pc.createAnswer();
          const enhancedSdp = enhanceOpusVoiceQuality(answer.sdp || "");
          const finalAnswer = { type: answer.type, sdp: enhancedSdp };
          await pc.setLocalDescription(finalAnswer);
          onSendSignal("answer", finalAnswer);
        } else if (type === "answer" && session.isInitiator) {
          if (pc.signalingState !== "stable") {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            // Drain queued ICE candidates
            await drainPendingIceCandidates(pc);
          }
        } else if (type === "ice-candidate" && data) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data));
            } catch (e) {
              console.warn("Error applying ICE candidate:", e);
            }
          } else {
            pendingIceCandidatesRef.current.push(data);
          }
        } else if (type === "screen-share" && data) {
          setIsRemoteSharingScreen(!!data.isSharing);
        } else if (type === "host-camera-mode" && data) {
          setIsHostCameraOnly(!!data.hostCameraOnly);
        } else if (type === "call-ended" || type === "call-cancelled" || type === "call-declined") {
          cleanup();
          onEndCall(data?.durationSeconds || 0);
        }
      } catch (err) {
        console.warn("WebRTC signal handling warning:", err);
      }
    };

    handleSignal();
  }, [incomingSignal]);

  const drainPendingIceCandidates = async (pc: RTCPeerConnection) => {
    while (pendingIceCandidatesRef.current.length > 0) {
      const cand = pendingIceCandidatesRef.current.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn("Candidate draining error:", e);
        }
      }
    }
  };

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  const setupAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateBars = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Pick 12 frequency points across the array
        const step = Math.floor(bufferLength / 12);
        const bars: number[] = [];
        for (let i = 0; i < 12; i++) {
          const val = dataArray[i * step] || 0;
          const pct = Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
          bars.push(pct);
        }
        setAudioVolumeBars(bars);
        animFrameRef.current = requestAnimationFrame(updateBars);
      };

      updateBars();
    } catch (e) {
      console.warn("Could not start audio visualizer:", e);
    }
  };

  const initCall = async () => {
    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Send local ICE candidates to peer
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateData = event.candidate.toJSON
            ? event.candidate.toJSON()
            : {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                usernameFragment: event.candidate.usernameFragment,
              };
          onSendSignal("ice-candidate", candidateData);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setConnectionStatus("Connected • Studio HD Audio & Video");
        } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          setConnectionStatus("Reconnecting peer-to-peer stream...");
        }
      };

      // Remote stream arrival (Audio & Video)
      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        remoteStreamRef.current = stream;

        // Route to persistent remote audio element
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current
            .play()
            .then(() => {
              setHasRemoteAudio(true);
              setAudioBlocked(false);
            })
            .catch((err) => {
              console.warn("Remote audio play blocked by browser:", err);
              setAudioBlocked(true);
            });
        }

        // Route to remote video element if in video call
        if (remoteVideoRef.current && session.type === "video") {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
        }

        setupAudioVisualizer(stream);
        setConnectionStatus("Connected • HD Audio & Video");
      };

      // High-definition audio & video constraints with mobile fallback
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 2,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video:
            session.type === "video"
              ? {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: { ideal: facingMode },
                }
              : false,
        });
      } catch (mediaErr) {
        // Fallback for devices with restrictive camera resolutions
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: session.type === "video",
        });
      }

      localStreamRef.current = stream;

      if (localVideoRef.current && session.type === "video") {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      // Add local media tracks to PeerConnection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // If initiator, send initial offer (or wait for call-accepted)
      if (session.isInitiator) {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: session.type === "video",
        });
        const enhancedSdp = enhanceOpusVoiceQuality(offer.sdp || "");
        const finalOffer = { type: offer.type, sdp: enhancedSdp };
        await pc.setLocalDescription(finalOffer);
        onSendSignal("offer", finalOffer);
      } else {
        // As receiver, announce readiness
        onSendSignal("call-accepted", { acceptedBy: currentUser.id });
      }
    } catch (err: any) {
      console.warn("Media capture error:", err);
      setConnectionStatus("Local Device Connected");
    }
  };

  // Toggle Microphone
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Camera Video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Flip Mobile Camera (Front / Back)
  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextFacing);

    if (session.type === "video" && localStreamRef.current && pcRef.current) {
      try {
        const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (currentVideoTrack) {
          currentVideoTrack.stop();
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: nextFacing } },
          audio: false,
        });

        const newTrack = newStream.getVideoTracks()[0];
        localStreamRef.current.removeTrack(currentVideoTrack);
        localStreamRef.current.addTrack(newTrack);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }

        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      } catch (err) {
        console.warn("Failed to switch camera:", err);
      }
    }
  };

  // Desktop Screen Sharing with track negotiation & fallback
  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        stopScreenSharing();
      } else {
        // Validate getDisplayMedia availability
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert("Screen sharing is supported on desktop and laptop browsers.");
          return;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" } as any,
          audio: false,
        });

        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
          if (sender && screenTrack) {
            await sender.replaceTrack(screenTrack);
          } else if (screenTrack) {
            pcRef.current.addTrack(screenTrack, screenStream);
            const offer = await pcRef.current.createOffer();
            await pcRef.current.setLocalDescription(offer);
            onSendSignal("offer", { type: offer.type, sdp: offer.sdp });
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Notify remote peer to adapt aspect-ratio
        onSendSignal("screen-share", { isSharing: true });

        // Handle user clicking native browser "Stop sharing" button
        screenTrack.onended = () => {
          stopScreenSharing();
        };

        setIsScreenSharing(true);
      }
    } catch (err) {
      console.warn("Screen sharing cancelled or denied:", err);
    }
  };

  const stopScreenSharing = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    if (localStreamRef.current && pcRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }

    setIsScreenSharing(false);
    onSendSignal("screen-share", { isSharing: false });
  };

  // Host broadcast view option
  const toggleHostCameraOnly = () => {
    const nextState = !isHostCameraOnly;
    setIsHostCameraOnly(nextState);
    onSendSignal("host-camera-mode", { hostCameraOnly: nextState });
  };

  const handleHangup = () => {
    try {
      const sigType = duration > 0 ? "call-ended" : "call-cancelled";
      onSendSignal(sigType, { durationSeconds: duration, callType: session.type });
    } catch (e) {}
    cleanup();
    onEndCall(duration);
  };

  // Manually unlock audio if browser autoplay blocked it
  const handleUnlockAudio = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current
        .play()
        .then(() => setAudioBlocked(false))
        .catch(() => {});
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins < 10 ? "0" : ""}${mins}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      id="webrtc-call-modal"
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white select-none animate-in fade-in duration-200"
    >
      {/* Permanent Audio Playback Element for Both Voice and Video Calls */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: "fixed", top: -9999, left: -9999, width: 1, height: 1, opacity: 0.01, pointerEvents: "none" }}
      />

      {/* Audio Autoplay Unblocker Banner (iOS/Chrome Policy) */}
      {audioBlocked && (
        <div
          onClick={handleUnlockAudio}
          className="absolute top-16 inset-x-4 z-40 p-3 rounded-2xl bg-amber-500 text-neutral-950 font-bold text-xs flex items-center justify-between shadow-2xl cursor-pointer animate-bounce max-w-md mx-auto"
        >
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 shrink-0" />
            <span>Sound paused by browser policy. Tap here to unmute call voice!</span>
          </div>
          <button className="px-2.5 py-1 rounded-lg bg-neutral-950 text-white text-[11px] shrink-0">
            Unmute
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3.5 sm:p-5 bg-gradient-to-b from-black/85 via-black/50 to-transparent">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <img
            src={session.peerUser.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
            alt={session.peerUser.fullName}
            className="w-10 h-10 rounded-full object-cover border-2 border-orange-500 shadow-md shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">
                {session.peerUser.fullName}
              </h3>
              <span className="text-xs text-orange-400 font-semibold truncate hidden xs:inline">
                @{session.peerUser.username}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] sm:text-xs text-neutral-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">{connectionStatus}</span>
              <span>•</span>
              <span className="font-mono font-bold text-amber-300 shrink-0">{formatDuration(duration)}</span>
            </div>
          </div>
        </div>

        {/* Remote screen sharing badge */}
        {isRemoteSharingScreen && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/90 border border-blue-400 text-white text-xs font-bold shadow-lg animate-pulse">
            <MonitorUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{session.peerUser.fullName}'s Screen</span>
            <span className="sm:hidden">Screen</span>
          </div>
        )}

        {/* Host broadcast mode indicator */}
        {isHostCameraOnly && !isRemoteSharingScreen && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-600/90 border border-orange-400 text-white text-xs font-bold shadow-lg animate-pulse">
            <Radio className="w-3.5 h-3.5" />
            <span>Presenter Mode</span>
          </div>
        )}
      </div>

      {/* Main Video & Audio Stage */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-neutral-900">
        {/* Remote Participant Stream (or Screen Share View) */}
        {session.type === "video" && !isHostCameraOnly ? (
          <div className="w-full h-full relative flex items-center justify-center bg-black">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full ${
                isRemoteSharingScreen ? "object-contain bg-neutral-950" : "object-cover"
              }`}
            />

            {/* Fallback avatar behind video */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/90 pointer-events-none -z-10">
              <img
                src={session.peerUser.avatar}
                alt={session.peerUser.fullName}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-amber-500 shadow-2xl animate-pulse"
              />
              <p className="mt-4 text-sm sm:text-base font-bold text-neutral-200">
                Connected with {session.peerUser.fullName}
              </p>
            </div>
          </div>
        ) : (
          /* Voice Call View or Host Presenter Mode */
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <div className="relative mb-6">
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden border-4 border-orange-500 shadow-2xl shadow-orange-500/30">
                <img
                  src={isHostCameraOnly ? currentUser.avatar : session.peerUser.avatar}
                  alt="Caller"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 p-2.5 rounded-full bg-orange-500 text-white shadow-md">
                <Volume2 className="w-5 h-5 animate-pulse" />
              </div>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {isHostCameraOnly ? "Host Broadcast Stream" : session.peerUser.fullName}
            </h2>
            <p className="text-xs sm:text-sm text-amber-400 mt-1 font-medium">
              {session.type === "video" ? "HD Video Call Active" : "Studio Quality HD Audio"}
            </p>

            {/* Real-time Dynamic Audio Frequency Wave Visualizer */}
            <div className="flex items-center gap-1.5 h-10 mt-6 px-4 py-2 rounded-2xl bg-black/40 border border-neutral-800">
              {audioVolumeBars.map((h, idx) => (
                <div
                  key={idx}
                  className="w-1.5 bg-gradient-to-t from-orange-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-75"
                  style={{
                    height: `${h}%`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Local Participant PIP Video Bubble */}
        {session.type === "video" && (
          <div
            className={`absolute z-20 rounded-2xl overflow-hidden shadow-2xl border-2 border-orange-500 bg-black transition-all ${
              isHostCameraOnly
                ? "inset-0 border-0 rounded-none w-full h-full"
                : "bottom-24 right-3 sm:bottom-28 sm:right-6 w-28 h-36 sm:w-44 sm:h-56 hover:scale-105"
            }`}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                !isScreenSharing && facingMode === "user" ? "scale-x-[-1]" : ""
              }`}
            />
            <div className="absolute bottom-1.5 left-1.5 bg-black/70 px-2 py-0.5 rounded text-[10px] font-bold text-white backdrop-blur-xs">
              {isScreenSharing ? "Your Screen" : "You"}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-3.5 sm:p-5 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center">
        <div className="flex items-center gap-2.5 sm:gap-4 p-2 sm:p-2.5 rounded-3xl bg-neutral-900/95 border border-neutral-700 shadow-2xl backdrop-blur-md">
          {/* Mute Mic */}
          <button
            id="call-mute-toggle-btn"
            type="button"
            onClick={toggleMute}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
            className={`min-w-[48px] min-h-[48px] p-3 rounded-2xl transition-all cursor-pointer flex items-center justify-center ${
              isMuted ? "bg-red-500 text-white" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Toggle Video Camera */}
          {session.type === "video" && (
            <button
              id="call-video-toggle-btn"
              type="button"
              onClick={toggleVideo}
              title={isVideoOff ? "Turn on camera" : "Turn off camera"}
              className={`min-w-[48px] min-h-[48px] p-3 rounded-2xl transition-all cursor-pointer flex items-center justify-center ${
                isVideoOff ? "bg-red-500 text-white" : "bg-neutral-800 text-white hover:bg-neutral-700"
              }`}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
          )}

          {/* Flip Mobile Camera (Front / Back) */}
          {session.type === "video" && !isScreenSharing && (
            <button
              id="call-flip-camera-btn"
              type="button"
              onClick={toggleCameraFacing}
              title="Flip camera"
              className="min-w-[48px] min-h-[48px] p-3 rounded-2xl bg-neutral-800 text-white hover:bg-neutral-700 transition-all cursor-pointer flex items-center justify-center"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}

          {/* Share Screen (Desktop Supported) */}
          {session.type === "video" && (
            <button
              id="call-screen-share-btn"
              type="button"
              onClick={toggleScreenShare}
              title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
              className={`min-w-[48px] min-h-[48px] p-3 rounded-2xl transition-all cursor-pointer flex items-center justify-center ${
                isScreenSharing
                  ? "bg-amber-500 text-neutral-950 font-bold shadow-md shadow-amber-500/40"
                  : "bg-neutral-800 text-white hover:bg-neutral-700"
              }`}
            >
              <MonitorUp className="w-5 h-5" />
            </button>
          )}

          {/* Host Exclusive Broadcast Mode */}
          {session.type === "video" && (
            <button
              id="call-host-camera-mode-btn"
              type="button"
              onClick={toggleHostCameraOnly}
              title={isHostCameraOnly ? "Restore standard view" : "Host camera exclusive mode"}
              className={`min-w-[48px] min-h-[48px] p-3 rounded-2xl transition-all cursor-pointer flex items-center justify-center ${
                isHostCameraOnly
                  ? "bg-orange-600 text-white ring-2 ring-orange-400"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              {isHostCameraOnly ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
          )}

          {/* Hang Up End Call */}
          <button
            id="call-hangup-btn"
            type="button"
            onClick={handleHangup}
            title="End Call"
            className="min-w-[48px] min-h-[48px] p-3 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white transition-all shadow-lg shadow-red-600/40 cursor-pointer flex items-center justify-center"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
