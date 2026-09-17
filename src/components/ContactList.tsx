import React, { useState } from "react";
import { User, Contact, Story, CallRecord } from "../types";
import { AppLogo } from "./AppLogo";
import {
  UserPlus,
  Search,
  LogOut,
  Sparkles,
  Users,
  ShieldAlert,
  Plus,
  MessageSquare,
  Clock,
  Phone,
  Video,
  PhoneMissed,
  ArrowUpRight,
  ArrowDownLeft,
  PhoneOff,
  PhoneCall,
  History,
} from "lucide-react";

interface ContactListProps {
  currentUser: User;
  contacts: Contact[];
  stories: Story[];
  calls?: CallRecord[];
  selectedContactId: string | null;
  onSelectContact: (contact: Contact | null) => void;
  onOpenAddContact: () => void;
  onOpenCreateGroup: () => void;
  onOpenAddStory: () => void;
  onOpenStoryViewer: (index: number) => void;
  onOpenSuperAdmin: () => void;
  onOpenGeminiDrawer: () => void;
  onLogout: () => void;
  onStartCallWithUser?: (
    peer: { id: string; fullName: string; username: string; avatar: string },
    type: "video" | "audio"
  ) => void;
}

export const ContactList: React.FC<ContactListProps> = ({
  currentUser,
  contacts = [],
  stories = [],
  calls = [],
  selectedContactId,
  onSelectContact,
  onOpenAddContact,
  onOpenCreateGroup,
  onOpenAddStory,
  onOpenStoryViewer,
  onOpenSuperAdmin,
  onOpenGeminiDrawer,
  onLogout,
  onStartCallWithUser,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [primarySection, setPrimarySection] = useState<"chats" | "calls">("chats");
  const [activeTab, setActiveTab] = useState<"all" | "direct" | "groups">("all");
  const [callFilterTab, setCallFilterTab] = useState<"all" | "missed">("all");

  const isSuperAdmin =
    currentUser.role === "superadmin" || currentUser.email.toLowerCase() === "hashir0047@gmail.com";

  const safeContacts = contacts || [];
  const safeCalls = calls || [];
  const safeStories = stories || [];

  // Filter contacts by search query
  const filteredContacts = safeContacts.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.username.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === "direct") return !c.isGroup;
    if (activeTab === "groups") return !!c.isGroup;
    return true;
  });

  const directContactsCount = safeContacts.filter((c) => !c.isGroup).length;
  const groupsCount = safeContacts.filter((c) => c.isGroup).length;

  // Calls calculations
  const myCalls = safeCalls.filter(
    (c) => c.callerId === currentUser.id || c.receiverId === currentUser.id
  );

  const missedCalls = myCalls.filter(
    (c) => c.receiverId === currentUser.id && (c.status === "missed" || c.status === "declined")
  );

  const displayedCalls = callFilterTab === "missed" ? missedCalls : myCalls;

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };

  const formatCallDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} • ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  // Group stories by author so each author appears once in the stories bar
  const myStories = safeStories.filter((s) => s.userId === currentUser.id);
  const otherStories = safeStories.filter((s) => s.userId !== currentUser.id);

  const distinctAuthorStories: Story[] = [];
  const seenAuthors = new Set<string>();

  for (const st of otherStories) {
    if (!seenAuthors.has(st.userId)) {
      seenAuthors.add(st.userId);
      distinctAuthorStories.push(st);
    }
  }

  return (
    <div
      id="contacts-sidebar"
      className="w-full h-full flex flex-col bg-white border-r border-orange-100/80 shrink-0 relative select-none"
    >
      {/* Top App Header */}
      <div className="p-3.5 border-b border-orange-100 flex items-center justify-between bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-white shrink-0">
        <AppLogo size="sm" showText={true} />

        <div className="flex items-center gap-1.5">
          {/* Superadmin Button */}
          {isSuperAdmin && (
            <button
              id="open-superadmin-btn"
              onClick={onOpenSuperAdmin}
              title="Super Admin Control Center (Delete users & manage site)"
              className="p-1.5 px-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all shadow-xs cursor-pointer flex items-center gap-1 text-[11px] font-bold active:scale-95"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>
          )}

          {/* Gemini AI shortcut */}
          <button
            id="open-gemini-assistant-btn"
            onClick={onOpenGeminiDrawer}
            title="Open Gemini AI Assistant"
            className="p-1.5 px-2 rounded-xl bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span className="hidden sm:inline">AI</span>
          </button>

          {/* Create Group Button */}
          <button
            id="open-create-group-btn"
            onClick={onOpenCreateGroup}
            title="Create group (more than 2 persons)"
            className="p-2 rounded-xl bg-amber-100 text-amber-800 hover:bg-amber-200 transition-all shadow-xs cursor-pointer"
          >
            <Users className="w-4 h-4" />
          </button>

          {/* Add Contact Button */}
          <button
            id="open-add-contact-btn"
            onClick={onOpenAddContact}
            title="Add contact by username"
            className="p-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-all shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Current User Profile Card */}
      <div className="px-3.5 py-2.5 bg-amber-50/40 border-b border-orange-100/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <img
              src={currentUser.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
              alt={currentUser.fullName}
              className="w-9 h-9 rounded-full object-cover border-2 border-orange-400 shadow-xs"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="flex items-center gap-1">
              <h4 className="text-xs font-bold text-neutral-900 truncate">{currentUser.fullName}</h4>
              {isSuperAdmin && (
                <span className="px-1 py-0.2 rounded-sm bg-red-100 text-red-700 text-[9px] font-extrabold uppercase">
                  Admin
                </span>
              )}
            </div>
            <span className="text-[11px] font-semibold text-orange-600 truncate block">
              @{currentUser.username}
            </span>
          </div>
        </div>

        {/* Sign out Button */}
        <button
          id="logout-btn"
          onClick={() => setShowLogoutConfirm(true)}
          title="Sign out"
          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200/80 bg-red-50/80 hover:bg-red-100 text-red-600 hover:text-red-700 transition-all text-[11px] font-bold cursor-pointer shrink-0"
        >
          <LogOut className="w-3 h-3" />
          <span>Exit</span>
        </button>
      </div>

      {/* 24-HOUR STORIES BAR (WhatsApp / Instagram style) */}
      <div className="px-3 py-2.5 border-b border-orange-100/70 bg-neutral-50/40 shrink-0">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-700 flex items-center gap-1">
            <Clock className="w-3 h-3 text-orange-500" />
            24h Stories
          </span>
          <button
            onClick={onOpenAddStory}
            className="text-[11px] text-orange-600 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          {/* Your Story Node */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div
              onClick={() => {
                if (myStories.length > 0) {
                  const firstMyIndex = stories.findIndex((s) => s.userId === currentUser.id);
                  onOpenStoryViewer(firstMyIndex >= 0 ? firstMyIndex : 0);
                } else {
                  onOpenAddStory();
                }
              }}
              className="relative cursor-pointer group"
            >
              <div
                className={`w-12 h-12 rounded-full p-0.5 transition-transform group-hover:scale-105 ${
                  myStories.length > 0
                    ? "bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 ring-2 ring-orange-400"
                    : "border-2 border-dashed border-neutral-300 group-hover:border-orange-500"
                }`}
              >
                <img
                  src={currentUser.avatar}
                  alt="Your story"
                  className="w-full h-full rounded-full object-cover border border-white"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold border-2 border-white shadow-xs">
                {myStories.length > 0 ? myStories.length : "+"}
              </div>
            </div>
            <span className="text-[10px] font-bold text-neutral-700 truncate w-14 text-center">
              Your Story
            </span>
          </div>

          {/* Contact Stories Nodes */}
          {distinctAuthorStories.map((story) => {
            const storyIndex = stories.findIndex((s) => s.id === story.id);

            return (
              <div
                key={story.id}
                onClick={() => onOpenStoryViewer(storyIndex >= 0 ? storyIndex : 0)}
                className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 via-orange-500 to-pink-500 shadow-xs group-hover:scale-105 transition-transform">
                  <img
                    src={story.userAvatar}
                    alt={story.userFullName}
                    className="w-full h-full rounded-full object-cover border-2 border-white"
                  />
                </div>
                <span className="text-[10px] font-semibold text-neutral-800 truncate w-14 text-center">
                  {story.userFullName.split(" ")[0]}
                </span>
              </div>
            );
          })}

          {distinctAuthorStories.length === 0 && myStories.length === 0 && (
            <div
              onClick={onOpenAddStory}
              className="flex items-center gap-2 py-1 px-3 rounded-xl bg-orange-50/80 border border-dashed border-orange-200 text-orange-700 text-xs cursor-pointer hover:bg-orange-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">Post your first 24h story</span>
            </div>
          )}
        </div>
      </div>

      {/* Primary Section Switcher: Chats vs Calls */}
      <div className="px-3 pt-2 pb-1 border-b border-orange-100/60 bg-white flex items-center gap-2 shrink-0">
        <button
          id="tab-chats-btn"
          onClick={() => setPrimarySection("chats")}
          className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            primarySection === "chats"
              ? "bg-orange-500 text-white shadow-xs"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chats</span>
        </button>

        <button
          id="tab-calls-btn"
          onClick={() => setPrimarySection("calls")}
          className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer relative ${
            primarySection === "calls"
              ? "bg-orange-500 text-white shadow-xs"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70"
          }`}
        >
          <PhoneCall className="w-3.5 h-3.5" />
          <span>Calls</span>
          {missedCalls.length > 0 && (
            <span
              title={`${missedCalls.length} missed calls`}
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                primarySection === "calls" ? "bg-white text-orange-600" : "bg-red-500 text-white"
              }`}
            >
              {missedCalls.length}
            </span>
          )}
        </button>
      </div>

      {primarySection === "chats" ? (
        <>
          {/* Search Contacts Bar */}
          <div className="p-2.5 border-b border-orange-50 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
              <input
                id="filter-contacts-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search contacts & groups..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-orange-500 text-xs text-neutral-900 outline-hidden transition-all"
              />
            </div>

            {/* Tab Filters */}
            <div className="flex items-center gap-1 mt-2">
              <button
                onClick={() => setActiveTab("all")}
                className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeTab === "all"
                    ? "bg-orange-500 text-white shadow-xs"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                All ({contacts.length})
              </button>
              <button
                onClick={() => setActiveTab("direct")}
                className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeTab === "direct"
                    ? "bg-orange-500 text-white shadow-xs"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Direct ({directContactsCount})
              </button>
              <button
                onClick={() => setActiveTab("groups")}
                className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeTab === "groups"
                    ? "bg-orange-500 text-white shadow-xs"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Groups ({groupsCount})
              </button>
            </div>
          </div>

          {/* Contacts & Groups Stream */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
            {filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 px-6 text-center text-neutral-500">
                <div className="w-12 h-12 rounded-2xl bg-orange-100/60 text-orange-600 flex items-center justify-center mb-3">
                  {activeTab === "groups" ? <Users className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
                </div>
                <p className="text-xs font-bold text-neutral-700">
                  {activeTab === "groups" ? "No groups yet" : "No contacts found"}
                </p>
                <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                  {activeTab === "groups"
                    ? "Create a group of more than 2 persons to talk together!"
                    : "Add friends by username or select from registered users!"}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  {activeTab === "groups" ? (
                    <button
                      onClick={onOpenCreateGroup}
                      className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Create Group</span>
                    </button>
                  ) : (
                    <button
                      onClick={onOpenAddContact}
                      className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add Contact</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedContactId === contact.id;

                return (
                  <button
                    key={contact.id}
                    onClick={() => onSelectContact(contact)}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between transition-all cursor-pointer text-left ${
                      isSelected
                        ? "bg-orange-500/10 border border-orange-300 shadow-xs"
                        : "hover:bg-neutral-100/80 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={contact.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
                          alt={contact.fullName}
                          className={`w-11 h-11 object-cover border ${
                            contact.isGroup ? "rounded-2xl border-orange-400" : "rounded-full border-neutral-200"
                          }`}
                        />
                        {contact.isGroup ? (
                          <span className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-orange-500 text-white border-2 border-white">
                            <Users className="w-2.5 h-2.5" />
                          </span>
                        ) : (
                          <span
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                              contact.status === "online"
                                ? "bg-emerald-500"
                                : contact.status === "in-call"
                                ? "bg-amber-500"
                                : "bg-neutral-300"
                            }`}
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-neutral-900 truncate">{contact.fullName}</h4>
                          {contact.isGroup && (
                            <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 text-[9px] font-extrabold uppercase shrink-0">
                              Group
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-orange-600 truncate">
                          {contact.isGroup ? `${contact.groupData?.memberIds?.length || 3} members` : `@${contact.username}`}
                        </p>
                        {contact.lastMessage ? (
                          <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                            {contact.lastMessage}
                          </p>
                        ) : (
                          <p className="text-[10px] text-neutral-400 italic mt-0.5">
                            {contact.isGroup ? "Group conversation ready" : contact.status === "online" ? "Active now" : "Offline"}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right badges */}
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      {contact.lastMessageTime && (
                        <span className="text-[10px] text-neutral-400">
                          {new Date(contact.lastMessageTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      {contact.unreadCount ? (
                        <span className="w-5 h-5 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center">
                          {contact.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* CALLS & MISSED CALLS WITH SEPARATE CALL DURATION SECTION */
        <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50/30">
          {/* Calls Subtabs */}
          <div className="p-2.5 border-b border-orange-100/60 bg-white shrink-0">
            <div className="flex items-center gap-1">
              <button
                id="filter-all-calls-btn"
                onClick={() => setCallFilterTab("all")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  callFilterTab === "all"
                    ? "bg-orange-500 text-white shadow-xs"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>All Calls ({myCalls.length})</span>
              </button>

              <button
                id="filter-missed-calls-btn"
                onClick={() => setCallFilterTab("missed")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  callFilterTab === "missed"
                    ? "bg-red-500 text-white shadow-xs"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <PhoneMissed className="w-3.5 h-3.5" />
                <span>Missed ({missedCalls.length})</span>
              </button>
            </div>
          </div>

          {/* Calls List */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
            {displayedCalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 px-6 text-center text-neutral-500">
                <div className="w-12 h-12 rounded-2xl bg-orange-100/70 text-orange-600 flex items-center justify-center mb-3">
                  {callFilterTab === "missed" ? (
                    <PhoneMissed className="w-6 h-6 text-red-500" />
                  ) : (
                    <PhoneCall className="w-6 h-6" />
                  )}
                </div>
                <p className="text-xs font-bold text-neutral-800">
                  {callFilterTab === "missed" ? "No missed calls" : "No recent calls yet"}
                </p>
                <p className="text-[11px] text-neutral-500 mt-1">
                  {callFilterTab === "missed"
                    ? "Great! You have answered all incoming calls."
                    : "Start an audio or video call with any contact to see it recorded here!"}
                </p>
              </div>
            ) : (
              displayedCalls.map((call) => {
                const isOutgoing = call.callerId === currentUser.id;
                const isMissed =
                  call.receiverId === currentUser.id && (call.status === "missed" || call.status === "declined");

                const peerName = isOutgoing ? call.receiverName : call.callerName;
                const peerUsername = isOutgoing ? call.receiverUsername : call.callerUsername;
                const peerAvatar = isOutgoing ? call.receiverAvatar : call.callerAvatar;
                const peerId = isOutgoing ? call.receiverId : call.callerId;

                return (
                  <div
                    key={call.id}
                    className="p-3 rounded-2xl bg-white border border-neutral-200/80 hover:border-orange-200 hover:shadow-xs transition-all flex flex-col gap-2"
                  >
                    {/* Top row: Peer info and Call status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={peerAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
                          alt={peerName}
                          className="w-10 h-10 rounded-full object-cover border border-neutral-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-neutral-900 truncate">{peerName}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isMissed ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-red-600">
                                <PhoneMissed className="w-3.5 h-3.5 shrink-0" />
                                <span>Missed Call</span>
                              </span>
                            ) : isOutgoing ? (
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                <span>Outgoing</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                                <span>Incoming</span>
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-400">•</span>
                            <span className="text-[10px] text-neutral-500 font-medium">
                              {call.type === "video" ? "Video" : "Audio"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Call Time */}
                      <span className="text-[10px] font-medium text-neutral-400 shrink-0">
                        {formatCallDate(call.timestamp)}
                      </span>
                    </div>

                    {/* SEPARATE CALL DURATION & DETAILS SECTION */}
                    <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-neutral-500">
                          Duration:
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border ${
                            isMissed
                              ? "bg-red-50 text-red-700 border-red-200"
                              : call.status === "completed" || call.durationSeconds > 0
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-neutral-100 text-neutral-600 border-neutral-200"
                          }`}
                        >
                          {isMissed
                            ? "0s (Missed)"
                            : call.status === "declined"
                            ? "0s (Declined)"
                            : call.status === "cancelled"
                            ? "0s (Cancelled)"
                            : formatDuration(call.durationSeconds)}
                        </span>
                      </div>

                      {/* Quick Call Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            if (onStartCallWithUser) {
                              onStartCallWithUser(
                                { id: peerId, fullName: peerName, username: peerUsername, avatar: peerAvatar },
                                "audio"
                              );
                            }
                          }}
                          title="Call back (Audio)"
                          className="p-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white transition-colors cursor-pointer"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (onStartCallWithUser) {
                              onStartCallWithUser(
                                { id: peerId, fullName: peerName, username: peerUsername, avatar: peerAvatar },
                                "video"
                              );
                            }
                          }}
                          title="Call back (Video)"
                          className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white transition-colors cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const found = safeContacts.find((c) => c.id === peerId);
                            if (found) {
                              onSelectContact(found);
                              setPrimarySection("chats");
                            } else {
                              onSelectContact({
                                id: peerId,
                                fullName: peerName,
                                username: peerUsername,
                                avatar: peerAvatar,
                                status: "offline",
                              });
                              setPrimarySection("chats");
                            }
                          }}
                          title="Open chat"
                          className="p-1.5 rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            id="logout-confirm-dialog"
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-orange-200 text-center animate-in zoom-in-95 duration-150"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 border border-red-200 flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-bold text-neutral-900 font-['Outfit',sans-serif]">
              Log out of Z-messenger?
            </h3>
            <p className="mt-1.5 text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to sign out of <span className="font-bold text-orange-600">@{currentUser.username}</span>?
            </p>

            <div className="mt-6 flex items-center gap-2.5 justify-center">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-300 text-neutral-700 font-semibold text-xs hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-logout-btn"
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-red-600/20 transition-all cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
