import React, { useState } from 'react';
import { useApp } from '../store';
import { UserRole } from '../types';
import { ShieldCheck, User as UserIcon, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabaseClient';

export const Login: React.FC = () => {
  const { login } = useApp();
  const [role, setRole] = useState<UserRole>(UserRole.MEMBER);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Query Supabase for the user
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (fetchError || !data) {
        setError('Invalid username or password.');
        setLoading(false);
        return;
      }

      if (data.role !== role) {
        setError(`This account is not a ${role === UserRole.ADMIN ? 'Admin' : 'Member'} account.`);
        setLoading(false);
        return;
      }

      // Map DB snake_case to app CamelCase
      const user = {
        ...data,
        isOnline: data.is_online,
        projectAccess: data.project_access
      };

      login(user);
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-indigo-600 p-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Setu</h1>
          <p className="text-indigo-100">Project Management Simplified</p>
        </div>

        <div className="p-8">
          <div className="flex bg-slate-100 p-1 rounded-lg mb-8">
            <button
              onClick={() => { setRole(UserRole.MEMBER); setError(''); }}
              className={`flex-1 flex items-center justify-center py-2 rounded-md text-sm font-medium transition-all ${role === UserRole.MEMBER ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
            >
              <UserIcon size={16} className="mr-2" /> Member
            </button>
            <button
              onClick={() => { setRole(UserRole.ADMIN); setError(''); }}
              className={`flex-1 flex items-center justify-center py-2 rounded-md text-sm font-medium transition-all ${role === UserRole.ADMIN ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
            >
              <ShieldCheck size={16} className="mr-2" /> Admin
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder={role === UserRole.ADMIN ? "admin" : "sarah"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center text-red-500 text-sm bg-red-50 p-2 rounded-lg">
                <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-lg shadow-indigo-200 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? 'Authenticating...' : `Login as ${role === UserRole.ADMIN ? 'Administrator' : 'Team Member'}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};