import { memo } from 'react';

interface BarData {
  label: string;
  activityHours: number;
  habitHours: number; // e.g. violin minutes / 60
  habitPages?: number;
}

interface Props {
  data: BarData[];
}

const CHART_HEIGHT = 180;
const BAR_GAP = 6;
const GROUP_GAP = 16;

function WeeklyChartBase({ data }: Props) {
  if (!data.length) return null;

  const maxVal = Math.max(...data.flatMap(d => [d.activityHours, d.habitHours, d.habitPages || 0]), 0.5);
  const paddedMax = Math.ceil(maxVal * 1.25 * 2) / 2 || 1;

  const totalWidth = 560;
  const leftPad = 40;
  const rightPad = 16;
  const chartWidth = totalWidth - leftPad - rightPad;
  const groupWidth = chartWidth / data.length;
  const hasPages = data.some(d => (d.habitPages || 0) > 0);
  const barCount = hasPages ? 3 : 2;
  const barWidth = Math.min((groupWidth - GROUP_GAP) / barCount - BAR_GAP / 2, 24);

  function barHeight(val: number) {
    return Math.max((val / paddedMax) * CHART_HEIGHT, val > 0 ? 2 : 0);
  }

  const yLines = 4;
  const yLabels = Array.from({ length: yLines + 1 }, (_, i) => {
    const val = (paddedMax * i) / yLines;
    return { val, y: CHART_HEIGHT - (val / paddedMax) * CHART_HEIGHT };
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${totalWidth} ${CHART_HEIGHT + 40}`}
        width="100%"
        style={{ fontFamily: 'inherit', display: 'block' }}
      >
        {/* Y grid lines + labels */}
        {yLabels.map(({ val, y }, i) => (
          <g key={i}>
            <line
              x1={leftPad} y1={y} x2={totalWidth - rightPad} y2={y}
              stroke="#F2F2F2" strokeWidth="1"
            />
            <text
              x={leftPad - 6} y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="#6B6B6B"
            >
              {val.toFixed(1)}h
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const groupX = leftPad + i * groupWidth + GROUP_GAP / 2;
          const innerWidth = groupWidth - GROUP_GAP;
          const centerX = groupX + innerWidth / 2;
          const actH = barHeight(d.activityHours);
          const habH = barHeight(d.habitHours);
          const pgH = barHeight(d.habitPages || 0);

          const slots: { h: number; fill: string }[] = [
            { h: actH, fill: '#1B2A4A' },
            { h: habH, fill: '#7B1C3E' },
          ];
          if (hasPages) slots.push({ h: pgH, fill: '#2D6A4F' });

          const totalBarsWidth = slots.length * barWidth + (slots.length - 1) * BAR_GAP;
          let cursor = centerX - totalBarsWidth / 2;

          return (
            <g key={i}>
              {slots.map((s, si) => {
                const x = cursor;
                cursor += barWidth + BAR_GAP;
                return (
                  <rect
                    key={si}
                    x={x}
                    y={CHART_HEIGHT - s.h}
                    width={barWidth}
                    height={s.h}
                    rx={4}
                    fill={s.fill}
                  />
                );
              })}
              {/* X label */}
              <text
                x={centerX}
                y={CHART_HEIGHT + 18}
                textAnchor="middle"
                fontSize="10"
                fill="#6B6B6B"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${leftPad}, ${CHART_HEIGHT + 32})`}>
          <rect x={0} y={0} width={10} height={10} rx={2} fill="#1B2A4A" />
          <text x={14} y={9} fontSize="10" fill="#6B6B6B">Activities</text>
          <rect x={80} y={0} width={10} height={10} rx={2} fill="#7B1C3E" />
          <text x={94} y={9} fontSize="10" fill="#6B6B6B">Habits (h)</text>
          {hasPages && (
            <>
              <rect x={160} y={0} width={10} height={10} rx={2} fill="#2D6A4F" />
              <text x={174} y={9} fontSize="10" fill="#6B6B6B">Pages</text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

const WeeklyChart = memo(WeeklyChartBase);
export default WeeklyChart;
