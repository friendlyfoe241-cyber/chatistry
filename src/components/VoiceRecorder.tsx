import React, { useState, useRef, useEffect } from 'react';
import { Square, Send, Trash2 } from 'lucide-react';

const WAVE_HEIGHTS = [4, 12, 8, 16, 6, 14, 10, 8, 12, 6, 14, 10];

interface Props {
  onSend: (file: File) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onSend, onCancel }: Props) {
  const [phase, setPhase] = useState<'recording' | 'preview'>('recording');
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [blobFile, setBlobFile] = useState<File | null>(null);
  const [waveHeights, setWaveHeights] = useState(WAVE_HEIGHTS);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Animate waveform while recording
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      setWaveHeights(WAVE_HEIGHTS.map(h => Math.max(3, h + Math.floor(Math.random() * 8 - 4))));
    }, 150);
    return () => clearInterval(id);
  }, [phase]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mr = new MediaRecorder(stream, { mimeType });
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType });
        setBlobFile(file);
        setAudioUrl(URL.createObjectURL(blob));
        setPhase('preview');
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      onCancel();
    }
  };

  const handleStop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mrRef.current?.stop();
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="flex-1 flex items-center gap-3 bg-[var(--surface3)] rounded-2xl px-4 py-2.5 border border-[var(--border)]">
      {phase === 'recording' ? (
        <>
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-sm font-mono text-[var(--txt)] w-12 flex-shrink-0">{fmt(duration)}</span>
          <div className="flex items-center gap-[3px] flex-1 h-6">
            {waveHeights.map((h, i) => (
              <div key={i} className="w-0.5 bg-cyan-500/70 rounded-full transition-all duration-150"
                style={{ height: `${h}px`, animation: `voiceWave 0.6s ease-in-out infinite alternate`, animationDelay: `${i * 0.06}s` }} />
            ))}
          </div>
          <button onClick={handleStop}
            className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors flex-shrink-0">
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        </>
      ) : (
        <>
          <audio src={audioUrl ?? undefined} controls className="h-8 flex-1 min-w-0" />
          <span className="text-xs text-[var(--txt3)] font-mono flex-shrink-0">{fmt(duration)}</span>
          <button onClick={() => { if (audioUrl) URL.revokeObjectURL(audioUrl); onCancel(); }}
            className="w-7 h-7 rounded-full bg-[var(--surface4)] border border-[var(--border)] flex items-center justify-center text-[var(--txt3)] hover:text-red-400 transition-colors flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => blobFile && onSend(blobFile)}
            className="w-8 h-8 rounded-full bg-cyan-600 hover:bg-cyan-500 flex items-center justify-center text-black transition-colors flex-shrink-0">
            <Send className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
