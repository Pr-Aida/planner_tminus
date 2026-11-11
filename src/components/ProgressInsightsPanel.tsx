import type { ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Check } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { formatAmount, formatDuration, formatPair, formatProgressDate } from '../lib/progress';
import type { ProgressInsights } from '../lib/progressInsights';
import type { CalendarMode } from '../types';

interface Props {
  insights: ProgressInsights;
  calMode: CalendarMode;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <div className="py-2.5" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: colors.textTertiary }}>{label}</p>
      <div className="text-xs" style={{ color: colors.textPrimary }}>{children}</div>
    </div>
  );
}

export default function ProgressInsightsPanel({ insights, calMode }: Props) {
  const { colors } = useTheme();
  const { today, goal, forecast, paceTrend, momentum, bestPace, fastest } = insights;

  const hasToday = today.amounts.length > 0 || today.studiedMinutes > 0;
  if (!hasToday && !goal && !forecast && !paceTrend && !momentum && !bestPace && !fastest) return null;

  const TrendIcon = paceTrend?.direction === 'up' ? ArrowUp : paceTrend?.direction === 'down' ? ArrowDown : ArrowRight;
  const trendColor = paceTrend?.direction === 'up' ? colors.success : paceTrend?.direction === 'down' ? colors.warning : colors.textSecondary;
  const trendText = paceTrend?.direction === 'up' ? 'Improving' : paceTrend?.direction === 'down' ? 'Slower than recent pace' : 'Steady';

  const momentumLabel = momentum?.level === 'strong' ? 'Strong' : 'Stable';
  const MomentumIcon = momentum?.level === 'strong' ? ArrowUp : ArrowRight;

  return (
    <div className="rounded-xl p-6 mb-4" style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 12px ${colors.shadow}` }}>
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>Insights</span>

      <div className="mt-2">
        {hasToday && (
          <Row label="Today">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {today.amounts.map(a => <span key={a.unit} className="font-semibold">+{formatAmount(a.amount, a.unit)}</span>)}
              {today.studiedMinutes > 0 && <span className="font-semibold">+{formatDuration(today.studiedMinutes)} studied</span>}
            </div>
          </Row>
        )}

        {goal && (
          <Row label="Daily goal">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold">{formatPair(goal.done, goal.target, goal.unit)} today</span>
                {goal.complete ? (
                  <span className="flex items-center gap-1 font-bold" style={{ color: colors.success }}><Check size={12} /> Daily Goal Complete</span>
                ) : (
                  <span className="font-bold" style={{ color: colors.accent }}>{goal.pct}%</span>
                )}
              </div>
              <div className="rounded-full h-1.5 overflow-hidden" style={{ background: colors.bgInput }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${goal.pct}%`, background: goal.complete ? colors.success : colors.accent }} />
              </div>
            </div>
          </Row>
        )}

        {forecast && (
          <Row label="Finish forecast">
            <div className="space-y-0.5">
              <div>Estimated finish: <span className="font-semibold">{formatProgressDate(forecast.finishDate, calMode)}</span></div>
              {forecast.deltaDays !== null && (
                <div style={{ color: forecast.deltaDays < 0 ? colors.error : colors.success }}>
                  At current pace: {forecast.deltaDays < 0
                    ? `${-forecast.deltaDays} ${-forecast.deltaDays === 1 ? 'day' : 'days'} late`
                    : forecast.deltaDays === 0 ? 'finishes on the deadline'
                    : `${forecast.deltaDays} ${forecast.deltaDays === 1 ? 'day' : 'days'} before deadline`}
                </div>
              )}
            </div>
          </Row>
        )}

        {paceTrend && (
          <Row label="Pace trend">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{paceTrend.current.toFixed(1)} {paceTrend.unit}/hour</span>
              <span style={{ color: colors.textTertiary }}>vs recent {paceTrend.previous.toFixed(1)}</span>
              <span className="flex items-center gap-1 font-bold" style={{ color: trendColor }}><TrendIcon size={12} /> {trendText}</span>
            </div>
          </Row>
        )}

        {momentum && (
          <Row label="Momentum">
            <span className="flex items-center gap-1.5 font-semibold">
              <MomentumIcon size={12} /> {momentumLabel}
              <span className="font-normal" style={{ color: colors.textTertiary }}>
                {momentum.activeDays} active days this week
              </span>
            </span>
          </Row>
        )}

        {(bestPace || fastest) && (
          <Row label="Best study pace">
            <div className="space-y-0.5">
              {bestPace && <div>Best recent pace: <span className="font-semibold">{bestPace.unitsPerHour.toFixed(1)} {bestPace.unit}/hour</span></div>}
              {fastest && <div>Fastest session: <span className="font-semibold">{formatAmount(fastest.amount, fastest.unit)} in {formatDuration(fastest.minutes)}</span></div>}
            </div>
          </Row>
        )}
      </div>
    </div>
  );
}
