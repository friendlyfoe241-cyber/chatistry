import React, { useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabase';

interface AuthScreenProps {}

export function AuthScreen({}: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const syntheticEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@chatapp.local`;

    if (syntheticEmail.length < 14) {
      setError('Username too short or invalid.');
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password: password,
        });

        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: syntheticEmail,
          password: password,
          options: {
            data: {
              username: username
            }
          }
        });

        if (signUpError) throw signUpError;
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 text-[#E0E0E0]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-[#121212] border border-[#2A2A2A] rounded-2xl p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#1E1E1E] border border-[#333] rounded-xl flex items-center justify-center mb-4">
            <span className="text-2xl text-cyan-400">⚡</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-cyan-500 uppercase">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-[#888] text-sm mt-2 text-center">
            {isLogin ? 'Enter your details to connect.' : 'No email required. Just pick a username.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#E0E0E0]">Username</label>
            <input
              type="text"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#1E1E1E] border border-[#333] rounded-md py-2 px-4 text-sm focus:outline-none focus:border-cyan-600 transition-colors placeholder-[#555] text-[#E0E0E0]"
              placeholder="unique_name"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#E0E0E0]">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1E1E1E] border border-[#333] rounded-md py-2 px-4 text-sm focus:outline-none focus:border-cyan-600 transition-colors placeholder-[#555] text-[#E0E0E0]"
              placeholder="••••••••"
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-black font-semibold rounded-md px-4 py-2.5 mt-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(8,145,178,0.2)]"
          >
            {loading ? (
               <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : isLogin ? (
               <><LogIn className="w-4 h-4" /> Sign In</>
            ) : (
               <><UserPlus className="w-4 h-4" /> Sign Up</>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-sm text-[#888] hover:text-[#E0E0E0] transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
