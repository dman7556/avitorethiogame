import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, LogOut, ChevronLeft } from 'lucide-react';

interface AdminHeaderProps {
  title: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

export default function AdminHeader({ title, showBackButton = false, onBack }: AdminHeaderProps) {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      logout();
      navigate('/login');
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/admin');
    }
  };

  const handleExitAdmin = () => {
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 bg-sky-card border-b border-sky-border">
      <div className="max-w-[1600px] mx-auto px-4 py-4 flex items-center justify-between">
        {/* Left: Title and Back Button */}
        <div className="flex items-center gap-4">
          {showBackButton && (
            <button
              onClick={handleBack}
              className="p-2 hover:bg-sky-card-hover rounded-lg transition-colors text-sky-text-secondary hover:text-white"
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <h1 className="text-xl font-bold text-white">{title}</h1>
        </div>

        {/* Right: User Info and Actions */}
        <div className="flex items-center gap-4">
          {/* Current User */}
          <div className="text-right hidden sm:block">
            <p className="text-xs text-sky-text-muted">Logged in as</p>
            <p className="text-sm font-semibold text-white">{user?.name}</p>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-sky-border hidden sm:block" />

          {/* Exit Admin Button */}
          <button
            onClick={handleExitAdmin}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-card-hover hover:bg-sky-card-hover-active text-sky-text-secondary hover:text-white transition-colors text-sm font-medium"
            aria-label="Exit admin and return to home"
            title="Return to game"
          >
            <Home size={18} />
            <span className="hidden sm:inline">Home</span>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 transition-colors text-sm font-medium"
            aria-label="Logout from admin"
            title="Logout"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
