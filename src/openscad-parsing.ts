export type OpenSCADPart = {
  /**
   * The complete OpenSCAD source code with all export blocks removed except for the one
   * corresponding to this part.
   */
  ownSourceCode: string;
  /**
   * The color extracted from a color() call in this part’s block (if present).
   */
  color?: string;
  /**
   * Whether this part should be exported (i.e. rendered).
   */
  exported: boolean;
};

interface ExportBlock {
  name: string;
  start: number; // character index where the block starts (includes the export marker)
  end: number;   // character index where the block ends
  exported: boolean; // false if the block was marked with !@export
}

/**
 * Identifies export blocks in the source code and then for each block produces a version
 * of the file in which all export blocks are removed except for that one.
 *
 * The export block is determined by:
 * - Starting at a line containing `@export` in a comment (whitespace around the
 *   marker is ignored and an optional name may follow).
 * - Continuing until either a new export marker is found, or after a blank line following
 *   at least one semicolon has been seen, or the file ends.
 *
 * @param sourceCode - The entire OpenSCAD source code.
 * @returns An object mapping each part's name to its OpenSCADPart. Parts
 *   marked with `!@export` will have `exported` set to `false`.
 * @throws Error if duplicate part names are detected.
 */
export function identifyParts(sourceCode: string): {
  [name: string]: OpenSCADPart;
} {
  // Create a “clean” object (with null prototype) to hold parts.
  const parts: { [name: string]: OpenSCADPart } = Object.create(null);
  const exportBlocks: ExportBlock[] = [];

  // Split the file into lines.
  const lines = sourceCode.split(/\r?\n/);
  // Precompute the starting character index for each line.
  const lineOffsets: number[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets[i] = offset;
    offset += lines[i].length + 1; // +1 for the newline
  }

  // --- Step 1. Identify export blocks ---
  const exportRegex = /^\s*\/\/\s*(!?@export)(?:\s+(\S+))?\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (exportRegex.test(line)) {
      // Extract an optional name from the marker.
      const exportMatch = line.match(exportRegex);
      const exported = !(exportMatch && exportMatch[1] && exportMatch[1].startsWith('!'));
      const name = exportMatch && exportMatch[2] ? exportMatch[2] : `Part${exportBlocks.length + 1}`;

      // Check for duplicate names among previously discovered blocks.
      if (exportBlocks.some(block => block.name === name)) {
        throw new Error(`Duplicate part name detected: ${name}`);
      }

      const blockStart = lineOffsets[i]; // include the export marker line
      let semicolonFound = false;
      let blockEnd = sourceCode.length; // default to end-of-file

      // Determine where this export block ends.
      for (let j = i + 1; j < lines.length; j++) {
        const currentLine = lines[j];
        // If a new export marker is encountered, end this block before it.
        if (exportRegex.test(currentLine)) {
          blockEnd = lineOffsets[j];
          break;
        }
        // Record if we've seen a semicolon.
        if (!semicolonFound && currentLine.includes(';')) {
          semicolonFound = true;
        }
        // If we've seen a semicolon and now encounter a blank line, that ends the block.
        if (semicolonFound && currentLine.trim() === '') {
          blockEnd = lineOffsets[j];
          break;
        }
      }

      exportBlocks.push({ name, start: blockStart, end: blockEnd, exported });
    }
  }

  // --- Step 2. For each part, produce a version of the file that keeps only its export block ---
  for (const block of exportBlocks) {
    // Build a list of intervals to remove: all export blocks except the current one.
    const removalIntervals = exportBlocks
      .filter(b => b.name !== block.name)
      .sort((a, b) => a.start - b.start);

    let result = '';
    let pos = 0;
    // Remove each interval in order.
    for (const interval of removalIntervals) {
      // Append the content before the interval.
      if (pos < interval.start) {
        result += sourceCode.slice(pos, interval.start);
      }
      // Skip the interval.
      pos = Math.max(pos, interval.end);
    }
    // Append any remaining content after the last removal interval.
    if (pos < sourceCode.length) {
      result += sourceCode.slice(pos);
    }

    // --- Step 3. Extract a color (if present) from the target block ---
    // We look inside the original export block for a color() call.
    let color: string | undefined;
    const blockText = sourceCode.slice(block.start, block.end);
    const colorRegex = /color\s*\(\s*(?:"([^"]+)"|'([^']+)'|([^),\s]+))\s*\)/;
    const colorMatch = blockText.match(colorRegex);
    if (colorMatch) {
      color = (colorMatch[1] || colorMatch[2] || colorMatch[3])?.trim();
    }

    // Store the part. Note that result is trimmed.
    parts[block.name] = { ownSourceCode: result.trim(), exported: block.exported };
    if (color) {
      parts[block.name].color = color;
    }
  }

  return parts;
}