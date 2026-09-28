import { useState, useRef, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useAuthGuard } from '../hooks/useAuthGuard';

interface ChatPanelProps {
  onClose: () => void;
}

export default function ChatPanel({ onClose }: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { chatMessages, sendMessage } = useGame();
  const { user, isAuthenticated } = useAuth();
  const { requireAuth } = useAuthGuard();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = async () => {
    if (!requireAuth()) return;
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(message.trim());
      setMessage('');
    } catch (err: any) {
      console.error('Chat error:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full bg-sky-card border-l border-sky-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sky-border">
        <h3 className="font-semibold text-white">Chat</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-sky-card-hover transition-colors"
        >
          <X size={18} className="text-sky-text-secondary" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center text-sky-text-muted text-sm py-8">
            No messages yet. Say hello!
          </div>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id} className="flex flex-col">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-semibold ${msg.username === user?.username ? 'text-sky-green' : 'text-sky-purple'}`}>
                {msg.username}
              </span>
              <span className="text-xs text-sky-text-muted">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-sm text-sky-text-secondary break-words">{msg.message}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-sky-border">
        {!isAuthenticated ? (
          <div className="text-center py-4">
            <p className="text-sky-text-secondary text-sm mb-2">Login required to chat</p>
            <button
              onClick={() => requireAuth()}
              className="btn-primary px-4 py-2 text-sm"
            >
              Login to Chat
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              maxLength={500}
              className="flex-1 bg-sky-dark border border-sky-border rounded-lg px-3 py-2 text-sm text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green"
            />
            <button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className="btn-primary px-4 py-2 disabled:opacity-30"
            >
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
