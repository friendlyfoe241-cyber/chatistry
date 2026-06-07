import React from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Zap, Shield, Smile, Image, Mic } from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

const FEATURES = [
  { icon: Zap,          title: 'Real-time',       desc: 'Messages delivered instantly with live typing indicators and presence.' },
  { icon: Shield,       title: 'Secure',          desc: 'End-to-end row-level security. Your conversations stay private.' },
  { icon: Image,        title: 'Rich media',       desc: 'Send images and videos with automatic compression built in.' },
  { icon: Mic,          title: 'Voice messages',   desc: 'Record and send voice messages with a single tap.' },
  { icon: Smile,        title: 'Reactions',        desc: 'React to any message with emoji. See who reacted on hover.' },
  { icon: MessageSquare,title: 'Threads & replies', desc: 'Reply inline, pin important messages, and never lose context.' },
];

export function LandingPage({ onSignIn, onSignUp }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--txt)] overflow-x-hidden">

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="CHATice" className="w-8 h-8 object-contain" />
            <span className="text-lg font-bold tracking-tight text-cyan-400">CHATice</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onSignIn}
              className="px-4 py-2 text-sm font-medium text-[var(--txt2)] hover:text-[var(--txt)] transition-colors">
              Sign In
            </button>
            <button onClick={onSignUp}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-500 text-black transition-colors shadow-[0_0_20px_rgba(6,182,212,0.2)]">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-28 px-6 flex flex-col items-center text-center overflow-hidden">
        {/* Background orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[10%] w-[500px] h-[500px] rounded-full bg-cyan-500/8 blur-[100px]" />
          <div className="absolute top-[20%] right-[5%]  w-[400px] h-[400px] rounded-full bg-orange-500/6 blur-[100px]" />
          <div className="absolute bottom-0  left-[30%] w-[350px] h-[350px] rounded-full bg-violet-500/5 blur-[100px]" />
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-100"
            style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative">
          {/* Logo glow */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-cyan-500/20 blur-2xl scale-150" />
              <div className="absolute inset-0 rounded-3xl bg-orange-500/10 blur-xl scale-125" />
              <img src="/logo.png" alt="CHATice" className="relative w-24 h-24 object-contain drop-shadow-2xl" />
            </div>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-5 leading-[1.1]">
            Messaging that<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-300">
              feels instant.
            </span>
          </h1>
          <p className="text-lg text-[var(--txt2)] max-w-md mx-auto mb-10 leading-relaxed">
            Real-time chat with voice messages, reactions, media sharing, and end-to-end security. Free, open, yours.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={onSignUp}
              className="px-8 py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-base transition-all shadow-[0_0_30px_rgba(6,182,212,0.3)] hover:shadow-[0_0_40px_rgba(6,182,212,0.45)] hover:-translate-y-0.5">
              Create Free Account →
            </button>
            <button onClick={onSignIn}
              className="px-8 py-3.5 rounded-2xl border border-[var(--border2)] bg-[var(--surface)] hover:bg-[var(--surface3)] text-[var(--txt)] font-semibold text-base transition-all hover:-translate-y-0.5">
              Sign In
            </button>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Everything you need</h2>
            <p className="text-[var(--txt2)]">Built for real conversations, not demo screenshots.</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <motion.div key={title}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.07 }}
                className="relative p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border2)] hover:bg-[var(--surface2)] transition-all group">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4 group-hover:bg-cyan-500/15 transition-colors">
                  <Icon className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="font-semibold text-[var(--txt)] mb-1.5">{title}</h3>
                <p className="text-sm text-[var(--txt2)] leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to chat?</h2>
          <p className="text-[var(--txt2)] mb-8">Free forever. No ads. No tracking.</p>
          <button onClick={onSignUp}
            className="px-10 py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-lg transition-all shadow-[0_0_40px_rgba(6,182,212,0.25)] hover:shadow-[0_0_55px_rgba(6,182,212,0.4)] hover:-translate-y-0.5">
            Start Messaging Free →
          </button>
          <p className="text-xs text-[var(--txt3)] mt-4">Already have an account?{' '}
            <button onClick={onSignIn} className="text-cyan-500 hover:text-cyan-400 transition-colors">Sign in</button>
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-5 h-5 object-contain opacity-60" />
            <span className="text-sm text-[var(--txt3)]">CHATice — free open messaging</span>
          </div>
          <span className="text-xs text-[var(--txt3)]">Built with React + Supabase</span>
        </div>
      </footer>
    </div>
  );
}