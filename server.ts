import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import { Apinator as ApinatorServer } from "@apinator/server";
import { initializeApp, getApps, getApp } from "firebase/app";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  Firestore,
} from "firebase/firestore";

dotenv.config();

// In-memory data structures for fast real-time operation in container
interface UserRecord {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatar: string;
  password: string;
  role: "user" | "superadmin";
  createdAt: number;
  lastSeen: number;
  status: "online" | "offline" | "in-call";
}

interface GroupRecord {
  id: string;
  name: string;
  description?: string;
  avatar: string;
  creatorId: string;
  memberIds: string[];
  createdAt: number;
  lastMessage?: string;
  lastMessageTime?: number;
  lastMessageSenderName?: string;
}

interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  type: "text" | "voice" | "video" | "file" | "location";
  content: string;
  metadata?: {
    duration?: number;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    thumbnail?: string;
  };
  timestamp: number;
  read: boolean;
  isGroup?: boolean;
  groupId?: string;
  senderName?: string;
  senderAvatar?: string;
  senderUsername?: string;
  reactions?: Record<string, string[]>;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  isForwarded?: boolean;
}

interface CallSignal {
  id: string;
  fromUserId: string;
  toUserId: string;
  type: "call-request" | "call-accepted" | "call-declined" | "call-ended" | "offer" | "answer" | "ice-candidate" | "host-camera-mode";
  data?: any;
  timestamp: number;
}

interface StoryRecord {
  id: string;
  userId: string;
  userFullName: string;
  userUsername: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string;
  createdAt: number;
  expiresAt: number; // 24 hours after creation
  restrictedUserIds: string[]; // User IDs restricted from viewing
  viewers: string[]; // User IDs who viewed the story
}

interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerUsername: string;
  callerAvatar: string;
  receiverId: string;
  receiverName: string;
  receiverUsername: string;
  receiverAvatar: string;
  type: "video" | "audio";
  status: "completed" | "missed" | "declined" | "cancelled";
  durationSeconds: number;
  timestamp: number;
}

// Databases in memory (backed by Firestore)
const users = new Map<string, UserRecord>(); // key: userId
const userByEmail = new Map<string, string>(); // email.toLowerCase() -> userId
const userByUsername = new Map<string, string>(); // username.toLowerCase() -> userId
const contactsByUser = new Map<string, Set<string>>(); // userId -> Set of contactUserIds
const groups = new Map<string, GroupRecord>(); // key: groupId
const messages: MessageRecord[] = [];
const stories = new Map<string, StoryRecord>(); // key: storyId
const callLogs = new Map<string, CallRecord>(); // key: callId

// Initialize Firestore
let firestoreDb: Firestore | null = null;
try {
  const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    const rawCfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    const fbApp = getApps().length > 0 ? getApp() : initializeApp(rawCfg);
    firestoreDb = rawCfg.firestoreDatabaseId
      ? getFirestore(fbApp, rawCfg.firestoreDatabaseId)
      : getFirestore(fbApp);
    console.log("Firebase Firestore initialized with database:", rawCfg.firestoreDatabaseId || "(default)");
  }
} catch (err) {
  console.warn("Firebase Firestore initialization notice:", err);
}

// Firestore Persistence Helpers
function cleanForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((v) => v !== undefined)
      .map((v) => cleanForFirestore(v));
  }
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = cleanForFirestore(val);
    }
  }
  return clean;
}

async function persistUserToFirestore(user: UserRecord) {
  if (!firestoreDb) return;
  try {
    await setDoc(doc(firestoreDb, "users", user.id), cleanForFirestore(user));
  } catch (e) {
    console.warn("Firestore persistUser error:", e);
  }
}

async function deleteUserFromFirestore(userId: string) {
  if (!firestoreDb) return;
  try {
    await deleteDoc(doc(firestoreDb, "users", userId));
    await deleteDoc(doc(firestoreDb, "contacts", userId));
  } catch (e) {
    console.warn("Firestore deleteUser error:", e);
  }
}

async function persistContactsToFirestore(userId: string, contactIds: string[]) {
  if (!firestoreDb) return;
  try {
    await setDoc(doc(firestoreDb, "contacts", userId), cleanForFirestore({ userId, contactIds }));
  } catch (e) {
    console.warn("Firestore persistContacts error:", e);
  }
}

async function persistGroupToFirestore(group: GroupRecord) {
  if (!firestoreDb) return;
  try {
    await setDoc(doc(firestoreDb, "groups", group.id), cleanForFirestore(group));
  } catch (e) {
    console.warn("Firestore persistGroup error:", e);
  }
}

async function deleteGroupFromFirestore(groupId: string) {
  if (!firestoreDb) return;
  try {
    await deleteDoc(doc(firestoreDb, "groups", groupId));
  } catch (e) {
    console.warn("Firestore deleteGroup error:", e);
  }
}

async function persistMessageToFirestore(msg: MessageRecord) {
  if (!firestoreDb) return;
  try {
    const rawJson = JSON.stringify(msg);
    const sizeBytes = Buffer.byteLength(rawJson, "utf8");
    if (sizeBytes > 900000) {
      console.warn(`Message ${msg.id} size (${sizeBytes} bytes) exceeds Firestore 1MB limit. Storing compact version.`);
      const compactMsg = {
        ...msg,
        content: msg.type === "text" ? msg.content.substring(0, 500) : "[File attached]",
      };
      await setDoc(doc(firestoreDb, "messages", msg.id), cleanForFirestore(compactMsg));
      return;
    }
    await setDoc(doc(firestoreDb, "messages", msg.id), cleanForFirestore(msg));
  } catch (e: any) {
    console.warn("Firestore persistMessage error:", e?.message || e);
  }
}

async function persistStoryToFirestore(story: StoryRecord) {
  if (!firestoreDb) return;
  try {
    const rawJson = JSON.stringify(story);
    const sizeBytes = Buffer.byteLength(rawJson, "utf8");
    if (sizeBytes > 900000) {
      console.warn(`Story ${story.id} size (${sizeBytes} bytes) exceeds Firestore 1MB limit. Storing compact version.`);
      const compactStory = {
        ...story,
        mediaUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
        caption: (story.caption ? story.caption + " " : "") + "[Media stored in active session]",
      };
      await setDoc(doc(firestoreDb, "stories", story.id), cleanForFirestore(compactStory));
      return;
    }
    await setDoc(doc(firestoreDb, "stories", story.id), cleanForFirestore(story));
  } catch (e: any) {
    console.warn("Firestore persistStory error:", e?.message || e);
  }
}

async function persistCallLogToFirestore(call: CallRecord) {
  if (!firestoreDb) return;
  try {
    await setDoc(doc(firestoreDb, "call_logs", call.id), cleanForFirestore(call));
  } catch (e) {
    console.warn("Firestore persistCallLog error:", e);
  }
}

