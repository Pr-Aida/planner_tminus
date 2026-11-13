import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { saveProjectNotes } from '../lib/progressChecklist';

interface Props {
  projectId: string;
  initialNotes: string | null;
  accentColor: string;
}

export default function ProjectNotes({ projectId, initialNotes }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialNotes || '');
  const [savedState, setSavedState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialNotes || '');

  // Reset when project changes
  useEffect(() => {
    setText(initialNotes || '');
    lastSavedRef.current = initialNotes || '';
    setSavedState('idle');
  }, [projectId, initialNotes]);

  function handleChange(value: string) {
    setText(value);
    setSavedState('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value === lastSavedRef.current) return;
      setSavedState('saving');
      const ok = await saveProjectNotes(projectId, value);
      if (ok) {
        lastSavedRef.current = value;
        setSavedState('saved');
        setTimeout(() => setSavedState('idle'), 1500);
      } else {
        setSavedState('idle');
      }
    }, 800);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div className="rounded-xl p-5 mb-4" style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>Notes</span>
        {savedState === 'saving' && (
          <span className="text-[10px] font-semibold" style={{ color: colors.textTertiary }}>Saving…</span>
        )}
        {savedState === 'saved' && (
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: colors.success }}>
            <Check size={10} /> Saved
          </span>
        )}
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="Project notes…"
        rows={4}
        dir="auto"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
        style={{
          border: `1.5px solid ${colors.borderLight}`,
          background: colors.bgInput,
          color: colors.textPrimary,
          fontFamily: 'inherit',
          lineHeight: 1.6,
        }}
      />
    </div>
  );
}
