"""Yahoo Finance download logic shared by the sample script and FastAPI."""

from pathlib import Path

import pandas as pd
import yfinance as yf
from yfinance.exceptions import YFPricesMissingError


REQUEST_TIMEOUT_SECONDS = 15


def download_history(symbol, start_date, end_date_exclusive):
    """Return (price DataFrame, currency or None). The caller handles provider errors."""
    cache_directory = Path(__file__).resolve().parent / ".cache" / "yfinance"
    yf.set_tz_cache_location(str(cache_directory))
    yf.config.debug.hide_exceptions = False

    ticker = yf.Ticker(symbol)
    try:
        history = ticker.history(
            start=start_date,
            end=end_date_exclusive,
            interval="1d",
            auto_adjust=True,
            actions=True,
            repair=False,
            keepna=True,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except YFPricesMissingError as error:
        # A nontrading period may have valid symbol metadata but no prices, which yfinance raises as an error.
        # Propagate missing symbol/exchange metadata or explicit Yahoo errors instead of treating them as empty data.
        metadata = ticker.history_metadata
        if (error.yahoo_reason is not None
                or metadata.get("symbol") != symbol
                or not metadata.get("exchangeTimezoneName")):
            raise
        return pd.DataFrame(), metadata.get("currency")
    # Read the currency included in the price response without requesting company information.
    currency = None
    if not history.empty:
        reported_currency = ticker.history_metadata.get("currency")
        if isinstance(reported_currency, str) and reported_currency:
            currency = reported_currency
    return history, currency
