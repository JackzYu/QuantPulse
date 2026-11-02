import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import React, { act } from 'react'

// This test DOM provides fixed geometry, not a real browser layout engine.
const window = new Window({ url: 'http://localhost:5173' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Node']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.getComputedStyle = window.getComputedStyle.bind(window)
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
globalThis.ResizeObserver = window.ResizeObserver = class {
  constructor(callback) { this.callback = callback }
  observe(target) { this.callback([{ target, contentRect: { width: 720, height: 340 } }]) }
  unobserve() {}
  disconnect() {}
}
const originalRect = window.HTMLElement.prototype.getBoundingClientRect
window.HTMLElement.prototype.getBoundingClientRect = function () {
  if (this.classList.contains('recharts-responsive-container')) return new window.DOMRect(0, 0, 720, 340)
  return originalRect.call(this)
}

const { createRoot } = await import('react-dom/client')
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true, hmr: false },
})
const { default: PriceChart } = await server.ssrLoadModule('/src/PriceChart.jsx')
const { default: App } = await server.ssrLoadModule('/src/App.jsx')
let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
after(async () => {
  await server.close()
  await window.happyDOM.close()
})

async function renderChart(data, metadata = {}) {
  await act(async () => {
    root.render(React.createElement(PriceChart, { result: {
      symbol: 'AAPL', currency: 'USD', source: 'Yahoo Finance', access_library: 'yfinance',
      ...metadata, data,
    } }))
  })
}

test('does not create a chart for an empty result', async () => {
  await renderChart([])
  assert.equal(container.querySelector('figure'), null)
})

test('shows a visible point for a single trading day', async () => {
  await renderChart([{ date: '2024-01-02', close: 100 }])
  assert.ok(container.querySelector('circle.recharts-line-dot'))
  assert.ok(container.textContent.includes('One trading-day record'))
})

test('renders flat prices without invalid coordinates', async () => {
  await renderChart([{ date: '2024-01-02', close: 100 }, { date: '2024-01-03', close: 100 }])
  const path = container.querySelector('.recharts-line-curve').getAttribute('d')
  assert.ok(!path.includes('NaN') && !path.includes('Infinity'))
  const coordinates = path.match(/^M[^,]+,([^L]+)L[^,]+,(.+)$/)
  assert.ok(coordinates)
  assert.equal(coordinates[1], coordinates[2])
})

test('plots every record and labels the symbol, currency, dates, and source', async () => {
  // Synthetic data used only to check that the chart does not truncate at ten rows.
  const data = Array.from({ length: 12 }, (_, index) => ({
    date: `2024-01-${String(index + 2).padStart(2, '0')}`, close: 100 + index,
  }))
  await renderChart(data)
  const path = container.querySelector('.recharts-line-curve').getAttribute('d')
  assert.equal((path.match(/[ML]/g) || []).length, 12)
  for (const label of ['AAPL', 'Price (USD)', 'Trading date', 'Split & dividend adjusted', 'Yahoo Finance via yfinance']) {
    assert.ok(container.textContent.includes(label))
  }
})

test('replaces a previous result and identifies unknown currency', async () => {
  await renderChart([{ date: '2024-01-02', close: 100 }])
  await renderChart(
    [{ date: '2024-02-01', close: 200 }, { date: '2024-02-02', close: 210 }],
    { symbol: 'MSFT', currency: null },
  )
  assert.ok(container.textContent.includes('MSFT'))
  assert.ok(!container.textContent.includes('AAPL'))
  assert.ok(container.textContent.includes('Price (currency unknown)'))
  assert.ok(container.textContent.includes('2024-02-01'))
  const path = container.querySelector('.recharts-line-curve').getAttribute('d')
  assert.equal((path.match(/[ML]/g) || []).length, 2)
})

test('supports inspecting a daily close with the keyboard', async () => {
  await renderChart([{ date: '2024-01-02', close: 100 }, { date: '2024-01-03', close: 101 }])
  await act(async () => {
    container.querySelector('svg.recharts-surface').dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight', bubbles: true,
    }))
  })
  const tooltip = container.querySelector('.recharts-tooltip-wrapper')
  assert.ok(tooltip.textContent.includes('Trading date: 2024-01-02'))
  assert.ok(tooltip.textContent.includes('100.00 USD'))
})

function queryResult(close = 100) {
  return {
    symbol: 'AAPL', currency: 'USD', source: 'Yahoo Finance', access_library: 'yfinance',
    price_basis: 'split_and_dividend_adjusted_ohlc',
    start_date: '2024-01-02', end_date: '2024-01-09', row_count: 2,
    actual_start_date: '2024-01-02', actual_end_date: '2024-01-03',
    fetched_at_utc: '2026-11-02T15:00:00+00:00',
    data: ['2024-01-02', '2024-01-03'].map((date) => ({
      date, open: close, high: close + 1, low: close - 1, close, volume: 100,
    })),
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function submitQuery() {
  await act(async () => {
    container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  })
}

test('a completed search shows a chart and table from the same result', async (t) => {
  let completeRequest
  const request = t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { completeRequest = resolve }))
  await act(async () => root.render(React.createElement(App)))
  await submitQuery()
  assert.ok(container.textContent.includes('Fetching historical prices'))
  assert.equal(container.querySelector('.price-chart'), null)
  assert.equal(container.querySelector('.download-button').disabled, true)
  await act(async () => completeRequest(jsonResponse(queryResult(123.45))))
  assert.ok(request.mock.calls[0].arguments[0].includes('/history?symbol=AAPL'))
  assert.ok(container.querySelector('.recharts-line-curve'))
  assert.equal(container.querySelectorAll('.price-table tbody tr').length, 2)
  assert.ok(container.querySelector('.close-price').textContent.includes('123.45'))
  assert.equal(container.querySelector('.download-button').disabled, false)
})

test('empty results and failed searches clear the previous chart', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', () => Promise.resolve(jsonResponse(queryResult())))
  await act(async () => root.render(React.createElement(App)))
  await submitQuery()
  assert.ok(container.querySelector('.price-chart'))

  const empty = { ...queryResult(), data: [], row_count: 0, actual_start_date: null, actual_end_date: null, message: 'No test records.' }
  request.mock.mockImplementation(() => Promise.resolve(jsonResponse(empty)))
  await submitQuery()
  assert.equal(container.querySelector('.price-chart'), null)
  assert.equal(container.querySelector('.download-button').disabled, true)
  assert.ok(container.textContent.includes('No daily records'))

  request.mock.mockImplementation(() => Promise.resolve(jsonResponse({ detail: 'Test provider unavailable.' }, 503)))
  await submitQuery()
  assert.equal(container.querySelector('.price-chart'), null)
  assert.equal(container.querySelector('.download-button').disabled, true)
  assert.ok(container.textContent.includes('Test provider unavailable.'))
})

test('a late older response cannot replace the latest displayed prices', async (t) => {
  const pending = []
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve) => {
    pending.push({ resolve, signal: options.signal })
  }))
  await act(async () => root.render(React.createElement(App)))
  await submitQuery()
  await submitQuery()
  assert.equal(pending[0].signal.aborted, true)
  await act(async () => pending[1].resolve(jsonResponse(queryResult(200))))
  await act(async () => pending[0].resolve(jsonResponse(queryResult(100))))
  assert.ok(container.querySelector('.close-price').textContent.includes('200.00'))
  assert.ok(container.querySelector('.recharts-line-curve'))
  assert.equal(container.querySelectorAll('.price-table tbody tr').length, 2)
})
