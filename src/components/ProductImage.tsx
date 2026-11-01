import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { mediaUrl } from '../lib/api';

interface Props {
  src?: string | null;
  alt: string;
  className?: string;
  /** compact = icon only (thumbnails, basket lines) */
  compact?: boolean;
  loading?: 'lazy' | 'eager';
}

/** Product photo with a designed empty state when there is no photo (never a stock image). */
export const ProductImage: React.FC<Props> = ({ src, alt, className = '', compact, loading = 'lazy' }) => {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={mediaUrl(src)} alt={alt} loading={loading} onError={() => setFailed(true)} className={className} />;
  }
  return (
    <div
      role="img"
      aria-label={`${alt} — photo not available`}
      className={`flex flex-col items-center justify-center gap-1.5 bg-[radial-gradient(circle_at_30%_20%,#f6f1e7,#e7e1d4)] text-[#a08a5c] ${className}`}
    >
      <ImageOff className={compact ? 'h-4 w-4' : 'h-7 w-7'} strokeWidth={1.5} />
      {!compact && <span className="text-[11px] font-semibold tracking-wide text-[#8c7a55]">Photo coming soon</span>}
    </div>
  );
};
