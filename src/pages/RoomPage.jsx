import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Peer from 'peerjs';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  MessageSquare,
  PhoneOff,
  Copy,
  Check,
  Users,
  Shield,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Send,
  X,
  Sparkles,
  User,
  ArrowRight,
  Wifi,
  Crown,
  KeyRound,
} from 'lucide-react';
import { useRoomContext } from '../context/RoomContext';
import { getBaseNetworkUrl, getNetworkIp } from '../utils/network';
import { createSyntheticStream } from '../utils/mediaFallback';

export default function RoomPage() {
  const { roomNumber } = useParams();
  const navigate = useNavigate();
  const { getRoom, deletedRoomNotification, loginAdmin, isRoomsLoaded } = useRoomContext();

  // Name & Join status
  const [userName, setUserName] = useState(() => localStorage.getItem('vccall_display_name') || '');
  const [isJoined, setIsJoined] = useState(false);
  const [nameError, setNameError] = useState('');

  // Admin Role & Password
  const [isAdmin, setIsAdmin] = useState(false);
  const [joinAsAdmin, setJoinAsAdmin] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');

  // Room config & permissions
  const roomConfig = getRoom(roomNumber);
  const permissions = roomConfig?.permissions || {};

  // Knocking / Ask Before Join state
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);
  const [hasAdminJoined, setHasAdminJoined] = useState(false);
  const [knockStatusMessage, setKnockStatusMessage] = useState('');
  const [pendingKnocks, setPendingKnocks] = useState([]); // Admin view: [{ peerId, name }]
  const knockWsRef = useRef(null);
  const pendingPeerIdRef = useRef('');

  // Media Streams
  const [localStream, setLocalStream] = useState(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  // participants map: { [peerId]: { name, stream, isConnected, isAdmin } }
  const [participants, setParticipants] = useState({});
  const [myPeerId, setMyPeerId] = useState('');
  const [isPeerReady, setIsPeerReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');

  // In-call toggles
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Chat
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  // Refs
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const activeCallsRef = useRef({}); // { peerId: call }
  const dataConnsRef = useRef({}); // { peerId: conn }
  const wsRef = useRef(null);
  const roomChannelRef = useRef(null);
  const chatBottomRef = useRef(null);
  const myPeerIdRef = useRef('');
  const userNameRef = useRef('');
  const isAdminRef = useRef(false);

  useEffect(() => {
    myPeerIdRef.current = myPeerId;
  }, [myPeerId]);

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // Auto-scroll chat
  useEffect(() => {
    if (isChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen]);

  // Listen for admin room deletion
  useEffect(() => {
    if (deletedRoomNotification && deletedRoomNotification === String(roomNumber).trim()) {
      alert(`Room #${roomNumber} was closed by the admin. Redirecting to lobby.`);
      navigate('/');
    }
  }, [deletedRoomNotification, roomNumber, navigate]);

  // Check if room is locked
  useEffect(() => {
    if (permissions.isLocked) {
      alert(`Room #${roomNumber} is locked by the admin.`);
      navigate('/');
    }
  }, [permissions.isLocked, roomNumber, navigate]);

  // Media state
  const [mediaError, setMediaError] = useState('');
  const [isRequestingMedia, setIsRequestingMedia] = useState(false);

  // 1. Initialize Local Media for Preview & Call (With Intelligent Fallback)
  const initMedia = async () => {
    setIsRequestingMedia(true);
    setMediaError('');
    let stream = null;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // 1st attempt: Request both camera and mic
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: permissions.allowCamera !== false ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
          audio: permissions.allowMic !== false,
        });
      } catch (err) {
        console.warn('Initial camera+mic request failed, attempting separate fallbacks:', err);

        // 2nd attempt: If camera failed, try microphone only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setMediaError('Camera unavailable or in use by another app/tab. Joined with microphone only.');
        } catch (micErr) {
          console.warn('Microphone request also failed:', micErr);
          // 3rd attempt: If mic failed, try camera only
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            setMediaError('Microphone unavailable or in use. Joined with camera only.');
          } catch (camErr) {
            console.warn('Both physical camera and microphone unavailable:', camErr);
            if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
              setMediaError('Browser blocked camera/mic on non-HTTPS IP. Use Chrome flag or HTTPS.');
            } else {
              setMediaError('Camera/Microphone is blocked or locked by another app/browser tab.');
            }
          }
        }
      }
    } else {
      setMediaError('Camera/Microphone API is not supported in this browser context.');
    }

    if (stream && stream.getTracks().length > 0) {
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsUsingFallback(false);
      setIsRequestingMedia(false);
      return stream;
    }

    // If all physical requests failed, create synthetic avatar stream to keep WebRTC alive
    const fallback = createSyntheticStream(userNameRef.current || 'User');
    localStreamRef.current = fallback;
    setLocalStream(fallback);
    setIsUsingFallback(true);
    setIsRequestingMedia(false);
    return fallback;
  };

  useEffect(() => {
    if (!roomConfig) return;
    initMedia();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [permissions.allowCamera, permissions.allowMic]);

  // 2. PeerJS & Multi-Peer Room Mesh (WebSocket + WebRTC for cross-device LAN)
  useEffect(() => {
    if (!isJoined) return;

    let peerInstance = null;
    let ws = null;
    const cleanRoom = String(roomNumber).replace(/[^a-zA-Z0-9_-]/g, '');
    const randomHex = Math.random().toString(36).substring(2, 8);
    const assignedPeerId = `vccall-${cleanRoom}-${randomHex}`;
    const peerNamesMap = new Map();

    // A. Setup BroadcastChannel for same-browser tabs
    const channelName = `vccall_mesh_${cleanRoom}`;
    let roomChannel = null;
    try {
      roomChannel = new BroadcastChannel(channelName);
      roomChannelRef.current = roomChannel;
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    // Initialize PeerJS
    const peer = new Peer(assignedPeerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
      },
    });

    peerInstance = peer;
    peerRef.current = peer;

    // Helper: Make sure we always have a non-null stream to pass
    const getStreamToShare = () => {
      if (localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
        return localStreamRef.current;
      }
      const synthetic = createSyntheticStream(userNameRef.current || 'You');
      localStreamRef.current = synthetic;
      setLocalStream(synthetic);
      return synthetic;
    };

    // Helper: Call a peer
    const initiateCallToPeer = (targetPeerId, targetName, targetIsAdmin = false) => {
      if (!targetPeerId || targetPeerId === assignedPeerId) return;
      if (activeCallsRef.current[targetPeerId]) return;

      if (targetName) {
        peerNamesMap.set(targetPeerId, { name: targetName, isAdmin: Boolean(targetIsAdmin) });
      }
      console.log(`[LAN Mesh] Calling peer: ${targetPeerId} (${targetName || 'Peer'}, Admin: ${targetIsAdmin})`);

      // Initiate media call
      const stream = getStreamToShare();
      try {
        const call = peer.call(targetPeerId, stream, {
          metadata: {
            senderName: userNameRef.current,
            peerId: assignedPeerId,
            isAdmin: isAdminRef.current,
          },
        });
        if (call) {
          handleIncomingCall(call, true, targetName, targetIsAdmin);
        }
      } catch (err) {
        console.warn('Call initiation error:', err);
      }

      // Initiate data connection for chat & admin role sync
      try {
        const conn = peer.connect(targetPeerId, {
          metadata: {
            senderName: userNameRef.current,
            peerId: assignedPeerId,
            isAdmin: isAdminRef.current,
          },
        });
        if (conn) {
          setupDataConnection(conn, targetName, targetIsAdmin);
        }
      } catch (err) {
        console.warn('Data connection error:', err);
      }
    };

    peer.on('open', (id) => {
      console.log(`[PeerJS] Connected with ID: ${id}`);
      setMyPeerId(id);
      setIsPeerReady(true);
      setConnectionStatus('Connected');

      // 1. Connect to Built-in LAN WebSocket Signaling on same port (for cross-device Mobile/PC)
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.host; // e.g. 10.12.191.153:5173
        const wsUrl = `${wsProtocol}//${wsHost}/signaling`;
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[LAN WS] Connected to local signaling server on', wsHost);
          ws.send(JSON.stringify({
            type: 'JOIN_ROOM',
            roomNumber: cleanRoom,
            peerId: id,
            name: userNameRef.current,
            isAdmin: isAdminRef.current,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'EXISTING_PEERS') {
              console.log('[LAN WS] Existing peers in room:', data.peers);
              data.peers.forEach((p) => {
                if (p.peerId !== id) {
                  peerNamesMap.set(p.peerId, { name: p.name, isAdmin: Boolean(p.isAdmin) });
                  initiateCallToPeer(p.peerId, p.name, p.isAdmin);
                }
              });
            } else if (data.type === 'PEER_JOINED') {
              console.log('[LAN WS] Peer joined from another device:', data.peerId, data.name, 'Admin:', data.isAdmin);
              if (data.peerId !== id) {
                peerNamesMap.set(data.peerId, { name: data.name, isAdmin: Boolean(data.isAdmin) });
                if (id > data.peerId) {
                  initiateCallToPeer(data.peerId, data.name, data.isAdmin);
                }
              }
            } else if (data.type === 'PEER_LEFT') {
              removePeer(data.peerId);
            } else if (data.type === 'ROOM_DELETED') {
              if (String(data.roomNumber) === String(cleanRoom)) {
                alert(`Room #${cleanRoom} was closed by the admin. Redirecting to lobby.`);
                navigate('/');
              }
            } else if (data.type === 'ADMIN_REQUIRED') {
              // Server rejected join because no admin is in the room
              console.warn('[LAN WS] Admin is required to join this room.');
              setIsJoined(false);
              startKnocking(userNameRef.current);
            } else if (data.type === 'KNOCK_REQUEST') {
              // Only active room admin receives this notification
              if (isAdminRef.current) {
                console.log('[Admin] Received knock request from:', data.name, data.peerId);
                setPendingKnocks((prev) => {
                  if (prev.some((k) => k.peerId === data.peerId)) return prev;
                  return [...prev, { peerId: data.peerId, name: data.name }];
                });
              }
            }
          } catch (err) {
            console.warn('[LAN WS] Error parsing message:', err);
          }
        };
      } catch (e) {
        console.warn('[LAN WS] Could not connect to WebSocket signaling:', e);
      }

      // 2. Broadcast on local channel for same-machine tabs
      if (roomChannel) {
        roomChannel.onmessage = (event) => {
          const { type, peerId: remoteId, userName: remoteName, isAdmin: remoteIsAdmin } = event.data || {};
          if (!remoteId || remoteId === id) return;

          if (type === 'PEER_JOINED') {
            peerNamesMap.set(remoteId, { name: remoteName, isAdmin: Boolean(remoteIsAdmin) });
            roomChannel.postMessage({
              type: 'PEER_ANNOUNCE',
              peerId: id,
              userName: userNameRef.current,
              isAdmin: isAdminRef.current,
            });

            if (id > remoteId) {
              initiateCallToPeer(remoteId, remoteName, remoteIsAdmin);
            }
          } else if (type === 'PEER_ANNOUNCE') {
            peerNamesMap.set(remoteId, { name: remoteName, isAdmin: Boolean(remoteIsAdmin) });
            if (id > remoteId) {
              initiateCallToPeer(remoteId, remoteName, remoteIsAdmin);
            }
          } else if (type === 'PEER_LEFT') {
            removePeer(remoteId);
          } else if (type === 'KNOCK_REQUEST') {
            if (isAdminRef.current) {
              setPendingKnocks((prev) => {
                if (prev.some((k) => k.peerId === remoteId)) return prev;
                return [...prev, { peerId: remoteId, name: remoteName }];
              });
            }
          }
        };

        roomChannel.postMessage({
          type: 'PEER_JOINED',
          peerId: id,
          userName: userNameRef.current,
          isAdmin: isAdminRef.current,
        });
      }
    });

    // Handle incoming or outgoing media call
    const handleIncomingCall = (call, isOutgoing = false, fallbackName = 'Peer', fallbackIsAdmin = false) => {
      activeCallsRef.current[call.peer] = call;

      const remoteMetadata = call.metadata || {};
      if (!isOutgoing && remoteMetadata.senderName) {
        peerNamesMap.set(call.peer, {
          name: remoteMetadata.senderName,
          isAdmin: Boolean(remoteMetadata.isAdmin),
        });
      } else if (fallbackName && fallbackName !== userNameRef.current) {
        peerNamesMap.set(call.peer, {
          name: fallbackName,
          isAdmin: Boolean(fallbackIsAdmin),
        });
      }

      call.on('stream', (incomingStream) => {
        const peerRecord = peerNamesMap.get(call.peer);
        const displayName = peerRecord?.name || (!isOutgoing ? remoteMetadata.senderName : fallbackName) || 'Peer';
        const isPeerAdmin = peerRecord?.isAdmin ?? (!isOutgoing ? Boolean(remoteMetadata.isAdmin) : Boolean(fallbackIsAdmin));

        console.log(`[WebRTC] Received stream from: ${call.peer} (${displayName}, Admin: ${isPeerAdmin})`);

        setParticipants((prev) => ({
          ...prev,
          [call.peer]: {
            name: displayName,
            isAdmin: isPeerAdmin,
            stream: incomingStream,
            isConnected: true,
          },
        }));
      });

      call.on('close', () => {
        removePeer(call.peer);
      });

      call.on('error', (err) => {
        console.warn('Call error:', err);
      });
    };

    peer.on('call', (call) => {
      console.log(`[PeerJS] Incoming call from: ${call.peer}, Metadata:`, call.metadata);
      const remoteName = call.metadata?.senderName || 'Peer';
      const remoteIsAdmin = Boolean(call.metadata?.isAdmin);
      peerNamesMap.set(call.peer, { name: remoteName, isAdmin: remoteIsAdmin });

      const stream = getStreamToShare();
      call.answer(stream);
      handleIncomingCall(call, false, remoteName, remoteIsAdmin);
    });

    // Handle data connection and exchange names & admin roles
    const setupDataConnection = (conn, partnerName, partnerIsAdmin = false) => {
      dataConnsRef.current[conn.peer] = conn;

      if (partnerName && partnerName !== userNameRef.current) {
        peerNamesMap.set(conn.peer, {
          name: partnerName,
          isAdmin: Boolean(partnerIsAdmin),
        });
      }

      conn.on('open', () => {
        console.log(`[DataConn] Connection opened with: ${conn.peer}`);

        // Exchange names and admin status bidirectionally
        conn.send({
          type: 'NAME_HANDSHAKE',
          name: userNameRef.current,
          isAdmin: isAdminRef.current,
        });

        const peerRecord = peerNamesMap.get(conn.peer);
        const currentName = peerRecord?.name || partnerName || 'Peer';
        const currentIsAdmin = peerRecord?.isAdmin ?? Boolean(partnerIsAdmin);

        setParticipants((prev) => ({
          ...prev,
          [conn.peer]: {
            ...prev[conn.peer],
            name: currentName,
            isAdmin: currentIsAdmin,
            isConnected: true,
          },
        }));
      });

      conn.on('data', (data) => {
        if (data.type === 'CHAT_MSG') {
          setMessages((prev) => [...prev, data.payload]);
          if (!isChatOpen) {
            setUnreadCount((prev) => prev + 1);
          }
        } else if (data.type === 'NAME_HANDSHAKE') {
          peerNamesMap.set(conn.peer, {
            name: data.name,
            isAdmin: Boolean(data.isAdmin),
          });
          setParticipants((prev) => ({
            ...prev,
            [conn.peer]: {
              ...prev[conn.peer],
              name: data.name,
              isAdmin: Boolean(data.isAdmin),
              isConnected: true,
            },
          }));
        }
      });

      conn.on('close', () => {
        removePeer(conn.peer);
      });
    };

    peer.on('connection', (conn) => {
      console.log(`[PeerJS] Incoming data connection from: ${conn.peer}, Metadata:`, conn.metadata);
      const partnerName = conn.metadata?.senderName || 'Peer';
      const partnerIsAdmin = Boolean(conn.metadata?.isAdmin);
      setupDataConnection(conn, partnerName, partnerIsAdmin);
    });

    const removePeer = (peerId) => {
      console.log(`[LAN Mesh] Peer disconnected: ${peerId}`);
      if (activeCallsRef.current[peerId]) {
        try {
          activeCallsRef.current[peerId].close();
        } catch (e) {
          // Ignore
        }
      }
      if (dataConnsRef.current[peerId]) {
        try {
          dataConnsRef.current[peerId].close();
        } catch (e) {
          // Ignore
        }
      }
      peerNamesMap.delete(peerId);
      setParticipants((prev) => {
        const updated = { ...prev };
        delete updated[peerId];
        return updated;
      });
    };

    peer.on('error', (err) => {
      console.warn('Peer error:', err);
    });

    return () => {
      if (ws) {
        ws.close();
      }
      if (roomChannel) {
        roomChannel.postMessage({
          type: 'PEER_LEFT',
          peerId: assignedPeerId,
        });
        roomChannel.close();
      }
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
      }
      Object.values(activeCallsRef.current).forEach((call) => call.close());
      Object.values(dataConnsRef.current).forEach((conn) => conn.close());
      if (peerInstance) {
        peerInstance.destroy();
      }
    };
  }, [isJoined, roomNumber]);

  // Handle Admin responding to a Knock request (Admit or Deny)
  const handleAdmitKnock = (targetPeerId) => {
    // Send admission via WebSocket
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'KNOCK_RESPONSE',
        roomNumber,
        targetPeerId,
        status: 'admitted',
      }));
    }
    // Also broadcast cross-tab
    if (roomChannelRef.current) {
      try {
        roomChannelRef.current.postMessage({
          type: 'KNOCK_RESPONSE',
          targetPeerId,
          status: 'admitted',
        });
      } catch (e) {
        // Ignored
      }
    }
    setPendingKnocks((prev) => prev.filter((k) => k.peerId !== targetPeerId));
  };

  const handleDenyKnock = (targetPeerId) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'KNOCK_RESPONSE',
        roomNumber,
        targetPeerId,
        status: 'denied',
      }));
    }
    if (roomChannelRef.current) {
      try {
        roomChannelRef.current.postMessage({
          type: 'KNOCK_RESPONSE',
          targetPeerId,
          status: 'denied',
        });
      } catch (e) {
        // Ignored
      }
    }
    setPendingKnocks((prev) => prev.filter((k) => k.peerId !== targetPeerId));
  };

  // Helper to start the Knocking / Waiting process
  const startKnocking = (trimmedName) => {
    setIsWaitingApproval(true);
    setHasAdminJoined(false);
    setKnockStatusMessage('Connecting to room...');

    const cleanRoom = String(roomNumber).replace(/[^a-zA-Z0-9_-]/g, '');
    const randomHex = Math.random().toString(36).substring(2, 8);
    const knockPeerId = `knock-${cleanRoom}-${randomHex}`;
    pendingPeerIdRef.current = knockPeerId;

    // Connect to WebSocket signaling to knock
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/signaling`;
    const knockWs = new WebSocket(wsUrl);
    knockWsRef.current = knockWs;

    knockWs.onopen = () => {
      knockWs.send(JSON.stringify({
        type: 'KNOCK_REQUEST',
        roomNumber: cleanRoom,
        peerId: knockPeerId,
        name: trimmedName,
      }));
    };

    knockWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'KNOCK_NO_ADMIN') {
          setHasAdminJoined(false);
          setKnockStatusMessage(data.message || 'The room admin has not joined yet. Waiting for admin to join Room #' + roomNumber + '...');
        } else if (data.type === 'KNOCK_ADMIN_ARRIVED') {
          setHasAdminJoined(true);
          setKnockStatusMessage(data.message || 'Admin has joined Room #' + roomNumber + '! Waiting for admin to admit you...');
        } else if (data.type === 'ROOM_DELETED') {
          if (String(data.roomNumber) === String(cleanRoom)) {
            setIsWaitingApproval(false);
            try { knockWs.close(); } catch (e) {}
            alert(`Room #${cleanRoom} was closed by the admin. Redirecting to lobby.`);
            navigate('/');
          }
        } else if (data.type === 'KNOCK_RESPONSE') {
          if (data.status === 'admitted') {
            setIsWaitingApproval(false);
            try { knockWs.close(); } catch (e) {}
            setIsJoined(true);
          } else if (data.status === 'denied') {
            setIsWaitingApproval(false);
            try { knockWs.close(); } catch (e) {}
            setNameError('The room admin declined your request to join.');
          }
        }
      } catch (e) {
        console.warn('Knock response parse error:', e);
      }
    };

    // Cross-tab broadcast support for knocking
    try {
      const channelName = `vccall_mesh_${cleanRoom}`;
      const channel = new BroadcastChannel(channelName);
      channel.postMessage({
        type: 'KNOCK_REQUEST',
        peerId: knockPeerId,
        userName: trimmedName,
      });
      channel.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === 'KNOCK_RESPONSE' && d.targetPeerId === knockPeerId) {
          if (d.status === 'admitted') {
            setIsWaitingApproval(false);
            channel.close();
            try { knockWs.close(); } catch (err) {}
            setIsJoined(true);
          } else if (d.status === 'denied') {
            setIsWaitingApproval(false);
            channel.close();
            try { knockWs.close(); } catch (err) {}
            setNameError('The room admin declined your request to join.');
          }
        } else if (d.type === 'PEER_JOINED' && d.isAdmin) {
          setHasAdminJoined(true);
          setKnockStatusMessage(`Admin (${d.userName || 'Host'}) has joined Room #${cleanRoom}! Waiting for admin to admit you...`);
          channel.postMessage({
            type: 'KNOCK_REQUEST',
            peerId: knockPeerId,
            userName: trimmedName,
          });
        }
      };
    } catch (err) {
      // Ignored
    }
  };

  const handleCancelKnock = () => {
    setIsWaitingApproval(false);
    if (knockWsRef.current) {
      try { knockWsRef.current.close(); } catch (e) {}
    }
  };

  // Confirm Name and Enter Call
  const handleConfirmJoin = (e) => {
    e.preventDefault();
    setNameError('');
    setAdminError('');

    const trimmed = userName.trim();
    if (!trimmed) {
      setNameError('Your name is required to enter the room.');
      return;
    }

    if (joinAsAdmin) {
      if (!adminPasswordInput.trim()) {
        setAdminError('Please enter the admin password or uncheck "Join as Room Admin".');
        return;
      }
      const success = loginAdmin(adminPasswordInput.trim());
      if (!success) {
        setAdminError('Invalid admin password. Check your password or join as regular participant.');
        return;
      }
      setIsAdmin(true);
      isAdminRef.current = true;
      localStorage.setItem('vccall_display_name', trimmed);
      setIsJoined(true);
      return;
    }

    setIsAdmin(false);
    isAdminRef.current = false;
    localStorage.setItem('vccall_display_name', trimmed);

    // Regular participants must always wait for admin to be in room & approve
    startKnocking(trimmed);
  };

  // Media Actions: Mute
  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  // Media Actions: Camera On/Off
  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  // Media Actions: Screen Share
  const toggleScreenShare = async () => {
    if (!permissions.allowScreenShare) {
      alert('Screen sharing has been disabled for this room by the admin.');
      return;
    }

    if (isScreenSharing) {
      stopScreenShare();
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        Object.values(activeCallsRef.current).forEach((call) => {
          if (call.peerConnection) {
            const videoSender = call.peerConnection
              .getSenders()
              .find((s) => s.track && s.track.kind === 'video');
            if (videoSender) videoSender.replaceTrack(screenTrack);
          }
        });

        screenTrack.onended = () => {
          stopScreenShare();
        };

        setIsScreenSharing(true);
      } catch (err) {
        console.warn('Screen share canceled or failed:', err);
      }
    }
  };

  const stopScreenShare = () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (localStreamRef.current) {
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      if (cameraTrack) {
        Object.values(activeCallsRef.current).forEach((call) => {
          if (call.peerConnection) {
            const videoSender = call.peerConnection
              .getSenders()
              .find((s) => s.track && s.track.kind === 'video');
            if (videoSender) videoSender.replaceTrack(cameraTrack);
          }
        });
      }
    }
    setIsScreenSharing(false);
  };

  // Chat Actions
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!permissions.allowChat) {
      alert('Text chat has been disabled for this room by the admin.');
      return;
    }

    if (!chatInput.trim()) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const payload = {
      text: chatInput.trim(),
      senderName: userName || 'You',
      senderId: myPeerId,
      isAdmin: isAdminRef.current,
      time,
    };

    Object.values(dataConnsRef.current).forEach((conn) => {
      if (conn.open) {
        conn.send({ type: 'CHAT_MSG', payload });
      }
    });

    setMessages((prev) => [...prev, { ...payload, isSelf: true }]);
    setChatInput('');
  };

  const handleCopyInviteLink = () => {
    const url = `${getBaseNetworkUrl()}/room/${roomNumber}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleLeaveCall = () => {
    navigate('/');
  };

  // 1. Loading state while verifying room existence from server
  if (!isRoomsLoaded) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 px-6 py-4 shadow-xl text-slate-300 text-sm font-semibold backdrop-blur-xl">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
          <span>Verifying room existence...</span>
        </div>
      </div>
    );
  }

  // 2. Room Does Not Exist Screen
  if (isRoomsLoaded && !roomConfig) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <ShieldAlert className="h-8 w-8 text-rose-400" />
          </div>

          <div>
            <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400 border border-rose-500/30 mb-2">
              Room Not Found
            </span>
            <h2 className="text-2xl font-extrabold text-white">Room Does Not Exist</h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Room <strong className="text-rose-400 font-mono">#{roomNumber}</strong> does not exist or has been deleted.
            </p>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              Please check the URL or contact your admin to create this room.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row gap-2.5 justify-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 transition-colors shadow-md"
            >
              Return to Lobby
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Contact Admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  // WAITING FOR ADMIN APPROVAL SCREEN ("Knock / Waiting Room")
  if (isWaitingApproval) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-5">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors ${
            hasAdminJoined
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            <ShieldAlert className="h-8 w-8 animate-pulse" />
          </div>

          <div>
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold border mb-2 transition-colors ${
              hasAdminJoined
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}>
              {hasAdminJoined ? 'Admin In Room • Approval Pending' : 'Waiting for Admin'}
            </span>
            <h2 className="text-xl font-bold text-white">
              {hasAdminJoined ? 'Waiting for Admin to Admit You' : 'Wait for Admin to Join'}
            </h2>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              {knockStatusMessage || (hasAdminJoined
                ? 'Admin has entered Room #' + roomNumber + '. Waiting for admin approval...'
                : 'The room admin has not joined yet. Waiting for admin to join Room #' + roomNumber + '...')}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-indigo-400 font-semibold py-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping"></span>
            <span>Request sent as <strong className="text-white font-mono">{userName}</strong></span>
          </div>

          <div className="pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleCancelKnock}
              className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Cancel Request
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PRE-JOIN SCREEN: Ask for Name (Required) and Camera/Mic Preview
  if (!isJoined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Header with IP display */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-400 mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Room #{roomNumber}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-white">Join Video Call</h2>
            <div className="mt-1 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              <span>Network IP: <strong className="text-indigo-300 font-mono">{getNetworkIp()}:5173</strong></span>
            </div>
          </div>

          {/* Self Camera Preview Tile */}
          <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
            <video
              ref={(el) => {
                if (el && localStream && el.srcObject !== localStream) {
                  el.srcObject = localStream;
                }
              }}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover -scale-x-100 ${isVideoOff ? 'hidden' : ''}`}
            />
            {isVideoOff && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-950 text-slate-500">
                <VideoOff className="h-8 w-8" />
                <span className="text-xs">Camera is Off</span>
              </div>
            )}

            {/* Preview Mute/Video Controls */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 shadow-xl backdrop-blur-md">
              <button
                type="button"
                onClick={toggleMute}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={toggleVideo}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  isVideoOff ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
                title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isVideoOff ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Media Permission / Hardware Alert Banner */}
          {isUsingFallback && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
              <div className="flex-1 space-y-1.5">
                <p className="font-semibold text-amber-200">
                  {mediaError || 'Physical camera/microphone is not accessible.'}
                </p>
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  If another browser tab or app is using your camera, close it and click Retry. Or ensure your browser has camera permission allowed for this IP address.
                </p>
                <button
                  type="button"
                  disabled={isRequestingMedia}
                  onClick={initMedia}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                >
                  {isRequestingMedia ? 'Requesting...' : 'Retry Camera & Mic'}
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleConfirmJoin} className="mt-6 space-y-4">
            {nameError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {nameError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Your Name <span className="text-indigo-400">*</span>
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Enter your name (Required)"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-700 bg-slate-950/90 py-3 pl-10 pr-4 text-sm font-semibold text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Join as Admin Option */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={joinAsAdmin}
                  onChange={(e) => {
                    setJoinAsAdmin(e.target.checked);
                    setAdminError('');
                  }}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                />
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Shield className="h-3.5 w-3.5 text-amber-400" />
                  <span>Join as Room Admin / Host</span>
                </div>
              </label>

              {joinAsAdmin && (
                <div className="pt-1 space-y-2 border-t border-slate-800/80 animate-in fade-in duration-200">
                  <label className="block text-[11px] font-medium text-slate-400">
                    Admin Password (from .env)
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                      <KeyRound className="h-3.5 w-3.5" />
                    </div>
                    <input
                      type="password"
                      placeholder="Enter admin password (e.g. admin123)"
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>
                  {adminError && (
                    <p className="text-[11px] font-medium text-red-400">{adminError}</p>
                  )}
                  <p className="text-[10px] text-slate-500">
                    Entering the correct password grants the 👑 Admin badge and host privileges in this call.
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:scale-[1.01] hover:shadow-indigo-600/50 transition-all active:scale-[0.99]"
            >
              <Video className="h-4 w-4" />
              <span>{joinAsAdmin ? `Join Room #${roomNumber} as Admin 👑` : `Join Room #${roomNumber}`}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE CALL SCREEN
  const participantIds = Object.keys(participants);
  const totalCount = participantIds.length + 1;

  const getGridClass = () => {
    if (totalCount <= 2) return 'grid-cols-1 md:grid-cols-2';
    if (totalCount <= 4) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2';
    if (totalCount <= 6) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
  };

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-950">
      {/* Main Video Stage */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Room Header Bar: Displays IP & Room */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/60 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono text-sm font-bold text-white">Room #{roomNumber}</span>
            </div>
            <span className="hidden text-xs text-slate-400 sm:inline">|</span>
            <span className="hidden text-xs font-medium text-slate-300 sm:inline">{roomConfig.roomName}</span>

            {/* Participants counter */}
            <span className="flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300 border border-slate-700">
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              <span>{totalCount} participant{totalCount > 1 ? 's' : ''}</span>
            </span>

            {/* Admin status indicator in header */}
            {isAdmin && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-400 border border-amber-500/30 shadow-sm">
                <Crown className="h-3.5 w-3.5" />
                <span>Host / Admin</span>
              </span>
            )}
          </div>

          {/* Center/Right: Network IP & Link */}
          <div className="flex items-center gap-2.5">
            {/* Top IP Display Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800/90 px-3 py-1 shadow-inner text-xs">
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-semibold text-slate-400">IP:</span>
              <code className="font-mono font-bold text-indigo-300">{getNetworkIp()}:5173</code>
            </div>

            {/* Copy Invite Link */}
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>

        {/* Admin Knock Request Notifications Bar */}
        {isAdmin && pendingKnocks.length > 0 && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 backdrop-blur-md">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 animate-bounce" />
                <span>
                  {pendingKnocks.length} participant{pendingKnocks.length > 1 ? 's are' : ' is'} asking to join Room #{roomNumber}:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pendingKnocks.map((knock) => (
                  <div
                    key={knock.peerId}
                    className="flex items-center gap-2 rounded-xl bg-slate-900/90 border border-amber-500/40 px-3 py-1 text-xs shadow-md"
                  >
                    <span className="font-bold text-white">{knock.name}</span>
                    <button
                      type="button"
                      onClick={() => handleAdmitKnock(knock.peerId)}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-emerald-500 transition-all active:scale-95"
                    >
                      Admit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDenyKnock(knock.peerId)}
                      className="rounded-lg bg-red-600/80 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 transition-all active:scale-95"
                    >
                      Deny
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Video Grid Area */}
        <div className="relative flex-1 p-4 overflow-hidden flex items-center justify-center">
          {participantIds.length === 0 ? (
            /* Single User Waiting State */
            <div className="relative h-full w-full max-w-4xl max-h-[75vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex items-center justify-center">
              <video
                ref={(el) => {
                  if (el && localStream && el.srcObject !== localStream) {
                    el.srcObject = localStream;
                  }
                }}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover -scale-x-100 ${isVideoOff ? 'hidden' : ''}`}
              />

              {isVideoOff && (
                <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                  <VideoOff className="h-12 w-12" />
                  <span className="text-sm">Your Camera is Off</span>
                </div>
              )}

              {/* Top overlay indicator */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                <span className="rounded-full bg-slate-950/80 px-3 py-1 text-xs text-slate-400 backdrop-blur-md border border-slate-800">
                  Waiting for peers on your Wi-Fi (IP: {getNetworkIp()}:5173)...
                </span>
              </div>

              {/* You tag */}
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1 backdrop-blur-md text-xs font-medium text-slate-200">
                <span>You ({userName || 'User'})</span>
                {isAdmin && (
                  <span className="flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30">
                    <Crown className="h-3 w-3" />
                    <span>Admin</span>
                  </span>
                )}
                {isMuted && <MicOff className="h-3.5 w-3.5 text-red-400" />}
              </div>
            </div>
          ) : (
            /* Multi-Peer Video Grid */
            <div className={`grid h-full w-full gap-4 ${getGridClass()} max-h-[75vh]`}>
              {/* Local Tile */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl flex items-center justify-center">
                <video
                  ref={(el) => {
                    if (el && localStream && el.srcObject !== localStream) {
                      el.srcObject = localStream;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover -scale-x-100 ${isVideoOff ? 'hidden' : ''}`}
                />
                {isVideoOff && (
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                    <VideoOff className="h-10 w-10" />
                    <span className="text-xs">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-medium text-slate-200 backdrop-blur-md">
                  <span>You ({userName})</span>
                  {isAdmin && (
                    <span className="flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30">
                      <Crown className="h-3 w-3" />
                      <span>Admin</span>
                    </span>
                  )}
                  {isMuted && <MicOff className="h-3.5 w-3.5 text-red-400" />}
                </div>
              </div>

              {/* Remote Participant Tiles */}
              {participantIds.map((peerId) => {
                const peerInfo = participants[peerId];
                const stream = peerInfo?.stream;
                const name = peerInfo?.name || `Peer (${peerId.substring(0, 8)})`;
                const peerIsAdmin = Boolean(peerInfo?.isAdmin);

                return (
                  <div
                    key={peerId}
                    className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl flex items-center justify-center"
                  >
                    {stream ? (
                      <video
                        ref={(el) => {
                          if (el && stream) {
                            if (el.srcObject !== stream) {
                              el.srcObject = stream;
                            }
                            el.play().catch((err) => console.log('Autoplay handled for remote peer:', err));
                          }
                        }}
                        autoPlay
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-bold text-2xl">
                          {(name[0] || 'P').toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-slate-300">{name}</span>
                        <span className="text-[11px] text-slate-500">Connecting video stream...</span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-medium text-slate-200 backdrop-blur-md">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      <span>{name}</span>
                      {peerIsAdmin && (
                        <span className="flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30">
                          <Crown className="h-3 w-3" />
                          <span>Admin</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Call Controls Dock */}
        <div className="flex h-20 items-center justify-center border-t border-slate-800/80 bg-slate-900/80 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Audio Mute/Unmute */}
            <button
              type="button"
              onClick={toggleMute}
              className={`flex h-12 w-12 flex-col items-center justify-center rounded-2xl transition-all shadow-md ${
                isMuted
                  ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>

            {/* Video On/Off */}
            <button
              type="button"
              onClick={toggleVideo}
              className={`flex h-12 w-12 flex-col items-center justify-center rounded-2xl transition-all shadow-md ${
                isVideoOff
                  ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
              title={isVideoOff ? 'Start video' : 'Stop video'}
            >
              {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </button>

            {/* Screen Share */}
            <button
              type="button"
              disabled={!permissions.allowScreenShare}
              onClick={toggleScreenShare}
              className={`flex h-12 w-12 flex-col items-center justify-center rounded-2xl transition-all shadow-md ${
                !permissions.allowScreenShare
                  ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed opacity-50'
                  : isScreenSharing
                  ? 'bg-indigo-600 text-white shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
              title={
                !permissions.allowScreenShare
                  ? 'Screen sharing disabled by admin'
                  : isScreenSharing
                  ? 'Stop sharing screen'
                  : 'Share screen'
              }
            >
              {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
            </button>

            {/* Live Chat Toggle */}
            <button
              type="button"
              disabled={!permissions.allowChat}
              onClick={() => {
                setIsChatOpen((prev) => !prev);
                setUnreadCount(0);
              }}
              className={`relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl transition-all shadow-md ${
                !permissions.allowChat
                  ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed opacity-50'
                  : isChatOpen
                  ? 'bg-indigo-600 text-white shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
              title={!permissions.allowChat ? 'Chat disabled by admin' : 'Toggle chat'}
            >
              <MessageSquare className="h-5 w-5" />
              {unreadCount > 0 && !isChatOpen && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* End / Leave Call */}
            <button
              type="button"
              onClick={handleLeaveCall}
              className="flex h-12 items-center gap-2 rounded-2xl bg-red-600 px-5 text-xs font-bold text-white shadow-lg shadow-red-600/30 transition-all hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98]"
              title="Leave call"
            >
              <PhoneOff className="h-4 w-4" />
              <span>Leave</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right P2P Live Chat Sidebar */}
      {isChatOpen && (
        <div className="flex h-full w-80 sm:w-96 flex-col border-l border-slate-800/80 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Live Room Chat</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Direct P2P Banner */}
          <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 text-[11px] font-medium text-emerald-400 border-b border-emerald-500/20">
            <Shield className="h-3.5 w-3.5" />
            <span>P2P Encrypted • Zero Server Storage</span>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
                <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-xs">No messages yet in Room #{roomNumber}.</p>
                <span className="text-[11px] text-slate-600">Send a greeting!</span>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1">
                    <span className="font-semibold text-slate-300">{msg.senderName}</span>
                    {msg.isAdmin && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-500/20 text-amber-300 px-1 py-0.2 text-[9px] font-bold border border-amber-500/30">
                        <Crown className="h-2.5 w-2.5" />
                        <span>Admin</span>
                      </span>
                    )}
                    <span>•</span>
                    <span>{msg.time}</span>
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm ${
                      msg.isSelf
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-slate-800 text-slate-100 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="border-t border-slate-800 p-3 bg-slate-950/60">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                disabled={!permissions.allowChat}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={permissions.allowChat ? 'Type your message...' : 'Chat disabled by admin'}
                className="flex-1 rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || !permissions.allowChat}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
