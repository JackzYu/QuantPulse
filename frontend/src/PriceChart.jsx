import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

export default function PriceChart({ result }) {
  const rows = result.data
  if (rows.length === 0) return null

  const priceFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
  const currency = result.currency || ''

  return (
    <figure className="price-chart" aria-labelledby="price-chart-title" aria-describedby="price-chart-caption">
      <div className="chart-heading">
        <h2 id="price-chart-title">{result.symbol} · Closing price</h2>
        <span>{currency ? `Price (${currency})` : 'Price (currency unknown)'}</span>
      </div>
      <div className="chart-viewport">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 720, height: 340 }}>
          <LineChart data={rows} margin={{ top: 12, right: 8, bottom: 4, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#252a2f" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#969da5', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#343a40' }}
              minTickGap={32}
              interval="preserveStartEnd"
              height={46}
              label={{ value: 'Trading date', position: 'insideBottom', fill: '#969da5', fontSize: 10 }}
            />
            <YAxis
              orientation="right"
              width={76}
              tickCount={5}
              tick={{ fill: '#969da5', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              // Pad the range so flat prices and single-record queries remain visible.
              domain={([minimum, maximum]) => {
                const padding = (maximum - minimum || Math.abs(minimum) || 1) * 0.08
                return [minimum - padding, maximum + padding]
              }}
            />
            <Tooltip
              isAnimationActive={false}
              labelFormatter={(value) => `Trading date: ${value}`}
              formatter={(value) => [`${priceFormatter.format(value)}${currency ? ` ${currency}` : ''}`, 'Adjusted close']}
              contentStyle={{ background: '#171b20', border: '1px solid #3a424b', borderRadius: 3, fontSize: 12 }}
              labelStyle={{ color: '#cbd1d8', marginBottom: 6 }}
              itemStyle={{ color: '#4bd599' }}
              cursor={{ stroke: '#5c6874', strokeDasharray: '3 3' }}
            />
            <Line
              dataKey="close"
              name="Adjusted close"
              type="linear"
              stroke="#4bd599"
              strokeWidth={2}
              dot={rows.length === 1 ? { r: 4, fill: '#4bd599' } : false}
              activeDot={{ r: 4, fill: '#4bd599', stroke: '#0b0d0f', strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption id="price-chart-caption" className="chart-caption">
        <span className="chart-legend" aria-hidden="true" />
        Daily close · Split &amp; dividend adjusted · {result.source} via {result.access_library}
      </figcaption>
      <p className="chart-hint">
        {rows.length === 1
          ? 'One trading-day record is shown as a point.'
          : 'Trading dates only. Price axis is auto-scaled. Hover or use the arrow keys to inspect a daily close.'}
      </p>
    </figure>
  )
}
