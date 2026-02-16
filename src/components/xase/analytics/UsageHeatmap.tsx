'use client'

import { useMemo } from 'react'

interface UsageData {
  hour: number
  day: number
  count: number
}

interface UsageHeatmapProps {
  data: UsageData[]
  title?: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function UsageHeatmap({ data, title = 'Usage Heatmap (by hour)' }: UsageHeatmapProps) {
  const heatmapData = useMemo(() => {
    const matrix: number[][] = Array(7).fill(0).map(() => Array(24).fill(0))
    
    data.forEach(({ hour, day, count }) => {
      if (day >= 0 && day < 7 && hour >= 0 && hour < 24) {
        matrix[day][hour] = count
      }
    })
    
    return matrix
  }, [data])

  const maxCount = useMemo(() => {
    return Math.max(...data.map(d => d.count), 1)
  }, [data])

  const getColor = (count: number) => {
    if (count === 0) return 'bg-gray-100'
    const intensity = Math.min(count / maxCount, 1)
    
    if (intensity < 0.2) return 'bg-blue-200'
    if (intensity < 0.4) return 'bg-blue-300'
    if (intensity < 0.6) return 'bg-blue-400'
    if (intensity < 0.8) return 'bg-blue-500'
    return 'bg-blue-600'
  }

  return (
    <div className="w-full">
      <h3 className="text-lg font-bold mb-4">{title}</h3>
      
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hour labels */}
          <div className="flex mb-1">
            <div className="w-12"></div>
            {HOURS.map(hour => (
              <div key={hour} className="w-8 text-xs text-center text-gray-600">
                {hour % 3 === 0 ? hour : ''}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="flex items-center mb-1">
              <div className="w-12 text-sm font-medium text-gray-700">{day}</div>
              {HOURS.map(hour => {
                const count = heatmapData[dayIndex][hour]
                return (
                  <div
                    key={hour}
                    className={`w-8 h-8 mx-0.5 rounded ${getColor(count)} transition-all hover:scale-110 cursor-pointer`}
                    title={`${day} ${hour}:00 - ${count} sessions`}
                  />
                )
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center mt-4 text-sm text-gray-600">
            <span className="mr-2">Less</span>
            <div className="w-6 h-6 bg-gray-100 rounded mr-1"></div>
            <div className="w-6 h-6 bg-blue-200 rounded mr-1"></div>
            <div className="w-6 h-6 bg-blue-300 rounded mr-1"></div>
            <div className="w-6 h-6 bg-blue-400 rounded mr-1"></div>
            <div className="w-6 h-6 bg-blue-500 rounded mr-1"></div>
            <div className="w-6 h-6 bg-blue-600 rounded mr-1"></div>
            <span className="ml-2">More</span>
          </div>
        </div>
      </div>
    </div>
  )
}
