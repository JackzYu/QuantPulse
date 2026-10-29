# QuantPulse

A minimalist quantitative research platform with a green-and-white interface.

The project aims to support stock analysis, factor research, machine learning-based stock ranking, and strategy backtesting.

## Current Progress

- React frontend with a custom logo and basic styling
- Python virtual environment configured
- FastAPI `/stock` endpoint returns AAPL/MSFT mock data
- React input and Search button call the backend and show a result or generic error
- Standalone real historical-data sample with CSV/JSON snapshots and CSV reloading (learning stages A/B)
- Real `GET /history` endpoint with symbol/date validation, snapshot saving, and JSON responses (learning stage C)

The page still displays mock prices through `/stock`. Real historical data can be queried through `/history` or the standalone sample. Frontend date inputs, real records, and charts are the next learning steps.

## Tech Stack

- Frontend: React and Vite
- Backend: Python, FastAPI, and Uvicorn

## Project Structure

- `frontend/`: User interface and frontend code
- `backend/`: API and future quantitative research code

## Local Development

The commands below are for Windows Git Bash.

Open the project root directory in VS Code, then open two terminals.

### Start the Frontend

```bash
npm --prefix frontend run dev
```

Open the URL shown in the terminal, usually:
http://localhost:5173/

### Start the Backend

```bash
./backend/.venv/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload
```

This command uses the virtual environment's Python directly, so manual activation is not required.

Backend endpoint:
http://127.0.0.1:8000/

### Stop the Services

Press `Ctrl + C` in each terminal.

## Environment Notes

These startup commands assume dependencies are already installed and the backend virtual environment exists.

You do not need to reinstall dependencies or recreate the virtual environment each day.

When setting up the project on another computer, install dependencies and create a new local virtual environment.

Do not commit `.venv`, `node_modules`, or files containing secrets.

## Stage A: Download the First Real Historical Prices

In **Windows Git Bash**, first navigate to the project root:

```bash
cd "/c/Users/billy/Desktop/github repos/QuantPulse"
./backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
./backend/.venv/Scripts/python.exe backend/history_sample.py
```

Both Python commands use the existing virtual environment directly. Manual activation and running FastAPI or the frontend are not required. For subsequent runs, use only the last command.

The script uses **yfinance**, an unofficial open-source package, to request AAPL daily historical prices from Yahoo Finance for `2024-01-02 <= date < 2024-01-10`. The end date is exclusive. The expected result is six trading days, with only the first five rows displayed; weekends have no trading records. Failures produce an error and a nonzero exit status. Mock data is never substituted.

Verified on October 29, 2026: Python 3.12.10, yfinance 1.7.0, and pandas 3.1.0 returned six rows from January 2 through January 9, 2024, in the America/New_York time zone, with exit code 0. Syntax checks and `pip check` also passed. The initial request in the restricted execution environment failed with exit code 1; the request succeeded after network access was granted. This verifies that particular symbol and period, not the availability of every symbol or future request.

The current dependency versions may display `Pandas4Warning` inside yfinance about future removal of the `inplace` argument. Downloads still succeeded, and warnings were not suppressed. Recheck compatibility when upgrading dependencies. `timeout=15` applies to individual requests that support this option, not a 15-second deadline for the entire operation.

The return value is a pandas `DataFrame`: an in-memory table with named columns and a date index in the exchange's time zone. Fields:

| Field | Meaning |
| --- | --- |
| Date index | The trading date represented by the row |
| Open / High / Low / Close | Daily opening, highest, lowest, and closing prices; this script uses adjusted prices |
| Volume | Shares traded as supplied by the provider; not scaled by the `auto_adjust` price ratio |
| Dividends | Dividend amount on that date; usually 0 when there is no event |
| Stock Splits | Split ratio on that date; usually 0 when there is no event |

The download function explicitly sets `auto_adjust=True`: yfinance adjusts OHLC using the ratio of Yahoo's adjusted close to close, accounting for splits and dividends. These values support continuous historical comparisons; they are neither unadjusted historical trade quotes nor real-time prices. Later corporate actions or data revisions may change adjusted historical values on a future download. `repair=False` disables additional package-level repairs. `keepna=True` preserves missing rows for inspection and cleanup by `prepare_history()`. Rounding to four decimal places is for terminal display only.

