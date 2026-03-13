import { useState, useCallback } from 'react';
import { Star } from '@phosphor-icons/react';

interface Props {
  /** Score 1-10 (half-star = odd, full-star = even). 0 = no rating. */
  value: number;
  onChange: (score: number) => void;
  size?: number;
}

/**
 * 5-star rating with half-star precision.
 * Each star is split into left (half) and right (full) hit zones.
 * score = stars × 2  →  half-star clicks yield odd scores, full-star clicks yield even.
 */
export function StarRating({ value, onChange, size = 36 }: Props) {
  const [hover, setHover] = useState(0);

  const getScoreFromEvent = useCallback(
    (e: React.MouseEvent, starIndex: number) => {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const isLeftHalf = x < rect.width / 2;
      return isLeftHalf ? starIndex * 2 - 1 : starIndex * 2;
    },
    [],
  );

  const display = hover || value;

  return (
    <div
      className="inline-flex gap-1.5 py-1"
      onMouseLeave={() => setHover(0)}
      role="radiogroup"
      aria-label="喜欢程度"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fullScore = star * 2;
        const halfScore = star * 2 - 1;
        const isFull = display >= fullScore;
        const isHalf = !isFull && display >= halfScore;

        return (
          <button
            key={star}
            type="button"
            className="relative transition-transform active:scale-90 cursor-pointer"
            style={{ width: size, height: size }}
            onMouseMove={(e) => setHover(getScoreFromEvent(e, star))}
            onClick={(e) => onChange(getScoreFromEvent(e, star))}
            aria-label={`${star} 星`}
          >
            {/* Empty base */}
            <Star
              size={size}
              weight="light"
              className="absolute inset-0 text-gray-300"
            />
            {/* Full fill */}
            {isFull && (
              <Star
                size={size}
                weight="fill"
                className="absolute inset-0 text-amber-400"
              />
            )}
            {/* Half fill — clip left 50% */}
            {isHalf && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                <Star
                  size={size}
                  weight="fill"
                  className="text-amber-400"
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
