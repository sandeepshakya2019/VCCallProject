import React, { createContext, useContext, useState, useEffect } from "react";

const RoomContext = createContext(null);

const DEFAULT_ROOMS = [
  {
    roomNumber: "101",
    roomName: "General Discussion",
    createdAt: new Date().toISOString(),
    permissions: {
      allowChat: true,
      allowScreenShare: true,
      allowCamera: true,
      allowMic: true,
      isLocked: false,
      askBeforeJoin: true,
    },
  },
  {
    roomNumber: "102",
    roomName: "Developer Standup",
    createdAt: new Date().toISOString(),
    permissions: {
      allowChat: true,
      allowScreenShare: true,
      allowCamera: true,
      allowMic: true,
      isLocked: false,
      askBeforeJoin: true,
    },
  },
];

const STORAGE_KEY = "vccall_rooms_v1";
const ADMIN_SESSION_KEY = "vccall_admin_auth";

export function RoomProvider({ children }) {
  const [rooms, setRooms] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((r) => ({
            ...r,
            permissions: {
              allowChat: true,
              allowScreenShare: true,
              allowCamera: true,
              allowMic: true,
              isLocked: false,
              askBeforeJoin: true,
              ...(r.permissions || {}),
            },
          }));
        }
      }
    } catch (e) {
      console.warn("Could not read saved rooms:", e);
    }
    return DEFAULT_ROOMS;
  });

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
  });

  const [deletedRoomNotification, setDeletedRoomNotification] = useState(null);
  const [isRoomsLoaded, setIsRoomsLoaded] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [roomCounts, setRoomCounts] = useState({});
  const syncWsRef = React.useRef(null);

  // Sync with Server REST API on initial mount
  useEffect(() => {
    fetch("/api/rooms")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.rooms)) {
          setRooms(data.rooms);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.rooms));
          } catch {}
        }
        if (data?.roomCounts) {
          setRoomCounts(data.roomCounts);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch server rooms:", err);
      })
      .finally(() => {
        setIsRoomsLoaded(true);
      });
  }, []);

  // Connect to Signaling WebSocket for LAN-wide real-time room sync
  useEffect(() => {
    let ws;
    let reconnectTimeout;

    const connectSyncWs = () => {
      try {
        const wsProtocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${window.location.host}/signaling`;
        ws = new WebSocket(wsUrl);
        syncWsRef.current = ws;

        ws.onopen = () => {
          // Request latest rooms from server
          ws.send(JSON.stringify({ type: "GET_ROOMS" }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (
              (data.type === "ROOMS_UPDATED" || data.type === "ROOMS_SYNC") &&
              Array.isArray(data.rooms)
            ) {
              setRooms(data.rooms);
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data.rooms));
              } catch {}
            } else if (data.type === "ROOM_COUNTS_UPDATED" && data.counts) {
              setRoomCounts(data.counts);
            } else if (data.type === "ROOM_DELETED") {
              const targetNum = String(data.roomNumber).trim();
              if (Array.isArray(data.rooms)) {
                setRooms(data.rooms);
                try {
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(data.rooms));
                } catch {}
              } else {
                setRooms((prev) => {
                  const updated = prev.filter(
                    (r) => r.roomNumber !== targetNum,
                  );
                  try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                  } catch {}
                  return updated;
                });
              }
              setDeletedRoomNotification(targetNum);
            }
          } catch (e) {
            console.warn("Sync WS message parse error:", e);
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectSyncWs, 3000);
        };
      } catch (e) {
        console.warn("Could not connect sync WS:", e);
      }
    };

    connectSyncWs();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    };
  }, []);

  // Sync rooms across browser tabs via storage & BroadcastChannel
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
    } catch (e) {
      console.warn("Could not persist rooms to localStorage:", e);
    }
  }, [rooms]);

  useEffect(() => {
    let channel;
    try {
      channel = new BroadcastChannel("vccall_sync_channel");
      channel.onmessage = (event) => {
        const { type, data } = event.data || {};
        if (type === "ROOMS_UPDATED") {
          setRooms(data);
        } else if (type === "ROOM_DELETED") {
          setDeletedRoomNotification(data.roomNumber);
        }
      };
    } catch (e) {
      console.warn("BroadcastChannel not supported:", e);
    }

    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setRooms(JSON.parse(e.newValue));
        } catch (err) {
          console.warn("Failed to parse storage event:", err);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      if (channel) channel.close();
    };
  }, []);

  const syncToServer = (payload) => {
    fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.warn("Failed to sync room action to server:", err);
    });
  };

  const broadcastUpdate = (updatedRooms, deletedRoomNum = null) => {
    try {
      const channel = new BroadcastChannel("vccall_sync_channel");
      channel.postMessage({ type: "ROOMS_UPDATED", data: updatedRooms });
      if (deletedRoomNum) {
        channel.postMessage({
          type: "ROOM_DELETED",
          data: { roomNumber: deletedRoomNum },
        });
      }
      channel.close();
    } catch {
      // Ignored if BroadcastChannel is not supported
    }
  };

  const createRoom = ({ roomNumber, roomName, permissions }) => {
    const cleanNumber = String(roomNumber).trim();
    if (!cleanNumber) {
      throw new Error("Room number cannot be empty");
    }

    if (rooms.some((r) => r.roomNumber === cleanNumber)) {
      throw new Error(`Room ${cleanNumber} already exists!`);
    }

    const newRoom = {
      roomNumber: cleanNumber,
      roomName: (roomName || `Room ${cleanNumber}`).trim(),
      createdAt: new Date().toISOString(),
      permissions: {
        allowChat: permissions?.allowChat ?? true,
        allowScreenShare: permissions?.allowScreenShare ?? true,
        allowCamera: permissions?.allowCamera ?? true,
        allowMic: permissions?.allowMic ?? true,
        isLocked: permissions?.isLocked ?? false,
        askBeforeJoin: permissions?.askBeforeJoin ?? false,
      },
    };

    const updated = [newRoom, ...rooms];
    setRooms(updated);
    broadcastUpdate(updated);
    syncToServer({ action: "CREATE", room: newRoom });
    return newRoom;
  };

  const updateRoomPermissions = (roomNumber, newPermissions) => {
    const cleanNumber = String(roomNumber).trim();
    const updated = rooms.map((room) => {
      if (room.roomNumber === cleanNumber) {
        return {
          ...room,
          permissions: {
            ...room.permissions,
            ...newPermissions,
          },
        };
      }
      return room;
    });

    setRooms(updated);
    broadcastUpdate(updated);
    syncToServer({
      action: "UPDATE_PERMISSIONS",
      roomNumber: cleanNumber,
      permissions: newPermissions,
    });
  };

  const deleteRoom = (roomNumber) => {
    const cleanNumber = String(roomNumber).trim();
    const updated = rooms.filter((room) => room.roomNumber !== cleanNumber);
    setRooms(updated);
    setDeletedRoomNotification(cleanNumber);
    broadcastUpdate(updated, cleanNumber);
    syncToServer({ action: "DELETE", roomNumber: cleanNumber });
  };

  const getRoom = (roomNumber) => {
    return rooms.find((r) => r.roomNumber === String(roomNumber).trim());
  };

  const loginAdmin = (enteredPassword) => {
    // Read password from environment variable
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;
    if (enteredPassword === adminPassword) {
      setIsAdminLoggedIn(true);
      sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
      return true;
    }
    return false;
  };

  const logoutAdmin = () => {
    setIsAdminLoggedIn(false);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  };

  const sendGlobalAnnouncement = (message) => {
    if (syncWsRef.current && syncWsRef.current.readyState === 1) {
      syncWsRef.current.send(
        JSON.stringify({
          type: "ADMIN_BROADCAST_ANNOUNCEMENT",
          message,
          sender: "System Admin",
        })
      );
      return true;
    }
    return false;
  };

  return (
    <RoomContext.Provider
      value={{
        rooms,
        roomCounts,
        sendGlobalAnnouncement,
        createRoom,
        updateRoomPermissions,
        deleteRoom,
        getRoom,
        isAdminLoggedIn,
        loginAdmin,
        logoutAdmin,
        deletedRoomNotification,
        isRoomsLoaded,
        isInCall,
        setIsInCall,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

export function useRoomContext() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error("useRoomContext must be used within a RoomProvider");
  }
  return context;
}
