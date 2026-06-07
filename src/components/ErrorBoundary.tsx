import React, { Component, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--txt)] mb-2">Something went wrong</h1>
            <p className="text-sm text-[var(--txt2)] leading-relaxed">
              An unexpected error occurred. Your messages are safe — just reload to continue.
            </p>
            {this.state.error && (
              <p className="text-xs text-[var(--txt3)] font-mono mt-3 bg-[var(--surface3)] border border-[var(--border)] rounded-lg px-3 py-2 text-left break-all">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-black text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Reload App
          </button>
        </div>
      </div>
    );
  }
}
