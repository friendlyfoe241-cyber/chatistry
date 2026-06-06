import React, { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '../utils';

interface PreviewData { title?: string; description?: string; image?: string; favicon?: string; url: string; }
const cache = new Map<string, PreviewData | null>();

export function LinkPreview({ url, isMe }: { url: string; isMe: boolean }) {
  const [data, setData] = useState<PreviewData | null | undefined>(cache.has(url) ? cache.get(url) : undefined);

  useEffect(() => {
    if (cache.has(url)) { setData(cache.get(url) ?? null); return; }
    const ctrl = new AbortController();
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(json => {
        if (json.status === 'success') {
          const p: PreviewData = { title: json.data.title ?? undefined, description: json.data.description ?? undefined, image: json.data.image?.url ?? undefined, favicon: json.data.logo?.url ?? undefined, url };
          cache.set(url, p); setData(p);
        } else { cache.set(url, null); setData(null); }
      })
      .catch(() => { cache.set(url, null); setData(null); });
    return () => ctrl.abort();
  }, [url]);

  if (data === undefined) return (
    <div className={cn('mt-2 rounded-xl border overflow-hidden animate-pulse', isMe ? 'border-cyan-900/40' : 'border-[var(--border)]')}>
      <div className="h-20 bg-[var(--surface4)]" />
      <div className="p-2.5 space-y-1.5">
        <div className="h-3 bg-[var(--surface4)] rounded w-3/4" />
        <div className="h-2.5 bg-[var(--surface4)] rounded w-full" />
      </div>
    </div>
  );

  if (!data || (!data.title && !data.description)) return null;

  let hostname = url;
  try { hostname = new URL(url).hostname; } catch {}

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      className={cn('mt-2 rounded-xl border overflow-hidden flex flex-col hover:opacity-90 transition-opacity block',
        isMe ? 'border-cyan-900/40 bg-cyan-950/20' : 'border-[var(--border)] bg-[var(--surface3)]')}>
      {data.image && <img src={data.image} alt="" className="w-full h-24 object-cover" loading="lazy" />}
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          {data.favicon && <img src={data.favicon} alt="" className="w-3.5 h-3.5 rounded flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />}
          <span className="text-[10px] text-[var(--txt3)] truncate">{hostname}</span>
          <ExternalLink className="w-2.5 h-2.5 text-[var(--txt3)] flex-shrink-0 ml-auto" />
        </div>
        {data.title && <div className="text-xs font-medium text-[var(--txt)] line-clamp-2 leading-tight">{data.title}</div>}
        {data.description && <div className="text-[11px] text-[var(--txt2)] mt-0.5 line-clamp-2 leading-tight">{data.description}</div>}
      </div>
    </a>
  );
}