// Sync stored data from Cloud Firestore on start
async function loadDataFromFirestore() {
  if (!firestoreDb) return;
  try {
    // 1. Users
    const usersSnap = await getDocs(collection(firestoreDb, "users"));
    usersSnap.forEach((d) => {
      const u = d.data() as UserRecord;
      if (u && u.id) {
        users.set(u.id, u);
        if (u.email) userByEmail.set(u.email.toLowerCase(), u.id);
        if (u.username) userByUsername.set(u.username.toLowerCase(), u.id);
      }
    });

    // 2. Contacts
    const contactsSnap = await getDocs(collection(firestoreDb, "contacts"));
    contactsSnap.forEach((d) => {
      const data = d.data() as { userId: string; contactIds: string[] };
      if (data && data.userId && Array.isArray(data.contactIds)) {
        contactsByUser.set(data.userId, new Set(data.contactIds));
      }
    });

    // 3. Groups
    const groupsSnap = await getDocs(collection(firestoreDb, "groups"));
    groupsSnap.forEach((d) => {
      const g = d.data() as GroupRecord;
      if (g && g.id) {
        groups.set(g.id, g);
      }
    });

    // 4. Messages
    const messagesSnap = await getDocs(collection(firestoreDb, "messages"));
    messagesSnap.forEach((d) => {
      const m = d.data() as MessageRecord;
      if (m && m.id && !messages.some((existing) => existing.id === m.id)) {
        messages.push(m);
      }
    });

    // 5. Stories (ignore expired > 24 hours)
    const now = Date.now();
    const storiesSnap = await getDocs(collection(firestoreDb, "stories"));
    storiesSnap.forEach((d) => {
      const s = d.data() as StoryRecord;
      if (s && s.id && s.expiresAt > now) {
        stories.set(s.id, s);
      }
    });

    // 6. Call logs
    const callSnap = await getDocs(collection(firestoreDb, "call_logs"));
    callSnap.forEach((d) => {
      const c = d.data() as CallRecord;
      if (c && c.id) {
        callLogs.set(c.id, c);
      }
    });

    console.log(`Firestore loaded: ${users.size} users, ${groups.size} groups, ${messages.length} messages, ${callLogs.size} call records.`);
  } catch (err) {
    console.warn("Notice: Firestore load completed or initialized empty:", err);
  }
}

// Initialize Superadmin Account and load Cloud Firestore data
async function initializeServerData() {
  const adminEmail = "hashir0047@gmail.com";
  const adminUser = "hashir0047";
  const adminId = "u_superadmin";

  // Ensure superadmin exists with fresh credentials
  const superadmin: UserRecord = {
    id: adminId,
    email: adminEmail,
    username: adminUser,
    fullName: "Hashir",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    password: "Hashir@56",
    role: "superadmin",
    createdAt: Date.now(),
    lastSeen: Date.now(),
    status: "offline",
  };
  users.set(adminId, superadmin);
  userByEmail.set(adminEmail, adminId);
  userByUsername.set(adminUser, adminId);
  if (!contactsByUser.has(adminId)) {
    contactsByUser.set(adminId, new Set<string>());
  }

  // Load persistent records from Cloud Firestore
  await loadDataFromFirestore();

  // Make sure superadmin is safely stored in Firestore
  await persistUserToFirestore(superadmin);
}

initializeServerData();

// Real-time connections: SSE, native WebSocket, and Apinator Realtime
const sseClients = new Map<string, express.Response[]>();
const userSockets = new Map<string, Set<WebSocket>>();

const apinatorAppId = process.env.APINATOR_APP_ID || "b93128ee-a389-4c23-aafa-eebf7c379b33";
const apinatorKey = process.env.APINATOR_KEY || process.env.WEBSOCKET_APP_KEY || "app_8c3ff14ca7014206f19972b858b03ee42555b2a1";
const apinatorSecret = process.env.APINATOR_SECRET || process.env.WEBSOCKET_SECRET || "c668ed4b9881084ec5d3184fbeaf941a6b39b4b05d0025b123af3caf0df7084a";

let apinatorServer: ApinatorServer | null = null;
try {
  apinatorServer = new ApinatorServer({
    appId: apinatorAppId,
    key: apinatorKey,
    secret: apinatorSecret,
    cluster: "us",
  });
  console.log("Apinator Server initialized for cluster 'us'.");
} catch (err) {
  console.warn("Apinator Server initialization warning:", err);
}

function notifyUser(userId: string, event: string, payload: any) {
  // 1. Broadcast via WebSocket if client socket is open
  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) {
    const wsPayload = JSON.stringify({ type: event, ...payload, event, data: payload });
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(wsPayload);
        } catch (e) {}
      }
    }
  }

  // 2. Broadcast via SSE for dual connection redundancy
  const clients = sseClients.get(userId);
  if (clients && clients.length > 0) {
    const dataString = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      try {
        res.write(dataString);
      } catch (e) {
        // Connection may have closed
      }
    }
  }

  // 3. Broadcast via Apinator Realtime WebSocket channels
  if (apinatorServer) {
    apinatorServer
      .trigger({
        name: event,
        channel: `user-${userId}`,
        data: JSON.stringify(payload),
      })
      .catch((err) => {
        // Non-blocking trigger log
      });
  }
}


