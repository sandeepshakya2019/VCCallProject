import { Link, useLocation } from 'react-router-dom';
import { Video, Shield, Home, Sparkles } from 'lucide-react';
import { useRoomContext } from '../context/RoomContext';

export default function Navbar({ currentRoomNumber }) {
  const location = useLocation();
  const { isAdminLoggedIn } = useRoomContext();
  const isAdminPage = location.pathname === '/admin';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="group flex items-center gap-2.5 transition-transform hover:scale-[1.02]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25">
            <Video className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg font-bold tracking-tight text-white">VC Call</span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/20">
                P2P
              </span>
            </div>
            <span className="hidden sm:inline text-[11px] text-slate-400">Zero Server Storage</span>
          </div>
        </Link>

        {/* Center: Status Indicator */}
        {currentRoomNumber ? (
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-emerald-300">Live Call:</span>
            <span className="font-mono text-xs font-bold text-white">Room #{currentRoomNumber}</span>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            <span>P2P Encrypted Mesh</span>
          </div>
        )}

        {/* Right Navigation */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-medium transition-all ${
              location.pathname === '/'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Lobby</span>
          </Link>

          <Link
            to="/admin"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs font-medium transition-all ${
              isAdminPage
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'border border-slate-700/60 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Shield className="h-4 w-4 text-indigo-400" />
            <span className="hidden sm:inline">Admin Panel</span>
            <span className="sm:hidden">Admin</span>
            {isAdminLoggedIn && (
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
