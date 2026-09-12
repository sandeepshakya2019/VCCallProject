import React, { useState } from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneCall, Copy, Check, Share2, Sparkles } from 'lucide-react';

export default function CallLobby({
  peerId,
  isPeerReady,
  targetPeerId,
  setTargetPeerId,
  startCall,
  localStream,
  isMuted,
  isVideoOff,
  toggleMute,
  toggleVideo,
  callStatus
}) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyId = () => {
    if (!peerId) return;
    navigator.clipboard.writeText(peerId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyLink = () => {
    if (!peerId) return;
    const url = `${window.location.origin}${window.location.pathname}?join=${peerId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCallSubmit = (e) => {
    e.preventDefault();
    if (targetPeerId.trim()) {
      startCall(targetPeerId.trim());
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        {/* Header */}
        <div className="lobby-header">
          <div className="app-logo">
            <span className="logo-icon"><Sparkles size={20} /></span>
            <h1>VC Call</h1>
          </div>
          <p className="app-tagline">Pure Peer-to-Peer Video Call & Live Chat (No Backend / Zero Storage)</p>
        </div>

        <div className="lobby-content">
          {/* Left: Camera Preview */}
          <div className="preview-section">
            <div className="video-preview-wrapper">
              <video
                ref={(el) => {
                  if (el && localStream) {
                    el.srcObject = localStream;
                  }
                }}
                autoPlay
                playsInline
                muted
                className={`preview-video ${isVideoOff ? 'hidden' : ''}`}
              />
              {isVideoOff && (
                <div className="video-placeholder">
                  <VideoOff size={48} className="placeholder-icon" />
                  <span>Camera is turned off</span>
                </div>
              )}
              <div className="preview-controls">
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`btn-icon ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <button
                  type="button"
                  onClick={toggleVideo}
                  className={`btn-icon ${isVideoOff ? 'btn-danger' : 'btn-secondary'}`}
                  title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                >
                  {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Right: ID & Call Action */}
          <div className="actions-section">
            {/* My Peer ID Box */}
            <div className="info-box">
              <div className="info-box-header">
                <span className="info-label">Your Unique Call ID</span>
                <span className={`status-indicator ${isPeerReady ? 'online' : 'connecting'}`}>
                  {isPeerReady ? 'Ready' : 'Connecting...'}
                </span>
              </div>
              <div className="id-display-row">
                <code className="peer-id-code">
                  {peerId || 'Generating connection ID...'}
                </code>
                <button
                  type="button"
                  onClick={handleCopyId}
                  disabled={!peerId}
                  className="btn-action-sm"
                  title="Copy ID"
                >
                  {copiedId ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  <span>{copiedId ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!peerId}
                className="btn-share-link"
              >
                {copiedLink ? <Check size={16} className="text-success" /> : <Share2 size={16} />}
                <span>{copiedLink ? 'Invite Link Copied!' : 'Copy Direct Invite Link'}</span>
              </button>
            </div>

            {/* Connect to Remote Peer Form */}
            <form onSubmit={handleCallSubmit} className="call-form">
              <label htmlFor="targetId" className="input-label">
                Connect to a Friend
              </label>
              <div className="input-row">
                <input
                  id="targetId"
                  type="text"
                  placeholder="Enter friend's Call ID"
                  value={targetPeerId}
                  onChange={(e) => setTargetPeerId(e.target.value)}
                  className="input-text"
                  disabled={callStatus === 'calling' || !isPeerReady}
                />
                <button
                  type="submit"
                  disabled={!targetPeerId.trim() || !isPeerReady || callStatus === 'calling'}
                  className="btn-primary"
                >
                  <PhoneCall size={18} />
                  <span>{callStatus === 'calling' ? 'Calling...' : 'Call'}</span>
                </button>
              </div>
            </form>

            <div className="network-tip">
              <p>
                💡 <strong>Tip:</strong> Share your ID or Invite Link with anyone on your local Wi-Fi or across the internet. Media streams directly peer-to-peer!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
