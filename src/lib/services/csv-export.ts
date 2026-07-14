export function exportCsv<T extends Record<string, any>>(
  data: T[],
  columns: { label: string; value: (row: T) => any }[],
  filename: string
) {
  if (!data.length) return

  const headers = columns.map((c) => c.label).join(',')
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = c.value(row)
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`
        return val ?? ''
      })
      .join(',')
  )

  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

