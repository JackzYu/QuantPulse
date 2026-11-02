// Export the completed query result, not the editable inputs or table preview.
export function createHistoryCsv(result) {
  if (!result || !Array.isArray(result.data) || result.data.length === 0) {
    throw new Error('No daily records are available to download.')
  }

  const columns = [
    'date', 'open', 'high', 'low', 'close', 'volume',
    'symbol', 'currency', 'interval', 'price_basis', 'source',
    'access_library', 'fetched_at_utc', 'start_date', 'end_date',
  ]
  const lines = [columns.join(',')]

  for (const row of result.data) {
    const values = [
      row.date, row.open, row.high, row.low, row.close, row.volume,
      result.symbol, result.currency, result.interval, result.price_basis,
      result.source, result.access_library, result.fetched_at_utc,
      result.start_date, result.end_date,
    ]
    // Quoting and escaping preserve commas, quotes, and line breaks inside fields.
    lines.push(values.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
  }

  return {
    filename: `${result.symbol}_${result.start_date}_${result.end_date}_${result.interval}.csv`,
    // A UTF-8 BOM helps Excel identify the file encoding on Windows.
    content: '\uFEFF' + lines.join('\r\n') + '\r\n',
  }
}

export function downloadHistoryCsv(result) {
  const { filename, content } = createHistoryCsv(result)
  const file = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const fileUrl = URL.createObjectURL(file)

  try {
    link.href = fileUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    // Let the browser begin the download before releasing the temporary URL.
    setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
  }
}
