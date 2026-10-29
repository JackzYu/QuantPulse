from datetime import date, datetime, timedelta, timezone
import json
import re

import pandas as pd
from curl_cffi.requests.exceptions import Timeout as CurlTimeout
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from requests.exceptions import Timeout as RequestsTimeout
from yfinance.exceptions import YFRateLimitError

from market_data import download_history
from snapshots import DATA_DIRECTORY, save_snapshot

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "QuantPulse backend is running"}

@app.get("/stock")
def get_stock(symbol: str = "AAPL"):
    stocks = {
        "AAPL": {"symbol": "AAPL", "name": "Apple", "price": 200},
        "MSFT": {"symbol": "MSFT", "name": "Microsoft", "price": 400}
    }
    if symbol not in stocks:
        raise HTTPException(status_code=404, detail="Stock not found")
    return stocks[symbol]


@app.get("/history")
def get_history(symbol: str, start: str, end: str):
    """Query adjusted daily prices with inclusive YYYY-MM-DD start and end dates."""
    symbol = symbol.strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9.-]{0,19}", symbol):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid U.S. stock or ETF symbol, such as AAPL, MSFT, or SPY (up to 20 characters).",
        )

    try:
        start_date = date.fromisoformat(start)
        end_date = date.fromisoformat(end)
        if start_date.isoformat() != start or end_date.isoformat() != end:
            raise ValueError("Use YYYY-MM-DD.")
        end_date_exclusive = (end_date + timedelta(days=1)).isoformat()
    except (ValueError, OverflowError):
        raise HTTPException(status_code=400, detail="Use valid dates in YYYY-MM-DD format. The end date must be earlier than 9999-12-31.")
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="The start date must be on or before the end date.")

    try:
        history, currency = download_history(symbol, start, end_date_exclusive)
    except YFRateLimitError:
        raise HTTPException(
            status_code=503, detail="The market data provider is temporarily rate limiting requests. Please try again later.",
            headers={"Retry-After": "60"},
        )
    except (CurlTimeout, RequestsTimeout, TimeoutError):
        raise HTTPException(status_code=504, detail="The market data request timed out. Please try again later.")
    except Exception:
        # Provider errors do not prove a symbol is invalid. Never substitute old snapshots or mock data.
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve historical prices. Check the symbol and date range, or try again later. The data provider may be temporarily unavailable.",
        )

    fetched_at = datetime.now(timezone.utc)
    result = {
        "symbol": symbol,
        "start_date": start,
        "end_date": end,
        "end_date_inclusive": True,
        "interval": "1d",
        "source": "Yahoo Finance",
        "access_library": "yfinance",
        "price_basis": "split_and_dividend_adjusted_ohlc",
        "currency": currency,
        "fetched_at_utc": fetched_at.isoformat(),
        "row_count": 0,
        "actual_start_date": None,
        "actual_end_date": None,
        "data": [],
        "snapshot": None,
        "message": None,
    }
    if history.empty:
        result["message"] = "No daily records were returned for this symbol and date range. This alone does not mean the symbol is invalid."
        return result

    try:
        csv_path, metadata_path = save_snapshot(
            history, symbol, start, end_date_exclusive, fetched_at,
            output_directory=DATA_DIRECTORY, currency=currency,
        )
        saved_history = pd.read_csv(csv_path)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except OSError:
        raise HTTPException(status_code=500, detail="Unable to save or read the market data snapshot. Check the server's data directory permissions.")
    except (ValueError, KeyError):
        raise HTTPException(status_code=502, detail="The data provider's records could not be processed into valid daily prices. Adjust the query or try again later.")

    # Convert each row to a Python dictionary; FastAPI serializes the result as a JSON response.
    result["data"] = saved_history.to_dict(orient="records")
    result["row_count"] = len(saved_history)
    result["actual_start_date"] = metadata["actual_start_date"]
    result["actual_end_date"] = metadata["actual_end_date"]
    result["cleanup"] = metadata["cleanup"]
    result["snapshot"] = {
        "root": "backend/data",
        "csv": csv_path.relative_to(DATA_DIRECTORY).as_posix(),
        "metadata": metadata_path.relative_to(DATA_DIRECTORY).as_posix(),
    }
    return result
