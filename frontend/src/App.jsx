import { useEffect, useRef, useState } from 'react'
import logo from './assets/logo.png'
import './App.css'
function App() {
  const [symbol, setSymbol] = useState('AAPL')
  const [startDate, setStartDate] = useState('2024-01-02')
  const [endDate, setEndDate] = useState('2024-01-09')
  const [result, setResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const activeRequest = useRef(null)

  // Cancel any unfinished request when this component leaves the page.
  useEffect(() => {
    return () => activeRequest.current?.abort()
  }, [])

  function searchStock(event) {
    event.preventDefault()
    activeRequest.current?.abort()
    activeRequest.current = null
    setResult(null)
    setErrorMessage('')
    setIsLoading(false)

    if (startDate > endDate) {
      setErrorMessage('The start date must be on or before the end date.')
      return
    }

    const controller = new AbortController()
    activeRequest.current = controller
    setIsLoading(true)

    const parameters = new URLSearchParams({
      symbol: symbol.trim().toUpperCase(),
      start: startDate,
      end: endDate,
    })

    fetch(`http://127.0.0.1:8000/history?${parameters}`, {
      signal: controller.signal,
    })
      .then((response) => {
        return response.json().then((body) => {
          if (!response.ok) {
            // FastAPI returns text for our errors and a list for missing parameters.
            const detail = Array.isArray(body.detail)
              ? body.detail.map((item) => item.msg).join(' ')
              : body.detail
            throw new Error(detail || 'Unable to load historical prices. Please try again.')
          }
          return body
        })
      })
      .then((body) => {
        // A previous request must never overwrite the latest query.
        if (activeRequest.current === controller) {
          setResult(body)
        }
      })
      .catch((error) => {
        if (activeRequest.current !== controller || error.name === 'AbortError') return
        setErrorMessage(error instanceof TypeError
          ? 'Could not reach the data service. Please try again.'
          : error.message)
      })
      .finally(() => {
        if (activeRequest.current === controller) setIsLoading(false)
      })
  }

  const rows = result ? result.data : []
  const latestRow = rows[rows.length - 1]
  const priceFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="QuantPulse home">
          <img src={logo} alt="" className="brand-logo" />
          <span>QuantPulse</span>
        </a>
        <span className="workspace-title">Historical research</span>
        <span className="header-note">DAILY DATA</span>
      </header>

      <main className="workspace">
        <aside className="query-panel" aria-labelledby="query-heading">
          <div className="panel-heading">
            <h2 id="query-heading">Query</h2>
            <span className="panel-marker" aria-hidden="true" />
          </div>
          <form className="query-form" onSubmit={searchStock}>
            <label htmlFor="symbol">Symbol</label>
            <input
              id="symbol"
              type="text"
              placeholder="AAPL"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <label htmlFor="start-date">Start date</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
            <label htmlFor="end-date">End date</label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
            <p className="field-hint">Both dates are included.</p>
            <button className="search-button" type="submit">
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </form>
          <div className="query-note">
            <h3>Historical prices</h3>
            <p>Explore daily prices for a U.S. stock or ETF. Weekends and market holidays may have no records.</p>
          </div>
        </aside>

        <section className="history-panel" aria-labelledby="history-heading" aria-busy={isLoading}>
          <div className="panel-heading">
            <h1 id="history-heading">Daily history</h1>
            <span className="interval-label">1D</span>
          </div>

          <div className="query-feedback" aria-live="polite">
            {isLoading && (
              <div className="empty-state" role="status">
                <span className="status-line"><span className="status-dot" />Fetching historical prices</span>
                <p>Requesting daily records for {symbol.trim().toUpperCase()}.</p>
              </div>
            )}
            {errorMessage && (
              <div className="empty-state error-state" role="alert">
                <h2>Unable to load prices</h2>
                <p>{errorMessage}</p>
                <span className="muted">Review your query or try again.</span>
              </div>
            )}
            {!isLoading && !errorMessage && !result && (
              <div className="empty-state">
                <span className="eyebrow">YOUR RESEARCH STARTS HERE</span>
                <h2>A symbol. A time frame.</h2>
                <p>Choose a stock or ETF and a date range to inspect its historical prices.</p>
              </div>
            )}
            {result && rows.length === 0 && (
              <div className="empty-state">
                <h2>No daily records</h2>
                <p>{result.message}</p>
                <span className="muted">Try a range that includes trading days.</span>
              </div>
            )}
          </div>

          {latestRow && (
            <>
              <div className="price-summary">
                <div className="symbol-line">
                  <h2>{result.symbol}</h2>
                  <span className="muted">Historical close</span>
                </div>
                <div className="close-price">
                  {priceFormatter.format(latestRow.close)}
                  <span>{result.currency || 'Currency unknown'}</span>
                </div>
                <p className="price-caption">As of {latestRow.date} <span>·</span> Split &amp; dividend adjusted</p>
              </div>

              <div className="records-heading">
                <h2>Daily records</h2>
                <span>{rows.length} trading {rows.length === 1 ? 'day' : 'days'}</span>
              </div>
              <div className="table-scroll">
                <table className="price-table">
                  <caption className="visually-hidden">Daily adjusted historical prices for {result.symbol}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Open</th>
                      <th scope="col">High</th>
                      <th scope="col">Low</th>
                      <th scope="col">Close</th>
                      <th scope="col">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row) => (
                      <tr key={row.date}>
                        <th scope="row">{row.date}</th>
                        <td>{priceFormatter.format(row.open)}</td>
                        <td>{priceFormatter.format(row.high)}</td>
                        <td>{priceFormatter.format(row.low)}</td>
                        <td className="close-cell">{priceFormatter.format(row.close)}</td>
                        <td>{row.volume.toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="table-note">Showing {Math.min(rows.length, 10)} of {rows.length} records. Prices are rounded for display only.</p>
            </>
          )}
        </section>

        <aside className="details-panel" aria-labelledby="details-heading">
          <div className="panel-heading">
            <h2 id="details-heading">Data details</h2>
          </div>
          <dl className="details-list">
            <div><dt>Symbol</dt><dd>{result ? result.symbol : '—'}</dd></div>
            <div><dt>Records</dt><dd>{result ? result.row_count : '—'}</dd></div>
            <div><dt>Currency</dt><dd>{result ? result.currency || 'Unknown' : '—'}</dd></div>
            <div><dt>First record</dt><dd>{result?.actual_start_date || '—'}</dd></div>
            <div><dt>Last record</dt><dd>{result?.actual_end_date || '—'}</dd></div>
          </dl>
          <div className="details-section">
            <h3>Requested range</h3>
            <p>{result ? `${result.start_date} — ${result.end_date}` : 'No query yet'}</p>
          </div>
          <div className="details-section">
            <h3>Source</h3>
            <p>{result ? result.source : 'Yahoo Finance'}</p>
            <p className="muted">Accessed via yfinance, an unofficial tool.</p>
          </div>
          <div className="details-section">
            <h3>Price basis</h3>
            <p>Split &amp; dividend adjusted</p>
            <p className="muted">Daily historical prices, not real-time quotes.</p>
          </div>
          {result && (
            <div className="details-section">
              <h3>Fetched</h3>
              <p>{new Date(result.fetched_at_utc).toLocaleString('en-US', { timeZoneName: 'short' })}</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
