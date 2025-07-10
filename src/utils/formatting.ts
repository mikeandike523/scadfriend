/**
 * Prefixes each line of `source` with a right‐justified line number.
 *
 * @param source   The raw source code (or any multi‐line string).
 * @param start     The first line number (defaults to 1).
 * @param delimiter The string between the number and the text (defaults to ". ").
 * @returns         A new string with numbered, aligned lines.
 */
export function formatWithLineNumbers(
  source: string,
  start = 1,
  delimiter = ". "
): string {
  const lines = source.split("\n");
  const totalLines = lines.length + (start - 1);
  const maxDigits = String(totalLines).length;

  return lines
    .map((line, idx) => {
      const lineNum = idx + start;
      const paddedNum = String(lineNum).padStart(maxDigits, " ");
      return `${paddedNum}${delimiter}${line}`;
    })
    .join("\n");
}