// Gemini AI Helper
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Initialize native WebSocket server on the same HTTP port
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    let currentUserId: string | null = null;
    try {
      const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
      const qUid = url.searchParams.get("userId");
      if (qUid) {
        currentUserId = qUid;
        if (!userSockets.has(qUid)) userSockets.set(qUid, new Set());
        userSockets.get(qUid)!.add(ws);
      }
    } catch (e) {}

    ws.on("message", (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        if (payload.type === "register" && payload.userId) {
          currentUserId = payload.userId;
          if (!userSockets.has(payload.userId)) userSockets.set(payload.userId, new Set());
          userSockets.get(payload.userId)!.add(ws);
          ws.send(JSON.stringify({ type: "registered", userId: payload.userId }));
        } else if (payload.type === "webrtc_signal" && payload.targetUserId) {
          notifyUser(payload.targetUserId, "webrtc_signal", payload.payload || payload);
        } else if (payload.type === "incoming_call" && payload.targetUserId) {
          notifyUser(payload.targetUserId, "incoming_call", payload.payload || payload);
        } else if (payload.type === "call_accepted" && payload.targetUserId) {
          notifyUser(payload.targetUserId, "call_accepted", payload.payload || payload);
        } else if (payload.type === "call_declined" && payload.targetUserId) {
          notifyUser(payload.targetUserId, "call_declined", payload.payload || payload);
        } else if (payload.type === "call_cancelled" && payload.targetUserId) {
          notifyUser(payload.targetUserId, "call_cancelled", payload.payload || payload);
        } else if (payload.type === "call_ended" && payload.targetUserId) {
          notifyUser(payload.targetUserId, "call_ended", payload.payload || payload);
        } else if (payload.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
        }
      } catch (err) {}
    });

    ws.on("close", () => {
      if (currentUserId && userSockets.has(currentUserId)) {
        const set = userSockets.get(currentUserId)!;
        set.delete(ws);
        if (set.size === 0) userSockets.delete(currentUserId);
      }
    });
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // CORS for development compatibility
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "Z-messenger", time: Date.now() });
  });

  // -------------------------------------------------------------
  // APINATOR REAL-TIME ENDPOINTS
  // -------------------------------------------------------------

  // Endpoint to authenticate private & presence channels
  app.post("/realtime/auth", (req, res) => {
    try {
      const socket_id = req.body?.socket_id || req.body?.socketId;
      const channel_name = req.body?.channel_name || req.body?.channelName;
      const userId = req.body?.userId;
      const userName = req.body?.userName;

      if (!apinatorServer) {
        res.status(500).json({ error: "Apinator Realtime server is not initialized" });
        return;
      }
      if (!socket_id || !channel_name) {
        res.status(400).json({ error: "socket_id and channel_name are required" });
        return;
      }

      const channelData = channel_name.startsWith("presence-")
        ? JSON.stringify({
            user_id: userId || "user_" + Date.now(),
            user_info: { name: userName || "User" },
          })
        : undefined;

      const authData = apinatorServer.authenticateChannel(socket_id, channel_name, channelData);
      res.json(authData);
    } catch (e: any) {
      console.warn("Apinator auth error:", e);
      res.status(403).json({ error: e?.message || "Channel authentication failed" });
    }
  });

  // Trigger events to Apinator channels from client/server
  app.post("/api/realtime/trigger", async (req, res) => {
    try {
      const { channel, event, data, socketId } = req.body;
      if (!channel || !event) {
        res.status(400).json({ error: "channel and event are required" });
        return;
      }

      if (apinatorServer) {
        await apinatorServer.trigger({
          channel,
          name: event,
          data: typeof data === "string" ? data : JSON.stringify(data),
          socketId,
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to trigger event" });
    }
  });


  // -------------------------------------------------------------
  // AUTH & USER MANAGEMENT
  // -------------------------------------------------------------

  // Check availability of email or username
  app.get("/api/auth/check-availability", (req, res) => {
    const { email, username, excludeUserId } = req.query;
    let emailTaken = false;
    let usernameTaken = false;

    if (email && typeof email === "string") {
      const cleanEmail = email.trim().toLowerCase();
      const existingId = userByEmail.get(cleanEmail);
      if (existingId && existingId !== excludeUserId) {
        emailTaken = true;
      }
    }
    if (username && typeof username === "string") {
      const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");
      const existingId = userByUsername.get(cleanUsername);
      if (existingId && existingId !== excludeUserId) {
        usernameTaken = true;
      }
    }

    res.json({ emailTaken, usernameTaken });
  });

  // User Registration
  app.post("/api/auth/register", (req, res) => {
    try {
      const { email, password, username, fullName, avatar } = req.body;

      if (!email || !password || !username || !fullName) {
        res.status(400).json({ error: "Missing required fields (email, password, username, fullName)" });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");

      if (userByEmail.has(cleanEmail)) {
        res.status(409).json({ error: "An account with this email address already exists. Please log in." });
        return;
      }

      // STRICT USERNAME UNIQUENESS CHECK
      if (userByUsername.has(cleanUsername)) {
        res.status(409).json({ error: "This username is already taken. Please choose a unique username." });
        return;
      }

      const userId = "u_" + Math.random().toString(36).substring(2, 11);
      const isSuperadmin = cleanEmail === "hashir0047@gmail.com";

      const newUser: UserRecord = {
        id: userId,
        email: cleanEmail,
        username: cleanUsername,
        fullName: fullName.trim(),
        avatar: avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
        password: password, // In memory secure storage
        role: isSuperadmin ? "superadmin" : "user",
        createdAt: Date.now(),
        lastSeen: Date.now(),
        status: "online",
      };

      users.set(userId, newUser);
      userByEmail.set(cleanEmail, userId);
      userByUsername.set(cleanUsername, userId);
      contactsByUser.set(userId, new Set<string>());

      // Persist to Cloud Firestore
      persistUserToFirestore(newUser);

      // Safe user object to return
      const safeUser = {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        fullName: newUser.fullName,
        avatar: newUser.avatar,
        role: newUser.role,
        status: newUser.status,
        createdAt: newUser.createdAt,
      };

      res.status(201).json({ success: true, user: safeUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to register account" });
    }
  });

  // User Login
  app.post("/api/auth/login", (req, res) => {
    try {
      const { identifier, password } = req.body;

      if (!identifier || !password) {
        res.status(400).json({ error: "Please enter your email or username and password." });
        return;
      }

      const cleanId = identifier.trim().toLowerCase().replace(/^@/, "");
      let userId = userByEmail.get(cleanId);
      if (!userId) {
        userId = userByUsername.get(cleanId);
      }

      if (!userId) {
        res.status(401).json({ error: "Account does not exist with this email or username." });
        return;
      }

      const user = users.get(userId);
      if (!user || user.password !== password) {
        res.status(401).json({ error: "Incorrect password. Please verify and try again." });
        return;
      }

      // Mark user as online
      user.status = "online";
      user.lastSeen = Date.now();

      // Check superadmin grant
      const userRole = user.role || (user.email === "hashir0047@gmail.com" ? "superadmin" : "user");
      user.role = userRole;

      persistUserToFirestore(user);

      const safeUser = {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      };

      res.json({ success: true, user: safeUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Login failed" });
    }
  });

  // Update profile with unique username check
  app.post("/api/users/profile", (req, res) => {
    const { userId, fullName, avatar, username } = req.body;
    if (!userId || !users.has(userId)) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const user = users.get(userId)!;
    if (fullName) user.fullName = fullName.trim();
    if (avatar !== undefined) user.avatar = avatar;

    if (username) {
      const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");
      if (cleanUsername !== user.username) {
        if (userByUsername.has(cleanUsername)) {
          res.status(409).json({ error: "This username is already taken by another account." });
          return;
        }
        userByUsername.delete(user.username);
        user.username = cleanUsername;
        userByUsername.set(cleanUsername, user.id);
      }
    }

    persistUserToFirestore(user);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
      },
    });
  });

  // Search User by exact Unique Username
  app.get("/api/users/search", (req, res) => {
    const query = req.query.username;
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Username query parameter required" });
      return;
    }

    const raw = query.trim().toLowerCase();
    const cleanUsername = raw.replace(/^@+/, "");

    // 1. Direct username lookup
    let targetUserId = userByUsername.get(cleanUsername) || userByUsername.get(raw);

    // 2. Direct email lookup
    if (!targetUserId) {
      targetUserId = userByEmail.get(raw) || userByEmail.get(cleanUsername);
    }

    // 3. Fallback scan through users for case-insensitive or email match
    if (!targetUserId) {
      for (const u of users.values()) {
        const uClean = u.username.trim().toLowerCase().replace(/^@+/, "");
        const eClean = u.email.trim().toLowerCase();
        if (uClean === cleanUsername || eClean === raw || uClean === raw) {
          targetUserId = u.id;
          break;
        }
      }
    }

    // 4. Fuzzy / partial match scan if still not found
    if (!targetUserId) {
      for (const u of users.values()) {
        const uClean = u.username.trim().toLowerCase().replace(/^@+/, "");
        if (uClean.includes(cleanUsername) || u.fullName.toLowerCase().includes(cleanUsername)) {
          targetUserId = u.id;
          break;
        }
      }
    }

    if (!targetUserId) {
      res.status(404).json({ error: `User with username '@${cleanUsername}' not found. Make sure the username is registered.` });
      return;
    }

    const targetUser = users.get(targetUserId);
    if (!targetUser) {
      res.status(404).json({ error: "User record missing" });
      return;
    }

    res.json({
      user: {
        id: targetUser.id,
        username: targetUser.username,
        fullName: targetUser.fullName,
        avatar: targetUser.avatar,
        status: targetUser.status,
        lastSeen: targetUser.lastSeen,
      },
    });
  });

  // User presence heartbeat
  app.post("/api/users/presence", (req, res) => {
    const { userId, status } = req.body;
    if (userId && users.has(userId)) {
      const user = users.get(userId)!;
      if (status) user.status = status;
      user.lastSeen = Date.now();
    }
    res.json({ success: true });
  });

  // -------------------------------------------------------------
  // CONTACTS MANAGEMENT (Strict Isolation: Contacts of one user never mixed)
  // -------------------------------------------------------------

  app.get("/api/contacts", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }

    const contactIds = contactsByUser.get(userId) || new Set<string>();
    const contactList = Array.from(contactIds).map((cid) => {
      const u = users.get(cid);
      if (!u) return null;
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        avatar: u.avatar,
        status: u.status,
        lastSeen: u.lastSeen,
      };
    }).filter(Boolean);

    res.json({ contacts: contactList });
  });

  app.post("/api/contacts/add", (req, res) => {
    const { userId, targetUsername } = req.body;
    if (!userId || !targetUsername) {
      res.status(400).json({ error: "Missing userId or targetUsername" });
      return;
    }

    const raw = targetUsername.trim().toLowerCase();
    const cleanTarget = raw.replace(/^@+/, "");

    // 1. Direct username map lookup
    let targetUserId = userByUsername.get(cleanTarget) || userByUsername.get(raw);

    // 2. Direct email map lookup
    if (!targetUserId) {
      targetUserId = userByEmail.get(raw) || userByEmail.get(cleanTarget);
    }

    // 3. Fallback scan through users for match
    if (!targetUserId) {
      for (const u of users.values()) {
        const uClean = u.username.trim().toLowerCase().replace(/^@+/, "");
        const eClean = u.email.trim().toLowerCase();
        if (uClean === cleanTarget || eClean === raw || uClean === raw) {
          targetUserId = u.id;
          break;
        }
      }
    }

    // 4. Partial fallback
    if (!targetUserId) {
      for (const u of users.values()) {
        const uClean = u.username.trim().toLowerCase().replace(/^@+/, "");
        if (uClean.includes(cleanTarget) || u.fullName.toLowerCase().includes(cleanTarget)) {
          targetUserId = u.id;
          break;
        }
      }
    }

    if (!targetUserId) {
      res.status(404).json({ error: `No user found with username '@${cleanTarget}'. Check the spelling or ask them for their registered username.` });
      return;
    }

    if (targetUserId === userId) {
      res.status(400).json({ error: "You cannot add yourself to your own contacts." });
      return;
    }

    let userContacts = contactsByUser.get(userId);
    if (!userContacts) {
      userContacts = new Set<string>();
      contactsByUser.set(userId, userContacts);
    }

    if (userContacts.has(targetUserId)) {
      res.status(400).json({ error: `@${targetUsername} is already in your contacts.` });
      return;
    }

    userContacts.add(targetUserId);

    // Also reciprocally link so both users can chat naturally
    let targetContacts = contactsByUser.get(targetUserId);
    if (!targetContacts) {
      targetContacts = new Set<string>();
      contactsByUser.set(targetUserId, targetContacts);
    }
    targetContacts.add(userId);

    // Save contact links to Firestore
    persistContactsToFirestore(userId, Array.from(userContacts));
    persistContactsToFirestore(targetUserId, Array.from(targetContacts));

    const targetUser = users.get(targetUserId)!;
    const addedContact = {
      id: targetUser.id,
      username: targetUser.username,
      fullName: targetUser.fullName,
      avatar: targetUser.avatar,
      status: targetUser.status,
      lastSeen: targetUser.lastSeen,
    };

    // Notify target that someone added them
    notifyUser(targetUserId, "contact_added", {
      from: {
        id: userId,
        username: users.get(userId)?.username,
        fullName: users.get(userId)?.fullName,
        avatar: users.get(userId)?.avatar,
      },
    });

    res.json({ success: true, contact: addedContact });
  });

  // Remove contact
  app.delete("/api/contacts", (req, res) => {
    const { userId, contactId } = req.body;
    if (userId && contactId && contactsByUser.has(userId)) {
      contactsByUser.get(userId)!.delete(contactId);
      persistContactsToFirestore(userId, Array.from(contactsByUser.get(userId)!));
    }
    res.json({ success: true });
  });

  // Get all users (for creating groups or contact discovery)
  app.get("/api/users/all", (req, res) => {
    const excludeUserId = req.query.excludeUserId as string;
    const allUsers = Array.from(users.values())
      .filter((u) => !excludeUserId || u.id !== excludeUserId)
      .map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        avatar: u.avatar,
        status: u.status,
        role: u.role || (u.email === "hashir0047@gmail.com" ? "superadmin" : "user"),
      }));
    res.json({ users: allUsers });
  });

  // -------------------------------------------------------------
  // SUPERADMIN MANAGEMENT (hashir0047@gmail.com / Hashir@56)
  // -------------------------------------------------------------

  function checkSuperadmin(requesterId: string | undefined): boolean {
    if (!requesterId) return false;
    const u = users.get(requesterId);
    if (!u) return false;
    return u.role === "superadmin" || u.email.toLowerCase() === "hashir0047@gmail.com";
  }

  // Get all accounts (Superadmin only)
  app.get("/api/admin/users", (req, res) => {
    const requesterId = req.query.requesterId as string;
    if (!checkSuperadmin(requesterId)) {
      res.status(403).json({ error: "Access denied. Superadmin privileges required." });
      return;
    }

    const accounts = Array.from(users.values()).map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      role: u.role || (u.email === "hashir0047@gmail.com" ? "superadmin" : "user"),
      status: u.status,
      createdAt: u.createdAt,
      lastSeen: u.lastSeen,
      contactsCount: contactsByUser.get(u.id)?.size || 0,
      messagesCount: messages.filter((m) => m.senderId === u.id).length,
    }));

    res.json({ users: accounts });
  });

  // Admin stats
  app.get("/api/admin/stats", (req, res) => {
    const requesterId = req.query.requesterId as string;
    if (!checkSuperadmin(requesterId)) {
      res.status(403).json({ error: "Access denied. Superadmin privileges required." });
      return;
    }

    const allU = Array.from(users.values());
    res.json({
      totalUsers: allU.length,
      onlineUsers: allU.filter((u) => u.status === "online").length,
      totalGroups: groups.size,
      totalMessages: messages.length,
    });
  });

  // Delete user account (Superadmin only)
  app.delete("/api/admin/users/:id", (req, res) => {
    const requesterId = (req.query.requesterId || req.body?.requesterId) as string;
    if (!checkSuperadmin(requesterId)) {
      res.status(403).json({ error: "Access denied. Superadmin privileges required." });
      return;
    }

    const targetId = req.params.id;
    const target = users.get(targetId);

    if (!target) {
      res.status(404).json({ error: "User account not found." });
      return;
    }

    // Protection: superadmin account cannot be deleted
    if (target.email.toLowerCase() === "hashir0047@gmail.com" || target.role === "superadmin") {
      res.status(400).json({ error: "Cannot delete the superadmin account." });
      return;
    }

    // Remove from in-memory maps
    users.delete(targetId);
    userByEmail.delete(target.email);
    userByUsername.delete(target.username);

    // Remove from all users' contact sets
    for (const [_uid, cSet] of contactsByUser.entries()) {
      cSet.delete(targetId);
    }
    contactsByUser.delete(targetId);

    // Remove from any groups
    for (const [_gid, group] of groups.entries()) {
      group.memberIds = group.memberIds.filter((mId) => mId !== targetId);
    }

    // Disconnect and notify the target user via SSE
    notifyUser(targetId, "account_deleted", {
      reason: "Your account has been permanently deleted by the superadmin.",
    });

    // Remove user from Cloud Firestore
    deleteUserFromFirestore(targetId);

    res.json({
      success: true,
      message: `Account @${target.username} (${target.fullName}) was deleted successfully.`,
    });
  });

  // Wipe all data from the website (Messages, groups, contacts, and reset state)
  app.post("/api/admin/reset-all-data", async (req, res) => {
    messages.length = 0;
    groups.clear();
    stories.clear();
    callLogs.clear();
    for (const [uid] of users.entries()) {
      contactsByUser.set(uid, new Set<string>());
    }
    await initializeServerData();
    res.json({
      success: true,
      message: "All data from the website has been deleted and the platform reset to an empty, clean state.",
    });
  });

  app.post("/api/system/reset-all-data", async (req, res) => {
    messages.length = 0;
    groups.clear();
    stories.clear();
    callLogs.clear();
    for (const [uid] of users.entries()) {
      contactsByUser.set(uid, new Set<string>());
    }
    await initializeServerData();
    res.json({
      success: true,
      message: "All website data wiped.",
    });
  });

  // -------------------------------------------------------------
  // STORIES (24-Hour Expiration & Restrict Specific Persons)
  // -------------------------------------------------------------

  // Periodic story cleanup every minute (Delete stories after 24 hours)
  setInterval(() => {
    const now = Date.now();
    for (const [sId, story] of stories.entries()) {
      if (story.expiresAt <= now) {
        stories.delete(sId);
      }
    }
  }, 60 * 1000);

  // Get active stories visible to viewer (excludes expired & restricted stories)
  app.get("/api/stories", (req, res) => {
    const viewerId = req.query.viewerId as string;
    const now = Date.now();

    // Clean expired
    for (const [sId, story] of stories.entries()) {
      if (story.expiresAt <= now) {
        stories.delete(sId);
      }
    }

    const visibleStories: StoryRecord[] = [];
    for (const story of stories.values()) {
      // Author always sees their own story
      if (story.userId === viewerId) {
        visibleStories.push(story);
        continue;
      }

      // Check if they are added contacts (either author has added viewer or viewer has added author)
      const authorContacts = contactsByUser.get(story.userId);
      const viewerContacts = viewerId ? contactsByUser.get(viewerId) : null;
      const isAddedContact = Boolean(
        (authorContacts && viewerId && authorContacts.has(viewerId)) ||
        (viewerContacts && viewerContacts.has(story.userId))
      );

      // Story will not share to everyone, only to contacts that are added
      if (!isAddedContact) {
        continue;
      }

      // If restricted persons list includes viewerId, hide it
      const isRestricted = Array.isArray(story.restrictedUserIds) && story.restrictedUserIds.includes(viewerId);
      if (!isRestricted) {
        visibleStories.push(story);
      }
    }

    visibleStories.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ stories: visibleStories });
  });

  // Post a new story (Valid for 24 hours, optional restrictedUserIds)
  app.post("/api/stories", (req, res) => {
    const { userId, mediaUrl, mediaType, caption, restrictedUserIds } = req.body;

    if (!userId || !mediaUrl) {
      res.status(400).json({ error: "Missing userId or mediaUrl" });
      return;
    }

    const user = users.get(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const storyId = "story_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours from creation

    const restrictedList = Array.isArray(restrictedUserIds) ? restrictedUserIds : [];

    const newStory: StoryRecord = {
      id: storyId,
      userId,
      userFullName: user.fullName,
      userUsername: user.username,
      userAvatar: user.avatar,
      mediaUrl,
      mediaType: mediaType || "image",
      caption: caption || "",
      createdAt: now,
      expiresAt,
      restrictedUserIds: restrictedList,
      viewers: [],
    };

    stories.set(storyId, newStory);
    persistStoryToFirestore(newStory);

    // Notify contacts who are not restricted via SSE
    const userContacts = contactsByUser.get(userId) || new Set<string>();
    for (const cId of userContacts) {
      if (!restrictedList.includes(cId)) {
        notifyUser(cId, "new_story", newStory);
      }
    }

    res.json({ success: true, story: newStory });
  });

  // Mark story as viewed
  app.post("/api/stories/:id/view", (req, res) => {
    const { viewerId } = req.body;
    const story = stories.get(req.params.id);
    if (!story) {
      res.status(404).json({ error: "Story not found or expired." });
      return;
    }

    if (viewerId && !story.viewers.includes(viewerId)) {
      story.viewers.push(viewerId);
      // Notify author of view
      notifyUser(story.userId, "story_viewed", {
        storyId: story.id,
        viewerId,
        viewersCount: story.viewers.length,
      });
    }

    res.json({ success: true, viewers: story.viewers });
  });

  // Delete story
  app.delete("/api/stories/:id", (req, res) => {
    const requesterId = (req.query.requesterId || req.body?.requesterId) as string;
    const story = stories.get(req.params.id);
    if (!story) {
      res.status(404).json({ error: "Story not found." });
      return;
    }

    if (story.userId !== requesterId && !checkSuperadmin(requesterId)) {
      res.status(403).json({ error: "Unauthorized to delete this story." });
      return;
    }

    stories.delete(req.params.id);
    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, "stories", req.params.id)).catch((err) => {
        console.warn("Firestore delete story error:", err);
      });
    }
    res.json({ success: true, message: "Story deleted." });
  });

  // -------------------------------------------------------------
  // GROUP CHAT MANAGEMENT (More than 2 people can communicate)
  // -------------------------------------------------------------

  function formatGroup(group: GroupRecord) {
    const members = group.memberIds
      .map((mId) => {
        const u = users.get(mId);
        if (!u) return null;
        return {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          avatar: u.avatar,
          status: u.status,
          role: mId === group.creatorId ? ("admin" as const) : ("member" as const),
        };
      })
      .filter(Boolean);

    return {
      ...group,
      members,
    };
  }

  // Create a group (Requires > 2 people => at least 3 members total)
  app.post("/api/groups", (req, res) => {
    const { name, description, avatar, creatorId, memberIds } = req.body;

    if (!name || !creatorId) {
      res.status(400).json({ error: "Group name and creatorId are required." });
      return;
    }

    const rawMembers = Array.isArray(memberIds) ? memberIds : [];
    const distinctMemberIds = Array.from(new Set([creatorId, ...rawMembers]));

    // Constraint: "where more than 2 person can communicate"
    if (distinctMemberIds.length < 3) {
      res.status(400).json({
        error: "A group must include more than 2 people (at least 3 members total including you). Please select at least 2 other people.",
      });
      return;
    }

    const groupId = "g_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const defaultAvatar =
      avatar ||
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80";

    const newGroup: GroupRecord = {
      id: groupId,
      name: name.trim(),
      description: description ? description.trim() : "",
      avatar: defaultAvatar,
      creatorId,
      memberIds: distinctMemberIds,
      createdAt: Date.now(),
      lastMessage: "Group created",
      lastMessageTime: Date.now(),
      lastMessageSenderName: users.get(creatorId)?.fullName || "Admin",
    };

    groups.set(groupId, newGroup);
    persistGroupToFirestore(newGroup);

    const formatted = formatGroup(newGroup);

    // Notify all members via SSE
    for (const mId of distinctMemberIds) {
      notifyUser(mId, "group_created", formatted);
    }

    res.status(201).json({ success: true, group: formatted });
  });

  // Get all groups for a user
  app.get("/api/groups", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }

    const userGroups: any[] = [];
    for (const group of groups.values()) {
      if (group.memberIds.includes(userId)) {
        userGroups.push(formatGroup(group));
      }
    }

    userGroups.sort((a, b) => (b.lastMessageTime || b.createdAt) - (a.lastMessageTime || a.createdAt));

    res.json({ groups: userGroups });
  });

  // Get single group
  app.get("/api/groups/:id", (req, res) => {
    const group = groups.get(req.params.id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    res.json({ group: formatGroup(group) });
  });

  // Add member(s) to group
  app.post("/api/groups/:id/members", (req, res) => {
    const group = groups.get(req.params.id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const { memberIds } = req.body;
    const toAdd = Array.isArray(memberIds) ? memberIds : [memberIds];

    for (const id of toAdd) {
      if (id && users.has(id) && !group.memberIds.includes(id)) {
        group.memberIds.push(id);
        notifyUser(id, "group_created", formatGroup(group));
      }
    }

    const formatted = formatGroup(group);
    for (const mId of group.memberIds) {
      notifyUser(mId, "group_updated", formatted);
    }

    res.json({ success: true, group: formatted });
  });

  // Leave or remove member from group
  app.delete("/api/groups/:id/members/:memberId", (req, res) => {
    const group = groups.get(req.params.id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const memberToRemove = req.params.memberId;
    group.memberIds = group.memberIds.filter((m) => m !== memberToRemove);

    if (group.memberIds.length === 0) {
      groups.delete(group.id);
      res.json({ success: true, deleted: true });
      return;
    }

    const formatted = formatGroup(group);
    for (const mId of group.memberIds) {
      notifyUser(mId, "group_updated", formatted);
    }
    notifyUser(memberToRemove, "group_left", { groupId: group.id });

    res.json({ success: true, group: formatted });
  });

  // Update group details (Change group DP / avatar, name, description)
  app.patch("/api/groups/:id", (req, res) => {
    const group = groups.get(req.params.id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const { avatar, name, description } = req.body;
    if (avatar && typeof avatar === "string") {
      group.avatar = avatar;
    }
    if (name && typeof name === "string" && name.trim()) {
      group.name = name.trim();
    }
    if (description !== undefined && typeof description === "string") {
      group.description = description.trim();
    }

    // Persist to Cloud Firestore
    persistGroupToFirestore(group);

    const formatted = formatGroup(group);

    // Notify all group members of the updated DP / info
    for (const mId of group.memberIds) {
      notifyUser(mId, "group_updated", formatted);
    }

    res.json({ success: true, group: formatted });
  });

  // -------------------------------------------------------------
  // REAL-TIME MESSAGING (1-on-1 & Multi-Person Groups)

  // -------------------------------------------------------------

  function getConversationKey(u1: string, u2: string) {
    return [u1, u2].sort().join("::");
  }

  app.get("/api/messages", (req, res) => {
    const { userId, contactId, groupId } = req.query;

    if (groupId && typeof groupId === "string") {
      let chatMsgs = messages.filter((m) => m.conversationId === groupId || m.groupId === groupId);
      if (userId && typeof userId === "string") {
        chatMsgs = chatMsgs.filter((m) => !m.deletedFor?.includes(userId));
      }
      res.json({ messages: chatMsgs });
      return;
    }

    if (!userId || !contactId || typeof userId !== "string" || typeof contactId !== "string") {
      res.status(400).json({ error: "Missing userId, contactId, or groupId" });
      return;
    }

    // Check if contactId is actually a group
    if (contactId.startsWith("g_")) {
      let chatMsgs = messages.filter((m) => m.conversationId === contactId || m.groupId === contactId);
      chatMsgs = chatMsgs.filter((m) => !m.deletedFor?.includes(userId));
      res.json({ messages: chatMsgs });
      return;
    }

    const convKey = getConversationKey(userId, contactId);
    let chatMsgs = messages.filter((m) => m.conversationId === convKey);
    chatMsgs = chatMsgs.filter((m) => !m.deletedFor?.includes(userId));

    // Mark received messages as read
    for (const m of chatMsgs) {
      if (m.receiverId === userId && !m.read) {
        m.read = true;
      }
    }

    res.json({ messages: chatMsgs });
  });

  app.post("/api/messages", (req, res) => {
    const { senderId, receiverId, groupId, type, content, metadata } = req.body;

    if (!senderId || (!receiverId && !groupId) || !type || content === undefined) {
      res.status(400).json({ error: "Missing required message parameters" });
      return;
    }

    const targetGroupId = groupId || (receiverId && receiverId.startsWith("g_") ? receiverId : null);
    const sender = users.get(senderId);

    // GROUP MESSAGE DISPATCH
    if (targetGroupId) {
      const group = groups.get(targetGroupId);
      if (!group) {
        res.status(404).json({ error: "Group does not exist" });
        return;
      }

      const msgId = "m_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const newMsg: MessageRecord = {
        id: msgId,
        conversationId: targetGroupId,
        groupId: targetGroupId,
        senderId,
        receiverId: targetGroupId,
        type,
        content,
        ...(metadata !== undefined ? { metadata } : {}),
        timestamp: Date.now(),
        read: true,
        isGroup: true,
        senderName: sender?.fullName || "Group Member",
        senderAvatar: sender?.avatar || "",
        senderUsername: sender?.username || "",
      };

      messages.push(newMsg);
      persistMessageToFirestore(newMsg);

      // Update group's preview info
      group.lastMessage = content;
      group.lastMessageTime = Date.now();
      group.lastMessageSenderName = newMsg.senderName;

      // Broadcast to every member of the group (except sender)
      for (const memberId of group.memberIds) {
        if (memberId !== senderId) {
          notifyUser(memberId, "new_message", newMsg);
        }
      }

      res.status(201).json({ success: true, message: newMsg });
      return;
    }

    // 1-on-1 DIRECT MESSAGE
    const convKey = getConversationKey(senderId, receiverId);
    const msgId = "m_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const newMsg: MessageRecord = {
      id: msgId,
      conversationId: convKey,
      senderId,
      receiverId,
      type,
      content,
      ...(metadata !== undefined ? { metadata } : {}),
      timestamp: Date.now(),
      read: false,
      senderName: sender?.fullName || "User",
      senderAvatar: sender?.avatar || "",
      senderUsername: sender?.username || "",
    };

    messages.push(newMsg);
    persistMessageToFirestore(newMsg);

    // Notify receiver via SSE
    notifyUser(receiverId, "new_message", newMsg);

    res.status(201).json({ success: true, message: newMsg });
  });

  // React to a message (Emoji reaction toggle)
  app.post("/api/messages/:id/react", (req, res) => {
    const msgId = req.params.id;
    const { userId, emoji } = req.body;
    if (!userId || !emoji) {
      res.status(400).json({ error: "userId and emoji are required" });
      return;
    }

    const msg = messages.find((m) => m.id === msgId);
    if (!msg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (!msg.reactions) {
      msg.reactions = {};
    }

    const currentList = msg.reactions[emoji] || [];
    if (currentList.includes(userId)) {
      // Toggle off
      msg.reactions[emoji] = currentList.filter((u) => u !== userId);
      if (msg.reactions[emoji].length === 0) {
        delete msg.reactions[emoji];
      }
    } else {
      // Add reaction
      msg.reactions[emoji] = [...currentList, userId];
    }

    persistMessageToFirestore(msg);

    const reactionPayload = { messageId: msg.id, reactions: msg.reactions, conversationId: msg.conversationId };
    if (msg.groupId) {
      const grp = groups.get(msg.groupId);
      if (grp) {
        for (const mId of grp.memberIds) {
          notifyUser(mId, "message_reaction", reactionPayload);
        }
      }
    } else {
      notifyUser(msg.senderId, "message_reaction", reactionPayload);
      notifyUser(msg.receiverId, "message_reaction", reactionPayload);
    }

    res.json({ success: true, reactions: msg.reactions });
  });

  // Delete message for myself
  app.post("/api/messages/:id/delete-me", (req, res) => {
    const msgId = req.params.id;
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const msg = messages.find((m) => m.id === msgId);
    if (msg) {
      if (!msg.deletedFor) {
        msg.deletedFor = [];
      }
      if (!msg.deletedFor.includes(userId)) {
        msg.deletedFor.push(userId);
        persistMessageToFirestore(msg);
      }
    }
    res.json({ success: true, messageId: msgId });
  });

  // Delete message for everyone
  app.delete("/api/messages/:id", (req, res) => {
    const msgId = req.params.id;
    const index = messages.findIndex((m) => m.id === msgId);
    if (index !== -1) {
      const msg = messages[index];
      msg.isDeletedForEveryone = true;
      msg.content = "This message was deleted";
      msg.type = "text";
      delete msg.metadata;
      msg.reactions = {};

      persistMessageToFirestore(msg);

      const deletePayload = { messageId: msgId, isDeletedForEveryone: true, conversationId: msg.conversationId };
      if (msg.groupId) {
        const grp = groups.get(msg.groupId);
        if (grp) {
          for (const mId of grp.memberIds) {
            notifyUser(mId, "message_deleted", deletePayload);
          }
        }
      } else {
        notifyUser(msg.senderId, "message_deleted", deletePayload);
        notifyUser(msg.receiverId, "message_deleted", deletePayload);
      }
    }
    res.json({ success: true, messageId: msgId });
  });

  // Forward message to another contact or group
  app.post("/api/messages/forward", (req, res) => {
    const { senderId, targetId, isGroup, originalMessageId } = req.body;
    const orig = messages.find((m) => m.id === originalMessageId);
    if (!orig || !senderId || !targetId) {
      res.status(400).json({ error: "Missing required parameters" });
      return;
    }

    const sender = users.get(senderId);
    const msgId = "m_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    if (isGroup) {
      const newMsg: MessageRecord = {
        id: msgId,
        conversationId: targetId,
        groupId: targetId,
        senderId,
        receiverId: targetId,
        type: orig.type,
        content: orig.content,
        metadata: orig.metadata ? { ...orig.metadata } : undefined,
        timestamp: Date.now(),
        read: true,
        isGroup: true,
        isForwarded: true,
        senderName: sender?.fullName || "Group Member",
        senderAvatar: sender?.avatar || "",
        senderUsername: sender?.username || "",
      };
      messages.push(newMsg);
      persistMessageToFirestore(newMsg);
      const group = groups.get(targetId);
      if (group) {
        group.lastMessage = orig.content;
        group.lastMessageTime = Date.now();
        for (const mId of group.memberIds) {
          if (mId !== senderId) notifyUser(mId, "new_message", newMsg);
        }
      }
      res.json({ success: true, message: newMsg });
      return;
    }

    // Direct message forward
    const convKey = getConversationKey(senderId, targetId);
    const newMsg: MessageRecord = {
      id: msgId,
      conversationId: convKey,
      senderId,
      receiverId: targetId,
      type: orig.type,
      content: orig.content,
      metadata: orig.metadata ? { ...orig.metadata } : undefined,
      timestamp: Date.now(),
      read: false,
      isForwarded: true,
      senderName: sender?.fullName || "User",
      senderAvatar: sender?.avatar || "",
      senderUsername: sender?.username || "",
    };
    messages.push(newMsg);
    persistMessageToFirestore(newMsg);
    notifyUser(targetId, "new_message", newMsg);
    res.json({ success: true, message: newMsg });
  });

  // -------------------------------------------------------------
  // WEBRTC SIGNALING SERVER (Offer, Answer, ICE, Call Control)
  // -------------------------------------------------------------

  app.post("/api/signaling/call", (req, res) => {
    const { callerId, receiverId, callType, hostCameraOnly } = req.body;
    if (!callerId || !receiverId) {
      res.status(400).json({ error: "callerId and receiverId required" });
      return;
    }

    const caller = users.get(callerId);
    if (!caller) {
      res.status(404).json({ error: "Caller not found" });
      return;
    }

    const callPayload = {
      id: "call_" + Date.now(),
      caller: {
        id: caller.id,
        username: caller.username,
        fullName: caller.fullName,
        avatar: caller.avatar,
      },
      receiverId,
      callType: callType || "video",
      hostCameraOnly: !!hostCameraOnly,
      timestamp: Date.now(),
    };

    // Broadcast to receiver's active sessions
    notifyUser(receiverId, "incoming_call", callPayload);

    res.json({ success: true, call: callPayload });
  });

  async function recordCallEvent(
    callerId: string,
    receiverId: string,
    callType: "video" | "audio",
    status: "completed" | "missed" | "declined" | "cancelled",
    durationSeconds: number = 0
  ) {
    const caller = users.get(callerId);
    const receiver = users.get(receiverId);
    if (!caller || !receiver) return null;

    const record: CallRecord = {
      id: "call_log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      callerId,
      callerName: caller.fullName,
      callerUsername: caller.username,
      callerAvatar: caller.avatar,
      receiverId,
      receiverName: receiver.fullName,
      receiverUsername: receiver.username,
      receiverAvatar: receiver.avatar,
      type: callType,
      status,
      durationSeconds: Math.max(0, durationSeconds),
      timestamp: Date.now(),
    };

    callLogs.set(record.id, record);
    await persistCallLogToFirestore(record);

    // Notify both parties via real-time SSE
    notifyUser(callerId, "new_call_log", record);
    notifyUser(receiverId, "new_call_log", record);

    return record;
  }

  // Cancel call (called when caller hangs up before answer)
  app.post("/api/calls/cancel", async (req, res) => {
    const { callerId, receiverId, callType } = req.body;
    if (callerId && receiverId) {
      notifyUser(receiverId, "call_cancelled", { fromUserId: callerId, callerId });
      notifyUser(receiverId, "call_ended", { fromUserId: callerId, callerId });
      notifyUser(callerId, "call_ended", { toUserId: receiverId });
      // Record as missed call for receiver
      await recordCallEvent(callerId, receiverId, callType || "video", "missed", 0);
    }
    res.json({ success: true });
  });

  // Log completed or ended call
  app.post("/api/calls/log", async (req, res) => {
    const { callerId, receiverId, type, status, durationSeconds } = req.body;
    if (!callerId || !receiverId) {
      res.status(400).json({ error: "callerId and receiverId required" });
      return;
    }

    const rec = await recordCallEvent(
      callerId,
      receiverId,
      type || "video",
      status || (durationSeconds > 0 ? "completed" : "cancelled"),
      durationSeconds || 0
    );

    res.json({ success: true, call: rec });
  });

  // Get call history with separate filter for missed calls and durations
  app.get("/api/calls", (req, res) => {
    const userId = req.query.userId as string;
    const filter = req.query.filter as string; // "all" | "missed"
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }

    const allRecords = Array.from(callLogs.values())
      .filter((c) => c.callerId === userId || c.receiverId === userId)
      .sort((a, b) => b.timestamp - a.timestamp);

    const mapped = allRecords.map((c) => {
      const isOutgoing = c.callerId === userId;
      // It's a missed call for this user if they were the receiver and did not pick up
      const isMissed = !isOutgoing && (c.status === "missed" || (c.status === "cancelled" && c.durationSeconds === 0));
      
      const peer = isOutgoing
        ? { id: c.receiverId, fullName: c.receiverName, username: c.receiverUsername, avatar: c.receiverAvatar }
        : { id: c.callerId, fullName: c.callerName, username: c.callerUsername, avatar: c.callerAvatar };

      return {
        ...c,
        isOutgoing,
        isMissed,
        peer,
      };
    });

    const filtered = filter === "missed" ? mapped.filter((c) => c.isMissed) : mapped;
    res.json({ calls: filtered });
  });

  app.post("/api/signaling/signal", (req, res) => {
    const { fromUserId, toUserId, type, data } = req.body;
    if (!fromUserId || !toUserId || !type) {
      res.status(400).json({ error: "Missing signaling parameters" });
      return;
    }

    const signal: CallSignal = {
      id: "sig_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      fromUserId,
      toUserId,
      type,
      data,
      timestamp: Date.now(),
    };

    // Forward to destination user
    notifyUser(toUserId, "webrtc_signal", signal);

    // If call ended, cancelled, or declined, sync state and notify both screens
    if (type === "call-ended" || type === "call-cancelled" || type === "call-declined") {
      notifyUser(toUserId, "call_cancelled", { fromUserId, toUserId, type });
      notifyUser(toUserId, "call_ended", { fromUserId, toUserId, type });
      notifyUser(fromUserId, "call_ended", { fromUserId, toUserId, type });

      const duration = Number(data?.durationSeconds || 0);
      let status: "completed" | "missed" | "declined" | "cancelled" = "completed";
      if (type === "call-declined") {
        status = "declined";
      } else if (duration === 0) {
        status = "missed";
      }
      recordCallEvent(fromUserId, toUserId, data?.callType || "video", status, duration);
    }

    res.json({ success: true });
  });

  // SSE Stream for Real-time events & WebRTC signaling
  app.get("/api/events", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).end("userId required");
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Send initial handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ userId, time: Date.now() })}\n\n`);

    if (!sseClients.has(userId)) {
      sseClients.set(userId, []);
    }
    sseClients.get(userId)!.push(res);

    // Keep-alive ping every 25 seconds
    const pingInterval = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch (e) {
        clearInterval(pingInterval);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(pingInterval);
      const list = sseClients.get(userId) || [];
      const idx = list.indexOf(res);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
      if (list.length === 0) {
        sseClients.delete(userId);
      }
    });
  });

  // -------------------------------------------------------------
  // GEMINI AI ASSISTANT & CALL INTELLIGENCE (WITH MULTI-MODEL FALLBACK)
  // -------------------------------------------------------------

  // Helper to query Gemini with automatic multi-model fallback on 503/429
  async function generateGeminiContentWithFallback(ai: any, contents: any, config?: any) {
    // gemini-3.1-flash-lite has the highest availability and lowest resource overhead
    // followed by gemini-flash-latest and gemini-3.8-flash
    const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });
        if (response && response.text) {
          return response;
        }
      } catch (err: any) {
        lastError = err;
        // Gracefully attempt next model in line without emitting uncaught error markers
        continue;
      }
    }

    throw lastError || new Error("Gemini AI models temporarily at capacity.");
  }

  // Gemini AI Chat in Messenger
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { prompt, voiceMode } = req.body;
      if (!prompt) {
        res.status(400).json({ error: "Prompt is required" });
        return;
      }

      const ai = getGenAI();
      if (!ai) {
        res.json({
          reply: "I am ready to assist you! Please ensure your GEMINI_API_KEY is configured in AI Studio Settings.",
          suggestedReplies: ["Tell me about Z-messenger", "How do WebRTC calls work?", "Write a quick message"],
        });
        return;
      }

      const systemInstruction = `You are "Z-Assistant", the built-in intelligent AI companion inside Z-messenger, a cutting-edge real-time messaging application with an orange, yellow, and white color combination.
