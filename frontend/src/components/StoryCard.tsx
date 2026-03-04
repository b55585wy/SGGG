import { useState } from 'react';
import { motion } from 'framer-motion';
import { ImageBroken, Tag } from '@phosphor-icons/react';
import type { Page } from '@/types/story';

interface StoryCardProps {
  page: Page;
  imageUrl?: string;
}

export function StoryCard({ page, imageUrl }: StoryCardProps) {
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className="w-full bg-[var(--color-surface)] rounded-2xl overflow-hidden border border-[var(--color-border-light)]"
      style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.05)' }}
    >
      {/* Fixed-height image area */}
      <div className="relative w-full aspect-[4/3] bg-[var(--color-warm-100)]">
        {imgStatus === 'loading' && (
          <div className="absolute inset-0 skeleton-shimmer" />
        )}
        {imgStatus === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-muted)] gap-2">
            <ImageBroken size={48} weight="light" />
            <p className="text-sm">Illustration unavailable</p>
          </div>
        )}
        {imageUrl && (
          <img
            src={imageUrl}
            alt={`Story page ${page.page_no}`}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
              imgStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImgStatus('loaded')}
            onError={() => setImgStatus('error')}
          />
        )}
      </div>

      {/* Text */}
      <div className="p-6">
        <p className="text-lg leading-relaxed text-[var(--color-foreground)] max-w-[65ch]">
          {page.text}
        </p>
        <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <Tag size={14} weight="bold" />
          <span>{page.behavior_anchor}</span>
        </div>
      </div>
    </motion.div>
  );
}
