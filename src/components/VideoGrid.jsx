import React, { useRef, useEffect } from 'react';
import { User, VideoOff, MicOff, Maximize2, Minimize2 } from 'lucide-react';

export default function VideoGrid({
  localStream,
  remoteStream,
  isVideoOff,
  isMuted,
  remotePeerId,
  isRemoteVideoOff = false,
  isRemoteMuted = false,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="video-grid-container">
      {/* Remote Video Tile (Main) */}
      <div className="video-tile remote-tile">
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`video-element ${isRemoteVideoOff ? 'hidden' : ''}`}
          />
        ) : (
          <div className="video-tile-placeholder">
            <div className="connecting-pulse"></div>
            <p>Connecting to peer video...</p>
          </div>
        )}

        {isRemoteVideoOff && (
          <div className="video-tile-placeholder">
            <div className="avatar-circle">
              <User size={64} />
            </div>
            <p className="placeholder-name">Peer camera is off</p>
          </div>
        )}

        <div className="video-overlay-info">
          <span className="user-badge">
            <span className="live-dot"></span>
            Peer ({remotePeerId ? remotePeerId.substring(0, 10) + '...' : 'Connected'})
          </span>
          {isRemoteMuted && (
            <span className="status-badge muted" title="Peer is muted">
              <MicOff size={14} /> Muted
            </span>
          )}
        </div>
      </div>

      {/* Local Video Tile (Self-preview Picture-in-Picture) */}
      <div className="video-tile local-tile">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`video-element local-mirror ${isVideoOff ? 'hidden' : ''}`}
        />
        {isVideoOff && (
          <div className="video-tile-placeholder small">
            <VideoOff size={28} />
            <span>Camera Off</span>
          </div>
        )}

        <div className="video-overlay-info">
          <span className="user-badge you">You</span>
          {isMuted && (
            <span className="status-badge muted">
              <MicOff size={14} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
