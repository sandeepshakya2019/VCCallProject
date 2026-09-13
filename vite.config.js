import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, loadEnv } from 'vite'
import { WebSocketServer } from 'ws'

/**
 * Built-in LAN WebRTC room signaling plugin (Zero-storage, runs on same port 5173)
 * Allows phones, laptops, and tablets on the same Wi-Fi to discover each other instantly.
 */
function lanSignalingPlugin() {
  const rooms = new Map(); // roomNumber -> Set of { ws, peerId, name, isAdmin, isPending }
  const roomStartTimes = new Map(); // roomNumber -> meeting start timestamp
  const admittedKnockIds = new Set(); // Track participants explicitly admitted by admin

  const DEFAULT_SERVER_ROOMS = [
    {
      roomNumber: '101',
      roomName: 'General Discussion',
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
      roomNumber: '102',
      roomName: 'Developer Standup',
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

  let sharedRooms = [...DEFAULT_SERVER_ROOMS];

  const getRoomCounts = () => {
    const counts = {};
    for (const [roomNum, peerSet] of rooms.entries()) {
      let activeCount = 0;
      for (const p of peerSet) {
        if (!p.isPending && p.ws.readyState === 1) {
          activeCount++;
        }
      }
      if (activeCount > 0) {
        counts[roomNum] = activeCount;
      }
    }
    return counts;
  };

  return {
    name: 'lan-signaling-plugin',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });

      const broadcastRoomCounts = () => {
        const counts = getRoomCounts();
        const payload = JSON.stringify({
          type: 'ROOM_COUNTS_UPDATED',
          counts,
        });
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(payload);
          }
        });
      };

      const broadcastRoomsUpdate = () => {
        const payload = JSON.stringify({
          type: 'ROOMS_UPDATED',
          rooms: sharedRooms,
        });
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(payload);
          }
        });
      };

      // REST API for Cross-Device Room Sync (Laptop, Mobile, Tablet)
      server.middlewares.use('/api/rooms', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ rooms: sharedRooms, roomCounts: getRoomCounts() }));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const { action, roomNumber, room, permissions, rooms: newRoomsList } = payload;

              if (action === 'DELETE') {
                const targetNum = String(roomNumber).trim();
                sharedRooms = sharedRooms.filter((r) => r.roomNumber !== targetNum);

                // Broadcast room deletion to ALL connected WebSockets across LAN
                wss.clients.forEach((client) => {
                  if (client.readyState === 1) {
                    client.send(JSON.stringify({
                      type: 'ROOM_DELETED',
                      roomNumber: targetNum,
                      rooms: sharedRooms,
                    }));
                  }
                });

                // Also notify and kick any peers currently in this room
                if (rooms.has(targetNum)) {
                  const roomPeers = rooms.get(targetNum);
                  for (const p of roomPeers) {
                    if (p.ws.readyState === 1) {
                      p.ws.send(JSON.stringify({
                        type: 'ROOM_DELETED',
                        roomNumber: targetNum,
                        rooms: sharedRooms,
                      }));
                    }
                  }
                  rooms.delete(targetNum);
                  roomStartTimes.delete(targetNum);
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, rooms: sharedRooms }));
                return;
              }

              if (action === 'CREATE' && room) {
                const targetNum = String(room.roomNumber).trim();
                if (!sharedRooms.some((r) => r.roomNumber === targetNum)) {
                  sharedRooms = [room, ...sharedRooms];
                }
                broadcastRoomsUpdate();
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, rooms: sharedRooms }));
                return;
              }

              if (action === 'UPDATE_PERMISSIONS' && roomNumber && permissions) {
                const targetNum = String(roomNumber).trim();
                sharedRooms = sharedRooms.map((r) => {
                  if (r.roomNumber === targetNum) {
                    return { ...r, permissions: { ...r.permissions, ...permissions } };
                  }
                  return r;
                });
                broadcastRoomsUpdate();
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, rooms: sharedRooms }));
                return;
              }

              if (action === 'SYNC_ALL' && Array.isArray(newRoomsList)) {
                sharedRooms = newRoomsList;
                broadcastRoomsUpdate();
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, rooms: sharedRooms }));
                return;
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, rooms: sharedRooms }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            }
          });
          return;
        }

        next();
      });

      server.httpServer.on('upgrade', (request, socket, head) => {
        try {
          const host = request.headers.host || 'localhost:5173';
          const url = new URL(request.url, `http://${host}`);
          if (url.pathname === '/signaling') {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit('connection', ws, request);
            });
          }
        } catch (err) {
          console.warn('WebSocket upgrade error:', err);
        }
      });

      wss.on('connection', (ws) => {
        let currentRoom = null;
        let currentPeerId = null;
        let currentName = null;
        let currentIsAdmin = false;

        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            if (data.type === 'GET_ROOMS') {
              ws.send(JSON.stringify({
                type: 'ROOMS_SYNC',
                rooms: sharedRooms,
              }));
              return;
            }

            if (data.type === 'JOIN_ROOM') {
              currentRoom = String(data.roomNumber).trim();
              currentPeerId = data.peerId;
              currentName = data.name || 'Peer';
              currentIsAdmin = Boolean(data.isAdmin);

              // Check if room was deleted by admin
              if (!sharedRooms.some((r) => r.roomNumber === currentRoom)) {
                ws.send(JSON.stringify({
                  type: 'ROOM_DELETED',
                  roomNumber: currentRoom,
                  rooms: sharedRooms,
                }));
                return;
              }

              if (!rooms.has(currentRoom)) {
                rooms.set(currentRoom, new Set());
              }

              const roomPeers = rooms.get(currentRoom);

              // Check if any admin is already in the room
              let hasAdmin = false;
              for (const p of roomPeers) {
                if (p.isAdmin && !p.isPending && p.ws.readyState === 1) {
                  hasAdmin = true;
                  break;
                }
              }

              const roomConfig = sharedRooms.find((r) => r.roomNumber === currentRoom);
              if (roomConfig?.permissions?.isLocked && !currentIsAdmin) {
                ws.send(JSON.stringify({
                  type: 'ROOM_LOCKED',
                  message: `Room #${currentRoom} is locked. Please contact the room admin to unlock the room.`,
                }));
                return;
              }

              const isAdmittedByKnock = Boolean(data.admittedFromKnockId && admittedKnockIds.has(data.admittedFromKnockId));

              // If non-admin attempts direct join when no admin has joined yet, require waiting unless already admitted
              if (!currentIsAdmin && !hasAdmin && !isAdmittedByKnock) {
                ws.send(JSON.stringify({
                  type: 'ADMIN_REQUIRED',
                  message: 'The room admin has not joined yet. Waiting for admin to join Room #' + currentRoom + '...',
                }));
                return;
              }


              // Initialize room start time if first active peer
              if (!roomStartTimes.has(currentRoom)) {
                roomStartTimes.set(currentRoom, Date.now());
              }
              const roomStartedAt = roomStartTimes.get(currentRoom);

              // 1. Send list of existing active peers in this room (exclude pending knocks)
              const existingList = [];
              for (const p of roomPeers) {
                if (!p.isPending && p.peerId !== currentPeerId && p.ws.readyState === 1) {
                  existingList.push({ peerId: p.peerId, name: p.name, isAdmin: Boolean(p.isAdmin) });
                }
              }

              ws.send(JSON.stringify({
                type: 'EXISTING_PEERS',
                peers: existingList,
                roomStartedAt,
              }));

              // 2. Announce to all existing active peers that this new device joined
              for (const p of roomPeers) {
                if (!p.isPending && p.peerId !== currentPeerId && p.ws.readyState === 1) {
                  p.ws.send(JSON.stringify({
                    type: 'PEER_JOINED',
                    peerId: currentPeerId,
                    name: currentName,
                    isAdmin: currentIsAdmin,
                    roomStartedAt,
                  }));
                }
              }

              // Add this device to room set as active
              roomPeers.add({ ws, peerId: currentPeerId, name: currentName, isAdmin: currentIsAdmin, isPending: false });
              broadcastRoomCounts();

              // If an admin just joined, notify the admin about any pending knock requests,
              // and notify pending participants that the admin is now here!
              if (currentIsAdmin) {
                for (const p of roomPeers) {
                  if (p.isPending && p.ws.readyState === 1) {
                    // Send knock request to the new admin
                    ws.send(JSON.stringify({
                      type: 'KNOCK_REQUEST',
                      peerId: p.peerId,
                      name: p.name,
                      roomNumber: currentRoom,
                    }));
                    // Inform the waiting participant that admin has arrived
                    p.ws.send(JSON.stringify({
                      type: 'KNOCK_ADMIN_ARRIVED',
                      message: 'Admin has joined Room #' + currentRoom + '! Waiting for admin to admit you...',
                    }));
                  }
                }
              }
            } else if (data.type === 'KNOCK_REQUEST') {
              // Non-admin requesting permission to join from room admin(s)
              currentRoom = String(data.roomNumber).trim();
              currentPeerId = data.peerId;
              currentName = data.name || 'Participant';

              // If the room was deleted, notify knocking peer immediately
              if (!sharedRooms.some((r) => r.roomNumber === currentRoom)) {
                ws.send(JSON.stringify({
                  type: 'ROOM_DELETED',
                  roomNumber: currentRoom,
                  rooms: sharedRooms,
                }));
                return;
              }

              // If the room is locked, inform knocking peer immediately
              const targetRoomConfig = sharedRooms.find((r) => r.roomNumber === currentRoom);
              if (targetRoomConfig?.permissions?.isLocked) {
                ws.send(JSON.stringify({
                  type: 'ROOM_LOCKED',
                  message: `Room #${currentRoom} is locked. Please contact the room admin to unlock the room.`,
                }));
                return;
              }

              if (!rooms.has(currentRoom)) {
                rooms.set(currentRoom, new Set());
              }
              const roomPeers = rooms.get(currentRoom);

              let adminFound = false;
              for (const p of roomPeers) {
                if (p.isAdmin && !p.isPending && p.ws.readyState === 1) {
                  adminFound = true;
                  p.ws.send(JSON.stringify({
                    type: 'KNOCK_REQUEST',
                    peerId: currentPeerId,
                    name: currentName,
                    roomNumber: currentRoom,
                  }));
                }
              }

              // Register as pending
              roomPeers.add({ ws, peerId: currentPeerId, name: currentName, isAdmin: false, isPending: true });

              if (adminFound) {
                ws.send(JSON.stringify({
                  type: 'KNOCK_WAITING',
                  message: 'Admin is in the room. Waiting for admin approval to enter Room #' + currentRoom + '...',
                }));
              } else {
                ws.send(JSON.stringify({
                  type: 'KNOCK_NO_ADMIN',
                  message: 'The room admin has not joined yet. Waiting for admin to join Room #' + currentRoom + '...',
                }));
              }
            } else if (data.type === 'KNOCK_RESPONSE') {
              // Admin admitted or denied a knocking participant
              const targetRoom = String(data.roomNumber || currentRoom).trim();
              const targetPeerId = data.targetPeerId;
              const status = data.status; // 'admitted' | 'denied'

              if (status === 'admitted' && targetPeerId) {
                admittedKnockIds.add(targetPeerId);
              }

              if (rooms.has(targetRoom)) {
                const roomPeers = rooms.get(targetRoom);
                for (const p of roomPeers) {
                  if (p.peerId === targetPeerId) {
                    if (p.ws.readyState === 1) {
                      p.ws.send(JSON.stringify({
                        type: 'KNOCK_RESPONSE',
                        status,
                        roomNumber: targetRoom,
                      }));
                    }
                    if (status === 'denied') {
                      roomPeers.delete(p);
                    }
                  }
                }
              }
            } else if (data.type === 'LOCK_ROOM' || data.type === 'UNLOCK_ROOM') {
              const targetRoom = String(data.roomNumber || currentRoom).trim();
              const isLocked = data.type === 'LOCK_ROOM';
              const targetConf = sharedRooms.find((r) => r.roomNumber === targetRoom);
              if (targetConf) {
                targetConf.permissions.isLocked = isLocked;
                broadcastRoomsUpdate();
              }
            } else if (data.type === 'ADMIN_BROADCAST_ANNOUNCEMENT') {
              // Relay global announcement to all active rooms and peers
              const announcementPayload = JSON.stringify({
                type: 'GLOBAL_ANNOUNCEMENT',
                message: data.message,
                sender: data.sender || 'System Admin',
                timestamp: Date.now(),
              });
              wss.clients.forEach((client) => {
                if (client.readyState === 1) {
                  client.send(announcementPayload);
                }
              });
            }
          } catch (e) {
            console.warn('Signaling message error:', e);
          }
        });

        ws.on('close', () => {
          if (currentRoom && rooms.has(currentRoom)) {
            const roomPeers = rooms.get(currentRoom);
            let wasAdmin = false;
            for (const p of roomPeers) {
              if (p.peerId === currentPeerId) {
                wasAdmin = Boolean(p.isAdmin);
                roomPeers.delete(p);
              } else if (!p.isPending && p.ws.readyState === 1) {
                p.ws.send(JSON.stringify({
                  type: 'PEER_LEFT',
                  peerId: currentPeerId,
                }));
              }
            }

            // If an admin left, check if any other admin remains
            if (wasAdmin) {
              let hasAdminRemaining = false;
              for (const p of roomPeers) {
                if (p.isAdmin && !p.isPending && p.ws.readyState === 1) {
                  hasAdminRemaining = true;
                  break;
                }
              }
              if (!hasAdminRemaining) {
                // Notify any still-waiting peers that admin has left
                for (const p of roomPeers) {
                  if (p.isPending && p.ws.readyState === 1) {
                    p.ws.send(JSON.stringify({
                      type: 'KNOCK_NO_ADMIN',
                      message: 'The room admin has left. Waiting for admin to join Room #' + currentRoom + '...',
                    }));
                  }
                }
              }
            }

            if (roomPeers.size === 0) {
              rooms.delete(currentRoom);
              roomStartTimes.delete(currentRoom);
            }
            broadcastRoomCounts();
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Enable HTTPS by default for LAN WebRTC camera & microphone support (unless explicitly set to false)
  const useHttps = env.VITE_USE_HTTPS !== 'false' && process.env.HTTPS !== 'false';

  return {
    plugins: [
      react(),
      tailwindcss(),
      lanSignalingPlugin(),
      ...(useHttps ? [basicSsl()] : []),
    ],
    server: {
      host: '0.0.0.0', // Listen on all IP interfaces
      port: 5173,
    },
  };
});
