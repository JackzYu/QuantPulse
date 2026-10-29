"""Test cleanup and storage with explicitly synthetic data and no external requests."""

from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest

import pandas as pd

from snapshots import prepare_history, save_snapshot


def sample_history():
    # Synthetic test data; never display it as real prices or use it as a fallback.
    return pd.DataFrame(
        {
            "Open": [30.0, 10.0, 31.0, None, float("inf"), 90.0],
            "High": [32.0, 12.0, 33.0, 22.0, 42.0, 92.0],
            "Low": [29.0, 9.0, 30.0, 19.0, 39.0, 89.0],
            "Close": [31.0, 11.0, 32.0, 21.0, 41.0, 91.0],
            "Volume": [300, 100, 310, 200, 400, 900],
        },
        index=pd.DatetimeIndex(
            ["2024-01-04", "2024-01-02", "2024-01-04",
             "2024-01-03", "2024-01-05", "2024-01-10"],
            tz="America/New_York", name="Date",
        ),
    )


class SnapshotTests(unittest.TestCase):
    def test_cleanup_and_source_unchanged(self):
        history = sample_history()
        original = history.copy(deep=True)
        prices, cleanup = prepare_history(history, "2024-01-02", "2024-01-10")
        self.assertEqual(prices["date"].tolist(), ["2024-01-02", "2024-01-04"])
        self.assertEqual(prices["close"].tolist(), [11.0, 32.0])
        self.assertEqual(prices["volume"].tolist(), [100, 310])
        self.assertEqual(cleanup, {
            "rows_received": 6,
            "rows_missing_or_nonfinite_removed": 2,
            "rows_outside_range_removed": 1,
            "rows_duplicate_dates_removed": 1,
        })
        pd.testing.assert_frame_equal(history, original)

    def test_csv_round_trip_and_strict_metadata(self):
        fetched_at = datetime(2026, 10, 29, 18, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            csv_path, metadata_path = save_snapshot(
                sample_history(), "AAPL", "2024-01-02", "2024-01-10",
                fetched_at, output_directory=Path(directory),
            )
            expected, _ = prepare_history(sample_history(), "2024-01-02", "2024-01-10")
            reloaded = pd.read_csv(csv_path)
            pd.testing.assert_frame_equal(reloaded, expected, check_dtype=False)
            metadata_text = metadata_path.read_text(encoding="utf-8")
            metadata = json.loads(metadata_text)
            self.assertEqual(metadata["symbol"], "AAPL")
            self.assertEqual(metadata["requested_end_date_exclusive"], "2024-01-10")
            self.assertEqual(metadata["row_count"], 2)
            self.assertEqual(metadata["source_timezone"], "America/New_York")
            self.assertEqual(metadata["price_basis"], "split_and_dividend_adjusted_ohlc")
            self.assertEqual(metadata["fetched_at_utc"], "2026-10-29T18:00:00+00:00")
            self.assertIsNone(metadata["currency"])
            self.assertNotIn("NaN", metadata_text)
            self.assertNotIn("Infinity", metadata_text)
            # Saving the same snapshot twice must fail without overwriting existing files.
            previous_bytes = csv_path.read_bytes()
            with self.assertRaises(FileExistsError):
                save_snapshot(
                    sample_history(), "AAPL", "2024-01-02", "2024-01-10",
                    fetched_at, output_directory=Path(directory),
                )
            self.assertEqual(csv_path.read_bytes(), previous_bytes)

    def test_all_missing_does_not_create_files(self):
        history = sample_history().iloc[[3]]
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "No valid daily rows"):
                save_snapshot(
                    history, "AAPL", "2024-01-02", "2024-01-10",
                    datetime.now(timezone.utc), output_directory=Path(directory),
                )
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_fractional_volume_is_rejected(self):
        history = sample_history().iloc[[1]].copy()
        history["Volume"] = 1.5
        with self.assertRaisesRegex(ValueError, "whole numbers"):
            prepare_history(history, "2024-01-02", "2024-01-10")


if __name__ == "__main__":
    unittest.main()
