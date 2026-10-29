"""Stages A/B: download real daily prices, save a snapshot, and reload the CSV."""

from datetime import datetime, timezone
import sys

import pandas as pd
import yfinance as yf

from snapshots import save_snapshot
from market_data import download_history


SYMBOL = "AAPL"
START_DATE = "2024-01-02"
END_DATE_EXCLUSIVE = "2024-01-10"


def main():
    print(f"Source: Yahoo Finance via yfinance {yf.__version__} (unofficial)")
    print(f"Symbol: {SYMBOL}")
    print(f"Range: {START_DATE} <= date < {END_DATE_EXCLUSIVE}")
    print("Interval: 1d; OHLC: split/dividend-adjusted (auto_adjust=True)")
    print("Volume: supplied by Yahoo; not scaled by auto_adjust")
    print("Request timeout: 15 seconds per supported HTTP request")
    print("Downloading historical data...", flush=True)

    try:
        history, currency = download_history(SYMBOL, START_DATE, END_DATE_EXCLUSIVE)
    except Exception as error:
        # The provider may time out, rate limit requests, or fail. Never substitute mock data.
        print(
            f"Download failed ({type(error).__name__}). "
            "Check network access, Yahoo availability, and rate limits. "
            "No mock data was substituted.",
            file=sys.stderr,
        )
        return 1

    if history.empty:
        print(
            "No rows returned. This alone does not prove the symbol is invalid. "
            "No mock data was substituted.",
            file=sys.stderr,
        )
        return 1

    fetched_at = datetime.now(timezone.utc)
    print(f"Currency: {currency or 'unknown'}")
    print(f"Python object: {type(history).__module__}.{type(history).__name__}")
    print(f"Rows received: {len(history)}")
    print(f"Date index timezone: {history.index.tz}")
    print(f"Actual dates: {history.index.min().date()} to {history.index.max().date()}")
    print("First 5 rows (rounded for display only):")
    columns = ["Open", "High", "Low", "Close", "Volume", "Dividends", "Stock Splits"]
    print(history[columns].head(5).round(4).to_string())
    try:
        csv_path, metadata_path = save_snapshot(
            history, SYMBOL, START_DATE, END_DATE_EXCLUSIVE, fetched_at,
            currency=currency,
        )
        # Use a separate variable for the table reloaded from disk.
        saved_history = pd.read_csv(csv_path)
    except (OSError, ValueError, KeyError) as error:
        print(f"Snapshot save/read failed: {error}", file=sys.stderr)
        return 1

    print(f"CSV saved to: {csv_path}")
    print(f"Metadata saved to: {metadata_path}")
    print(f"CSV reloaded: {len(saved_history)} rows")
    print("First 5 rows read from disk:")
    print(saved_history.head(5).round(4).to_string(index=False))
    print("The existing /stock API and page still use mock data.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
