import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHistoryCsv, downloadHistoryCsv } from './historyCsv.js'

function sampleResult() {
  // Synthetic fixtures only; never used as fallback market data.
  const dates = ['02', '03', '04', '05', '08', '09', '10', '11', '12', '16', '17', '18']
  return {
    symbol: 'AAPL',
    start_date: '2024-01-02',
    end_date: '2024-01-18',
    currency: 'USD',
    interval: '1d',
    price_basis: 'split_and_dividend_adjusted_ohlc',
    source: 'Yahoo Finance',
    access_library: 'yfinance',
    fetched_at_utc: '2026-11-02T15:00:00+00:00',
    data: dates.map((day, index) => ({
      date: `2024-01-${day}`, open: 183 + index, high: 185 + index,
      low: 182 + index, close: 183.4040069580078 + index, volume: 100000 + index,
    })),
  }
}

test('exports every record at full precision with query metadata', () => {
  const result = sampleResult()
  const original = structuredClone(result)
  const { filename, content } = createHistoryCsv(result)
  assert.equal(filename, 'AAPL_2024-01-02_2024-01-18_1d.csv')
  assert.equal(content[0], '\uFEFF')
  const lines = content.slice(1).trimEnd().split('\r\n')
  assert.equal(lines.length, 13)
  assert.ok(lines[0].startsWith('date,open,high,low,close,volume,'))
  assert.ok(lines[1].includes('"183.4040069580078"'))
  assert.ok(lines[12].includes('"2024-01-18"'))
  assert.ok(lines[1].includes('"AAPL","USD","1d","split_and_dividend_adjusted_ohlc"'))
  assert.ok(lines[1].includes('"Yahoo Finance","yfinance","2026-11-02T15:00:00+00:00"'))
  assert.deepEqual(result, original)
})

test('escapes CSV text fields and preserves unknown currency as empty', () => {
  const result = sampleResult()
  result.currency = null
  result.source = 'Provider, "Example"\nHistorical data'
  const { content } = createHistoryCsv(result)
  assert.ok(content.includes('"Provider, ""Example""\nHistorical data"'))
  assert.ok(content.includes('"AAPL","","1d"'))
})

test('rejects absent or empty results', () => {
  for (const result of [null, { data: [] }, { data: 'invalid' }]) {
    assert.throws(() => createHistoryCsv(result), /No daily records/)
  }
})

function mockBrowser(t, failClick = false) {
  const previousDocument = globalThis.document
  const pendingCleanup = []
  const state = { clicked: false, removed: false, file: null }
  const link = {
    click() {
      if (failClick) throw new Error('Test download failure')
      state.clicked = true
    },
    remove() { state.removed = true },
  }
  globalThis.document = {
    createElement(tag) { assert.equal(tag, 'a'); return link },
    body: { appendChild(element) { assert.equal(element, link) } },
  }
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  })
  t.mock.method(URL, 'createObjectURL', (file) => {
    state.file = file
    return 'blob:quantpulse-test'
  })
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {})
  const fetchRequest = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Downloading an existing result must not make a network request.')
  })
  t.mock.method(globalThis, 'setTimeout', (callback) => { pendingCleanup.push(callback) })
  return { state, link, pendingCleanup, revoke, fetchRequest }
}

test('starts a browser download without fetching again and releases its URL', async (t) => {
  const browser = mockBrowser(t)
  downloadHistoryCsv(sampleResult())
  assert.equal(browser.link.download, 'AAPL_2024-01-02_2024-01-18_1d.csv')
  assert.equal(browser.link.href, 'blob:quantpulse-test')
  assert.equal(browser.state.clicked, true)
  assert.equal(browser.state.removed, true)
  assert.ok(browser.state.file.type.startsWith('text/csv'))
  assert.ok((await browser.state.file.text()).includes('2024-01-18'))
  assert.equal(browser.fetchRequest.mock.callCount(), 0)
  assert.equal(browser.revoke.mock.callCount(), 0)
  assert.equal(browser.pendingCleanup.length, 1)
  browser.pendingCleanup[0]()
  assert.deepEqual(browser.revoke.mock.calls[0].arguments, ['blob:quantpulse-test'])
})

test('cleans up temporary download resources if the browser click fails', (t) => {
  const browser = mockBrowser(t, true)
  assert.throws(() => downloadHistoryCsv(sampleResult()), /Test download failure/)
  assert.equal(browser.state.removed, true)
  browser.pendingCleanup[0]()
  assert.equal(browser.revoke.mock.callCount(), 1)
  assert.equal(browser.fetchRequest.mock.callCount(), 0)
})
