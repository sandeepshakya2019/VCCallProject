import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ArrowRight,
  Hash,
  User,
  Copy,
  Check,
  ShieldAlert,
  Users,
  Lock,
  Sparkles,
  ExternalLink,
  Wifi,
} from 'lucide-react';
import { useRoomContext } from '../context/RoomContext';
import { getBaseNetworkUrl, getNetworkIp } from '../utils/network';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { rooms, getRoom } = useRoomContext();

  const [roomNumberInput, setRoomNumberInput] = useState('');
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem('vccall_display_name') || '';
  });

  // Local Media Preview State
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);
  const [formError, setFormError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Initialize camera and mic
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        streamRef.current = stream;
        setLocalStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Camera preview failed:', err);
        setMediaError('Camera or Microphone not available. You can still enter the room to view others.');
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const toggleMic = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    setFormError('');

    const trimmedRoom = roomNumberInput.trim();
    if (!trimmedRoom) {
      setFormError('Please enter a room number to join.');
      return;
    }

    // Check if room exists in configured rooms and if it is locked
    const configuredRoom = getRoom(trimmedRoom);
    if (configuredRoom && configuredRoom.permissions?.isLocked) {
      setFormError(`Room #${trimmedRoom} is locked by the admin. New participants cannot join.`);
      return;
    }

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setFormError('Your name is required to join the room.');
      return;
    }

    localStorage.setItem('vccall_display_name', trimmedName);

    // Navigate to /room/:roomNumber
    navigate(`/room/${trimmedRoom}`);
  };

  const handleCopyQuickLink = (roomNum) => {
    const num = roomNum || roomNumberInput.trim() || '101';
    const link = `${getBaseNetworkUrl()}/room/${num}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyIp = () => {
    const url = getBaseNetworkUrl();
    navigator.clipboard.writeText(url);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Header Title */}
        <div className="mb-8 text-center sm:mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1 text-xs font-semibold text-indigo-400 mb-3 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Pure Peer-to-Peer Video Calling & Live Chat</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Enter Room Number to Join
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
            Type your room number below. Anyone entering the same room number will instantly connect to the same video call.
          </p>

          {/* Prominent Network IP Banner */}
          <div className="mx-auto mt-5 inline-flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-indigo-500/30 bg-slate-900/90 px-4 py-2.5 shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              </span>
              <Wifi className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Your Network IP:</span>
              <code className="font-mono text-sm font-bold text-indigo-300">{getNetworkIp()}:5173</code>
            </div>

            <button
              type="button"
              onClick={handleCopyIp}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition-all hover:scale-[1.02] active:scale-[0.98]"
              title="Copy Network IP URL to share with others on your Wi-Fi"
            >
              {copiedIp ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedIp ? 'IP Copied!' : 'Copy IP URL'}</span>
            </button>
          </div>
        </div>

        {/* Media Warning if any */}
        {mediaError && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-300">
            <ShieldAlert className="h-5 w-5 flex-shrink-0 text-amber-400" />
            <span>{mediaError}</span>
          </div>
        )}

        {/* Join Box & Camera Preview Side-by-Side */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12 items-start">
          {/* Main Join Room Card (7 cols) */}
          <div className="md:col-span-7">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Join Call</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Connect immediately using your room number
                  </p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Ready to Connect
                </span>
              </div>

              {formError && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {formError}
                </div>
              )}

              <form onSubmit={handleJoin} className="mt-6 space-y-5">
                {/* Room Number Input */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Room Number / Room ID <span className="text-indigo-400">*</span>
                  </label>
                  <div className="relative mt-2">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-indigo-400">
                      <Hash className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. 101, dev-sync, demo"
                      value={roomNumberInput}
                      onChange={(e) => setRoomNumberInput(e.target.value)}
                      className="w-full rounded-xl border-2 border-slate-700 bg-slate-950/90 py-3.5 pl-11 pr-4 text-base font-bold text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all font-mono shadow-inner"
                    />
                  </div>
                  <span className="mt-1.5 block text-[11px] text-slate-400">
                    Tip: Enter any number or code (e.g. <button type="button" onClick={() => setRoomNumberInput('101')} className="text-indigo-400 underline hover:text-indigo-300">101</button>, <button type="button" onClick={() => setRoomNumberInput('102')} className="text-indigo-400 underline hover:text-indigo-300">102</button>)
                  </span>
                </div>

                {/* Display Name Input */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Your Name <span className="text-indigo-400">*</span>
                  </label>
                  <div className="relative mt-2">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Enter your name (Required)"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/80 py-3 pl-10 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Submit Join Button */}
                <button
                  type="submit"
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 py-4 text-sm font-extrabold text-white shadow-xl shadow-indigo-600/30 transition-all hover:scale-[1.01] hover:shadow-indigo-600/50 active:scale-[0.99]"
                >
                  <span>Connect to Room {roomNumberInput.trim() ? `#${roomNumberInput.trim()}` : ''}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
              </form>

              {/* Direct Link generator */}
              {roomNumberInput.trim() && (
                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Direct Join Link:
                  </span>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <code className="text-xs font-mono text-indigo-300 truncate">
                      {getBaseNetworkUrl()}/room/{roomNumberInput.trim()}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyQuickLink()}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors flex-shrink-0"
                    >
                      {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Camera Preview Tile (5 cols) */}
          <div className="md:col-span-5 space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
              <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                <video
                  ref={videoRef}
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

                {/* Floating Preview Controls */}
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 shadow-xl backdrop-blur-md">
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                      isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                    title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleVideo}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                      isVideoOff ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                    title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                  >
                    {isVideoOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2.5 text-xs text-slate-400">
                <span>Self Camera Preview</span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  Active
                </span>
              </div>
            </div>

            {/* Network / LAN info card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 space-y-2">
              <div className="flex items-center justify-between font-semibold text-slate-200">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-indigo-400" />
                  <span>Network IP Access</span>
                </div>
                <span className="font-mono text-xs text-indigo-300">{getNetworkIp()}</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Connect directly using: <code className="text-indigo-300 font-mono font-bold">{getBaseNetworkUrl()}</code>. Anyone on your local network/Wi-Fi can enter your room number and connect!
              </p>
            </div>
          </div>
        </div>

        {/* Available Rooms Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Existing Configured Rooms
              </h3>
            </div>
            <span className="text-xs text-slate-500">{rooms.length} room(s) available</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <div
                key={room.roomNumber}
                className="group flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition-all hover:border-slate-700 hover:bg-slate-900/90"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-block rounded-md bg-indigo-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-indigo-400 border border-indigo-500/20">
                        #{room.roomNumber}
                      </span>
                      <h4 className="mt-2 text-base font-semibold text-white group-hover:text-indigo-300 transition-colors">
                        {room.roomName}
                      </h4>
                    </div>

                    {room.permissions?.isLocked ? (
                      <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-500/20">
                        <Lock className="h-3 w-3" /> Locked
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> Open
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-slate-800 pt-3">
                  <button
                    type="button"
                    disabled={room.permissions?.isLocked}
                    onClick={() => navigate(`/room/${room.roomNumber}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600/90 py-2 text-xs font-semibold text-white transition-all hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Join #{room.roomNumber}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyQuickLink(room.roomNumber)}
                    className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white transition-colors"
                    title="Copy Direct Link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
