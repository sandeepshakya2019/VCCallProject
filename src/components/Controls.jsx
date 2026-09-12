import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  MessageSquare,
  PhoneOff,
} from 'lucide-react';

export default function Controls({
  isMuted,
  isVideoOff,
  isScreenSharing,
  isChatOpen,
  unreadChatCount,
  toggleMute,
  toggleVideo,
  toggleScreenShare,
  toggleChat,
  endCall,
}) {
  return (
    <div className="controls-bar">
      {/* Audio Mute/Unmute */}
      <button
        type="button"
        onClick={toggleMute}
        className={`control-btn ${isMuted ? 'active-alert' : ''}`}
        title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        <span className="control-label">{isMuted ? 'Unmute' : 'Mute'}</span>
      </button>

      {/* Video On/Off */}
      <button
        type="button"
        onClick={toggleVideo}
        className={`control-btn ${isVideoOff ? 'active-alert' : ''}`}
        title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
      >
        {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
        <span className="control-label">{isVideoOff ? 'Start Video' : 'Stop Video'}</span>
      </button>

      {/* Screen Share */}
      <button
        type="button"
        onClick={toggleScreenShare}
        className={`control-btn ${isScreenSharing ? 'active-highlight' : ''}`}
        title={isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
      >
        {isScreenSharing ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
        <span className="control-label">{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
      </button>

      {/* Chat toggle */}
      <button
        type="button"
        onClick={toggleChat}
        className={`control-btn relative ${isChatOpen ? 'active-highlight' : ''}`}
        title="Toggle chat panel"
      >
        <MessageSquare size={22} />
        {unreadChatCount > 0 && !isChatOpen && (
          <span className="chat-badge">{unreadChatCount}</span>
        )}
        <span className="control-label">Chat</span>
      </button>

      {/* End Call */}
      <button
        type="button"
        onClick={endCall}
        className="control-btn end-call-btn"
        title="Leave and end call"
      >
        <PhoneOff size={22} />
        <span className="control-label">End Call</span>
      </button>
    </div>
  );
}
