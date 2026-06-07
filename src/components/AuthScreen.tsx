import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import { cn } from '../utils';

export function AuthScreen({ initialMode = 'signin', onBack }: { initialMode?: 'signin' | 'signup'; onBack?: () => void }) {
  const [isLogin, setIsLogin] = useState(initialMode === 'signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const syntheticEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@chatapp.local`;
    if (syntheticEmail.length < 14) {
      setError('Username too short or contains invalid characters.');
      setLoading(false);
      return;
    }
    try {
      if (isLogin) {
        const { error: e } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.auth.signUp({ email: syntheticEmail, password, options: { data: { username } } });
        if (e) throw e;
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  const switchMode = (login: boolean) => { setIsLogin(login); setError(''); };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4 overflow-hidden relative">
      {onBack && (
        <button onClick={onBack}
          className="absolute top-5 left-5 flex items-center gap-1.5 text-sm text-[var(--txt3)] hover:text-[var(--txt2)] transition-colors z-10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
      )}

      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="auth-orb-1" />
        <div className="auth-orb-2" />
        <div className="auth-orb-3" />
      </div>

      {/* Dot grid */}
      <div className="auth-dots absolute inset-0 pointer-events-none opacity-100" />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="auth-card relative w-full max-w-[400px] p-8"
      >
        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative mb-5"
          >
            {/* Glow halo */}
            <div className="absolute inset-0 rounded-2xl bg-cyan-500/15 blur-2xl scale-150" />
            <div className="absolute inset-0 rounded-2xl bg-orange-500/10 blur-xl scale-125" />
            <img src="/logo.png" alt="Chatice" className="relative w-20 h-20 object-contain drop-shadow-2xl" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="text-center"
          >
            <h1 className="text-2xl font-semibold tracking-tight text-cyan-400 mb-1">CHATice</h1>
            <p className="text-[13px] text-[var(--txt3)] tracking-wide">
              {isLogin ? 'Welcome back.' : 'Secure. Real-time. Yours.'}
            </p>
          </motion.div>
        </div>

        {/* Tab switcher */}
        <div className="relative flex bg-[var(--surface3)] rounded-xl p-1 mb-6 border border-[var(--border)]">
          <motion.div
            layoutId="authTab"
            className="absolute inset-y-1 rounded-lg bg-[var(--surface4)] border border-[var(--border2)] shadow-lg"
            style={{ width: 'calc(50% - 4px)', left: isLogin ? '4px' : 'calc(50%)' }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          />
          {(['Sign In', 'Sign Up'] as const).map((label, i) => (
            <button
              key={label}
              onClick={() => switchMode(i === 0)}
              className={cn(
                'relative z-10 flex-1 py-2 text-sm font-medium rounded-lg transition-colors duration-200',
                (isLogin ? i === 0 : i === 1) ? 'text-[var(--txt)]' : 'text-[var(--txt3)] hover:text-[var(--txt2)]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--txt2)] tracking-wide uppercase">Username</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--txt3)] text-sm select-none">@</span>
              <input
                type="text" autoFocus required
                value={username} onChange={e => setUsername(e.target.value)}
                placeholder="your_username"
                className="w-full bg-[var(--input-bg)] border border-[var(--border2)] rounded-xl py-2.5 pl-8 pr-4 text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-600/70 focus:shadow-[0_0_0_3px_rgba(6,182,212,0.08)] transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--txt2)] tracking-wide uppercase">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'} required
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[var(--input-bg)] border border-[var(--border2)] rounded-xl py-2.5 px-4 pr-10 text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-600/70 focus:shadow-[0_0_0_3px_rgba(6,182,212,0.08)] transition-all"
              />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--txt3)] hover:text-[var(--txt2)] transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="text-red-400 text-sm bg-red-500/8 border border-red-500/20 rounded-xl p-3 leading-relaxed">
                  {error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="group relative w-full overflow-hidden rounded-xl py-2.5 px-4 text-sm font-semibold text-black bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:shadow-[0_0_28px_rgba(6,182,212,0.4)] mt-1 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Footer note */}
        <p className="text-center text-[11px] text-[var(--txt3)] mt-5 leading-relaxed">
          {isLogin ? "New here? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => switchMode(!isLogin)}
            className="text-cyan-500 hover:text-cyan-400 transition-colors font-medium"
          >
            {isLogin ? 'Create an account' : 'Sign in instead'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}