import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useTimeFormat, formatTimeForInput, parseTime } from '../lib/timeFormat';

interface Props {
  value: string;
  onChange: (hhmm: string) => void;
  className?: string;
}

export default function TimeInput({ value, onChange, className = '' }: Props) {
  const { colors } = useTheme();
  const timeFormat = useTimeFormat();
  const formatted = formatTimeForInput(value, timeFormat);
  const [draft, setDraft] = useState(formatted);

  useEffect(() => { setDraft(formatted); }, [formatted]);

  function commit() {
    if (!draft.trim()) {
      setDraft(formatted);
      return;
    }
    const parsed = parseTime(draft);
    if (parsed) {
      onChange(parsed);
      setDraft(formatTimeForInput(parsed, timeFormat));
    } else {
      setDraft(formatted);
    }
  }

  return (
    <div
      className={`flex items-center rounded-lg px-3 gap-2 ${className}`}
      style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput }}
    >
      <input
        type="text"
        inputMode={timeFormat === '24h' ? 'numeric' : 'text'}
        value={draft}
        placeholder={timeFormat === '24h' ? 'HH:mm' : 'h:mm AM'}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        className="flex-1 min-w-0 text-sm py-2.5 outline-none bg-transparent"
        style={{ color: draft ? colors.textPrimary : colors.textTertiary, border: 'none', fontFamily: 'inherit' }}
      />
      <Clock size={14} color={colors.textTertiary} />
    </div>
  );
}
