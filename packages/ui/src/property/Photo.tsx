import { IMAGES, srcSet, type ImageKey } from '@repo/assets';
import { ImageIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';

/**
 * Responsive photograph from the asset registry: srcset + sizes, reserved aspect ratio (no layout
 * shift), lazy below the fold, translated alt text. Fictional projects are never presented as
 * real: `labelled` adds the visible "Illustrative image" chip (owner rule; see ASSET_REGISTRY.md).
 */
export function Photo({
  imageKey,
  sizes,
  className,
  imgClassName,
  priority = false,
  labelled = true,
  labelPosition = 'top-end',
  decorative = false,
}: {
  imageKey: string;
  sizes: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  labelled?: boolean;
  labelPosition?: 'top-end' | 'bottom-end' | 'top-start';
  /** When a heading next to it already says what the image shows. */
  decorative?: boolean;
}) {
  const { t } = useT();
  const image = IMAGES[imageKey as ImageKey];
  if (!image) return null;
  return (
    <div className={cn('relative overflow-hidden bg-sunken', className)}>
      <img
        src={image.srcset[960]}
        srcSet={srcSet(image)}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt={decorative ? '' : t(`common:${image.altKey}` as 'common:images.heightsDusk')}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        draggable={false}
        className={cn('size-full object-cover', imgClassName)}
        style={{ objectPosition: image.focus }}
      />
      {labelled && <IllustrativeChip className={cn('absolute', POSITION[labelPosition])} />}
    </div>
  );
}

const POSITION = {
  'top-end': 'top-3 end-3',
  'bottom-end': 'bottom-3 end-3',
  'top-start': 'top-3 start-3',
};

export function IllustrativeChip({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-[rgb(12_17_15/0.66)] px-2 py-0.5 text-mini font-medium whitespace-nowrap text-inverse backdrop-blur-sm',
        className,
      )}
    >
      <ImageIcon aria-hidden className="size-3" />
      {t('common:images.illustrative')}
    </span>
  );
}
