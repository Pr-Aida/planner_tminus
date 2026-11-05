import { Clock } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useTimeFormat, formatTimeForInput } from '../lib/timeFormat';

interface Props {
  value: string;
  onChange: (hhmm: string) => void;
  className?: string;
  showIcon?: boolean;
}

export default function TimeInput({ value, onChange, className = '', showIcon = true }: Props) {
  const { colors } = useTheme();
  const timeFormat = useTimeFormat();
  const formatted = formatTimeForInput(value, timeFormat);

  return (
    <div
      className={`relative flex items-center gap-2 rounded-lg px-3 py-2.5 ${className}`}
      style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput }}
    >
      <span
        className="flex-1 min-w-0 text-sm pointer-events-none truncate"
        style={{ color: value ? colors.textPrimary : colors.textTertiary }}
      >
        {formatted || (timeFormat === '24h' ? 'HH:mm' : 'h:mm AM')}
      </span>
      {showIcon && <Clock size={14} color={colors.textTertiary} />}
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ border: 'none', background: 'transparent' }}
      />
    </div>
  );
}
