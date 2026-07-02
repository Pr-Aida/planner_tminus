import React, { useRef } from 'react';
import { ImageIcon, X } from 'lucide-react';
import { useTheme } from '../lib/theme';

interface Props {
  imageDataUrl: string | null;
  onImageChange: (dataUrl: string | null) => void;
}

export default function HeroBanner({ imageDataUrl, onImageChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { colors } = useTheme();

  function handleClick() {
    if (!imageDataUrl) inputRef.current?.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onImageChange(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        background: colors.heroBg,
        minHeight: imageDataUrl ? '220px' : '52px',
        cursor: imageDataUrl ? 'default' : 'pointer',
        transition: 'min-height 0.3s',
      }}
      onClick={handleClick}
    >
      {imageDataUrl ? (
        <img
          src={imageDataUrl}
          alt="Cover"
          className="w-full object-cover"
          style={{ maxHeight: '320px', display: 'block' }}
        />
      ) : (
        <div className="flex items-center justify-center gap-2 py-3.5 px-6 pointer-events-none">
          <ImageIcon size={16} color="rgba(255,255,255,0.45)" />
          <span className="text-xs tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Click to add a cover image — stays across all views
          </span>
        </div>
      )}

      {imageDataUrl && (
        <button
          className="absolute top-2.5 right-3.5 flex items-center justify-center rounded-full z-10 transition-opacity hover:opacity-80"
          style={{
            background: 'rgba(0,0,0,0.55)',
            width: 28,
            height: 28,
            border: 'none',
            cursor: 'pointer',
            color: '#fff',
          }}
          onClick={e => { e.stopPropagation(); onImageChange(null); }}
        >
          <X size={14} />
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
