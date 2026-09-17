import React, { useState, useEffect, useRef } from "react";
import {
  User,
  Contact,
  Message,
  MessageType,
  CallSession,
  CallSummaryData,
  Story,
  CallRecord,
} from "./types";
import { SplashScreen } from "./components/SplashScreen";
import { AuthModal } from "./components/AuthModal";
import { ContactList } from "./components/ContactList";
import { ChatArea } from "./components/ChatArea";
import { AddContactModal } from "./components/AddContactModal";
import { CreateGroupModal } from "./components/CreateGroupModal";
import { CreateStoryModal } from "./components/CreateStoryModal";
import { StoryViewerModal } from "./components/StoryViewerModal";
import { SuperAdminModal } from "./components/SuperAdminModal";
import { CallModal } from "./components/CallModal";
import { IncomingCallModal } from "./components/IncomingCallModal";
import { CallSummaryModal } from "./components/CallSummaryModal";
import { GeminiAiDrawer } from "./components/GeminiAiDrawer";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("z_user_session");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);

  // Modals & Panels
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateStoryOpen, setIsCreateStoryOpen] = useState(false);
  const [isSuperAdminOpen, setIsSuperAdminOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  const [isGeminiDrawerOpen, setIsGeminiDrawerOpen] = useState(false);

  // Calling States
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    caller: { id: string; username: string; fullName: string; avatar: string };
    callType: "video" | "audio";
    hostCameraOnly?: boolean;
  } | null>(null);
  const [callSummary, setCallSummary] = useState<CallSummaryData | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<{ type: string; data?: any; fromUserId?: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const [showContactsSidebar, setShowContactsSidebar] = useState(false);

  // Fetch stories from server / firestore
  const fetchStories = async (userId: string) => {
    try {
      const resp = await fetch(`/api/stories?userId=${userId}`);
      const data = await resp.json();
      if (data.stories) {
        setStories(data.stories);
      }
    } catch (e) {
      console.warn("Error fetching stories:", e);
    }
  };

  // Fetch calls history from server / firestore
  const fetchCalls = async (userId: string) => {
    try {
      const resp = await fetch(`/api/calls?userId=${userId}`);
      const data = await resp.json();
      if (data.calls) {
        setCalls(data.calls);
      }
    } catch (e) {
      console.warn("Error fetching calls:", e);
    }
  };

  // Fetch contact list
  const fetchContacts = async (userId: string) => {
    try {
      const resp = await fetch(`/api/contacts?userId=${userId}`);
      const data = await resp.json();
      if (data.contacts) {
        setContacts(data.contacts);
      }
    } catch (e) {
      console.warn("Error fetching contacts:", e);
    }
  };

  // Initialize BroadcastChannel for cross-tab real-time testing
  useEffect(() => {
    try {
      const bc = new BroadcastChannel("z_messenger_p2p_channel");
      broadcastChannelRef.current = bc;

      bc.onmessage = (event) => {
        const { targetUserId, type, payload } = event.data;
        if (currentUser && targetUserId === currentUser.id) {
          handleIncomingRealtimeEvent(type, payload);
        }
      };
    } catch (e) {
      // BroadcastChannel fallback
    }

    return () => {
      broadcastChannelRef.current?.close();
    };
  }, [currentUser]);

  // Handle real-time updates for messages, calls, presence, stories
  const handleIncomingRealtimeEvent = (type: string, payload: any) => {
    if (type === "new_message") {
      const msg: Message = payload;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      // Update contact's last message in sidebar
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id === (msg.groupId || msg.senderId)) {
            return {
              ...c,
              lastMessage: msg.type === "text" ? msg.content : `[${msg.type} message]`,
              lastMessageTime: msg.timestamp,
              unreadCount: activeContact?.id === c.id ? 0 : (c.unreadCount || 0) + 1,
            };
          }
          return c;
        })
      );
    } else if (type === "incoming_call") {
      setIncomingCall({
        caller: payload.caller,
        callType: payload.callType || "video",
        hostCameraOnly: payload.hostCameraOnly,
      });
    } else if (
      type === "call_cancelled" ||
      type === "call_declined" ||
      type === "call_ended"
    ) {
      // When either user cancels/declines, close all call windows and return to contact list
      setIncomingCall(null);
      setActiveCall(null);
      if (currentUser) {
        fetchCalls(currentUser.id);
      }
    } else if (type === "webrtc_signal") {
      if (
        payload.type === "call-cancelled" ||
        payload.type === "call-declined" ||
        payload.type === "call-ended"
      ) {
        setIncomingCall(null);
        setActiveCall(null);
        if (currentUser) {
          fetchCalls(currentUser.id);
        }
      }
      setIncomingSignal(payload);
    } else if (type === "call_logged") {
      if (currentUser) {
        fetchCalls(currentUser.id);
      }
    } else if (type === "contact_added" || type === "group_created") {
      if (currentUser) {
        fetchContacts(currentUser.id);
      }
    } else if (type === "new_story") {
      if (currentUser) {
        fetchStories(currentUser.id);
      }
    }
  };

  // SSE setup when user is logged in
  useEffect(() => {
    if (!currentUser) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    fetchContacts(currentUser.id);
    fetchStories(currentUser.id);
    fetchCalls(currentUser.id);

    // Heartbeat presence
    const heartbeat = setInterval(() => {
      fetch("/api/users/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, status: "online" }),
      }).catch(() => {});
    }, 20000);

    // SSE connection
    const es = new EventSource(`/api/events?userId=${currentUser.id}`);
    eventSourceRef.current = es;

    // Native WebSocket connection for instant WebRTC signaling
    let ws: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${currentUser.id}`;
      ws = new WebSocket(wsUrl);
      webSocketRef.current = ws;

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: "register", userId: currentUser.id }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.type || data.event;
          const payload = data.data || data.payload || data;

          if (eventType === "webrtc_signal") {
            handleIncomingRealtimeEvent("webrtc_signal", payload);
          } else if (eventType === "incoming_call") {
            handleIncomingRealtimeEvent("incoming_call", payload);
          } else if (
            eventType === "call_cancelled" ||
            eventType === "call_declined" ||
            eventType === "call_ended"
          ) {
            handleIncomingRealtimeEvent(eventType, payload);
          } else if (eventType === "new_message") {
            handleIncomingRealtimeEvent("new_message", payload);
          } else if (eventType === "contact_added" || eventType === "group_created") {
            fetchContacts(currentUser.id);
          } else if (eventType === "new_story") {
            fetchStories(currentUser.id);
          }
        } catch (e) {}
      };
    } catch (err) {}

    es.addEventListener("new_message", (e: any) => {
      try {
        const msg = JSON.parse(e.data);
        handleIncomingRealtimeEvent("new_message", msg);
      } catch (err) {}
    });

    es.addEventListener("incoming_call", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        handleIncomingRealtimeEvent("incoming_call", data);
      } catch (err) {}
    });

    es.addEventListener("call_cancelled", () => {
      setIncomingCall(null);
      setActiveCall(null);
      if (currentUser) fetchCalls(currentUser.id);
    });

    es.addEventListener("call_declined", () => {
      setIncomingCall(null);
      setActiveCall(null);
      if (currentUser) fetchCalls(currentUser.id);
    });

    es.addEventListener("call_logged", () => {
      if (currentUser) fetchCalls(currentUser.id);
    });

    es.addEventListener("webrtc_signal", (e: any) => {
      try {
        const signal = JSON.parse(e.data);
        handleIncomingRealtimeEvent("webrtc_signal", signal);
      } catch (err) {}
    });

    es.addEventListener("contact_added", () => {
      fetchContacts(currentUser.id);
    });

    es.addEventListener("group_created", () => {
      fetchContacts(currentUser.id);
    });

    es.addEventListener("new_story", () => {
      fetchStories(currentUser.id);
    });

    return () => {
      clearInterval(heartbeat);
      es.close();
      eventSourceRef.current = null;
      if (ws) ws.close();
      webSocketRef.current = null;
    };
  }, [currentUser]);

  // Fetch messages when active contact changes
  useEffect(() => {
    if (!currentUser || !activeContact) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const resp = await fetch(
          `/api/messages?userId=${currentUser.id}&contactId=${activeContact.id}`
        );
        const data = await resp.json();
        if (data.messages) {
          setMessages(data.messages);
        }
      } catch (e) {
        console.warn("Error loading messages:", e);
      }
    };

    loadMessages();
  }, [currentUser, activeContact]);

  // Send Message handler (Direct & Group)
  const handleSendMessage = async (
    type: MessageType,
    content: string,
    metadata?: any
  ) => {
    if (!currentUser || !activeContact) return;

    try {
      const isGroup = !!activeContact.isGroup;
      const resp = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: isGroup ? undefined : activeContact.id,
          groupId: isGroup ? activeContact.id : undefined,
          type,
          content,
          metadata,
        }),
      });

      const data = await resp.json();
      if (data.success && data.message) {
        setMessages((prev) => [...prev, data.message]);

        // Cross-tab broadcast notification for direct chat
        if (!isGroup) {
          broadcastChannelRef.current?.postMessage({
            targetUserId: activeContact.id,
            type: "new_message",
            payload: data.message,
          });
        }

        // Update contacts preview
        setContacts((prev) =>
          prev.map((c) =>
            c.id === activeContact.id
              ? {
                  ...c,
                  lastMessage: type === "text" ? content : `[${type} message]`,
                  lastMessageTime: Date.now(),
                }
              : c
          )
        );
      }
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  };

  // Start Call handler (from chat area)
  const handleStartCall = async (callType: "video" | "audio") => {
    if (!currentUser || !activeContact) return;
    handleStartCallWithPeer(
      {
        id: activeContact.id,
        username: activeContact.username,
        fullName: activeContact.fullName,
        avatar: activeContact.avatar,
      },
      callType
    );
  };

  // Start Call with any peer (from Contacts or Calls list)
  const handleStartCallWithPeer = async (
    peer: { id: string; fullName: string; username: string; avatar: string },
    callType: "video" | "audio"
  ) => {
    if (!currentUser) return;

    const newSession: CallSession = {
      id: "call_" + Date.now(),
      peerId: peer.id,
      peerUser: peer,
      isInitiator: true,
      type: callType,
      status: "connected",
      startTime: Date.now(),
      durationSeconds: 0,
      isMuted: false,
      isVideoOff: callType === "audio",
      isScreenSharing: false,
      isHostCameraOnly: false,
    };

    setActiveCall(newSession);

    // Send call invite to peer via server
    try {
      await fetch("/api/signaling/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerId: currentUser.id,
          receiverId: peer.id,
          callType,
          hostCameraOnly: false,
        }),
      });

      broadcastChannelRef.current?.postMessage({
        targetUserId: peer.id,
        type: "incoming_call",
        payload: {
          caller: {
            id: currentUser.id,
            username: currentUser.username,
            fullName: currentUser.fullName,
            avatar: currentUser.avatar,
          },
          callType,
          hostCameraOnly: false,
        },
      });

      if (webSocketRef.current?.readyState === WebSocket.OPEN) {
        try {
          webSocketRef.current.send(
            JSON.stringify({
              type: "incoming_call",
              targetUserId: peer.id,
              payload: {
                caller: {
                  id: currentUser.id,
                  username: currentUser.username,
                  fullName: currentUser.fullName,
                  avatar: currentUser.avatar,
                },
                callType,
                hostCameraOnly: false,
              },
            })
          );
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Signaling call failed:", e);
    }
  };

  // Accept incoming call
  const handleAcceptIncomingCall = () => {
    if (!incomingCall || !currentUser) return;

    const newSession: CallSession = {
      id: "call_" + Date.now(),
      peerId: incomingCall.caller.id,
      peerUser: incomingCall.caller,
      isInitiator: false,
      type: incomingCall.callType,
      status: "connected",
      startTime: Date.now(),
      durationSeconds: 0,
      isMuted: false,
      isVideoOff: incomingCall.callType === "audio",
      isScreenSharing: false,
      isHostCameraOnly: !!incomingCall.hostCameraOnly,
    };

    setActiveCall(newSession);
    setIncomingCall(null);
  };

  // Decline incoming call: sync with server and caller screen
  const handleDeclineIncomingCall = async () => {
    if (!incomingCall || !currentUser) return;

    const callerId = incomingCall.caller.id;
    const callType = incomingCall.callType;

    // Immediately close modal
    setIncomingCall(null);

    try {
      // Notify server to log declined call and notify caller
      await fetch("/api/calls/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerId,
          receiverId: currentUser.id,
          callType,
          status: "declined",
        }),
      });

      // Send signal directly to caller
      handleSendSignalToUser(callerId, "call-declined", { durationSeconds: 0 });

      broadcastChannelRef.current?.postMessage({
        targetUserId: callerId,
        type: "call_declined",
        payload: { callerId, receiverId: currentUser.id },
      });

      if (webSocketRef.current?.readyState === WebSocket.OPEN) {
        try {
          webSocketRef.current.send(
            JSON.stringify({
              type: "call_declined",
              targetUserId: callerId,
              payload: { callerId, receiverId: currentUser.id },
            })
          );
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Failed to decline call:", e);
    }

    fetchCalls(currentUser.id);
  };

  // End Call or Cancel Call handler
  const handleEndCall = async (durationSeconds: number) => {
    if (!activeCall || !currentUser) return;

    const peerId = activeCall.peerId;
    const callType = activeCall.type;
    const isInitiator = activeCall.isInitiator;
    const isCancelledBeforeConnect = durationSeconds <= 0;

    // Close call window immediately and return to contacts
    setActiveCall(null);

    if (isCancelledBeforeConnect) {
      // Cancelled call
      try {
        await fetch("/api/calls/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callerId: isInitiator ? currentUser.id : peerId,
            receiverId: isInitiator ? peerId : currentUser.id,
            callType,
            status: "cancelled",
          }),
        });

        handleSendSignalToUser(peerId, "call-cancelled", { durationSeconds: 0 });

        broadcastChannelRef.current?.postMessage({
          targetUserId: peerId,
          type: "call_cancelled",
          payload: { callerId: currentUser.id, receiverId: peerId },
        });

        if (webSocketRef.current?.readyState === WebSocket.OPEN) {
          try {
            webSocketRef.current.send(
              JSON.stringify({
                type: "call_cancelled",
                targetUserId: peerId,
                payload: { callerId: currentUser.id, receiverId: peerId },
              })
            );
          } catch (e) {}
        }
      } catch (e) {
        console.warn("Failed to cancel call:", e);
      }
    } else {
      // Completed call with duration
      try {
        await fetch("/api/calls/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callerId: isInitiator ? currentUser.id : peerId,
            receiverId: isInitiator ? peerId : currentUser.id,
            type: callType,
            status: "completed",
            durationSeconds,
          }),
        });

        handleSendSignalToUser(peerId, "call-ended", { durationSeconds });

        broadcastChannelRef.current?.postMessage({
          targetUserId: peerId,
          type: "call_ended",
          payload: { durationSeconds },
        });

        if (webSocketRef.current?.readyState === WebSocket.OPEN) {
          try {
            webSocketRef.current.send(
              JSON.stringify({
                type: "call_ended",
                targetUserId: peerId,
                payload: { durationSeconds },
              })
            );
          } catch (e) {}
        }
      } catch (e) {
        console.warn("Failed to log call:", e);
      }

      // Show summary for completed calls
      setCallSummary({
        callType: activeCall.type,
        durationSeconds,
        peerName: activeCall.peerUser.fullName,
        summary: "",
        timestamp: Date.now(),
      });
    }

    fetchCalls(currentUser.id);
  };

  // Helper to safely serialize WebRTC objects to prevent DataCloneError
  const serializeSignalData = (data: any): any => {
    if (!data) return data;
    if (typeof data.toJSON === "function") {
      try {
        return data.toJSON();
      } catch (e) {}
    }
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (e) {
      if (data.candidate !== undefined) {
        return {
          candidate: data.candidate,
          sdpMid: data.sdpMid,
          sdpMLineIndex: data.sdpMLineIndex,
          usernameFragment: data.usernameFragment,
        };
      }
      if (data.sdp !== undefined) {
        return {
          type: data.type,
          sdp: data.sdp,
        };
      }
      return data;
    }
  };

  // Send Signaling Message to specific user
  const handleSendSignalToUser = (targetUserId: string, type: string, data?: any) => {
    if (!currentUser) return;
    const safeData = serializeSignalData(data);

    fetch("/api/signaling/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromUserId: currentUser.id,
        toUserId: targetUserId,
        type,
        data: safeData,
      }),
    }).catch(() => {});

    try {
      broadcastChannelRef.current?.postMessage({
        targetUserId,
        type: "webrtc_signal",
        payload: { type, data: safeData, fromUserId: currentUser.id },
      });
    } catch (err) {
      console.warn("BroadcastChannel signal send error:", err);
    }

    if (webSocketRef.current?.readyState === WebSocket.OPEN) {
      try {
        webSocketRef.current.send(
          JSON.stringify({
            type: "webrtc_signal",
            targetUserId,
            payload: { type, data: safeData, fromUserId: currentUser.id },
          })
        );
      } catch (e) {}
    }
  };

  // Send Signaling Message during active call
  const handleSendSignal = (type: string, data?: any) => {
    if (!activeCall || !currentUser) return;
    handleSendSignalToUser(activeCall.peerId, type, data);
  };

  // User Authentication Success
  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    try {
      localStorage.setItem("z_user_session", JSON.stringify(user));
    } catch (e) {}
  };

  // Auto-dismiss splash screen after exactly 3 seconds failsafe
  useEffect(() => {
    if (showSplash) {
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

  // User Logout
  const handleLogout = () => {
    if (currentUser) {
      fetch("/api/users/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, status: "offline" }),
      }).catch(() => {});
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      localStorage.removeItem("z_user_session");
    } catch (e) {}

    setCurrentUser(null);
    setActiveContact(null);
    setMessages([]);
    setContacts([]);
    setStories([]);
    setCalls([]);
    setActiveCall(null);
    setIncomingCall(null);
    setCallSummary(null);
  };

  // Open Gemini Assistant in half-screen split view on tablet/laptop
  const handleOpenGemini = () => {
    setIsGeminiDrawerOpen(true);
    // If no contact is currently selected, pick the first contact so messaging interface opens at half screen immediately
    if (!activeContact && contacts.length > 0) {
      setActiveContact(contacts[0]);
    }
  };

  // Render Splash Screen First
  if (showSplash) {
    return <SplashScreen onContinue={() => setShowSplash(false)} />;
  }

  // Render Auth Modal if not logged in
  if (!currentUser) {
    return <AuthModal onSuccess={handleAuthSuccess} />;
  }

  return (
    <div id="z-messenger-root" className="flex h-screen w-screen bg-neutral-100 overflow-hidden font-['Plus_Jakarta_Sans',sans-serif] relative">
      {/* Slide-out backdrop for contacts sidebar when in split-view on tablet/laptop */}
      {isGeminiDrawerOpen && showContactsSidebar && (
        <div
          id="split-view-contacts-backdrop"
          className="fixed inset-0 bg-neutral-900/40 z-30 transition-opacity backdrop-blur-xs"
          onClick={() => setShowContactsSidebar(false)}
        />
      )}

      {/* Left Contacts Sidebar */}
      <div
        className={`h-full ${
          isGeminiDrawerOpen
            ? showContactsSidebar
              ? "fixed md:absolute inset-y-0 left-0 z-40 w-80 lg:w-96 bg-white shadow-2xl flex border-r border-neutral-200"
              : "hidden"
            : activeContact
            ? "hidden md:flex"
            : "flex"
        } w-full md:w-80 lg:w-96 shrink-0 transition-all`}
      >
        <ContactList
          currentUser={currentUser}
          contacts={contacts}
          stories={stories}
          calls={calls}
          selectedContactId={activeContact?.id || null}
          onSelectContact={(c) => {
            setActiveContact(c);
            setShowContactsSidebar(false);
          }}
          onOpenAddContact={() => setIsAddContactOpen(true)}
          onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
          onOpenAddStory={() => setIsCreateStoryOpen(true)}
          onOpenStoryViewer={(idx) => setStoryViewerIndex(idx)}
          onOpenSuperAdmin={() => setIsSuperAdminOpen(true)}
          onOpenGeminiDrawer={handleOpenGemini}
          onStartCallWithUser={handleStartCallWithPeer}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Chat Area (takes 50% on tablet/laptop when Gemini is open, otherwise full flex-1) */}
      <div
        className={`h-full ${
          activeContact ? "flex" : isGeminiDrawerOpen ? "flex" : "hidden md:flex"
        } ${
          isGeminiDrawerOpen ? "w-full md:w-1/2" : "flex-1"
        } overflow-hidden transition-all`}
      >
        <ChatArea
          currentUser={currentUser}
          activeContact={activeContact}
          contacts={contacts}
          messages={messages}
          onSendMessage={handleSendMessage}
          onStartCall={handleStartCall}
          onOpenGeminiDrawer={handleOpenGemini}
          onBack={() => {
            setActiveContact(null);
            setShowContactsSidebar(true);
          }}
          onRefreshMessages={() => {
            if (activeContact && currentUser) {
              fetch(`/api/messages?userId=${currentUser.id}&contactId=${activeContact.id}`)
                .then((r) => r.json())
                .then((d) => {
                  if (d.messages) setMessages(d.messages);
                })
                .catch(() => {});
            }
          }}
          onToggleContactsSidebar={() => setShowContactsSidebar((prev) => !prev)}
          isSplitView={isGeminiDrawerOpen}
        />
      </div>

      {/* Gemini AI Assistant Drawer (takes remaining 50% on tablet/laptop in split mode) */}
      <GeminiAiDrawer
        isOpen={isGeminiDrawerOpen}
        onClose={() => {
          setIsGeminiDrawerOpen(false);
          setShowContactsSidebar(false);
        }}
        isSplitView={true}
        onInsertToChat={(text) => {
          if (activeContact) {
            handleSendMessage("text", text);
          }
        }}
      />

      {/* Add Contact Modal */}
      {isAddContactOpen && (
        <AddContactModal
          currentUser={currentUser}
          contacts={contacts}
          onClose={() => setIsAddContactOpen(false)}
          onContactAdded={(contact) => {
            setContacts((prev) => {
              if (prev.some((c) => c.id === contact.id)) return prev;
              return [contact, ...prev];
            });
            setActiveContact(contact);
          }}
        />
      )}

      {/* Create Group Modal (> 2 members) */}
      {isCreateGroupOpen && (
        <CreateGroupModal
          currentUser={currentUser}
          contacts={contacts}
          onClose={() => setIsCreateGroupOpen(false)}
          onGroupCreated={(newGroup) => {
            setIsCreateGroupOpen(false);
            fetchContacts(currentUser.id);
            const groupContact: Contact = {
              id: newGroup.id,
              username: "group_" + newGroup.id.substring(0, 6),
              fullName: newGroup.name,
              avatar: newGroup.avatar,
              status: "online",
              isGroup: true,
              groupData: newGroup,
            };
            setActiveContact(groupContact);
          }}
        />
      )}

      {/* Create Story Modal (24h expiry & custom privacy restriction) */}
      {isCreateStoryOpen && (
        <CreateStoryModal
          currentUser={currentUser}
          contacts={contacts}
          onClose={() => setIsCreateStoryOpen(false)}
          onStoryCreated={(story) => {
            setStories((prev) => [story, ...prev]);
            setIsCreateStoryOpen(false);
          }}
        />
      )}

      {/* 24h Story Viewer Modal */}
      {storyViewerIndex !== null && stories.length > 0 && (
        <StoryViewerModal
          currentUser={currentUser}
          stories={stories}
          initialIndex={storyViewerIndex}
          onClose={() => setStoryViewerIndex(null)}
          onStoryDeleted={(deletedId) => {
            setStories((prev) => prev.filter((s) => s.id !== deletedId));
          }}
        />
      )}

      {/* Super Admin Control Modal (hashir0047@gmail.com) */}
      {isSuperAdminOpen && (
        <SuperAdminModal
          currentUser={currentUser}
          onClose={() => setIsSuperAdminOpen(false)}
          onUserDeleted={() => {
            fetchContacts(currentUser.id);
          }}
        />
      )}

      {/* Incoming Call Dialog */}
      {incomingCall && (
        <IncomingCallModal
          caller={incomingCall.caller}
          callType={incomingCall.callType}
          onAccept={handleAcceptIncomingCall}
          onDecline={handleDeclineIncomingCall}
        />
      )}

      {/* Active WebRTC Video / Voice Call Modal */}
      {activeCall && (
        <CallModal
          session={activeCall}
          currentUser={currentUser}
          onEndCall={handleEndCall}
          onSendSignal={handleSendSignal}
          incomingSignal={incomingSignal}
        />
      )}

      {/* End-of-Call Gemini AI Summary Modal */}
      {callSummary && (
        <CallSummaryModal
          peerName={callSummary.peerName}
          durationSeconds={callSummary.durationSeconds}
          callType={callSummary.callType}
          onSendToChat={(summaryText) => {
            if (activeContact) {
              handleSendMessage("text", summaryText);
            }
          }}
          onClose={() => setCallSummary(null)}
        />
      )}
    </div>
  );
}