Sample script data flow: Yahoo HTTP response -> yfinance parsing and adjustment -> Python `history` DataFrame -> cleaned table -> CSV/JSON snapshot -> `saved_history` DataFrame reloaded from CSV. The terminal displays the first five rows of both downloaded and reloaded data. The standalone script does not send this data to FastAPI, frontend JavaScript objects, or React state.

Stage A originally only printed prices. Stage B added the snapshot and reload functionality below. The `history` variable does not survive program exit, but CSV and JSON files written to disk remain available. `backend/.cache/yfinance/` holds the package's internal time zone and cookie cache and is ignored by Git.

## Stage B: Save and Reload the First Snapshot

Run `backend/history_sample.py` as shown above. No additional dependencies or running frontend/backend services are required. Each run requests data from Yahoo again and creates a separate directory on success:

```text
backend/data/
  AAPL_2024-01-02_2024-01-10_<UTC_fetch_timestamp>/
    prices.csv
    metadata.json
```

In the directory name, `2024-01-10` is still the exclusive end date. The timestamp includes microseconds, and `Z` indicates UTC. Paths are resolved relative to the script location rather than the terminal's working directory; the terminal prints the full paths. Saving an identical timestamped directory again raises an error instead of overwriting the existing snapshot.

In the VS Code Explorer, expand `backend -> data -> the snapshot directory` and open the files. You can also open `prices.csv` in Excel. CSV columns:

```text
date,open,high,low,close,volume
```

`date` is the exchange-local trading date as a `YYYY-MM-DD` string. The CSV omits the extra pandas row index, and prices are not rounded on save. Snapshots currently store OHLCV only; dividend and split event columns are not saved separately. Prices use the adjustment basis described above.

Start with these three steps in `history_sample.py`:

```python
csv_path, metadata_path = save_snapshot(...)
saved_history = pd.read_csv(csv_path)
print(saved_history.head(5))
```

`save_snapshot(...)` is a project function defined in `backend/snapshots.py`:

- `prepare_history(...)` accepts the downloaded table and returns a cleaned table plus removal counts. It preserves local trading dates, treats invalid numbers and infinity as missing, drops incomplete OHLCV rows, restricts the date range, removes duplicates, and sorts dates in ascending order. For duplicate dates, it keeps the last complete row in source order. Volume must be a nonnegative integer. It never fills weekends, holidays, or missing prices, and nothing is saved if no valid rows remain.
- `prices.to_csv(csv_path, index=False, encoding="utf-8")` writes the cleaned in-memory table to disk. `index=False` omits the extra pandas row index.
- `metadata.json` records the symbol, requested range and end-date rule, fetch time, provider and package version, price basis, source time zone, actual dates, row count, and removal counts. Stage B initially did not record currency. Starting in Stage C, the code reads `currency` from the price response metadata; missing currency remains JSON `null` rather than being guessed.
- Metadata uses plain Python strings, integers, booleans, and `None`. `json.dumps(..., allow_nan=False)` produces JSON text, converts `None` to JSON `null`, and rejects nonstandard JSON `NaN`/`Infinity` values.
- `pd.read_csv(csv_path)` reads the disk file into a new in-memory table. `saved_history` and the downloaded `history` are separate variables. The reloaded table contains only saved, cleaned columns, and dates initially remain strings.

**Snapshots and caches:** A snapshot preserves one download and its provenance for inspection and reproducibility. A cache is typically read automatically on later queries to reduce repeated requests. These market data snapshots are not reused automatically, so this is not a market data cache. The current dataset is small and intended for learning and manual inspection; CSV/JSON is sufficient without a database.

Git ignores `backend/data/`, virtual environments, internal caches, and `.env` files. No market data was committed, and no Git commit or push was performed during implementation.

Run offline tests from the project root in Windows Git Bash; manual virtual environment activation is not required:

```bash
./backend/.venv/Scripts/python.exe -m unittest discover -s backend -p test_snapshots.py -v
```

