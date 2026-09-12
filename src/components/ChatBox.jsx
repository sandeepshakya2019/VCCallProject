import React, { useState, useRef, useEffect } from 'react';
import { Send, X, MessageSquare, ShieldCheck } from 'lucide-react';

export default function ChatBox({ messages, sendMessage, isOpen, onClose }) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText.trim());
      setInputText('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-title">
          <MessageSquare size={18} />
          <h3>Live P2P Chat</h3>
        </div>
        <button type="button" onClick={onClose} className="btn-icon-sm" title="Close chat">
          <X size={18} />
        </button>
      </div>

      <div className="chat-banner">
        <ShieldCheck size={14} />
        <span>Direct peer-to-peer. Zero server storage.</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet.</p>
            <span>Say hi to your peer!</span>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`message-bubble ${msg.sender === 'you' ? 'outgoing' : 'incoming'}`}
            >
              <div className="message-meta">
                <span className="message-sender">{msg.sender === 'you' ? 'You' : 'Peer'}</span>
                <span className="message-time">{msg.time}</span>
              </div>
              <p className="message-text">{msg.text}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
          autoFocus
        />
        <button type="submit" disabled={!inputText.trim()} className="btn-send">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
