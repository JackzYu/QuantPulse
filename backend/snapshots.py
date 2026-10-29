"""Clean Yahoo daily prices and save an independent download snapshot."""

from datetime import timezone
import json
from pathlib import Path

import pandas as pd
import yfinance as yf


DATA_DIRECTORY = Path(__file__).resolve().parent / "data"
PRICE_COLUMNS = ["Open", "High", "Low", "Close", "Volume"]


def prepare_history(history, start_date, end_date_exclusive):
    """Return cleaned OHLCV rows and counts of records removed during cleanup."""
    if not isinstance(history.index, pd.DatetimeIndex):
        raise ValueError("History must have a DatetimeIndex.")

    prices = history[PRICE_COLUMNS].copy()
    prices.columns = ["open", "high", "low", "close", "volume"]
    # Keep exchange-local dates; converting to UTC first could change the trading date.
    prices.insert(0, "date", history.index.strftime("%Y-%m-%d"))
    prices = prices.reset_index(drop=True)
    rows_received = len(prices)

    # Treat invalid numbers and infinity as missing values. Never fabricate prices.
    numeric_columns = ["open", "high", "low", "close", "volume"]
    for column in numeric_columns:
        prices[column] = pd.to_numeric(prices[column], errors="coerce")
    prices = prices.replace([float("inf"), -float("inf")], float("nan"))
    prices = prices.dropna(subset=["date", *numeric_columns])
    rows_missing_or_nonfinite = rows_received - len(prices)

    in_range = (prices["date"] >= start_date) & (prices["date"] < end_date_exclusive)
    rows_outside_range = int((~in_range).sum())
    prices = prices.loc[in_range]

    # For duplicate dates, keep the last complete row in the provider's original order.
    rows_before_deduplication = len(prices)
    prices = prices.drop_duplicates(subset="date", keep="last")
    rows_duplicate_dates = rows_before_deduplication - len(prices)
    prices = prices.sort_values("date").reset_index(drop=True)

    if prices.empty:
        raise ValueError("No valid daily rows remain; no snapshot saved.")
    if ((prices["volume"] < 0) | (prices["volume"] % 1 != 0)).any():
        raise ValueError("Volume must contain non-negative whole numbers.")
    prices["volume"] = prices["volume"].astype("int64")

    cleanup = {
        "rows_received": rows_received,
        "rows_missing_or_nonfinite_removed": rows_missing_or_nonfinite,
        "rows_outside_range_removed": rows_outside_range,
        "rows_duplicate_dates_removed": rows_duplicate_dates,
    }
    return prices, cleanup


def save_snapshot(history, symbol, start_date, end_date_exclusive, fetched_at,
                  output_directory=DATA_DIRECTORY, currency=None):
    """Save CSV/JSON files and return their Paths. This step uses adjusted daily prices."""
    prices, cleanup = prepare_history(history, start_date, end_date_exclusive)
    fetched_at_utc = fetched_at.astimezone(timezone.utc)
    timestamp = fetched_at_utc.strftime("%Y%m%dT%H%M%S%fZ")
    snapshot_directory = output_directory / f"{symbol}_{start_date}_{end_date_exclusive}_{timestamp}"
    csv_path = snapshot_directory / "prices.csv"
    metadata_path = snapshot_directory / "metadata.json"

    metadata = {
        "symbol": symbol,
        "requested_start_date": start_date,
        "requested_end_date_exclusive": end_date_exclusive,
        "fetched_at_utc": fetched_at_utc.isoformat(),
        "source": "Yahoo Finance",
        "access_library": "yfinance",
        "access_library_version": yf.__version__,
        "interval": "1d",
        "price_basis": "split_and_dividend_adjusted_ohlc",
        "auto_adjust": True,
        "volume_basis": "Yahoo-supplied; not scaled by auto_adjust",
        "currency": currency,
        "currency_note": "Reported by Yahoo history metadata." if currency else "Unknown.",
        "source_timezone": str(history.index.tz) if history.index.tz else None,
        "actual_start_date": str(prices["date"].iloc[0]),
        "actual_end_date": str(prices["date"].iloc[-1]),
        "row_count": len(prices),
        "csv_file": csv_path.name,
        "date_format": "YYYY-MM-DD (exchange-local trading date)",
        "missing_value_policy": "Drop incomplete OHLCV rows; never fill prices or dates.",
        "duplicate_policy": "Keep the last complete row for each date in source order.",
        "cleanup": cleanup,
    }
    # Use plain Python metadata values and reject nonstandard JSON NaN/Infinity values.
    metadata_text = json.dumps(metadata, ensure_ascii=False, indent=2, allow_nan=False)

    # Fail if the directory already exists to avoid overwriting a saved snapshot.
    snapshot_directory.mkdir(parents=True, exist_ok=False)
    prices.to_csv(csv_path, index=False, encoding="utf-8")
    metadata_path.write_text(metadata_text + "\n", encoding="utf-8")
    return csv_path, metadata_path
