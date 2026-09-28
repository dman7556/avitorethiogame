import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Menu,
  X,
  Home,
  Users,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  LogOut,
  Settings,
} from 'lucide-react';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { logout, user } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: Home },
    { path: '/admin/deposits', label: 'Deposits', icon: ArrowDownLeft },
    { path: '/admin/withdrawals', label: 'Withdrawals', icon: ArrowUpRight },
    { path: '/admin/users', label: 'Users', icon: Users },
    { path: '/admin/transactions', label: 'Transactions', icon: DollarSign },
    { path: '/admin/audit-logs', label: 'Audit Logs', icon: FileText },
    { path: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-gray-800 border-r border-gray-700 transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Logo */}
        <div className="h-20 flex items-center justify-between px-4 border-b border-gray-700">
          {sidebarOpen && <h1 className="text-lg font-bold text-blue-400">Aviator Admin</h1>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-gray-700 rounded"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                  isActive(item.path)
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
              >
                <Icon size={20} />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:bg-gray-700 rounded transition-colors"
          >
            <LogOut size={20} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* Top Bar */}
        <header className="h-20 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
          <div className="flex-1" />
          <div className="text-sm text-gray-400">
            Welcome, <span className="text-blue-400 font-semibold">{user?.name}</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
