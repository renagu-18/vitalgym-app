'use client'

interface DataPoint { date: string; weight: number }
interface Series { name: string; points: DataPoint[] }

export default function ProgressSection({ progressData }: { progressData: Series[] }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {progressData.map(series => (
        <MiniChart key={series.name} series={series} />
      ))}
    </div>
  )
}

function MiniChart({ series }: { series: Series }) {
  const { name, points } = series
  const weights = points.map(p => p.weight)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const range = max - min || 1
  const first = points[0].weight
  const last = points[points.length - 1].weight
  const delta = last - first
  const isUp = delta >= 0

  const W = 240
  const H = 48
  const PAD = 6

  const coords = points.map((p, i) => ({
    x: PAD + (i / (points.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((p.weight - min) / range) * (H - PAD * 2),
  }))

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')

  return (
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-800 truncate flex-1 mr-2">{name}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0
          ${isUp ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {isUp ? '+' : ''}{delta.toFixed(1)} kg
        </span>
      </div>
      <div className="flex items-center gap-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="flex-1 h-10">
          <path
            d={pathD}
            fill="none"
            stroke={isUp ? '#16a34a' : '#dc2626'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={i === coords.length - 1 ? 4 : 2.5}
              fill={i === coords.length - 1 ? (isUp ? '#16a34a' : '#dc2626') : '#d1d5db'}
            />
          ))}
        </svg>
        <div className="text-right flex-shrink-0 w-14">
          <p className="text-[10px] text-gray-400">{first} kg</p>
          <p className="text-sm font-bold text-gray-900">{last} kg</p>
        </div>
      </div>
    </div>
  )
}
