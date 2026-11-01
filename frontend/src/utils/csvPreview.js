export function parseCsvPreview(text, maxRows = 6, preserveEmptyRows = false) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(value.trim());
      if (preserveEmptyRows || row.some((cell) => cell)) {
        rows.push(row);
      }
      row = [];
      value = '';
      if (rows.length >= maxRows) {
        break;
      }
    } else {
      value += char;
    }
  }

  if (rows.length < maxRows && (value || row.length)) {
    row.push(value.trim());
    if (preserveEmptyRows || row.some((cell) => cell)) {
      rows.push(row);
    }
  }

  return rows;
}

export function serializeCsv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
