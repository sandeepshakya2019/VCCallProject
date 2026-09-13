import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Crown,
  KeyRound,
  Pin,
  PinOff,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Timer,
  Keyboard,
  LockOpen,
  UserMinus,
  Settings,
  Camera,
  ClipboardList,
  Bookmark,
  Activity,
  Sliders,
  Hand,
  Circle,
  FileText,
} from 'lucide-react';
import { useRoomContext } from '../context/RoomContext';
import { getBaseNetworkUrl } from '../utils/network';
import { createSyntheticStream } from '../utils/mediaFallback';

function generateRandomHex(length = 6) {
  return Math.random().toString(36).substring(2, 2 + length);
}

export default function RoomPage() {
  const { roomNumber } = useParams();
  const navigate = useNavigate();
  const { getRoom, deletedRoomNotification, loginAdmin, isRoomsLoaded, setIsInCall, updateRoomPermissions } = useRoomContext();

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
  const isAdmittedRef = useRef(false);

  // Media Streams
  const [localStream, setLocalStream] = useState(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  // participants map: { [peerId]: { name, stream, isConnected, isAdmin } }
  const [participants, setParticipants] = useState({});
  const [myPeerId, setMyPeerId] = useState('');
  const [knockNow, setKnockNow] = useState(() => Date.now());

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

  // --- Phase 1: Layout, Spotlight, Active Speaker, Timer, PiP, Fullscreen, Sounds ---
  const [pinnedId, setPinnedId] = useState(null);       // 'local' | peerId | null
  const [activeSpeakers, setActiveSpeakers] = useState(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  const [elapsedTime, setElapsedTime] = useState('');
  const [milestoneToast, setMilestoneToast] = useState(null);
  const [isPipVisible, setIsPipVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  // --- Phase 2: Admin Quick Controls, Screen Share Request, Room Lock, Auto-deny, Participants Panel ---
  const [shareRequests, setShareRequests] = useState([]); // [{ peerId, name }]
  const [shareRequestPending, setShareRequestPending] = useState(false);
  const [shareRequestStatus, setShareRequestStatus] = useState(''); // 'approved' | 'denied' | ''
  const isRoomLocked = Boolean(permissions.isLocked);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);

  // Admin Mute & Unmute Permission Request
  const [isMutedByAdmin, setIsMutedByAdmin] = useState(false);
  const [unmuteRequestPending, setUnmuteRequestPending] = useState(false);
  const [unmuteRequests, setUnmuteRequests] = useState([]); // [{ peerId, name }]

  // --- Phase 3: Media & Quality Settings, Reactions, Snapshot, Chat Pin, Agenda, Network Stats ---
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLowBandwidth, setIsLowBandwidth] = useState(false);
  const [pinnedChatMessage, setPinnedChatMessage] = useState(null); // { id, text, senderName, time }
  const [agenda, setAgenda] = useState('');
  const [isAgendaOpen, setIsAgendaOpen] = useState(false);
  const [agendaUnread, setAgendaUnread] = useState(false);
  const [statsPeerId, setStatsPeerId] = useState(null); // peerId | 'local' | null
  const [currentStats, setCurrentStats] = useState(null); // { rtt, packetsLost, resolution, fps, bitrate }
  const [reactionHoverMsgId, setReactionHoverMsgId] = useState(null);

  // --- Phase 4: Meeting Intelligence, Local Recording, Hand Raise, Global Announcements ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState('00:00');
  const [raisedHands, setRaisedHands] = useState(new Set()); // Set of peerId (or 'local')
  const [globalAnnouncement, setGlobalAnnouncement] = useState(null); // { message, sender, timestamp }

  // Refs
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const activeCallsRef = useRef({}); // { peerId: call }
  const dataConnsRef = useRef({}); // { peerId: conn }
  const wsRef = useRef(null);
  const roomChannelRef = useRef(null);
  const removePeerRef = useRef(null);
  const chatBottomRef = useRef(null);
  const myPeerIdRef = useRef('');
  const userNameRef = useRef('');
  const isAdminRef = useRef(false);
  // Phase 1 refs
  const analyserNodesRef = useRef({});   // { 'local': AnalyserNode, [peerId]: AnalyserNode }
  const audioCtxRef = useRef(null);
  const speakerTimersRef = useRef({});   // debounce timers per speaker id
  const joinedAtRef = useRef(null);
  const lastMilestoneRef = useRef(0);
  const callContainerRef = useRef(null); // for fullscreen
  const pinnedIdRef = useRef(null);      // mirror for callbacks
  const agendaRef = useRef('');          // mirror for data callbacks
  const pinnedChatMessageRef = useRef(null); // mirror for data callbacks
  // Phase 4 refs
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const attendanceMapRef = useRef({}); // { [peerId]: { name, isAdmin, joinedAt, leftAt } }
  const messagesRef = useRef([]);
  const isChatOpenRef = useRef(isChatOpen);
  const isAgendaOpenRef = useRef(isAgendaOpen);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  useEffect(() => {
    isAgendaOpenRef.current = isAgendaOpen;
  }, [isAgendaOpen]);

  useEffect(() => {
    myPeerIdRef.current = myPeerId;
  }, [myPeerId]);

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  useEffect(() => {
    pinnedIdRef.current = pinnedId;
  }, [pinnedId]);

  useEffect(() => {
    agendaRef.current = agenda;
  }, [agenda]);

  useEffect(() => {
    pinnedChatMessageRef.current = pinnedChatMessage;
  }, [pinnedChatMessage]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync with AppLayout to hide top navigation bar during active call
  useEffect(() => {
    if (setIsInCall) {
      setIsInCall(isJoined);
    }
    return () => {
      if (setIsInCall) {
        setIsInCall(false);
      }
    };
  }, [isJoined, setIsInCall]);

  // ─── Helper: Broadcast to all open data connections ───────────────────────
  const broadcastData = (payload) => {
    Object.values(dataConnsRef.current).forEach((conn) => {
      if (conn.open) conn.send(payload);
    });
  }

  // ─── Helper: Play synthesized notification sounds ─────────────────────────
  const playSound = useCallback((type) => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      masterGain.gain.setValueAtTime(0.28, ctx.currentTime);

      const beep = (freq, start, duration, wave = 'sine') => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        g.gain.setValueAtTime(0, ctx.currentTime + start);
        g.gain.linearRampToValueAtTime(1, ctx.currentTime + start + 0.02);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration + 0.05);
      };

      const sounds = {
        join:         () => { beep(523, 0, 0.15); beep(659, 0.16, 0.2); },
        leave:        () => { beep(659, 0, 0.15); beep(523, 0.16, 0.2); },
        knock:        () => { beep(440, 0, 0.08, 'triangle'); beep(440, 0.1, 0.08, 'triangle'); beep(440, 0.2, 0.08, 'triangle'); },
        admitted:     () => { beep(523, 0, 0.12); beep(659, 0.13, 0.12); beep(784, 0.26, 0.2); },
        denied:       () => { beep(300, 0, 0.15); beep(200, 0.16, 0.22); },
        admin_action: () => { beep(220, 0, 0.15); },
        milestone:    () => { beep(880, 0, 0.08); beep(1047, 0.1, 0.15); },
        request:      () => { beep(880, 0, 0.1); beep(660, 0.12, 0.15); },
        snapshot:     () => { beep(1200, 0, 0.05, 'square'); beep(1800, 0.06, 0.08, 'triangle'); },
        hand_raise:   () => { beep(600, 0, 0.1, 'sine'); beep(800, 0.12, 0.18, 'sine'); },
      };

      if (sounds[type]) sounds[type]();
      setTimeout(() => ctx.close(), 2000);
    } catch { /* no audio support */ }
  }, []);

  // ─── Active Speaker Detection ──────────────────────────────────────────────
  useEffect(() => {
    if (!isJoined) return;
    const SPEAK_THRESHOLD = 18;
    const SILENCE_DEBOUNCE = 600;

    const ensureAudioCtx = () => {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      return audioCtxRef.current;
    };

    const connectStream = (id, stream) => {
      if (!stream || analyserNodesRef.current[id]) return;
      try {
        const ctx = ensureAudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserNodesRef.current[id] = analyser;
      } catch { /* ignore */ }
    };

    // Connect local stream
    if (localStreamRef.current) connectStream('local', localStreamRef.current);

    // Connect all remote streams
    Object.entries(participants).forEach(([peerId, info]) => {
      if (info.stream) connectStream(peerId, info.stream);
    });

    const pollInterval = setInterval(() => {
      const data = new Uint8Array(64);

      Object.entries(analyserNodesRef.current).forEach(([id, analyser]) => {
        try {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((s, v) => s + v, 0) / data.length;
          const isSpeaking = avg > SPEAK_THRESHOLD;

          // Skip local if muted
          if (id === 'local' && isMuted) return;

          if (isSpeaking) {
            clearTimeout(speakerTimersRef.current[id]);
            delete speakerTimersRef.current[id];
            setActiveSpeakers(prev => {
              if (prev.has(id)) return prev;
              const next = new Set(prev);
              next.add(id);
              return next;
            });
          } else {
            if (!speakerTimersRef.current[id]) {
              speakerTimersRef.current[id] = setTimeout(() => {
                setActiveSpeakers(prev => {
                  const next = new Set(prev);
                  next.delete(id);
                  return next;
                });
                delete speakerTimersRef.current[id];
              }, SILENCE_DEBOUNCE);
            }
          }
        } catch { /* analyser may be disconnected */ }
      });
    }, 80);

    return () => {
      clearInterval(pollInterval);
      Object.values(speakerTimersRef.current).forEach(t => clearTimeout(t));
      speakerTimersRef.current = {};
    };
  }, [isJoined, participants, isMuted]);

  // ─── Clock + Progressive Meeting Timer ───────────────────────────────────
  useEffect(() => {
    if (!isJoined) return;
    if (!joinedAtRef.current) {
      joinedAtRef.current = Date.now();
    }
    lastMilestoneRef.current = 0;
    // Only notify every 10 minutes (10, 20, 30, 40, 50, 60 min, etc.)
    const MILESTONES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];

    const tick = () => {
      const start = joinedAtRef.current || Date.now();
      const elapsed = Math.max(0, Date.now() - start);
      const totalMinutes = Math.floor(elapsed / 60000);
      const h = Math.floor(elapsed / 3600000);
      const m = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');

      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setElapsedTime(h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`);

      const nextMs = MILESTONES.find(ms => ms > lastMilestoneRef.current && totalMinutes >= ms);
      if (nextMs) {
        lastMilestoneRef.current = nextMs;
        let label = '';
        if (nextMs % 60 === 0) {
          const hrs = nextMs / 60;
          label = `${hrs} hour${hrs > 1 ? 's' : ''} completed 🎉`;
        } else if (nextMs > 60) {
          const hrs = Math.floor(nextMs / 60);
          const remMin = nextMs % 60;
          label = `${hrs} hr ${remMin} mins completed`;
        } else {
          label = `${nextMs} minutes completed`;
        }

        setMilestoneToast(`⏱ ${label}`);
        playSound('milestone');
        setTimeout(() => setMilestoneToast(null), 4000);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isJoined, playSound]);

  // ─── Fullscreen change listener ───────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ─── Phase 1 & 2 Actions (Memoized & Defined Before Hooks/Effects) ───────
  const handleRequestUnmute = useCallback(() => {
    if (unmuteRequestPending) {
      alert('Your request to unmute is already waiting for host approval.');
      return;
    }
    setUnmuteRequestPending(true);
    playSound('request');
    broadcastData({
      type: 'UNMUTE_REQUEST',
      senderPeerId: myPeerIdRef.current,
      senderName: userNameRef.current,
    });
  }, [unmuteRequestPending, playSound]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    if (isMutedByAdmin && isMuted) {
      handleRequestUnmute();
      return;
    }
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, [isMutedByAdmin, isMuted, handleRequestUnmute]);

  const toggleSpeakerMute = useCallback(() => {
    setIsSpeakerMuted(prev => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      callContainerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleTakeSnapshot = useCallback(async () => {
    playSound('snapshot');
    try {
      const videos = Array.from(document.querySelectorAll('video'));
      if (videos.length === 0) {
        alert('No active video feeds to capture.');
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const count = videos.length;
      const cols = count === 1 ? 1 : count <= 4 ? 2 : 3;
      const rows = Math.ceil(count / cols);
      const padding = 16;
      const cellW = (canvas.width - padding * (cols + 1)) / cols;
      const cellH = (canvas.height - 70 - padding * (rows + 1)) / rows;

      videos.forEach((videoEl, index) => {
        const c = index % cols;
        const r = Math.floor(index / cols);
        const x = padding + c * (cellW + padding);
        const y = padding + r * (cellH + padding);

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 12);
        ctx.fill();

        if (videoEl.readyState >= 2) {
          try {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, cellW, cellH, 12);
            ctx.clip();
            ctx.drawImage(videoEl, x, y, cellW, cellH);
            ctx.restore();
          } catch (drawErr) {
            console.warn('Canvas drawImage error:', drawErr);
          }
        }

        ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 12);
        ctx.stroke();
      });

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fillRect(0, canvas.height - 60, canvas.width, 60);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.fillText(`VC Call • Room #${roomNumber}`, 24, canvas.height - 24);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, sans-serif';
      const timeStr = new Date().toLocaleString();
      ctx.fillText(`P2P Encrypted • ${timeStr}`, canvas.width - 340, canvas.height - 24);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `vccall-room-${roomNumber}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.warn('Snapshot error:', err);
      alert('Could not take snapshot. Check browser canvas permissions.');
    }
  }, [playSound, roomNumber]);

  const toggleHandRaise = useCallback(() => {
    setRaisedHands((prev) => {
      const isRaised = prev.has('local');
      const next = new Set(prev);
      if (isRaised) {
        next.delete('local');
        broadcastData({ type: 'HAND_LOWER', peerId: myPeerIdRef.current });
      } else {
        next.add('local');
        playSound('hand_raise');
        broadcastData({ type: 'HAND_RAISE', peerId: myPeerIdRef.current });
      }
      return next;
    });
  }, [playSound]);

  const lowerPeerHand = useCallback((peerId) => {
    if (peerId === 'local') {
      toggleHandRaise();
      return;
    }
    setRaisedHands((prev) => {
      const next = new Set(prev);
      next.delete(peerId);
      return next;
    });
    broadcastData({ type: 'HAND_LOWER', peerId });
  }, [toggleHandRaise]);

  const stopScreenShare = useCallback(() => {
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
    broadcastData({ type: 'SCREEN_SHARE_STOP', senderPeerId: myPeerIdRef.current });
    setPinnedId(prev => prev === 'local' ? null : prev);
    setIsScreenSharing(false);
  }, []);

  const startScreenCapture = useCallback(async () => {
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
      setPinnedId('local');
      broadcastData({ type: 'SCREEN_SHARE_START', senderPeerId: myPeerIdRef.current });
    } catch (err) {
      console.warn('Screen share canceled or failed:', err);
    }
  }, [stopScreenShare]);

  const handleLeaveCall = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    navigate('/');
  }, [navigate]);

  const handleAdmitKnock = useCallback((targetPeerId) => {
    const cleanRoom = String(roomNumber || '101').replace(/[^a-zA-Z0-9_-]/g, '');
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'KNOCK_RESPONSE',
        roomNumber: cleanRoom,
        targetPeerId,
        status: 'admitted',
      }));
    }
    if (roomChannelRef.current) {
      try {
        roomChannelRef.current.postMessage({
          type: 'KNOCK_RESPONSE',
          targetPeerId,
          status: 'admitted',
          roomNumber: cleanRoom,
        });
      } catch {
        // Ignored
      }
    }
    setPendingKnocks((prev) => prev.filter((k) => k.peerId !== targetPeerId));
  }, [roomNumber]);

  const handleDenyKnock = useCallback((targetPeerId) => {
    const cleanRoom = String(roomNumber || '101').replace(/[^a-zA-Z0-9_-]/g, '');
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'KNOCK_RESPONSE',
        roomNumber: cleanRoom,
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
          roomNumber: cleanRoom,
        });
      } catch {
        // Ignored
      }
    }
    setPendingKnocks((prev) => prev.filter((k) => k.peerId !== targetPeerId));
  }, [roomNumber]);


  const startKnocking = useCallback((trimmedName) => {
    setIsWaitingApproval(true);
    setHasAdminJoined(false);
    setKnockStatusMessage('Connecting to room...');

    const cleanRoom = String(roomNumber).replace(/[^a-zA-Z0-9_-]/g, '');
    const randomHex = generateRandomHex();
    const knockPeerId = `knock-${cleanRoom}-${randomHex}`;
    pendingPeerIdRef.current = knockPeerId;

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
            try { knockWs.close(); } catch {}
            alert(`Room #${cleanRoom} was closed by the admin. Redirecting to lobby.`);
            navigate('/');
          }
        } else if (data.type === 'KNOCK_RESPONSE') {
          if (data.status === 'admitted') {
            isAdmittedRef.current = true;
            setIsWaitingApproval(false);
            try { knockWs.close(); } catch {}
            setIsJoined(true);
          } else if (data.status === 'denied') {
            isAdmittedRef.current = false;
            setIsWaitingApproval(false);
            try { knockWs.close(); } catch {}
            setNameError('The room admin declined your request to join.');
          }
        } else if (data.type === 'ROOM_LOCKED') {
          setIsWaitingApproval(false);
          try { knockWs.close(); } catch {}
          setNameError(data.message || `Room #${cleanRoom} is locked. Please contact the room admin to unlock the room.`);
        }
      } catch (e) {
        console.warn('Knock response parse error:', e);
      }
    };

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
            isAdmittedRef.current = true;
            setIsWaitingApproval(false);
            channel.close();
            try { knockWs.close(); } catch {}
            setIsJoined(true);
          } else if (d.status === 'denied') {
            isAdmittedRef.current = false;
            setIsWaitingApproval(false);
            channel.close();
            try { knockWs.close(); } catch {}
            setNameError('The room admin declined your request to join.');
          }

        } else if (d.type === 'ROOM_LOCKED') {
          setIsWaitingApproval(false);
          channel.close();
          try { knockWs.close(); } catch {}
          setNameError(d.message || `Room #${cleanRoom} is locked. Please contact the room admin to unlock the room.`);
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
    } catch {
      // Ignored
    }
  }, [roomNumber, navigate]);

  const keyHandlerRef = useRef(null);
  useEffect(() => {
    keyHandlerRef.current = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 'm': toggleMute(); break;
        case 'o': toggleSpeakerMute(); break;
        case 'v': toggleVideo(); break;
        case 'c':
          setIsChatOpen(p => {
            const next = !p;
            if (next) setIsParticipantsOpen(false);
            return next;
          });
          break;
        case 'p':
          setIsParticipantsOpen(p => {
            const next = !p;
            if (next) {
              setIsChatOpen(false);
              setIsAgendaOpen(false);
            }
            return next;
          });
          break;
        case 'a':
          setIsAgendaOpen(p => {
            const next = !p;
            if (next) {
              setIsChatOpen(false);
              setIsParticipantsOpen(false);
              setAgendaUnread(false);
            }
            return next;
          });
          break;
        case 's':
          handleTakeSnapshot();
          break;
        case 'h':
          toggleHandRaise();
          break;
        case 'f': toggleFullscreen(); break;
        case '?': setIsShortcutsModalOpen(p => !p); break;
        case 'escape':
          setPinnedId(null);
          setIsShortcutsModalOpen(false);
          setIsChatOpen(false);
          setIsParticipantsOpen(false);
          setIsAgendaOpen(false);
          setIsSettingsOpen(false);
          setStatsPeerId(null);
          break;
      }
    };
  });

  useEffect(() => {
    if (!isJoined) return;
    const handler = (e) => keyHandlerRef.current?.(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isJoined]);

  // ─── Auto-deny knock requests after 2 minutes (120,000 ms) ───────────────
  useEffect(() => {
    if (!isAdmin || pendingKnocks.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setKnockNow(now);
      pendingKnocks.forEach((knock) => {
        if (knock.requestedAt && now - knock.requestedAt >= 120000) {
          console.log(`[Auto-deny] Knock from ${knock.name} (${knock.peerId}) expired after 2 minutes`);
          handleDenyKnock(knock.peerId);
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isAdmin, pendingKnocks, handleDenyKnock]);

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

  // Media state
  const [mediaError, setMediaError] = useState('');
  const [isRequestingMedia, setIsRequestingMedia] = useState(false);

  // 1. Initialize Local Media for Preview & Call (With Intelligent Fallback)
  const initMedia = useCallback(async () => {
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
  }, [permissions.allowCamera, permissions.allowMic]);

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      if (!isCancelled && !localStreamRef.current) {
        await initMedia();
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [initMedia]);

  // Clean up media tracks only on component unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);


  // 2. PeerJS & Multi-Peer Room Mesh (WebSocket + WebRTC for cross-device LAN)
  useEffect(() => {
    if (!isJoined) return;

    let peerInstance = null;
    let ws = null;
    const cleanRoom = String(roomNumber).replace(/[^a-zA-Z0-9_-]/g, '');
    const randomHex = generateRandomHex();
    const assignedPeerId = `vccall-${cleanRoom}-${randomHex}`;
    const peerNamesMap = new Map();
    const effectCalls = activeCallsRef.current;
    const effectConns = dataConnsRef.current;

    // A. Setup BroadcastChannel for same-browser tabs
    const channelName = `vccall_mesh_${cleanRoom}`;
    let roomChannel = null;
    try {
      roomChannel = new BroadcastChannel(channelName);
      roomChannelRef.current = roomChannel;
    } catch {
      console.warn('BroadcastChannel not supported');
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
      const current = localStreamRef.current;
      if (current && current.getTracks().length > 0 && current.getTracks().some((t) => t.readyState === 'live')) {
        return current;
      }
      const synthetic = createSyntheticStream(userNameRef.current || 'You');
      localStreamRef.current = synthetic;
      setLocalStream(synthetic);
      return synthetic;
    };

    // Helper: Call a peer
    const initiateCallToPeer = (targetPeerId, targetName, targetIsAdmin = false) => {
      if (!targetPeerId || targetPeerId === assignedPeerId) return;
      if (activeCallsRef.current[targetPeerId]) {
        console.log(`[LAN Mesh] Call already active with: ${targetPeerId}`);
        return;
      }

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
      if (!dataConnsRef.current[targetPeerId]) {
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
      }
    };

    peer.on('open', (id) => {
      console.log(`[PeerJS] Connected with ID: ${id}`);
      setMyPeerId(id);

      // Record self in attendance log
      attendanceMapRef.current[id] = {
        name: userNameRef.current || 'You',
        isAdmin: isAdminRef.current,
        joinedAt: new Date().toLocaleTimeString(),
        leftAt: null,
      };

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
            admittedFromKnockId: pendingPeerIdRef.current,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'EXISTING_PEERS') {
              console.log('[LAN WS] Existing peers in room:', data.peers);
              if (data.roomStartedAt) {
                joinedAtRef.current = data.roomStartedAt;
              }
              data.peers.forEach((p) => {
                if (p.peerId !== id) {
                  peerNamesMap.set(p.peerId, { name: p.name, isAdmin: Boolean(p.isAdmin) });
                  if (id > p.peerId) {
                    initiateCallToPeer(p.peerId, p.name, p.isAdmin);
                  }
                }
              });
            } else if (data.type === 'PEER_JOINED') {
              console.log('[LAN WS] Peer joined from another device:', data.peerId, data.name, 'Admin:', data.isAdmin);
              if (data.roomStartedAt && (!joinedAtRef.current || data.roomStartedAt < joinedAtRef.current)) {
                joinedAtRef.current = data.roomStartedAt;
              }
              if (data.peerId !== id) {
                peerNamesMap.set(data.peerId, { name: data.name, isAdmin: Boolean(data.isAdmin) });
                if (id > data.peerId) {
                  initiateCallToPeer(data.peerId, data.name, data.isAdmin);
                }
              }
            } else if (data.type === 'ROOM_LOCKED') {
              alert(data.message || `Room #${cleanRoom} is locked. Please contact the room admin to unlock the room.`);
              setIsJoined(false);
              navigate('/');
            } else if (data.type === 'PEER_LEFT') {
              removePeer(data.peerId);
            } else if (data.type === 'ROOM_DELETED') {
              if (String(data.roomNumber) === String(cleanRoom)) {
                alert(`Room #${cleanRoom} was closed by the admin. Redirecting to lobby.`);
                navigate('/');
              }
            } else if (data.type === 'ADMIN_REQUIRED') {
              if (isAdmittedRef.current) {
                console.log('[LAN WS] Peer was already admitted by admin, ignoring ADMIN_REQUIRED');
                return;
              }
              // Server rejected join because no admin is in the room
              console.warn('[LAN WS] Admin is required to join this room.');
              setIsJoined(false);
              startKnocking(userNameRef.current);
            } else if (data.type === 'KNOCK_REQUEST') {
              // Only active room admin receives this notification
              if (isAdminRef.current) {
                console.log('[Admin] Received knock request from:', data.name, data.peerId);
                playSound('knock');
                setPendingKnocks((prev) => {
                  if (prev.some((k) => k.peerId === data.peerId)) return prev;
                  return [...prev, { peerId: data.peerId, name: data.name, requestedAt: Date.now() }];
                });
              }
            } else if (data.type === 'GLOBAL_ANNOUNCEMENT') {

              playSound('request');
              setGlobalAnnouncement({
                message: data.message,
                sender: data.sender || 'System Administrator',
                timestamp: data.timestamp || Date.now(),
              });
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
            if (event.data?.roomStartedAt && (!joinedAtRef.current || event.data.roomStartedAt < joinedAtRef.current)) {
              joinedAtRef.current = event.data.roomStartedAt;
            }
            peerNamesMap.set(remoteId, { name: remoteName, isAdmin: Boolean(remoteIsAdmin) });
            roomChannel.postMessage({
              type: 'PEER_ANNOUNCE',
              peerId: id,
              userName: userNameRef.current,
              isAdmin: isAdminRef.current,
              roomStartedAt: joinedAtRef.current,
            });

            if (id > remoteId) {
              initiateCallToPeer(remoteId, remoteName, remoteIsAdmin);
            }
          } else if (type === 'PEER_ANNOUNCE') {
            if (event.data?.roomStartedAt && (!joinedAtRef.current || event.data.roomStartedAt < joinedAtRef.current)) {
              joinedAtRef.current = event.data.roomStartedAt;
            }
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
                return [...prev, { peerId: remoteId, name: remoteName, requestedAt: Date.now() }];
              });
            }
          }
        };

        roomChannel.postMessage({
          type: 'PEER_JOINED',
          peerId: id,
          userName: userNameRef.current,
          isAdmin: isAdminRef.current,
          roomStartedAt: joinedAtRef.current,
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
        if (activeCallsRef.current[call.peer] === call) {
          removePeer(call.peer);
        }
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
          roomStartedAt: joinedAtRef.current,
          agenda: agendaRef.current,
          pinnedChatMessage: pinnedChatMessageRef.current,
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
          if (!isChatOpenRef.current) {
            setUnreadCount((prev) => prev + 1);
          }
        } else if (data.type === 'NAME_HANDSHAKE') {
          if (data.roomStartedAt && (!joinedAtRef.current || data.roomStartedAt < joinedAtRef.current)) {
            joinedAtRef.current = data.roomStartedAt;
          }
          peerNamesMap.set(conn.peer, {
            name: data.name,
            isAdmin: Boolean(data.isAdmin),
          });
          // Update attendance log
          attendanceMapRef.current[conn.peer] = {
            name: data.name || 'Participant',
            isAdmin: Boolean(data.isAdmin),
            joinedAt: attendanceMapRef.current[conn.peer]?.joinedAt || new Date().toLocaleTimeString(),
            leftAt: null,
          };
          if (data.agenda && !agendaRef.current) {
            setAgenda(data.agenda);
          }
          if (data.pinnedChatMessage && !pinnedChatMessageRef.current) {
            setPinnedChatMessage(data.pinnedChatMessage);
          }
          playSound('join');
          setParticipants((prev) => ({
            ...prev,
            [conn.peer]: {
              ...prev[conn.peer],
              name: data.name,
              isAdmin: Boolean(data.isAdmin),
              isConnected: true,
            },
          }));
        } else if (data.type === 'SCREEN_SHARE_START') {
          // Remote peer started screen share — auto-spotlight them
          setPinnedId(conn.peer);
        } else if (data.type === 'SCREEN_SHARE_STOP') {
          // Remote peer stopped screen share — unpin if they were spotlighted
          setPinnedId(prev => prev === conn.peer ? null : prev);
        } else if (data.type === 'SCREEN_SHARE_REQUEST') {
          // Admin receives request from peer to share screen
          if (isAdminRef.current) {
            playSound('request');
            setShareRequests((prev) => {
              if (prev.some((r) => r.peerId === data.senderPeerId)) return prev;
              return [...prev, { peerId: data.senderPeerId, name: data.senderName || 'Participant' }];
            });
          }
        } else if (data.type === 'SCREEN_SHARE_RESPONSE') {
          // Participant receives approval/denial from admin
          if (data.targetPeerId === myPeerIdRef.current) {
            setShareRequestPending(false);
            if (data.approved) {
              setShareRequestStatus('approved');
              playSound('admitted');
              startScreenCapture();
            } else {
              setShareRequestStatus('denied');
              playSound('denied');
              alert('The room admin declined your request to share your screen.');
            }
          }
        } else if (data.type === 'UNMUTE_REQUEST') {
          if (isAdminRef.current) {
            playSound('request');
            setUnmuteRequests((prev) => {
              if (prev.some((r) => r.peerId === data.senderPeerId)) return prev;
              return [...prev, { peerId: data.senderPeerId, name: data.senderName || 'Participant' }];
            });
          }
        } else if (data.type === 'UNMUTE_RESPONSE') {
          if (data.targetPeerId === myPeerIdRef.current) {
            setUnmuteRequestPending(false);
            if (data.approved) {
              setIsMutedByAdmin(false);
              if (localStreamRef.current) {
                const audioTrack = localStreamRef.current.getAudioTracks()[0];
                if (audioTrack) {
                  audioTrack.enabled = true;
                  setIsMuted(false);
                }
              }
              playSound('admitted');
              alert('The room host approved your request. Your microphone is unmuted.');
            } else {
              playSound('denied');
              alert('The room host declined your request to unmute your microphone.');
            }
          }
        } else if (data.type === 'KICK_PARTICIPANT') {
          if (data.targetPeerId === myPeerIdRef.current) {
            playSound('denied');
            alert('You were removed from the meeting by the room admin.');
            handleLeaveCall();
          }
        } else if (data.type === 'ADMIN_MUTE' || data.type === 'ADMIN_MUTE_ALL') {
          if (data.targetPeerId === myPeerIdRef.current || data.type === 'ADMIN_MUTE_ALL') {
            setIsMutedByAdmin(true);
            if (localStreamRef.current) {
              const audioTrack = localStreamRef.current.getAudioTracks()[0];
              if (audioTrack && audioTrack.enabled) {
                audioTrack.enabled = false;
                setIsMuted(true);
                playSound('admin_action');
                alert(data.type === 'ADMIN_MUTE_ALL' ? 'The room host muted all participants. To speak, click unmute to request host permission.' : 'The room admin muted your microphone. To speak, click unmute to request host permission.');
              }
            }
          }
        } else if (data.type === 'ADMIN_STOP_VIDEO') {
          if (data.targetPeerId === myPeerIdRef.current) {
            if (localStreamRef.current) {
              const videoTrack = localStreamRef.current.getVideoTracks()[0];
              if (videoTrack && videoTrack.enabled) {
                videoTrack.enabled = false;
                setIsVideoOff(true);
                playSound('admin_action');
                alert('The room admin turned off your camera.');
              }
            }
          }
        } else if (data.type === 'ADMIN_STOP_SHARE') {
          if (data.targetPeerId === myPeerIdRef.current && screenTrackRef.current) {
            stopScreenShare();
            playSound('admin_action');
            alert('The room admin stopped your screen share.');
          }
        } else if (data.type === 'CHAT_REACTION') {
          const { messageId, emoji, reactorName, isRemoving } = data;
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== messageId) return msg;
              const reactions = { ...(msg.reactions || {}) };
              const currentList = reactions[emoji] || [];
              if (isRemoving) {
                reactions[emoji] = currentList.filter((n) => n !== reactorName);
                if (reactions[emoji].length === 0) delete reactions[emoji];
              } else {
                if (!currentList.includes(reactorName)) {
                  reactions[emoji] = [...currentList, reactorName];
                }
              }
              return { ...msg, reactions };
            })
          );
        } else if (data.type === 'CHAT_PIN') {
          setPinnedChatMessage(data.message);
          playSound('request');
        } else if (data.type === 'CHAT_UNPIN') {
          setPinnedChatMessage(null);
        } else if (data.type === 'AGENDA_UPDATE') {
          setAgenda(data.agenda || '');
          if (!isAgendaOpenRef.current) {
            setAgendaUnread(true);
          }
        } else if (data.type === 'HAND_RAISE') {
          playSound('hand_raise');
          setRaisedHands((prev) => {
            const next = new Set(prev);
            next.add(data.peerId);
            return next;
          });
        } else if (data.type === 'HAND_LOWER') {
          setRaisedHands((prev) => {
            const next = new Set(prev);
            next.delete(data.peerId);
            return next;
          });
        }
      });

      conn.on('close', () => {
        if (dataConnsRef.current[conn.peer] === conn) {
          removePeer(conn.peer);
        }
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
      // Record departure in attendance log
      if (attendanceMapRef.current[peerId]) {
        attendanceMapRef.current[peerId].leftAt = new Date().toLocaleTimeString();
      }
      // Remove any raised hand
      setRaisedHands((prev) => {
        if (!prev.has(peerId)) return prev;
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
      if (activeCallsRef.current[peerId]) {
        try {
          activeCallsRef.current[peerId].close();
        } catch {
          // Ignore
        }
        delete activeCallsRef.current[peerId];
      }
      if (dataConnsRef.current[peerId]) {
        try {
          dataConnsRef.current[peerId].close();
        } catch {
          // Ignore
        }
        delete dataConnsRef.current[peerId];
      }
      peerNamesMap.delete(peerId);
      // Reset pinned spotlight if this peer was pinned
      setPinnedId(prev => prev === peerId ? null : prev);
      // Cleanup analyser node for this peer
      delete analyserNodesRef.current[peerId];
      // Play leave sound
      playSound('leave');
      setParticipants((prev) => {
        const updated = { ...prev };
        delete updated[peerId];
        return updated;
      });
    };
    removePeerRef.current = removePeer;

    peer.on('error', (err) => {
      console.warn('Peer error:', err);
    });

    // Fallback timer: ensure call is established even if simultaneous events lagged
    const fallbackTimer = setTimeout(() => {
      peerNamesMap.forEach((meta, peerId) => {
        if (peerId !== assignedPeerId && !activeCallsRef.current[peerId]) {
          console.log(`[LAN Mesh] Fallback initiating call to: ${peerId}`);
          initiateCallToPeer(peerId, meta.name, meta.isAdmin);
        }
      });
    }, 3500);

    return () => {
      clearTimeout(fallbackTimer);
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
      const curScreen = screenTrackRef.current;
      if (curScreen) {
        curScreen.stop();
      }
      Object.values(effectCalls).forEach((call) => call.close());
      Object.values(effectConns).forEach((conn) => conn.close());
      if (peerInstance) {
        peerInstance.destroy();
      }
      removePeerRef.current = null;
    };
  }, [isJoined, roomNumber, playSound, startKnocking, handleLeaveCall, startScreenCapture, stopScreenShare, navigate]);


  function handleCancelKnock() {
    setIsWaitingApproval(false);
    if (knockWsRef.current) {
      try { knockWsRef.current.close(); } catch {}
    }
  }

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

  // Media Actions: Screen Share
  async function toggleScreenShare() {
    if (!permissions.allowScreenShare && !isAdmin) {
      alert('Screen sharing has been disabled for participants in this room by the admin.');
      return;
    }

    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    // Admins can share screen immediately
    if (isAdmin) {
      startScreenCapture();
      return;
    }

    // Non-admin participants: if permission already granted, start; otherwise request approval
    if (shareRequestStatus === 'approved') {
      startScreenCapture();
    } else {
      setShareRequestPending(true);
      playSound('request');
      broadcastData({
        type: 'SCREEN_SHARE_REQUEST',
        senderPeerId: myPeerIdRef.current,
        senderName: userNameRef.current,
      });
    }
  }

  // ─── Admin Quick Controls & Room Management ──────────────────────────────
  const handleAdminMutePeer = (targetPeerId) => {
    broadcastData({ type: 'ADMIN_MUTE', targetPeerId });
  };

  const handleAdminStopPeerVideo = (targetPeerId) => {
    broadcastData({ type: 'ADMIN_STOP_VIDEO', targetPeerId });
  };

  const handleAdminStopPeerShare = (targetPeerId) => {
    broadcastData({ type: 'ADMIN_STOP_SHARE', targetPeerId });
  };

  const handleAdminKickPeer = (targetPeerId, targetName) => {
    if (window.confirm(`Are you sure you want to remove ${targetName || 'this participant'} from the call?`)) {
      broadcastData({ type: 'KICK_PARTICIPANT', targetPeerId });
      removePeerRef.current?.(targetPeerId);
    }
  };

  const handleAdminMuteAll = () => {
    broadcastData({ type: 'ADMIN_MUTE_ALL' });
    playSound('admin_action');
  };

  const handleToggleLockRoom = () => {
    const nextLocked = !isRoomLocked;
    updateRoomPermissions(roomNumber, { isLocked: nextLocked });

    // Broadcast through WebSocket signaling if connected
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: nextLocked ? 'LOCK_ROOM' : 'UNLOCK_ROOM',
        roomNumber,
      }));
    }
    playSound('admin_action');
  };

  const handleApproveShareRequest = (peerId) => {
    broadcastData({
      type: 'SCREEN_SHARE_RESPONSE',
      targetPeerId: peerId,
      approved: true,
    });
    setShareRequests(prev => prev.filter(r => r.peerId !== peerId));
    playSound('admitted');
  };

  const handleDenyShareRequest = (peerId) => {
    broadcastData({
      type: 'SCREEN_SHARE_RESPONSE',
      targetPeerId: peerId,
      approved: false,
    });
    setShareRequests(prev => prev.filter(r => r.peerId !== peerId));
    playSound('denied');
  };

  const handleApproveUnmuteRequest = (peerId) => {
    broadcastData({
      type: 'UNMUTE_RESPONSE',
      targetPeerId: peerId,
      approved: true,
    });
    setUnmuteRequests(prev => prev.filter(r => r.peerId !== peerId));
    playSound('admitted');
  };

  const handleDenyUnmuteRequest = (peerId) => {
    broadcastData({
      type: 'UNMUTE_RESPONSE',
      targetPeerId: peerId,
      approved: false,
    });
    setUnmuteRequests(prev => prev.filter(r => r.peerId !== peerId));
    playSound('denied');
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
    const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      id: msgId,
      text: chatInput.trim(),
      senderName: userName || 'You',
      senderId: myPeerId,
      isAdmin: isAdminRef.current,
      time,
      reactions: {},
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

  // ─── Phase 3: Action Handlers ───────────────────────────────────────────
  // 1. Devices Enumeration & Switching
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter((d) => d.kind === 'audioinput');
      const videos = devices.filter((d) => d.kind === 'videoinput');
      setAudioDevices(audios);
      setVideoDevices(videos);

      // Select active device IDs if available
      if (localStreamRef.current) {
        const aTrack = localStreamRef.current.getAudioTracks()[0];
        const vTrack = localStreamRef.current.getVideoTracks()[0];
        if (aTrack && !selectedAudioId) {
          const settings = aTrack.getSettings?.();
          if (settings?.deviceId) setSelectedAudioId(settings.deviceId);
        }
        if (vTrack && !selectedVideoId) {
          const settings = vTrack.getSettings?.();
          if (settings?.deviceId) setSelectedVideoId(settings.deviceId);
        }
      }
    } catch (e) {
      console.warn('Error enumerating devices:', e);
    }
  }, [selectedAudioId, selectedVideoId]);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices?.enumerateDevices?.().then(() => {
      if (active) refreshDevices();
    }).catch(() => {});

    const onDeviceChange = () => {
      if (active) refreshDevices();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, [isJoined, refreshDevices]);

  const handleSwitchAudioDevice = async (deviceId) => {
    setSelectedAudioId(deviceId);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;

      if (localStreamRef.current) {
        const oldTrack = localStreamRef.current.getAudioTracks()[0];
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        newTrack.enabled = !isMuted;
        localStreamRef.current.addTrack(newTrack);

        // Replace track across all WebRTC peer connections
        Object.values(activeCallsRef.current).forEach((call) => {
          if (call.peerConnection) {
            const sender = call.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'audio');
            if (sender) sender.replaceTrack(newTrack).catch((err) => console.warn('Audio replaceTrack error:', err));
          }
        });
      }
    } catch (err) {
      console.warn('Failed to switch audio device:', err);
      alert('Could not switch to selected microphone.');
    }
  };

  const handleSwitchVideoDevice = async (deviceId) => {
    setSelectedVideoId(deviceId);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;

      if (localStreamRef.current) {
        const oldTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        newTrack.enabled = !isVideoOff;
        localStreamRef.current.addTrack(newTrack);

        // If currently in low bandwidth, reapply low resolution constraint
        if (isLowBandwidth) {
          newTrack.applyConstraints({ width: 320, height: 240, frameRate: 10 }).catch(() => {});
        }

        // Replace track across all WebRTC peer connections
        Object.values(activeCallsRef.current).forEach((call) => {
          if (call.peerConnection) {
            const sender = call.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(newTrack).catch((err) => console.warn('Video replaceTrack error:', err));
          }
        });
      }
    } catch (err) {
      console.warn('Failed to switch video device:', err);
      alert('Could not switch to selected camera.');
    }
  };

  // 2. Low Bandwidth Mode Toggle
  const toggleLowBandwidth = async () => {
    const nextVal = !isLowBandwidth;
    setIsLowBandwidth(nextVal);
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      try {
        if (nextVal) {
          await videoTrack.applyConstraints({ width: 320, height: 240, frameRate: 10 });
        } else {
          await videoTrack.applyConstraints({ width: 1280, height: 720, frameRate: 30 });
        }
      } catch (err) {
        console.warn('Could not apply bandwidth constraints:', err);
      }
    }
  };

  // 3. In-Call Chat Reactions
  const handleToggleReaction = (messageId, emoji) => {
    const targetMsg = messages.find((m) => m.id === messageId);
    if (!targetMsg) return;

    const currentReactors = targetMsg.reactions?.[emoji] || [];
    const hasReacted = currentReactors.includes(userName || 'You');
    const isRemoving = hasReacted;

    // Update locally
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions = { ...(msg.reactions || {}) };
        const list = reactions[emoji] || [];
        if (isRemoving) {
          reactions[emoji] = list.filter((n) => n !== (userName || 'You'));
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...list, userName || 'You'];
        }
        return { ...msg, reactions };
      })
    );

    // Broadcast to peers
    broadcastData({
      type: 'CHAT_REACTION',
      messageId,
      emoji,
      reactorName: userName || 'You',
      isRemoving,
    });
  };

  // 5. Pin / Unpin Chat Message
  const handlePinChatMessage = (msg) => {
    if (!isAdmin) return;
    const pinPayload = { id: msg.id, text: msg.text, senderName: msg.senderName, time: msg.time };
    setPinnedChatMessage(pinPayload);
    broadcastData({ type: 'CHAT_PIN', message: pinPayload });
  };

  const handleUnpinChatMessage = () => {
    if (!isAdmin) return;
    setPinnedChatMessage(null);
    broadcastData({ type: 'CHAT_UNPIN' });
  };

  // 6. Meeting Agenda Actions
  const handleUpdateAgenda = (text) => {
    setAgenda(text);
    broadcastData({ type: 'AGENDA_UPDATE', agenda: text });
  };

  // 7. Network Stats Polling (WebRTC getStats)
  useEffect(() => {
    if (!statsPeerId) return;

    const pollStats = async () => {
      let pc = null;
      if (statsPeerId === 'local') {
        const firstCall = Object.values(activeCallsRef.current)[0];
        pc = firstCall?.peerConnection;
      } else {
        pc = activeCallsRef.current[statsPeerId]?.peerConnection;
      }

      if (!pc) {
        setCurrentStats({
          rtt: 12,
          resolution: '1280x720',
          fps: 30,
          bitrate: '1.2 Mbps',
          packetsLost: 0,
          quality: 'Excellent',
        });
        return;
      }

      try {
        const stats = await pc.getStats();
        let rtt = 15;
        let packetsLost = 0;
        let frameRate = 30;
        let resolution = '1280x720';
        let bitrate = '1.0 Mbps';

        stats.forEach((report) => {
          if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
            rtt = Math.round((report.roundTripTime || 0.015) * 1000);
            packetsLost = report.packetsLost || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            frameRate = Math.round(report.framesPerSecond || 30);
            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}x${report.frameHeight}`;
            }
            if (report.bytesReceived) {
              bitrate = `${Math.round((report.bytesReceived * 8) / 1000000)} Mbps`;
            }
          }
        });

        const quality = rtt < 80 && packetsLost === 0 ? 'Excellent' : rtt < 200 ? 'Fair' : 'Poor';
        setCurrentStats({ rtt, resolution, fps: frameRate, bitrate, packetsLost, quality });
      } catch (e) {
        console.warn('getStats error:', e);
      }
    };

    pollStats();
    const interval = setInterval(pollStats, 1500);
    return () => {
      clearInterval(interval);
      setCurrentStats(null);
    };
  }, [statsPeerId]);

  // --- Phase 4 Functions ---

  // 2. Meeting Recording (Client-Side MediaRecorder)
  const startRecording = async () => {
    try {
      // Create off-screen canvas to render combined video
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        alert('Canvas 2D context not available for recording.');
        return;
      }

      // Mix all audio tracks (local + remote) using AudioContext
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();

      if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
        try {
          const localAudioSource = audioCtx.createMediaStreamSource(
            new MediaStream([localStreamRef.current.getAudioTracks()[0]])
          );
          localAudioSource.connect(dest);
        } catch (e) {
          console.warn('Local audio mix error:', e);
        }
      }

      Object.values(participants).forEach((p) => {
        if (p.stream && p.stream.getAudioTracks().length > 0) {
          try {
            const peerAudioSource = audioCtx.createMediaStreamSource(
              new MediaStream([p.stream.getAudioTracks()[0]])
            );
            peerAudioSource.connect(dest);
          } catch (e) {
            console.warn('Peer audio mix error:', e);
          }
        }
      });

      // Canvas render loop
      let animFrameId = null;
      const render = () => {
        // Dark background
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const videos = Array.from(document.querySelectorAll('video')).filter(
          (v) => v.readyState >= 2 && v.videoWidth > 0
        );

        if (videos.length > 0) {
          const count = videos.length;
          const cols = count === 1 ? 1 : count <= 4 ? 2 : 3;
          const rows = Math.ceil(count / cols);
          const pad = 12;
          const cellW = (canvas.width - pad * (cols + 1)) / cols;
          const cellH = (canvas.height - 50 - pad * (rows + 1)) / rows;

          videos.forEach((videoEl, index) => {
            const c = index % cols;
            const r = Math.floor(index / cols);
            const x = pad + c * (cellW + pad);
            const y = pad + r * (cellH + pad);

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, cellW, cellH, 10);
            ctx.clip();
            try {
              ctx.drawImage(videoEl, x, y, cellW, cellH);
            } catch {
              // Ignore cross-origin frame draw error
            }
            ctx.restore();

            // Border
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x, y, cellW, cellH, 10);
            ctx.stroke();
          });
        }

        // Watermark / timestamp bar
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(0, canvas.height - 42, canvas.width, 42);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText(`VC Call • Room #${roomNumber}`, 16, canvas.height - 16);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(canvas.width - 160, canvas.height - 21, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(`REC ${new Date().toLocaleTimeString()}`, canvas.width - 148, canvas.height - 16);

        animFrameId = requestAnimationFrame(render);
      };

      render();

      // Combined stream: Canvas video + Destination mixed audio
      const canvasStream = canvas.captureStream(30);
      const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(combinedTracks);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        try { audioCtx.close(); } catch {}
        combinedTracks.forEach((t) => t.stop());

        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vccall-recording-room-${roomNumber}-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Recording duration timer
      const startTime = Date.now();
      setRecordingDuration('00:00');
      recordingTimerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - startTime) / 1000);
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        setRecordingDuration(`${m}:${s}`);
      }, 1000);

      playSound('request');
    } catch (err) {
      console.warn('Recording start error:', err);
      alert('Could not start recording. Check browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    playSound('denied');
  };

  // 3. Export Meeting Summary & Attendance Log
  const exportMeetingSummary = () => {
    const lines = [];
    lines.push('===============================================================');
    lines.push(`VC CALL - MEETING SUMMARY & ATTENDANCE REPORT`);
    lines.push('===============================================================');
    lines.push(`Room Number    : #${roomNumber}`);
    lines.push(`Room Name      : ${roomConfig?.roomName || 'Room #' + roomNumber}`);
    lines.push(`Exported At    : ${new Date().toLocaleString()}`);
    lines.push(`Call Duration  : ${elapsedTime || '00:00'}`);
    lines.push(`Total Attendees: ${Object.keys(attendanceMapRef.current).length}`);
    lines.push('');
    lines.push('---------------------------------------------------------------');
    lines.push('ATTENDANCE LOG:');
    lines.push('---------------------------------------------------------------');

    Object.values(attendanceMapRef.current).forEach((info, idx) => {
      lines.push(`${idx + 1}. ${info.name || 'Participant'} (${info.isAdmin ? 'Host / Admin' : 'Attendee'})`);
      lines.push(`   Joined: ${info.joinedAt || 'N/A'}`);
      lines.push(`   Status: ${info.leftAt ? `Left at ${info.leftAt}` : 'Active until meeting end'}`);
    });

    lines.push('');
    lines.push('---------------------------------------------------------------');
    lines.push('MEETING AGENDA & NOTES:');
    lines.push('---------------------------------------------------------------');
    lines.push(agendaRef.current || 'No agenda recorded for this meeting.');
    lines.push('');
    lines.push('---------------------------------------------------------------');
    lines.push('CHAT TRANSCRIPT:');
    lines.push('---------------------------------------------------------------');

    if (messagesRef.current.length === 0) {
      lines.push('No chat messages sent during this meeting.');
    } else {
      messagesRef.current.forEach((msg) => {
        lines.push(`[${msg.time}] ${msg.senderName} (${msg.isAdmin ? 'Host' : 'User'}): ${msg.text}`);
      });
    }

    lines.push('');
    lines.push('===============================================================');
    lines.push('End of Report - Generated directly on device (Zero Server Storage)');
    lines.push('===============================================================');

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vccall-meeting-summary-room-${roomNumber}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    playSound('milestone');
  };

  // 1. Loading state while verifying room existence from server
  if (!isRoomsLoaded) {
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4">
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
      <div className="flex min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
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

  // 3. Room is Locked Screen
  if (isRoomsLoaded && roomConfig && permissions.isLocked && !isJoined && !isAdmin && !joinAsAdmin) {
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <Lock className="h-8 w-8 text-rose-400 animate-pulse" />
          </div>

          <div>
            <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400 border border-rose-500/30 mb-2">
              Room Locked
            </span>
            <h2 className="text-2xl font-extrabold text-white">Room #{roomNumber} is Locked</h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              This meeting room has been locked by the host. New participants cannot join or knock at this time.
            </p>
            <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs font-medium text-rose-300">
              🔒 <strong>Room is locked. Please contact the room admin to unlock the room.</strong>
            </div>
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
              onClick={() => setJoinAsAdmin(true)}
              className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Join as Host / Admin
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
      <div className="flex min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
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
      <div className="flex min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Header with IP display */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-400 mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Room #{roomNumber}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-white">Join Video Call</h2>
            <p className="mt-1 text-xs text-slate-400 font-medium">
              Configure your audio and video before entering
            </p>
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
                  className="w-full rounded-xl border-2 border-slate-700 bg-slate-950/90 py-3 pl-10 pr-4 text-base font-semibold text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
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
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-base sm:text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
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
    if (totalCount <= 4) return 'grid-cols-2';
    if (totalCount <= 6) return 'grid-cols-2 sm:grid-cols-3';
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
  };


  return (
    <div ref={callContainerRef} className="relative flex h-[100dvh] w-full overflow-hidden bg-slate-950">
      {/* Main Video Stage */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Room Header Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/60 px-3 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono text-xs sm:text-sm font-bold text-white">#{roomNumber}</span>
            </div>
            <span className="hidden text-xs text-slate-400 sm:inline">|</span>
            <span className="hidden text-xs font-medium text-slate-300 sm:inline truncate max-w-[150px] md:max-w-[220px]">
              {roomConfig.roomName}
            </span>

            {/* Participants counter */}
            <span className="flex items-center gap-1 rounded-full bg-slate-800 px-2 sm:px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold text-slate-300 border border-slate-700 shrink-0">
              <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-400" />
              <span>{totalCount}</span>
              <span className="hidden sm:inline">participant{totalCount > 1 ? 's' : ''}</span>
            </span>

            {/* Admin status indicator in header */}
            {isAdmin && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-amber-400 border border-amber-500/30 shadow-sm shrink-0">
                <Crown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Host / Admin</span>
                <span className="sm:hidden">Admin</span>
              </span>
            )}
          </div>

          {/* Center: Clock & Progressive Timer */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs border border-slate-700/60 shadow-inner">
            <span className="hidden md:inline font-mono font-medium text-slate-300">{currentTime}</span>
            <span className="hidden md:inline text-slate-500">•</span>
            <div className="flex items-center gap-1">
              <Timer className="h-3 w-3 text-indigo-400 shrink-0" />
              <span className={`font-mono font-bold ${
                elapsedTime.startsWith('2:') || (elapsedTime.includes(':') && parseInt(elapsedTime.split(':')[0], 10) >= 120)
                  ? 'text-rose-400 animate-pulse'
                  : elapsedTime.startsWith('1:') || (elapsedTime.includes(':') && parseInt(elapsedTime.split(':')[0], 10) >= 60)
                  ? 'text-orange-400'
                  : parseInt(elapsedTime.split(':')[0], 10) >= 30
                  ? 'text-amber-400'
                  : 'text-slate-200'
              }`}>
                {elapsedTime || '00:00'}
              </span>
            </div>
          </div>

          {/* Right: Sound toggle, Fullscreen, Copy Link */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Keyboard Shortcuts Info Button */}
            <button
              type="button"
              onClick={() => setIsShortcutsModalOpen(p => !p)}
              className="hidden sm:flex p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-sm"
              title="Keyboard Shortcuts (?)"
            >
              <Keyboard className="h-3.5 w-3.5 text-indigo-400" />
            </button>

            {/* Sound toggle button */}
            <button
              type="button"
              onClick={() => setSoundEnabled(p => !p)}
              className={`p-1.5 rounded-lg border transition-colors shadow-sm ${
                soundEnabled
                  ? 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  : 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
              }`}
              title={soundEnabled ? 'Mute notification sounds' : 'Enable notification sounds'}
            >
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>

            {/* Lock Room Toggle (Admin only) */}
            {isAdmin && (
              <button
                type="button"
                onClick={handleToggleLockRoom}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all shadow-sm ${
                  isRoomLocked
                    ? 'border-rose-500/50 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title={isRoomLocked ? 'Room is Locked: New participants cannot knock or join. Click to unlock.' : 'Room is Unlocked: Click to lock room from new joiners.'}
              >
                {isRoomLocked ? <Lock className="h-3.5 w-3.5 text-rose-400" /> : <LockOpen className="h-3.5 w-3.5 text-slate-400" />}
                <span className="hidden md:inline">{isRoomLocked ? 'Room Locked' : 'Lock Room'}</span>
              </button>
            )}

            {/* Non-admin Locked Room indicator */}
            {!isAdmin && isRoomLocked && (
              <div className="flex items-center gap-1 rounded-md bg-rose-500/10 border border-rose-500/30 px-2 py-1 text-[11px] font-semibold text-rose-300" title="This room is locked by the admin">
                <Lock className="h-3 w-3 text-rose-400" />
                <span className="hidden sm:inline">Locked</span>
              </div>
            )}

            {/* Low Bandwidth Indicator badge */}
            {isLowBandwidth && (
              <span className="flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                <Sliders className="h-3 w-3" />
                <span>Low BW</span>
              </span>
            )}

            {/* Meeting Snapshot (Camera capture) */}
            <button
              type="button"
              onClick={handleTakeSnapshot}
              className="hidden sm:flex p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-sm"
              title="Take Meeting Snapshot (S)"
            >
              <Camera className="h-3.5 w-3.5 text-indigo-400" />
            </button>

            {/* Settings (Device Selector & Low BW) */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-sm"
              title="Device Settings & Quality"
            >
              <Settings className="h-3.5 w-3.5 text-indigo-400" />
            </button>

            {/* Fullscreen button (hidden on mobile) */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:flex p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-sm"
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5 text-indigo-400" /> : <Maximize2 className="h-3.5 w-3.5 text-indigo-400" />}
            </button>

            {/* Local Recording Toggle Button (Header) */}
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all shadow-sm ${
                isRecording
                  ? 'border-red-500/50 bg-red-500/20 text-red-300 animate-pulse'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title={isRecording ? `Recording in progress (${recordingDuration}). Click to stop and download.` : 'Record meeting locally (.webm)'}
            >
              <Circle className={`h-3 w-3 ${isRecording ? 'fill-red-500 text-red-500' : 'text-red-400'}`} />
              <span className="hidden sm:inline">{isRecording ? `REC ${recordingDuration}` : 'Record'}</span>
            </button>

            {/* Copy Invite Link */}
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800 px-2.5 py-1.5 sm:px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 hover:text-white shadow-sm"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-indigo-400" />}
              <span className="hidden sm:inline">{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
              <span className="sm:hidden">{copiedLink ? 'Copied' : 'Invite'}</span>
            </button>
          </div>
        </div>

        {/* Global Admin Broadcast Announcement Banner */}
        {globalAnnouncement && (
          <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 px-4 py-2.5 text-white shadow-xl flex items-center justify-between border-b border-amber-400/40 animate-in slide-in-from-top duration-300 z-40">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/20 border border-white/20">
                <AlertTriangle className="h-4 w-4 text-amber-200 animate-bounce" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold bg-black/30 px-1.5 py-0.5 rounded border border-white/20">
                    Global Broadcast
                  </span>
                  <span className="text-[11px] text-amber-100/90 font-medium">
                    from {globalAnnouncement.sender}
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-bold truncate mt-0.5">
                  {globalAnnouncement.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGlobalAnnouncement(null)}
              className="rounded-lg p-1 text-amber-200 hover:text-white hover:bg-black/20 transition-colors shrink-0 ml-2"
              title="Dismiss announcement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Admin Knock Request Notifications Bar */}
        {isAdmin && pendingKnocks.length > 0 && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md animate-in fade-in">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 animate-bounce" />
                <span>
                  {pendingKnocks.length} participant{pendingKnocks.length > 1 ? 's are' : ' is'} asking to join Room #{roomNumber}:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pendingKnocks.map((knock) => {
                  const elapsed = knockNow - (knock.requestedAt || knockNow);
                  const remainingSec = Math.max(0, Math.ceil((120000 - elapsed) / 1000));
                  return (
                    <div
                      key={knock.peerId}
                      className="flex items-center gap-2 rounded-xl bg-slate-900/90 border border-amber-500/40 px-3 py-1 text-xs shadow-md"
                    >
                      <span className="font-bold text-white">{knock.name}</span>
                      <span className="font-mono text-[10px] text-amber-300/90 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30" title="Auto-denies after 2 minutes">
                        {remainingSec}s
                      </span>
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
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Admin Screen Share Request Notification Bar */}
        {isAdmin && shareRequests.length > 0 && (
          <div className="bg-sky-500/15 border-b border-sky-500/30 px-3 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md animate-in fade-in">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                <MonitorUp className="h-4 w-4 shrink-0 text-sky-400 animate-pulse" />
                <span>
                  {shareRequests.length} participant{shareRequests.length > 1 ? 's are' : ' is'} requesting permission to share screen:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {shareRequests.map((req) => (
                  <div
                    key={req.peerId}
                    className="flex items-center gap-2 rounded-xl bg-slate-900/90 border border-sky-500/40 px-3 py-1 text-xs shadow-md"
                  >
                    <span className="font-bold text-white">{req.name}</span>
                    <button
                      type="button"
                      onClick={() => handleApproveShareRequest(req.peerId)}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-emerald-500 transition-all active:scale-95"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDenyShareRequest(req.peerId)}
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

        {/* Participant Screen Share Request Pending Toast */}
        {shareRequestPending && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 animate-in fade-in">
            <div className="flex items-center gap-2.5 rounded-full border border-sky-500/40 bg-slate-900/95 px-4 py-1.5 text-xs font-semibold text-sky-300 shadow-2xl backdrop-blur-md">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent shrink-0" />
              <span>Waiting for room admin approval to share screen...</span>
              <button
                type="button"
                onClick={() => setShareRequestPending(false)}
                className="ml-1 rounded p-0.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Cancel request"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Admin Unmute Permission Request Notification Bar */}
        {isAdmin && unmuteRequests.length > 0 && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-3 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md animate-in fade-in">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <Mic className="h-4 w-4 shrink-0 text-emerald-400 animate-pulse" />
                <span>
                  {unmuteRequests.length} participant{unmuteRequests.length > 1 ? 's are' : ' is'} asking permission to unmute microphone:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {unmuteRequests.map((req) => (
                  <div
                    key={req.peerId}
                    className="flex items-center gap-2 rounded-xl bg-slate-900/90 border border-emerald-500/40 px-3 py-1 text-xs shadow-md"
                  >
                    <span className="font-bold text-white">{req.name}</span>
                    <button
                      type="button"
                      onClick={() => handleApproveUnmuteRequest(req.peerId)}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-emerald-500 transition-all active:scale-95"
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDenyUnmuteRequest(req.peerId)}
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

        {/* Participant Unmute Request Pending Toast */}
        {unmuteRequestPending && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 animate-in fade-in">
            <div className="flex items-center gap-2.5 rounded-full border border-emerald-500/40 bg-slate-900/95 px-4 py-1.5 text-xs font-semibold text-emerald-300 shadow-2xl backdrop-blur-md">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent shrink-0" />
              <span>Waiting for room host approval to unmute microphone...</span>
              <button
                type="button"
                onClick={() => setUnmuteRequestPending(false)}
                className="ml-1 rounded p-0.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Cancel request"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Progressive Meeting Milestone Toast */}
        {milestoneToast && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-all duration-300 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-slate-900/95 px-4 py-1.5 text-xs font-bold text-amber-300 shadow-2xl backdrop-blur-md">
              <Timer className="h-3.5 w-3.5 text-amber-400 shrink-0 animate-spin" />
              <span>{milestoneToast}</span>
            </div>
          </div>
        )}

        {/* Video Stage Area (Grid vs Spotlight) */}
        <div className="relative flex-1 p-2 sm:p-4 overflow-hidden flex items-center justify-center min-h-0">
          {participantIds.length === 0 ? (
            /* Single User Waiting State */
            <div className={`relative h-full w-full max-w-4xl max-h-full overflow-hidden rounded-2xl border bg-slate-900 shadow-2xl flex items-center justify-center transition-all duration-300 ${
              activeSpeakers.has('local')
                ? 'border-emerald-500 ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
                : 'border-slate-800'
            }`}>
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
                  <VideoOff className="h-10 w-10 sm:h-12 sm:w-12" />
                  <span className="text-xs sm:text-sm">Your Camera is Off</span>
                </div>
              )}

              {/* Top overlay indicator */}
              <div className="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 flex items-center justify-between pointer-events-none">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/85 px-3 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-xs text-slate-300 backdrop-blur-md border border-slate-800 shadow-md">
                  <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  <span>Waiting for others to join...</span>
                </span>
              </div>

              {/* You tag */}
              <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 flex items-center gap-1.5 sm:gap-2 rounded-full bg-slate-950/80 px-2.5 py-1 sm:px-3 backdrop-blur-md text-xs font-medium text-slate-200">
                <span className="truncate max-w-[110px] sm:max-w-none">You ({userName || 'User'})</span>
                {isAdmin && (
                  <span className="flex items-center gap-0.5 sm:gap-1 rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30">
                    <Crown className="h-3 w-3" />
                    <span>Admin</span>
                  </span>
                )}
                {raisedHands.has('local') && (
                  <span className="flex items-center gap-1 rounded bg-amber-500 text-slate-950 px-1.5 py-0.5 text-[10px] font-bold shadow animate-bounce">
                    <span>✋ Hand Raised</span>
                  </span>
                )}
                {isMuted && <MicOff className="h-3.5 w-3.5 text-red-400 shrink-0" />}
              </div>
            </div>
          ) : pinnedId !== null ? (
            /* SPOTLIGHT LAYOUT (Google Meet Style) */
            <div className="relative flex flex-col sm:flex-row h-full w-full gap-2 sm:gap-3 overflow-hidden">
              {/* Main Stage (Pinned Participant) */}
              <div className="relative flex-1 h-full w-full overflow-hidden rounded-2xl border border-indigo-500/30 bg-slate-900 shadow-2xl flex items-center justify-center min-h-0">
                {pinnedId === 'local' ? (
                  /* Local user pinned (Camera or Screen Share) */
                  <>
                    <video
                      ref={(el) => {
                        if (el) {
                          if (isScreenSharing && screenTrackRef.current) {
                            const stream = new MediaStream([screenTrackRef.current]);
                            if (el.srcObject !== stream) el.srcObject = stream;
                          } else if (localStream && el.srcObject !== localStream) {
                            el.srcObject = localStream;
                          }
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className={`h-full w-full ${isScreenSharing ? 'object-contain bg-black' : 'object-cover -scale-x-100'} ${isVideoOff && !isScreenSharing ? 'hidden' : ''}`}
                    />
                    {isVideoOff && !isScreenSharing && (
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                        <VideoOff className="h-10 w-10 sm:h-12 sm:w-12" />
                        <span className="text-sm">Camera Off</span>
                      </div>
                    )}
                    {/* Active Speaker Ring on Spotlight */}
                    {activeSpeakers.has('local') && (
                      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-emerald-400/80 shadow-[inset_0_0_20px_rgba(52,211,153,0.3)] animate-pulse" />
                    )}
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-slate-950/85 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md border border-slate-800">
                      <span>{isScreenSharing ? 'Your Screen' : `You (${userName})`}</span>
                      {isAdmin && (
                        <span className="flex items-center gap-0.5 rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30">
                          <Crown className="h-3 w-3" />
                          <span>Admin</span>
                        </span>
                      )}
                      {raisedHands.has('local') && (
                        <span className="flex items-center gap-1 rounded bg-amber-500 text-slate-950 px-1.5 py-0.5 text-[10px] font-bold shadow animate-bounce">
                          <span>✋ Raised</span>
                        </span>
                      )}
                      {isMuted && <MicOff className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                    </div>
                  </>
                ) : (
                  /* Remote peer pinned */
                  (() => {
                    const peerInfo = participants[pinnedId];
                    const stream = peerInfo?.stream;
                    const name = peerInfo?.name || `Peer (${pinnedId.substring(0, 8)})`;
                    const peerIsAdmin = Boolean(peerInfo?.isAdmin);

                    return (
                      <>
                        {stream ? (
                          <video
                            ref={(el) => {
                              if (el && stream) {
                                if (el.srcObject !== stream) el.srcObject = stream;
                                el.play().catch(() => {});
                              }
                            }}
                            autoPlay
                            playsInline
                            muted={isSpeakerMuted}
                            className="h-full w-full object-contain bg-black"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-bold text-2xl">
                              {(name[0] || 'P').toUpperCase()}
                            </div>
                            <span className="text-sm font-semibold text-slate-300">{name}</span>
                          </div>
                        )}
                        {/* Active Speaker Ring on Spotlight */}
                        {activeSpeakers.has(pinnedId) && (
                          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-emerald-400/80 shadow-[inset_0_0_20px_rgba(52,211,153,0.3)] animate-pulse" />
                        )}
                        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-slate-950/85 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md border border-slate-800">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                          <span>{name}</span>
                          {peerIsAdmin && (
                            <span className="flex items-center gap-0.5 rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30 shrink-0">
                              <Crown className="h-3 w-3" />
                              <span>Admin</span>
                            </span>
                          )}
                          {raisedHands.has(pinnedId) && (
                            <span className="flex items-center gap-1 rounded bg-amber-500 text-slate-950 px-1.5 py-0.5 text-[10px] font-bold shadow animate-bounce">
                              <span>✋ Hand Raised</span>
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()
                )}

                {/* Admin Quick Controls Overlay on Pinned Remote Peer */}
                {isAdmin && pinnedId !== 'local' && (
                  <div
                    className="absolute top-3 left-3 z-30 flex items-center gap-1 rounded-xl bg-slate-950/85 p-1 border border-slate-700/80 backdrop-blur-md shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleAdminMutePeer(pinnedId)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                      title="Mute participant's mic"
                    >
                      <MicOff className="h-4 w-4 text-amber-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdminStopPeerVideo(pinnedId)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                      title="Turn off participant's camera"
                    >
                      <VideoOff className="h-4 w-4 text-amber-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdminStopPeerShare(pinnedId)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                      title="Stop participant's screen share"
                    >
                      <MonitorOff className="h-4 w-4 text-amber-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdminKickPeer(pinnedId, participants[pinnedId]?.name)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
                      title="Remove participant from call"
                    >
                      <UserMinus className="h-4 w-4 text-rose-400" />
                    </button>
                  </div>
                )}

                {/* Stage Actions: Stats & Unpin */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 z-30">
                  <button
                    type="button"
                    onClick={() => setStatsPeerId(statsPeerId === pinnedId ? null : pinnedId)}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-md shadow-lg hover:bg-slate-800 hover:text-emerald-400 transition-all active:scale-95"
                    title="View Connection & Quality Stats"
                  >
                    <Activity className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Stats</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinnedId(null)}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-md shadow-lg hover:bg-slate-800 hover:text-white transition-all active:scale-95"
                    title="Unpin (Return to grid view)"
                  >
                    <PinOff className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Unpin</span>
                  </button>
                </div>
              </div>

              {/* Side/Bottom Thumbnail Strip (All other participants) */}
              <div className="flex sm:flex-col gap-2 overflow-x-auto sm:overflow-y-auto sm:w-44 md:w-52 shrink-0 py-1 sm:py-0">
                {/* Local user tile (if not the one pinned) */}
                {pinnedId !== 'local' && (
                  <div
                    onClick={() => setPinnedId('local')}
                    className={`group relative h-24 sm:h-32 w-36 sm:w-full shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-slate-900 shadow-md transition-all hover:border-indigo-500/70 hover:scale-[1.02] ${
                      activeSpeakers.has('local')
                        ? 'border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.35)]'
                        : 'border-slate-800'
                    }`}
                  >
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
                      <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-500">
                        <VideoOff className="h-6 w-6" />
                      </div>
                    )}
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between rounded-md bg-slate-950/80 px-2 py-0.5 text-[10px] font-medium text-slate-200 backdrop-blur-sm">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="truncate max-w-[80px]">You</span>
                        {raisedHands.has('local') && <span className="animate-bounce">✋</span>}
                      </div>
                      {isMuted && <MicOff className="h-3 w-3 text-red-400 shrink-0" />}
                    </div>
                    {/* Hover Pin Icon */}
                    <div className="absolute inset-0 bg-indigo-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="rounded-full bg-slate-900/90 p-1.5 border border-indigo-500/40 shadow-lg">
                        <Pin className="h-3.5 w-3.5 text-indigo-400" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Remote peer thumbnail tiles */}
                {participantIds
                  .filter((pId) => pId !== pinnedId)
                  .map((peerId) => {
                    const peerInfo = participants[peerId];
                    const stream = peerInfo?.stream;
                    const name = peerInfo?.name || `Peer (${peerId.substring(0, 8)})`;
                    const isSpeaking = activeSpeakers.has(peerId);

                    return (
                      <div
                        key={peerId}
                        onClick={() => setPinnedId(peerId)}
                        className={`group relative h-24 sm:h-32 w-36 sm:w-full shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-slate-900 shadow-md transition-all hover:border-indigo-500/70 hover:scale-[1.02] ${
                          isSpeaking
                            ? 'border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.35)]'
                            : 'border-slate-800'
                        }`}
                      >
                        {stream ? (
                          <video
                            ref={(el) => {
                              if (el && stream) {
                                if (el.srcObject !== stream) el.srcObject = stream;
                                el.play().catch(() => {});
                              }
                            }}
                            autoPlay
                            playsInline
                            muted={isSpeakerMuted}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-500">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600/20 text-indigo-400 text-xs font-bold border border-indigo-500/30">
                              {(name[0] || 'P').toUpperCase()}
                            </div>
                          </div>
                        )}
                        {/* Admin Quick Controls Overlay in Thumbnail */}
                        {isAdmin && (
                          <div
                            className="absolute top-1 left-1 z-20 flex items-center gap-0.5 rounded-md bg-slate-950/85 p-0.5 border border-slate-700/80 backdrop-blur-md opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleAdminMutePeer(peerId)}
                              className="p-1 rounded text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                              title={`Mute ${name}`}
                            >
                              <MicOff className="h-3 w-3 text-amber-400" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminStopPeerVideo(peerId)}
                              className="p-1 rounded text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                              title={`Stop ${name}'s camera`}
                            >
                              <VideoOff className="h-3 w-3 text-amber-400" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminKickPeer(peerId, name)}
                              className="p-1 rounded text-slate-300 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
                              title={`Remove ${name}`}
                            >
                              <UserMinus className="h-3 w-3 text-rose-400" />
                            </button>
                          </div>
                        )}
                        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between rounded-md bg-slate-950/80 px-2 py-0.5 text-[10px] font-medium text-slate-200 backdrop-blur-sm">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="truncate max-w-[80px]">{name}</span>
                            {raisedHands.has(peerId) && <span className="animate-bounce">✋</span>}
                          </div>
                          {peerInfo?.isAdmin && <Crown className="h-3 w-3 text-amber-400 shrink-0" />}
                        </div>
                        {/* Hover Pin Icon */}
                        <div className="absolute inset-0 bg-indigo-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <div className="rounded-full bg-slate-900/90 p-1.5 border border-indigo-500/40 shadow-lg">
                            <Pin className="h-3.5 w-3.5 text-indigo-400" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Floating Self-Preview (PiP) when another participant is pinned */}
              {isPipVisible && pinnedId !== 'local' && (
                <div className="hidden sm:block absolute bottom-3 right-3 z-30 group overflow-hidden rounded-xl border border-indigo-500/40 bg-slate-950 shadow-2xl transition-all hover:border-indigo-400 w-36 h-24">
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
                    <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-500">
                      <VideoOff className="h-6 w-6" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] text-slate-200">
                    <span className="truncate">You (PiP)</span>
                    {isMuted && <MicOff className="h-2.5 w-2.5 text-red-400" />}
                  </div>
                  {/* Close PiP button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPipVisible(false);
                    }}
                    className="absolute top-1 right-1 rounded p-0.5 bg-slate-900/80 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Hide picture-in-picture"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* MULTI-PEER EQUAL GRID (Click any tile to pin) */
            <div className={`grid h-full w-full gap-2 sm:gap-4 ${getGridClass()} max-h-full`}>
              {/* Local Tile */}
              <div
                onClick={() => setPinnedId('local')}
                className={`group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border bg-slate-900 shadow-xl flex items-center justify-center transition-all duration-200 hover:border-indigo-500/70 hover:scale-[1.01] ${
                  activeSpeakers.has('local')
                    ? 'border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_16px_rgba(52,211,153,0.35)]'
                    : 'border-slate-800'
                }`}
                title="Click to pin your video"
              >
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
                    <VideoOff className="h-8 w-8 sm:h-10 sm:w-10" />
                    <span className="text-xs">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex items-center gap-1.5 rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-slate-200 backdrop-blur-md">
                  <span className="truncate max-w-[100px] sm:max-w-none">You ({userName})</span>
                  {isAdmin && (
                    <span className="flex items-center gap-0.5 sm:gap-1 rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30">
                      <Crown className="h-3 w-3" />
                      <span>Admin</span>
                    </span>
                  )}
                  {raisedHands.has('local') && (
                    <span className="flex items-center gap-1 rounded bg-amber-500 text-slate-950 px-1.5 py-0.5 text-[10px] font-bold shadow animate-bounce">
                      <span>✋ Raised</span>
                    </span>
                  )}
                  {isMuted && <MicOff className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                </div>
                {/* Pin hover tooltip icon */}
                <div className="absolute top-2 right-2 rounded-lg bg-slate-950/80 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity border border-slate-700 shadow-md">
                  <Pin className="h-3.5 w-3.5 text-indigo-400" />
                </div>
              </div>

              {/* Remote Participant Tiles */}
              {participantIds.map((peerId) => {
                const peerInfo = participants[peerId];
                const stream = peerInfo?.stream;
                const name = peerInfo?.name || `Peer (${peerId.substring(0, 8)})`;
                const peerIsAdmin = Boolean(peerInfo?.isAdmin);
                const isSpeaking = activeSpeakers.has(peerId);

                return (
                  <div
                    key={peerId}
                    onClick={() => setPinnedId(peerId)}
                    className={`group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border bg-slate-900 shadow-xl flex items-center justify-center transition-all duration-200 hover:border-indigo-500/70 hover:scale-[1.01] ${
                      isSpeaking
                        ? 'border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_16px_rgba(52,211,153,0.35)]'
                        : 'border-slate-800'
                    }`}
                    title={`Click to pin ${name}`}
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
                        muted={isSpeakerMuted}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 sm:gap-3 text-slate-400">
                        <div className="flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-bold text-xl sm:text-2xl">
                          {(name[0] || 'P').toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-slate-300 truncate max-w-[140px]">{name}</span>
                        <span className="text-[10px] sm:text-[11px] text-slate-500">Connecting stream...</span>
                      </div>
                    )}
                    {/* Admin Quick Controls Overlay in Equal Grid */}
                    {isAdmin && (
                      <div
                        className="absolute top-2 left-2 z-20 flex items-center gap-1 rounded-lg bg-slate-950/85 p-1 border border-slate-700/80 backdrop-blur-md opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleAdminMutePeer(peerId)}
                          className="p-1.5 rounded-md text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title={`Mute ${name}'s mic`}
                        >
                          <MicOff className="h-3.5 w-3.5 text-amber-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminStopPeerVideo(peerId)}
                          className="p-1.5 rounded-md text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title={`Turn off ${name}'s camera`}
                        >
                          <VideoOff className="h-3.5 w-3.5 text-amber-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminStopPeerShare(peerId)}
                          className="p-1.5 rounded-md text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title={`Stop ${name}'s screen share`}
                        >
                          <MonitorOff className="h-3.5 w-3.5 text-amber-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminKickPeer(peerId, name)}
                          className="p-1.5 rounded-md text-slate-300 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
                          title={`Remove ${name} from call`}
                        >
                          <UserMinus className="h-3.5 w-3.5 text-rose-400" />
                        </button>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex items-center gap-1.5 rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-slate-200 backdrop-blur-md">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="truncate max-w-[100px] sm:max-w-none">{name}</span>
                      {peerIsAdmin && (
                        <span className="flex items-center gap-0.5 sm:gap-1 rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30 shrink-0">
                          <Crown className="h-3 w-3" />
                          <span>Admin</span>
                        </span>
                      )}
                      {raisedHands.has(peerId) && (
                        <span className="flex items-center gap-1 rounded bg-amber-500 text-slate-950 px-1.5 py-0.5 text-[10px] font-bold shadow animate-bounce">
                          <span>✋ Raised</span>
                        </span>
                      )}
                    </div>
                    {/* Tile Actions: Stats & Pin */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatsPeerId(statsPeerId === peerId ? null : peerId);
                        }}
                        className="rounded-lg bg-slate-950/80 p-1.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity border border-slate-700 shadow-md hover:bg-slate-800 text-slate-300 hover:text-emerald-400"
                        title="Connection & WebRTC Quality Stats"
                      >
                        <Activity className="h-3.5 w-3.5" />
                      </button>
                      <div className="rounded-lg bg-slate-950/80 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity border border-slate-700 shadow-md">
                        <Pin className="h-3.5 w-3.5 text-indigo-400" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Call Controls Dock */}
        <div className="flex h-16 sm:h-20 items-center justify-start sm:justify-center border-t border-slate-800/80 bg-slate-900/90 px-2 sm:px-4 backdrop-blur-xl shrink-0 w-full overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 sm:gap-3.5 min-w-max mx-auto px-2">
            {/* Audio Mute/Unmute (Microphone) */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                onClick={toggleMute}
                className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex-col items-center justify-center rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 ${
                  isMuted
                    ? isMutedByAdmin
                      ? 'bg-amber-600/90 text-white hover:bg-amber-600 shadow-amber-600/20 ring-2 ring-amber-400'
                      : 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isMuted ? <MicOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Mic className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>
                  {isMutedByAdmin && isMuted
                    ? unmuteRequestPending
                      ? 'Unmute request pending host approval...'
                      : 'Muted by host (Click to request unmute)'
                    : isMuted
                    ? 'Unmute microphone'
                    : 'Mute microphone'}
                </span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 border border-slate-700">M</kbd>
              </div>
            </div>

            {/* Mute/Unmute Output Sound (Speaker Audio) */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                onClick={toggleSpeakerMute}
                className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex-col items-center justify-center rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 ${
                  isSpeakerMuted
                    ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-amber-600/20 ring-2 ring-amber-400/50'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isSpeakerMuted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>{isSpeakerMuted ? 'Unmute speaker audio' : 'Mute speaker audio (Deafen)'}</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 border border-slate-700">O</kbd>
              </div>
            </div>

            {/* Video On/Off */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                onClick={toggleVideo}
                className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex-col items-center justify-center rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 ${
                  isVideoOff
                    ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isVideoOff ? <VideoOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Video className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>{isVideoOff ? 'Turn on camera' : 'Turn off camera'}</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 border border-slate-700">V</kbd>
              </div>
            </div>

            {/* Screen Share (Desktop only) */}
            <div className="group relative hidden sm:flex shrink-0 items-center justify-center">
              <button
                type="button"
                disabled={!permissions.allowScreenShare && !isAdmin}
                onClick={toggleScreenShare}
                className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 ${
                  !permissions.allowScreenShare && !isAdmin
                    ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed opacity-50'
                    : isScreenSharing
                    ? 'bg-indigo-600 text-white shadow-indigo-600/30'
                    : shareRequestPending
                    ? 'bg-sky-600 text-white shadow-sky-600/30 animate-pulse'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isScreenSharing ? <MonitorOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <MonitorUp className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>
                  {!permissions.allowScreenShare && !isAdmin
                    ? 'Screen sharing disabled by admin'
                    : isScreenSharing
                    ? 'Stop sharing screen'
                    : isAdmin || shareRequestStatus === 'approved'
                    ? 'Present screen to everyone'
                    : shareRequestPending
                    ? 'Waiting for host approval...'
                    : 'Request to present screen'}
                </span>
              </div>
            </div>

            {/* Live Chat Toggle */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                disabled={!permissions.allowChat}
                onClick={() => {
                  setIsChatOpen((prev) => {
                    const next = !prev;
                    if (next) setIsParticipantsOpen(false);
                    return next;
                  });
                  setUnreadCount(0);
                }}
                className={`relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex-col items-center justify-center rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 ${
                  !permissions.allowChat
                    ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed opacity-50'
                    : isChatOpen
                    ? 'bg-indigo-600 text-white shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                {unreadCount > 0 && !isChatOpen && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] sm:text-[10px] font-bold text-white shadow">
                    {unreadCount}
                  </span>
                )}
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>{isChatOpen ? 'Close in-call chat' : 'Open in-call chat'}</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 border border-slate-700">C</kbd>
              </div>
            </div>

            {/* Hand Raise Toggle */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                onClick={toggleHandRaise}
                className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex-col items-center justify-center rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 ${
                  raisedHands.has('local')
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-amber-500/30 ring-2 ring-amber-300'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Hand className={`h-4 w-4 sm:h-5 sm:w-5 ${raisedHands.has('local') ? 'animate-bounce text-slate-950' : ''}`} />
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>{raisedHands.has('local') ? 'Lower your hand' : 'Raise hand (✋)'}</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 border border-slate-700">H</kbd>
              </div>
            </div>

            {/* Participants / Host Controls Toggle */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  setIsParticipantsOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setIsChatOpen(false);
                      setIsAgendaOpen(false);
                    }
                    return next;
                  });
                }}
                className={`relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex-col items-center justify-center rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 ${
                  isParticipantsOpen
                    ? 'bg-indigo-600 text-white shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200 border border-slate-600">
                  {totalCount}
                </span>
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>{isParticipantsOpen ? 'Close people list' : 'People & Host Controls'}</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 border border-slate-700">P</kbd>
              </div>
            </div>

            {/* Meeting Agenda Toggle */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  setIsAgendaOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setIsChatOpen(false);
                      setIsParticipantsOpen(false);
                      setAgendaUnread(false);
                    }
                    return next;
                  });
                }}
                className={`relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex-col items-center justify-center rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 ${
                  isAgendaOpen
                    ? 'bg-indigo-600 text-white shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" />
                {agendaUnread && !isAgendaOpen && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3 rounded-full bg-indigo-500 animate-ping" />
                )}
                {agendaUnread && !isAgendaOpen && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3 rounded-full bg-indigo-500" />
                )}
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>{isAgendaOpen ? 'Close meeting agenda' : 'Meeting Agenda & Notes'}</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 border border-slate-700">A</kbd>
              </div>
            </div>

            {/* Device Settings Button */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex-col items-center justify-center rounded-xl sm:rounded-2xl bg-slate-800 text-slate-200 hover:bg-slate-700 transition-all shadow-md active:scale-95"
              >
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-200 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>Audio/Video Device Settings</span>
              </div>
            </div>

            {/* End / Leave Call */}
            <div className="group relative flex shrink-0 items-center justify-center">
              <button
                type="button"
                onClick={handleLeaveCall}
                className="flex h-10 sm:h-12 shrink-0 items-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl bg-red-600 px-3 sm:px-5 text-xs font-bold text-white shadow-lg shadow-red-600/30 transition-all hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98]"
              >
                <PhoneOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Leave</span>
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-lg border border-red-500/40 bg-slate-900/95 px-2.5 py-1 text-xs text-red-300 shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-150">
                <span>Disconnect from call</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Right P2P Live Chat (Full screen on mobile, sidebar on desktop) */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-80 md:w-96 sm:border-l sm:border-slate-800/80 sm:bg-slate-900/95 sm:backdrop-blur-xl shadow-2xl">
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:py-3.5">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Live Room Chat</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </div>

          {/* Direct P2P Banner */}
          <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 text-[11px] font-medium text-emerald-400 border-b border-emerald-500/20 shrink-0">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            <span>P2P Encrypted • Zero Server Storage</span>
          </div>

          {/* Pinned Message Sticky Banner */}
          {pinnedChatMessage && (
            <div className="flex items-start justify-between gap-2 bg-indigo-950/60 border-b border-indigo-500/30 p-2.5 px-3 text-xs shrink-0">
              <div className="flex items-start gap-2 min-w-0">
                <Bookmark className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-[10px] text-indigo-300 font-semibold">
                    <span>Pinned by {pinnedChatMessage.senderName}</span>
                    <span>•</span>
                    <span>{pinnedChatMessage.time}</span>
                  </div>
                  <p className="text-white font-medium break-words text-xs line-clamp-2 mt-0.5">
                    {pinnedChatMessage.text}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleUnpinChatMessage}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                  title="Unpin message"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
                <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-xs">No messages yet in Room #{roomNumber}.</p>
                <span className="text-[11px] text-slate-600">Send a greeting!</span>
              </div>
            ) : (
              messages.map((msg, index) => {
                const messageId = msg.id || `msg-${index}`;
                const reactions = msg.reactions || {};
                const reactionEntries = Object.entries(reactions);

                return (
                  <div
                    key={messageId}
                    onMouseEnter={() => setReactionHoverMsgId(messageId)}
                    onMouseLeave={() => setReactionHoverMsgId(null)}
                    className={`group relative flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}
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

                    <div className="relative max-w-[85%]">
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm break-words ${
                          msg.isSelf
                            ? 'bg-indigo-600 text-white rounded-br-none'
                            : 'bg-slate-800 text-slate-100 rounded-bl-none'
                        }`}
                      >
                        {msg.text}
                      </div>

                      {/* Quick Emoji Reaction Bar (Hover on desktop, accessible via tap) */}
                      <div
                        className={`absolute -top-7 ${
                          msg.isSelf ? 'right-0' : 'left-0'
                        } z-20 flex items-center gap-1 rounded-full bg-slate-900 border border-slate-700 px-2 py-0.5 shadow-xl transition-all duration-150 ${
                          reactionHoverMsgId === messageId ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                        }`}
                      >
                        {['👍', '❤️', '😂', '🎉', '😮'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleToggleReaction(messageId, emoji)}
                            className="hover:scale-125 transition-transform text-xs p-0.5"
                            title={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handlePinChatMessage(msg)}
                            className="text-slate-400 hover:text-amber-400 p-0.5 transition-colors ml-1 border-l border-slate-700 pl-1"
                            title="Pin this message"
                          >
                            <Bookmark className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Reaction Badges */}
                    {reactionEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 px-1">
                        {reactionEntries.map(([emoji, reactors]) => {
                          const hasReacted = reactors.includes(userName || 'You');
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleToggleReaction(messageId, emoji)}
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-all ${
                                hasReacted
                                  ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-200'
                                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                              }`}
                              title={`Reacted by: ${reactors.join(', ')}`}
                            >
                              <span>{emoji}</span>
                              <span className="text-[10px] font-bold">{reactors.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="border-t border-slate-800 p-3 bg-slate-950/90 sm:bg-slate-950/60 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                disabled={!permissions.allowChat}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={permissions.allowChat ? 'Type your message...' : 'Chat disabled by admin'}
                className="flex-1 rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2 text-base sm:text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || !permissions.allowChat}
                className="flex h-9 w-9 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Right Participants Panel (Full screen on mobile, sidebar on desktop) */}
      {isParticipantsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-80 md:w-96 sm:border-l sm:border-slate-800/80 sm:bg-slate-900/95 sm:backdrop-blur-xl shadow-2xl">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:py-3.5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">People ({totalCount})</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsParticipantsOpen(false)}
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              title="Close participants panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Admin Host Controls Bar */}
          {isAdmin && (
            <div className="border-b border-slate-800/80 bg-slate-950/60 p-3 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <Crown className="h-3 w-3" /> Host Controls
                </span>
                <button
                  type="button"
                  onClick={handleToggleLockRoom}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border transition-all ${
                    isRoomLocked
                      ? 'border-rose-500/50 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {isRoomLocked ? <Lock className="h-3 w-3 text-rose-400" /> : <LockOpen className="h-3 w-3 text-slate-400" />}
                  <span>{isRoomLocked ? 'Unlock Room' : 'Lock Room'}</span>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAdminMuteAll}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/80 py-1.5 text-xs font-semibold text-slate-200 transition-colors"
                >
                  <MicOff className="h-3.5 w-3.5 text-amber-400" />
                  <span>Mute All Peers</span>
                </button>
                <button
                  type="button"
                  onClick={exportMeetingSummary}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/80 py-1.5 text-xs font-semibold text-indigo-300 transition-colors"
                  title="Download full meeting metrics, attendance roster, agenda & chat transcript (.txt)"
                >
                  <FileText className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Export Report</span>
                </button>
              </div>
            </div>
          )}

          {/* Participant List (Prioritizing raised hands to the top) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* You (Local User) */}
            <div className={`flex items-center justify-between rounded-xl bg-slate-900/60 border p-2.5 transition-colors ${
              raisedHands.has('local') ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-800/80'
            }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-bold">
                  {(userName[0] || 'Y').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate">{userName} (You)</span>
                    {isAdmin && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-500/20 text-amber-300 px-1 py-0.2 text-[9px] font-bold border border-amber-500/30">
                        Host
                      </span>
                    )}
                    {raisedHands.has('local') && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-500 text-slate-950 px-1.5 py-0.5 text-[9px] font-extrabold animate-bounce">
                        ✋ Hand Raised
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {activeSpeakers.has('local')
                      ? 'Speaking...'
                      : isMuted
                      ? isMutedByAdmin
                        ? 'Muted by Host'
                        : 'Muted'
                      : 'Mic active'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {raisedHands.has('local') && (
                  <button
                    type="button"
                    onClick={toggleHandRaise}
                    className="p-1 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40"
                    title="Lower hand"
                  >
                    Lower
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPinnedId(pinnedId === 'local' ? null : 'local')}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    pinnedId === 'local'
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title={pinnedId === 'local' ? 'Unpin your view' : 'Pin your view'}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
                {isMuted ? (
                  <MicOff className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Mic className="h-3.5 w-3.5 text-slate-400" />
                )}
              </div>
            </div>

            {/* Remote Participants (Sorted: Raised hands first) */}
            {[...participantIds]
              .sort((a, b) => {
                const aRaised = raisedHands.has(a) ? 1 : 0;
                const bRaised = raisedHands.has(b) ? 1 : 0;
                return bRaised - aRaised;
              })
              .map((peerId) => {
              const peerInfo = participants[peerId];
              const name = peerInfo?.name || `Peer (${peerId.substring(0, 8)})`;
              const peerIsAdmin = Boolean(peerInfo?.isAdmin);
              const isPinned = pinnedId === peerId;
              const isSpeaking = activeSpeakers.has(peerId);
              const isHandRaised = raisedHands.has(peerId);

              return (
                <div
                  key={peerId}
                  className={`flex items-center justify-between rounded-xl bg-slate-900/60 border p-2.5 transition-colors ${
                    isHandRaised ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isSpeaking
                        ? 'bg-emerald-500/30 border-2 border-emerald-400 text-emerald-300'
                        : 'bg-slate-800 border border-slate-700 text-slate-300'
                    }`}>
                      {(name[0] || 'P').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{name}</span>
                        {peerIsAdmin && (
                          <span className="flex items-center gap-0.5 rounded bg-amber-500/20 text-amber-300 px-1 py-0.2 text-[9px] font-bold border border-amber-500/30">
                            Host
                          </span>
                        )}
                        {isHandRaised && (
                          <span className="flex items-center gap-0.5 rounded bg-amber-500 text-slate-950 px-1.5 py-0.5 text-[9px] font-extrabold animate-bounce">
                            ✋ Hand Raised
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {isSpeaking ? 'Speaking...' : isHandRaised ? 'Waiting to speak...' : 'In call'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Lower hand action for Admin or Peer */}
                    {isHandRaised && isAdmin && (
                      <button
                        type="button"
                        onClick={() => lowerPeerHand(peerId)}
                        className="px-2 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-bold text-amber-300 transition-colors"
                        title={`Lower ${name}'s hand`}
                      >
                        Lower Hand
                      </button>
                    )}

                    {/* Pin button */}
                    <button
                      type="button"
                      onClick={() => setPinnedId(isPinned ? null : peerId)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        isPinned
                          ? 'border-indigo-500 bg-indigo-600 text-white'
                          : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                      title={isPinned ? `Unpin ${name}` : `Pin ${name}`}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>

                    {/* Admin quick controls */}
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAdminMutePeer(peerId)}
                          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title={`Mute ${name}`}
                        >
                          <MicOff className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminStopPeerVideo(peerId)}
                          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title={`Turn off ${name}'s camera`}
                        >
                          <VideoOff className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminStopPeerShare(peerId)}
                          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title={`Stop ${name}'s screen share`}
                        >
                          <MonitorOff className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminKickPeer(peerId, name)}
                          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
                          title={`Remove ${name} from call`}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Meeting Agenda Panel (Full screen on mobile, sidebar on desktop) */}
      {isAgendaOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-80 md:w-96 sm:border-l sm:border-slate-800/80 sm:bg-slate-900/95 sm:backdrop-blur-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:py-3.5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Meeting Agenda & Notes</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsAgendaOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </div>

          <div className="bg-slate-900/50 p-3 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>{isAdmin ? '👑 You can edit this agenda live' : '👀 Live read-only sync from host'}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(agenda);
                alert('Agenda copied to clipboard!');
              }}
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </button>
          </div>

          {/* Agenda Body */}
          <div className="flex-1 p-4 flex flex-col">
            {isAdmin ? (
              <div className="flex-1 flex flex-col space-y-2">
                <textarea
                  value={agenda}
                  onChange={(e) => handleUpdateAgenda(e.target.value)}
                  placeholder="Type meeting agenda, discussion topics, links, or action items here... Changes sync instantly to all attendees."
                  className="flex-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-sans leading-relaxed"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Synced in real-time with all peers</span>
                  <span>{agenda.length} characters</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                {agenda.trim() ? (
                  <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {agenda}
                  </pre>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
                    <ClipboardList className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-xs">No agenda has been set for this meeting yet.</p>
                    <span className="text-[11px] text-slate-600">The room host can update this anytime.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Device Settings Modal (Microphone, Camera, Low Bandwidth) */}
      {isSettingsOpen && (
        <div
          onClick={() => setIsSettingsOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Settings className="h-4 w-4 text-indigo-400" />
                <span>Audio & Video Settings</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Microphone Selector */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Mic className="h-3.5 w-3.5 text-indigo-400" />
                <span>Microphone</span>
              </label>
              <select
                value={selectedAudioId}
                onChange={(e) => handleSwitchAudioDevice(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                {audioDevices.length === 0 ? (
                  <option value="">Default System Microphone</option>
                ) : (
                  audioDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Microphone ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Camera Selector */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Video className="h-3.5 w-3.5 text-indigo-400" />
                <span>Camera</span>
              </label>
              <select
                value={selectedVideoId}
                onChange={(e) => handleSwitchVideoDevice(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                {videoDevices.length === 0 ? (
                  <option value="">Default System Camera</option>
                ) : (
                  videoDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Camera ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Low Bandwidth Mode Toggle */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Low Bandwidth Mode</span>
                <span className="text-[11px] text-slate-400 block">
                  Drops resolution to 320x240 @ 10fps for slower network connections
                </span>
              </div>
              <button
                type="button"
                onClick={toggleLowBandwidth}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isLowBandwidth ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isLowBandwidth ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition-colors shadow"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Network Quality & WebRTC Stats Overlay HUD */}
      {statsPeerId && (
        <div
          onClick={() => setStatsPeerId(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400 animate-pulse" />
                <h4 className="text-xs font-bold text-white">
                  WebRTC Network Quality HUD
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setStatsPeerId(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Inspecting Peer:</span>
                <span className="font-semibold text-white truncate max-w-[160px]">
                  {statsPeerId === 'local' ? `You (${userName})` : participants[statsPeerId]?.name || statsPeerId}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Connection Quality:</span>
                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                  currentStats?.quality === 'Excellent'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : currentStats?.quality === 'Fair'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {currentStats?.quality || 'Analyzing...'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Round Trip Time (RTT):</span>
                <span className="font-mono font-bold text-slate-200">
                  {currentStats?.rtt !== undefined ? `${currentStats.rtt} ms` : 'Measuring...'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Stream Resolution:</span>
                <span className="font-mono font-bold text-slate-200">
                  {currentStats?.resolution || '1280x720'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Frame Rate:</span>
                <span className="font-mono font-bold text-slate-200">
                  {currentStats?.fps !== undefined ? `${currentStats.fps} fps` : '30 fps'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Video Bitrate:</span>
                <span className="font-mono font-bold text-slate-200">
                  {currentStats?.bitrate || '1.0 Mbps'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">Packets Lost:</span>
                <span className="font-mono font-bold text-slate-200">
                  {currentStats?.packetsLost || 0}
                </span>
              </div>
            </div>

            <div className="text-center pt-2">
              <span className="text-[10px] text-slate-500">
                Metrics polled every 1.5s via RTCPeerConnection.getStats()
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      {isShortcutsModalOpen && (
        <div
          onClick={() => setIsShortcutsModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Keyboard className="h-4 w-4 text-indigo-400" />
                <span>Keyboard Shortcuts</span>
              </div>
              <button
                type="button"
                onClick={() => setIsShortcutsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Mute / Unmute microphone</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">M</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Mute / Unmute speaker audio</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">O</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Turn camera on / off</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">V</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Toggle in-call chat</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">C</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Toggle people & host controls</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">P</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Toggle meeting agenda & notes</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">A</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Take meeting snapshot</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">S</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Raise / Lower hand</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">H</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Toggle fullscreen mode</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">F</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span>Unpin / Close panels</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">Esc</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span>Show keyboard shortcuts</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-indigo-300 border border-slate-700">?</kbd>
              </div>
            </div>

            <div className="pt-2 text-center">
              <span className="text-[11px] text-slate-500">Shortcuts are disabled while typing in text inputs.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