Tests use explicitly synthetic fixtures, never fallback data for failed real queries. On October 29, 2026, all four snapshot tests passed, and an independent live download, save, and reload succeeded with six AAPL rows from January 2 through January 9, 2024. Expected terminal messages include `CSV saved to:`, `Metadata saved to:`, and `CSV reloaded: 6 rows`. If saving fails, check the printed path and directory write permissions. A failed download does not create a new snapshot or automatically return an old one as a fresh result.

## Stage C: Query Real Historical Prices Through FastAPI

This stage adds `/history`. The existing `/stock` mock endpoint is unchanged and still used by the frontend. The script's yfinance download logic was moved to `backend/market_data.py` for reuse by both the script and API. No production dependencies were added; test dependencies are recorded in `backend/requirements-dev.txt`.

Start the backend from the project root in **Windows Git Bash**. Manual virtual environment activation is not required:

```bash
./backend/.venv/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload
```

If the backend is already running with `--reload`, saving a file reloads the application. If the port is in use, press `Ctrl+C` in the original terminal to stop the old server before starting another instance. Open:

- Interactive API documentation: <http://127.0.0.1:8000/docs>. Expand `GET /history`, click **Try it out**, fill in the parameters, and click **Execute**.
- Real price query: <http://127.0.0.1:8000/history?symbol=AAPL&start=2024-01-02&end=2024-01-09>.
- Empty weekend query: <http://127.0.0.1:8000/history?symbol=AAPL&start=2024-01-06&end=2024-01-07>.

### Request Rules

`symbol`, `start`, and `end` are required. Symbols are trimmed and uppercased. They must start with a letter, followed by letters, digits, periods, or hyphens, up to 20 characters total (for example, AAPL, SPY, or BRK-B). This validates the format, not the provider's support for a symbol.

Dates must use the exact `YYYY-MM-DD` format, and the start date must not be after the end date. **Both API dates are inclusive**, and a single-day query is allowed. Yahoo uses an exclusive end date, so the API adds one day to `end` before downloading. API `end=2024-01-09`, for example, becomes `end_date_exclusive=2024-01-10` in the download function and snapshot metadata. The end date cannot be 9999-12-31 because adding another day would overflow.

### JSON Response

| Field | Meaning |
| --- | --- |
| `symbol` | Normalized query symbol |
| `start_date` / `end_date` / `end_date_inclusive` | Requested range; the inclusive end-date flag is always true |
| `interval` | `1d`, daily |
| `source` / `access_library` | Yahoo Finance / yfinance, an unofficial tool |
| `price_basis` | `split_and_dividend_adjusted_ohlc`: OHLC adjusted for splits and dividends |
| `currency` | Currency from Yahoo price metadata, such as USD; null if unknown |
| `fetched_at_utc` | Fetch time as an ISO 8601 UTC string |
| `row_count` | Number of returned rows |
| `actual_start_date` / `actual_end_date` | Actual trading date range; null when no rows are available |
| `data` | Rows in ascending date order, each containing date/open/high/low/close/volume |
| `snapshot` | Local root directory and relative file paths; null when empty. These are not HTTP download links |
| `message` | Explanation for an empty result; null when records are returned |
| `cleanup` | Cleanup statistics when a snapshot exists |

Each row's `date` is an exchange-local `YYYY-MM-DD` string. Prices are numeric, and volume is an integer. Responses contain historical daily bars, not real-time quotes. A bar for a trading session still in progress may be incomplete; live verification used a completed historical period.

### Real Data Flow

```text
Browser GET /history?symbol=...&start=...&end=...
  -> main.py: receive and validate parameters, then add one day to the end date
  -> market_data.py: use yfinance to send HTTP requests to Yahoo
  -> parse Yahoo's response into history (a Python DataFrame) and currency
  -> snapshots.py: clean with prepare_history, then save CSV and JSON metadata
  -> main.py: use read_csv to create saved_history
  -> saved_history.to_dict(orient="records"): convert rows to Python dictionaries
  -> return the Python result dictionary; FastAPI serializes it as a JSON response
```

Opening the endpoint in a browser displays JSON text. The real endpoint is not yet connected to React. In the next stage, the frontend will use `response.json()` to parse backend JSON into a JavaScript object and a setter to store it in React state.

