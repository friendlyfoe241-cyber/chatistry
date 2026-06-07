import React, { useState, useEffect } from 'react';
import { cn } from '../utils';
import { User } from '../types';

interface AvatarProps {
  user: User;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  isCurrentUser?: boolean;
}

const sizes = {
  sm: 'w-7 h-7 text-[9px]',
  md: 'w-10 h-10 text-[10px]',
  lg: 'w-12 h-12 text-sm',
};

export function Avatar({ user, size = 'md', className, isCurrentUser }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  // Reset error state whenever the URL changes so a new/updated avatar always loads
  useEffect(() => {
    setImgError(false);
  }, [user.avatarUrl]);

  const base = cn(
    'rounded-full flex-shrink-0 flex items-center justify-center font-bold border',
    sizes[size],
    className,
  );

  if (user.avatarUrl && !imgError) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.username}
        className={cn(base, 'object-cover border-[#2A2A2A]')}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className={cn(base, isCurrentUser
      ? 'bg-cyan-900/40 border-cyan-800/60 text-cyan-300'
      : 'bg-[#1A1A1A] border-[#2A2A2A] text-[#E0E0E0]'
    )}>
      {user.username.substring(0, 2).toUpperCase()}
    </div>
  );
}
