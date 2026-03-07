export function formatTable(
  rows: string[][],
  headers: string[],
  emptyMessage = 'No data.',
): string {
  if (rows.length === 0) return emptyMessage;

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const pad = (val: string, width: number) => val.padEnd(width);

  const headerLine = headers.map((h, i) => pad(h, colWidths[i])).join('  ');
  const separator = '-'.repeat(headerLine.length);
  const dataLines = rows.map((row) => row.map((cell, i) => pad(cell, colWidths[i])).join('  '));

  return [headerLine, separator, ...dataLines].join('\n');
}