### Errors and Empty Results

| Condition | HTTP Status and Behavior |
| --- | --- |
| Empty symbol, invalid format, invalid date, or reversed date range | 400, with an explanatory `detail` string; Yahoo is not contacted |
| Missing required parameter | 422; FastAPI's default `detail` is a list of errors |
| Provider returns an empty table | 200 with `data=[]`, `row_count=0`, `snapshot=null`, and a message |
| yfinance reports missing prices, but this response includes matching symbol/exchange metadata and no explicit Yahoo error | 200 with an empty result; verified with a weekend period |
| Provider rate limit | 503; `Retry-After: 60` suggests a wait time but does not guarantee recovery after 60 seconds |
| Recognized network timeout | 504 |
| Other provider error or unusable source records | 502; the symbol/range may be unavailable or the provider may have failed, so an invalid symbol is not assumed |
| Local snapshot write/read failure | 500 |

Yahoo/yfinance cannot always reliably distinguish an invalid symbol from a service failure. Unknown or ambiguous provider errors therefore return 502 rather than being universally treated as empty results or 404 responses. Mock data and old snapshots never conceal a failure. Each successful query with records saves a new snapshot; automatic market data caching is not implemented.

Downloads use `timeout=15` for individual requests supporting that parameter. yfinance may also perform preliminary time zone or cookie requests with its own timeout settings, so this is not a hard 15-second deadline for the full endpoint.

### Verification

Install test dependencies and run offline tests from the project root in Windows Git Bash. Manual virtual environment activation is not required:

```bash
./backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
./backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_*.py' -v
```

Dependencies are already installed in the current environment and do not need to be reinstalled on every run. httpx2 is required by the installed FastAPI/Starlette test client. Verified on October 29, 2026: all 16 offline tests, syntax checks, and `pip check` passed. A temporary Uvicorn server handled a real HTTP query for AAPL from January 2 through January 9, 2024, returning and saving six rows in USD. The weekend query returned 200 with an empty result, and reversed dates returned 400. The temporary verification server was stopped. Rate limits, timeouts, and other provider failures were tested with mocks rather than intentionally triggering live rate limits. Existing pandas deprecation warnings may still appear.

Suggested reading order: `get_history()` in `main.py`, then `download_history()` in `market_data.py`, then `snapshots.py`. Read the tests afterward.

References: [FastAPI query parameters](https://fastapi.tiangolo.com/tutorial/query-params/) and [FastAPI error handling](https://fastapi.tiangolo.com/tutorial/handling-errors/).

## Data Source Selection (Reviewed October 29, 2026)

| Option | Cost and Credentials | Daily History and Limits | Adjustments, Maintenance, and Usage Terms |
| --- | --- | --- | --- |
| Yahoo Finance + yfinance | Usually free; no account or API key required | U.S. stocks and ETFs with symbol-dependent history; no guaranteed fixed request allowance, and rate limits may apply | Automatic OHLC adjustments and dividend/split events; community-maintained and affected by Yahoo API changes; maintainers specify personal use |
| Alpha Vantage | Free key requires registration; standard free limit is 25 requests/day | Over 25 years of daily history, but free compact output includes only the latest 100 points; full daily history requires a paid plan | Daily Adjusted is a paid endpoint with adjusted close and events; official documentation and support, subject to quotas and availability; personal noncommercial use does not grant public redistribution rights |

The current project uses yfinance to learn data acquisition and pandas without initial registration or payment. Before public deployment or redistribution, verify and obtain the appropriate data rights. An open-source package license does not grant unrestricted rights to distribute the underlying market data.

References: [yfinance documentation](https://ranaroussi.github.io/yfinance/), [history implementation and parameters](https://github.com/ranaroussi/yfinance/blob/main/yfinance/scrapers/history.py), [adjustment calculations](https://github.com/ranaroussi/yfinance/blob/main/yfinance/utils.py), [Alpha Vantage API](https://www.alphavantage.co/documentation/), [free usage limits](https://www.alphavantage.co/support/), and [terms of service](https://www.alphavantage.co/terms_of_service/).