Key features you can help with:
- Multimedia messaging (text, voice clips, circular video messages, attachments, GPS locations).
- WebRTC P2P voice and video calling with screen sharing and host-camera-only broadcast mode.
- Communication drafting, translating messages, answering questions playfully and informatively.
${voiceMode ? "The user is using Voice Mode. Keep your responses conversational, natural, punchy, and under 3 short sentences so it sounds great spoken aloud." : "Keep responses clear, engaging, and well formatted with markdown."}`;

      try {
        const response = await generateGeminiContentWithFallback(ai, prompt, {
          systemInstruction,
          temperature: 0.7,
        });

        const replyText = response.text || "Hello! I am your Z-messenger AI assistant. How can I assist you?";

        // Contextual quick suggestions without triggering a second redundant API call
        const defaultChips = [
          "Tell me more",
          "How to start a video call?",
          "Help me draft a message",
        ];

        res.json({ reply: replyText, suggestedReplies: defaultChips });
      } catch (apiErr: any) {
        // Handled fallback response to the user
        res.json({
          reply: "I am currently experiencing high network demand from temporary traffic spikes. You can continue sending voice notes, text messages, or direct WebRTC video calls, or try asking me again in a moment!",
          suggestedReplies: ["Try asking again", "How to video call?", "Add a contact"],
        });
      }
    } catch (err: any) {
      // Global route safety fallback
      res.json({
        reply: "I'm temporarily experiencing high traffic. Please try asking again shortly!",
        suggestedReplies: ["Try again", "What can Z-messenger do?"],
      });
    }
  });

  // Call Summarization (triggers at end of WebRTC call)
  app.post("/api/gemini/call-summary", async (req, res) => {
    const { callType, durationSeconds, participants, transcriptNotes } = req.body;
    const fallbackSummary = `### Call Summary (${callType === "video" ? "Video Call" : "Voice Call"})\n- **Duration:** ${durationSeconds || 0} seconds\n- **Participants:** ${participants?.join(" and ") || "You and peer"}\n- **Highlights:** WebRTC encrypted peer-to-peer session concluded successfully on Z-messenger.\n- **Next Steps:** Follow up with any requested files or action items discussed during the call.`;

    try {
      const ai = getGenAI();
      if (!ai) {
        res.json({ summary: fallbackSummary });
        return;
      }

      const prompt = `A ${callType || "video"} call between ${participants?.join(" and ") || "users"} just concluded on Z-messenger.
Call duration: ${durationSeconds} seconds.
Conversation context / notes: "${transcriptNotes || "General discussion, screen sharing, and catch-up."}"

Please generate a professional, concise Call Summary with:
1. Executive Overview (2-3 sentences)
2. Key Discussion Highlights (bullet points)
3. Action Items (actionable next steps)`;

      const response = await generateGeminiContentWithFallback(ai, prompt);
      res.json({
        summary: response.text || fallbackSummary,
      });
    } catch (err: any) {
      res.json({ summary: fallbackSummary });
    }
  });

  // Message Translation
  app.post("/api/gemini/translate", async (req, res) => {
    const { text, targetLanguage } = req.body;
    if (!text) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    try {
      const ai = getGenAI();
      if (!ai) {
        res.json({ translated: text });
        return;
      }

      const prompt = `Translate the following message accurately and naturally to ${targetLanguage || "Spanish"}. Return ONLY the translated text without additional commentary:
"${text}"`;

      const response = await generateGeminiContentWithFallback(ai, prompt);
      res.json({ translated: response.text?.trim() || text });
    } catch (err: any) {
      res.json({ translated: text });
    }
  });

  // -------------------------------------------------------------
  // VITE & STATIC SERVING
  // -------------------------------------------------------------

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Z-messenger server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
