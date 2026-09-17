import React, { useState, useEffect } from "react";
import { User, AdminUser } from "../types";
import {
  ShieldAlert,
  Users,
  MessageSquare,
  Radio,
  Trash2,
  X,
  Search,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  UserX,
} from "lucide-react";

interface SuperAdminModalProps {
  currentUser: User;
  onClose: () => void;
  onUserDeleted?: (deletedUserId: string) => void;
}

export const SuperAdminModal: React.FC<SuperAdminModalProps> = ({
  currentUser,
  onClose,
  onUserDeleted,
}) => {
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<{
    totalUsers: number;
    onlineUsers: number;
    totalGroups: number;
    totalMessages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUser | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [usersRes, statsRes] = await Promise.all([
        fetch(`/api/admin/users?requesterId=${currentUser.id}`),
        fetch(`/api/admin/stats?requesterId=${currentUser.id}`),
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsersList(usersData.users || []);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err: any) {
      console.error("Admin fetch error:", err);
      setNotification({ type: "error", text: "Failed to load admin data. Verify superadmin access." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [currentUser.id]);

  const handleDeleteAccount = async (target: AdminUser) => {
    try {
      setDeletingId(target.id);
      const res = await fetch(`/api/admin/users/${target.id}?requesterId=${currentUser.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      setNotification({
        type: "success",
        text: `Account @${target.username} (${target.fullName}) was deleted permanently.`,
      });
      setUsersList((prev) => prev.filter((u) => u.id !== target.id));
      if (stats) {
        setStats({ ...stats, totalUsers: Math.max(0, stats.totalUsers - 1) });
      }
      setConfirmDeleteUser(null);
      if (onUserDeleted) {
        onUserDeleted(target.id);
      }
    } catch (err: any) {
      setNotification({ type: "error", text: err.message || "Failed to delete user account." });
    } finally {
      setDeletingId(null);
    }
  };

  const filteredUsers = usersList.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div
        id="superadmin-panel-modal"
        className="w-full max-w-4xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-100 text-red-600 shadow-xs">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-neutral-900">Super Admin Control Center</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-600 text-white uppercase tracking-wider">
                  Root Access
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Logged in as <span className="font-semibold text-neutral-800">{currentUser.email}</span> (Delete user accounts & monitor platform)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications */}
        {notification && (
          <div
            className={`my-3 p-3 rounded-xl flex items-center justify-between text-xs font-semibold ${
              notification.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{notification.text}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-xs underline hover:no-underline ml-3 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Overview Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 shrink-0">
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80">
              <div className="flex items-center justify-between text-neutral-500 mb-1">
                <span className="text-[11px] font-bold uppercase">Total Users</span>
                <Users className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-xl font-black text-neutral-900">{stats.totalUsers}</p>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80">
              <div className="flex items-center justify-between text-neutral-500 mb-1">
                <span className="text-[11px] font-bold uppercase">Online Now</span>
                <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
              </div>
              <p className="text-xl font-black text-emerald-600">{stats.onlineUsers}</p>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80">
              <div className="flex items-center justify-between text-neutral-500 mb-1">
                <span className="text-[11px] font-bold uppercase">Active Groups</span>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xl font-black text-neutral-900">{stats.totalGroups}</p>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80">
              <div className="flex items-center justify-between text-neutral-500 mb-1">
                <span className="text-[11px] font-bold uppercase">Messages Sent</span>
                <MessageSquare className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-xl font-black text-neutral-900">{stats.totalMessages}</p>
            </div>
          </div>
        )}

        {/* Search and Refresh Bar */}
        <div className="flex items-center justify-between gap-3 py-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users by name, username (@), or email..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-red-500 text-xs text-neutral-900 outline-hidden transition-all"
            />
          </div>
          <button
            onClick={fetchAdminData}
            disabled={loading}
            className="px-3 py-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* User Accounts Management Table / List */}
        <div className="flex-1 overflow-y-auto pr-1 mt-2 space-y-2">
          {loading ? (
            <div className="py-12 text-center text-xs text-neutral-400">Loading user accounts...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-500">No users match your search query.</div>
          ) : (
            filteredUsers.map((user) => {
              const isSelf = user.id === currentUser.id || user.email === "hashir0047@gmail.com";

              return (
                <div
                  key={user.id}
                  className="p-3.5 rounded-xl border border-neutral-200/80 bg-neutral-50/50 hover:bg-neutral-50 transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <img
                        src={user.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"}
                        alt={user.fullName}
                        className="w-10 h-10 rounded-full object-cover border border-neutral-300"
                      />
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                          user.status === "online" ? "bg-emerald-500" : "bg-neutral-400"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-neutral-900 truncate">{user.fullName}</p>
                        {user.role === "superadmin" && (
                          <span className="px-1.5 py-0.2 rounded-md bg-red-100 text-red-700 text-[10px] font-extrabold uppercase">
                            Superadmin
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-neutral-500 truncate">
                        <span className="text-orange-600 font-semibold">@{user.username}</span>
                        <span>•</span>
                        <span className="truncate">{user.email}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSelf ? (
                      <span className="px-2.5 py-1 rounded-lg bg-neutral-200 text-neutral-600 text-[11px] font-bold">
                        Current Account
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteUser(user)}
                        disabled={deletingId === user.id}
                        className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Account</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Confirmation Modal to Delete Account */}
        {confirmDeleteUser && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-red-300">
              <div className="flex items-center gap-3 text-red-600 mb-3">
                <div className="p-3 rounded-full bg-red-100">
                  <UserX className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Confirm Account Deletion</h3>
                  <p className="text-xs text-neutral-500">This action is irreversible</p>
                </div>
              </div>

              <p className="text-xs text-neutral-700 leading-relaxed mb-4">
                Are you sure you want to permanently delete the account for{" "}
                <span className="font-bold text-neutral-900">@{confirmDeleteUser.username}</span> (
                {confirmDeleteUser.fullName})? All of their messages, contact relationships, and personal data will be completely wiped from the platform immediately.
              </p>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  onClick={() => setConfirmDeleteUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteAccount(confirmDeleteUser)}
                  disabled={deletingId === confirmDeleteUser.id}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {deletingId === confirmDeleteUser.id ? (
                    <span>Deleting...</span>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Yes, Delete Account</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
