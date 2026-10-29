"""Test HTTP parameters, errors, and snapshots with synthetic data and no network access."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from curl_cffi.requests.exceptions import Timeout as CurlTimeout
from fastapi.testclient import TestClient
import pandas as pd
from requests.exceptions import Timeout as RequestsTimeout
from yfinance.exceptions import YFPricesMissingError, YFRateLimitError, YFTzMissingError

from main import app
from market_data import download_history
from test_snapshots import sample_history


class HistoryApiTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        storage_patch = patch("main.DATA_DIRECTORY", self.directory)
        storage_patch.start()
        self.addCleanup(storage_patch.stop)
        provider_patch = patch("main.download_history", return_value=(sample_history(), "USD"))
        self.provider = provider_patch.start()
        self.addCleanup(provider_patch.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.query = {"symbol": "AAPL", "start": "2024-01-02", "end": "2024-01-04"}

    def test_success_normalizes_symbol_includes_end_and_saves_same_rows(self):
        response = self.client.get("/history", params={**self.query, "symbol": " aapl "})
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.provider.assert_called_once_with("AAPL", "2024-01-02", "2024-01-05")
        self.assertEqual(result["symbol"], "AAPL")
        self.assertEqual(result["currency"], "USD")
        self.assertEqual(result["source"], "Yahoo Finance")
        self.assertTrue(result["end_date_inclusive"])
        self.assertEqual(result["row_count"], 2)
        self.assertEqual([row["date"] for row in result["data"]], ["2024-01-02", "2024-01-04"])
        self.assertEqual(result["data"][-1]["close"], 32.0)
        self.assertNotIn("NaN", response.text)
        self.assertNotIn("Infinity", response.text)
        csv_path = self.directory / result["snapshot"]["csv"]
        metadata_path = self.directory / result["snapshot"]["metadata"]
        self.assertEqual(pd.read_csv(csv_path).to_dict(orient="records"), result["data"])
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        self.assertEqual(metadata["currency"], "USD")
        self.assertEqual(metadata["requested_end_date_exclusive"], "2024-01-05")

    def test_invalid_parameters_do_not_contact_provider(self):
        invalid_queries = [
            {"symbol": ""}, {"symbol": "   "}, {"symbol": "../AAPL"},
            {"symbol": "A" * 21}, {"start": "2024-02-30"},
            {"start": "20240102"}, {"start": "2024/01/02"},
            {"start": "2024-01-05"}, {"end": "9999-12-31"},
        ]
        for change in invalid_queries:
            with self.subTest(change=change):
                response = self.client.get("/history", params={**self.query, **change})
                self.assertEqual(response.status_code, 400)
                self.assertIsInstance(response.json()["detail"], str)
        self.provider.assert_not_called()
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_missing_parameters_are_reported_by_fastapi(self):
        self.assertEqual(self.client.get("/history").status_code, 422)
        self.provider.assert_not_called()

    def test_empty_data_does_not_save_or_claim_symbol_is_missing(self):
        self.provider.return_value = (pd.DataFrame(), None)
        response = self.client.get("/history", params=self.query)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["data"], [])
        self.assertEqual(result["row_count"], 0)
        self.assertIsNone(result["snapshot"])
        self.assertIn("does not mean the symbol is invalid", result["message"])
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_source_failures_have_distinct_http_statuses_and_no_fallback(self):
        cases = [
            (YFRateLimitError(), 503),
            (CurlTimeout("test timeout"), 504),
            (RequestsTimeout("test timeout"), 504),
            (TimeoutError(), 504),
            (RuntimeError("test provider failure"), 502),
            (YFPricesMissingError("TEST", "test missing prices"), 502),
            (YFTzMissingError("TEST"), 502),
        ]
        for error, expected_status in cases:
            with self.subTest(error=type(error).__name__):
                self.provider.side_effect = error
                response = self.client.get("/history", params=self.query)
                self.assertEqual(response.status_code, expected_status)
                self.assertIn("detail", response.json())
                self.assertNotIn("data", response.json())
                if expected_status == 503:
                    self.assertEqual(response.headers["Retry-After"], "60")
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_unusable_source_rows_are_not_returned_as_valid_prices(self):
        self.provider.return_value = (sample_history().iloc[[3]], "USD")
        response = self.client.get("/history", params=self.query)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_storage_failure_is_not_a_stock_not_found_error(self):
        with patch("main.save_snapshot", side_effect=PermissionError("test permission error")):
            response = self.client.get("/history", params=self.query)
        self.assertEqual(response.status_code, 500)
        self.assertIn("snapshot", response.json()["detail"])

    def test_unknown_currency_stays_null(self):
        self.provider.return_value = (sample_history(), None)
        response = self.client.get("/history", params=self.query)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["currency"])

    def test_existing_mock_endpoint_is_preserved(self):
        response = self.client.get("/stock", params={"symbol": "MSFT"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["price"], 400)
        self.provider.assert_not_called()


class DownloadHistoryTests(unittest.TestCase):
    def test_shared_downloader_uses_explicit_options_and_response_currency(self):
        with patch("market_data.yf.Ticker") as ticker_class:
            ticker = ticker_class.return_value
            ticker.history.return_value = sample_history()
            ticker.history_metadata = {"currency": "USD"}
            history, currency = download_history("SPY", "2024-01-02", "2024-01-05")
            ticker_class.assert_called_once_with("SPY")
            ticker.history.assert_called_once_with(
                start="2024-01-02", end="2024-01-05", interval="1d",
                auto_adjust=True, actions=True, repair=False, keepna=True, timeout=15,
            )
            self.assertIs(history, ticker.history.return_value)
            self.assertEqual(currency, "USD")

    def test_missing_prices_with_valid_response_metadata_is_empty(self):
        with patch("market_data.yf.Ticker") as ticker_class:
            ticker = ticker_class.return_value
            ticker.history.side_effect = YFPricesMissingError("AAPL", "weekend")
            ticker.history_metadata = {
                "symbol": "AAPL", "exchangeTimezoneName": "America/New_York", "currency": "USD",
            }
            history, currency = download_history("AAPL", "2024-01-06", "2024-01-08")
            self.assertTrue(history.empty)
            self.assertEqual(currency, "USD")

    def test_missing_prices_does_not_hide_malformed_response_or_explicit_error(self):
        cases = [
            (YFPricesMissingError("AAPL", "missing response"), {}),
            (YFPricesMissingError("AAPL", "error", yahoo_reason="test service failure"),
             {"symbol": "AAPL", "exchangeTimezoneName": "America/New_York"}),
        ]
        for error, metadata in cases:
            with self.subTest(error=str(error)):
                with patch("market_data.yf.Ticker") as ticker_class:
                    ticker = ticker_class.return_value
                    ticker.history.side_effect = error
                    ticker.history_metadata = metadata
                    with self.assertRaises(YFPricesMissingError):
                        download_history("AAPL", "2024-01-06", "2024-01-08")


if __name__ == "__main__":
    unittest.main()
