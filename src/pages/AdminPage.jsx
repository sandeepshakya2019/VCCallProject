import React, { useState } from "react";
import {
  Shield,
  KeyRound,
  Plus,
  Trash2,
  Settings,
  Lock,
  Unlock,
  Check,
  Copy,
  ExternalLink,
  MessageSquare,
  Monitor,
  Video,
  Mic,
  AlertTriangle,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useRoomContext } from "../context/RoomContext";
import { getBaseNetworkUrl } from "../utils/network";

export default function AdminPage() {
  const {
    rooms,
    createRoom,
    updateRoomPermissions,
    deleteRoom,
    isAdminLoggedIn,
    loginAdmin,
    logoutAdmin,
  } = useRoomContext();

  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [copiedRoom, setCopiedRoom] = useState(null);

  // New Room Form State
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [newPermissions, setNewPermissions] = useState({
    allowChat: true,
    allowScreenShare: true,
    allowCamera: true,
    allowMic: true,
    isLocked: false,
    askBeforeJoin: false,
  });
  const [createError, setCreateError] = useState("");

  // 1. Password Login Handler
  const handleLogin = (e) => {
    e.preventDefault();
    setAuthError("");
    const success = loginAdmin(passwordInput.trim());
    if (!success) {
      setAuthError("Incorrect admin password.");
    } else {
      setPasswordInput("");
    }
  };

  // 2. Create Room Handler
  const handleCreateRoom = (e) => {
    e.preventDefault();
    setCreateError("");
    try {
      createRoom({
        roomNumber: newRoomNumber,
        roomName: newRoomName,
        permissions: newPermissions,
      });
      // Reset & close
      setNewRoomNumber("");
      setNewRoomName("");
      setNewPermissions({
        allowChat: true,
        allowScreenShare: true,
        allowCamera: true,
        allowMic: true,
        isLocked: false,
        askBeforeJoin: false,
      });
      setShowCreateModal(false);
    } catch (err) {
      setCreateError(err.message || "Failed to create room.");
    }
  };

  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  // 3. Update Permissions Handler
  const handleSaveEditedPermissions = (e) => {
    e.preventDefault();
    if (!editingRoom) return;

    updateRoomPermissions(editingRoom.roomNumber, editingRoom.permissions);
    setSaveSuccessMsg(
      `Permissions for Room #${editingRoom.roomNumber} updated successfully!`,
    );
    setEditingRoom(null);
    setTimeout(() => setSaveSuccessMsg(""), 3500);
  };

  // 4. Copy Room Link
  const handleCopyLink = (roomNumber) => {
    const url = `${getBaseNetworkUrl()}/room/${roomNumber}`;
    navigator.clipboard.writeText(url);
    setCopiedRoom(roomNumber);
    setTimeout(() => setCopiedRoom(null), 2000);
  };

  // 5. Delete Room Handler
  const handleDeleteRoom = (roomNumber) => {
    if (
      window.confirm(
        `Are you sure you want to delete Room #${roomNumber}? Active participants will be disconnected.`,
      )
    ) {
      deleteRoom(roomNumber);
    }
  };

  // If not authenticated, show password prompt
  if (!isAdminLoggedIn) {
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Shield className="h-7 w-7" />
          </div>

          <h2 className="mt-5 text-center text-2xl font-bold tracking-tight text-white">
            Admin Authentication
          </h2>

          {authError && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Admin Password
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <KeyRound className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter Password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 py-3 pl-10 pr-4 text-base sm:text-sm font-medium text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:scale-[1.01]"
            >
              <Shield className="h-4 w-4" />
              <span>Unlock Admin Panel</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Authenticated Admin Dashboard
  return (
    <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Admin Dashboard Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-5 sm:pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Authenticated Admin Session
              </span>
            </div>
            <h1 className="mt-1 text-xl font-extrabold text-white sm:text-3xl">
              Room Management & Permissions
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Create rooms, edit live permissions, and delete rooms.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:scale-[1.02]"
            >
              <Plus className="h-4 w-4" />
              <span>Create New Room</span>
            </button>

            <button
              type="button"
              onClick={logoutAdmin}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Success Banner */}
        {saveSuccessMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-300 shadow-lg animate-in fade-in">
            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Stats Row */}
        <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-xs text-slate-400">
              Total Configured Rooms
            </span>
            <div className="mt-1 text-2xl font-extrabold text-white font-mono">
              {rooms.length}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-xs text-slate-400">Open for Join</span>
            <div className="mt-1 text-2xl font-extrabold text-emerald-400 font-mono">
              {rooms.filter((r) => !r.permissions?.isLocked).length}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-xs text-slate-400">Locked Rooms</span>
            <div className="mt-1 text-2xl font-extrabold text-red-400 font-mono">
              {rooms.filter((r) => r.permissions?.isLocked).length}
            </div>
          </div>
        </div>

        {/* Rooms Table / Cards */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-2xl backdrop-blur-xl">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Configured Rooms
            </h2>
            <span className="text-xs text-slate-500">Live WebRTC Rooms</span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {rooms.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No rooms created yet. Click "Create New Room" to add one.
              </div>
            ) : (
              rooms.map((room) => {
                const perms = room.permissions || {};
                return (
                  <div
                    key={room.roomNumber}
                    className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-slate-800/30"
                  >
                    {/* Left: Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-md bg-indigo-500/10 px-2.5 py-0.5 font-mono text-sm font-bold text-indigo-400 border border-indigo-500/20">
                          #{room.roomNumber}
                        </span>
                        <h3 className="text-base font-semibold text-white">
                          {room.roomName}
                        </h3>
                        {perms.isLocked ? (
                          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-500/20">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                            <Unlock className="h-3 w-3" /> Open
                          </span>
                        )}
                      </div>

                      {/* Direct URL */}
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span>
                          URL: {getBaseNetworkUrl()}/room/{room.roomNumber}
                        </span>
                      </div>

                      {/* Permissions Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 text-[11px]">
                        <span className="text-slate-500 mr-1">
                          Permissions:
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 ${perms.allowChat ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
                        >
                          Chat: {perms.allowChat ? "Enabled" : "Disabled"}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 ${perms.allowScreenShare ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
                        >
                          Screen:{" "}
                          {perms.allowScreenShare ? "Enabled" : "Disabled"}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 ${perms.allowCamera ? "bg-slate-800 text-slate-300" : "bg-red-500/10 text-red-400"}`}
                        >
                          Video: {perms.allowCamera ? "On" : "Off"}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 ${perms.allowMic ? "bg-slate-800 text-slate-300" : "bg-red-500/10 text-red-400"}`}
                        >
                          Mic: {perms.allowMic ? "On" : "Off"}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 ${perms.askBeforeJoin ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-slate-800 text-slate-400"}`}
                        >
                          Ask to Join:{" "}
                          {perms.askBeforeJoin ? "Required" : "Off"}
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Edit Permissions */}
                      <button
                        type="button"
                        onClick={() =>
                          setEditingRoom(JSON.parse(JSON.stringify(room)))
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        <Settings className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Edit Permissions</span>
                      </button>

                      {/* Copy Link */}
                      <button
                        type="button"
                        onClick={() => handleCopyLink(room.roomNumber)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                        title="Copy direct join link"
                      >
                        {copiedRoom === room.roomNumber ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {copiedRoom === room.roomNumber ? "Copied" : "Link"}
                        </span>
                      </button>

                      {/* Direct Join Link */}
                      <a
                        href={`/room/${room.roomNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white transition-colors"
                        title="Open room in new tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>

                      {/* Delete Room */}
                      <button
                        type="button"
                        onClick={() => handleDeleteRoom(room.roomNumber)}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                        title="Delete Room"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* CREATE ROOM MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              Create New Video Room
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure room number and default participant permissions.
            </p>

            {createError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Room Number / ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 103, daily-sync"
                  value={newRoomNumber}
                  onChange={(e) => setNewRoomNumber(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 px-3.5 text-base sm:text-sm font-mono text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Room Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales Team Meeting"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 px-3.5 text-base sm:text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Permissions Checkboxes */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Participant Permissions
                </span>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPermissions.allowChat}
                    onChange={(e) =>
                      setNewPermissions({
                        ...newPermissions,
                        allowChat: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>Allow Text Chat (Live P2P Chat)</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPermissions.allowScreenShare}
                    onChange={(e) =>
                      setNewPermissions({
                        ...newPermissions,
                        allowScreenShare: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>Allow Screen Sharing</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPermissions.allowCamera}
                    onChange={(e) =>
                      setNewPermissions({
                        ...newPermissions,
                        allowCamera: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>Allow Camera / Video</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPermissions.allowMic}
                    onChange={(e) =>
                      setNewPermissions({
                        ...newPermissions,
                        allowMic: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>Allow Microphone / Audio</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-amber-300 cursor-pointer pt-2 border-t border-slate-800">
                  <input
                    type="checkbox"
                    checked={newPermissions.askBeforeJoin}
                    onChange={(e) =>
                      setNewPermissions({
                        ...newPermissions,
                        askBeforeJoin: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded accent-amber-500"
                  />
                  <span>
                    Ask Before Join (Require Admin approval before entering
                    call)
                  </span>
                </label>

                <label className="flex items-center gap-3 text-xs text-red-300 cursor-pointer pt-2 border-t border-slate-800">
                  <input
                    type="checkbox"
                    checked={newPermissions.isLocked}
                    onChange={(e) =>
                      setNewPermissions({
                        ...newPermissions,
                        isLocked: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded accent-red-600"
                  />
                  <span>Lock Room (Block new participants from joining)</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500"
                >
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PERMISSIONS MODAL */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              Edit Permissions for Room #{editingRoom.roomNumber}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Changes will immediately take effect for all active and new
              participants.
            </p>

            <form
              onSubmit={handleSaveEditedPermissions}
              className="mt-5 space-y-4"
            >
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRoom.permissions?.allowChat ?? true}
                    onChange={(e) =>
                      setEditingRoom({
                        ...editingRoom,
                        permissions: {
                          ...editingRoom.permissions,
                          allowChat: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>Allow Text Chat</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRoom.permissions?.allowScreenShare ?? true}
                    onChange={(e) =>
                      setEditingRoom({
                        ...editingRoom,
                        permissions: {
                          ...editingRoom.permissions,
                          allowScreenShare: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>Allow Screen Sharing</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRoom.permissions?.allowCamera ?? true}
                    onChange={(e) =>
                      setEditingRoom({
                        ...editingRoom,
                        permissions: {
                          ...editingRoom.permissions,
                          allowCamera: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>Allow Camera</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRoom.permissions?.allowMic ?? true}
                    onChange={(e) =>
                      setEditingRoom({
                        ...editingRoom,
                        permissions: {
                          ...editingRoom.permissions,
                          allowMic: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>Allow Microphone</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-amber-300 cursor-pointer pt-2 border-t border-slate-800">
                  <input
                    type="checkbox"
                    checked={editingRoom.permissions?.askBeforeJoin ?? false}
                    onChange={(e) =>
                      setEditingRoom({
                        ...editingRoom,
                        permissions: {
                          ...editingRoom.permissions,
                          askBeforeJoin: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded accent-amber-500"
                  />
                  <span>
                    Ask Before Join (Require Admin approval before entering
                    call)
                  </span>
                </label>

                <label className="flex items-center gap-3 text-xs text-red-300 cursor-pointer pt-2 border-t border-slate-800">
                  <input
                    type="checkbox"
                    checked={editingRoom.permissions?.isLocked ?? false}
                    onChange={(e) =>
                      setEditingRoom({
                        ...editingRoom,
                        permissions: {
                          ...editingRoom.permissions,
                          isLocked: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded accent-red-600"
                  />
                  <span>Lock Room (Prevents joining)</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500"
                >
                  Save Permissions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
