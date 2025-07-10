/**
 * Splits an OpenSCAD source into a preserved section and export parts.
 * All lines up to (but not including) the first //@export marker are always preserved
 * in each part. Then each part is the preserved section + two newlines + its own export block.
 *
 * This version normalizes line endings, uses line-based slicing, splits logic into helper
 * functions, and refines the export regex.
 */
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
  startLine: number;
  endLine: number;
  exported: boolean;
}

const EXPORT_REGEX = /^\s*\/\/\s*(!?@export)\b(?:\s+(\S+))?\s*$/;
const COLOR_REGEX = /color\s*\(\s*(?:"([^"]+)"|'([^']+)'|([^),\s]+))\s*\)/;

/**
 * Parses export blocks from a slice of lines starting at index 0.
 * Assumes the slice begins with an export marker.
 */
function parseExportBlocks(lines: string[]): ExportBlock[] {
  const blocks: ExportBlock[] = [];
  let idx = 0;
  while (idx < lines.length) {
    const match = lines[idx].match(EXPORT_REGEX);
    if (match) {
      const exported = !match[1].startsWith('!');
      const name = match[2] || `Part${blocks.length + 1}`;
      if (blocks.some(b => b.name === name)) {
        throw new Error(`Duplicate part name detected: ${name}`);
      }
      const startLine = idx;
      let endLine = lines.length;
      let seenSemicolon = false;
      for (let j = idx + 1; j < lines.length; j++) {
        if (EXPORT_REGEX.test(lines[j])) {
          endLine = j;
          break;
        }
        if (!seenSemicolon && lines[j].includes(';')) {
          seenSemicolon = true;
        }
        if (seenSemicolon && lines[j].trim() === '') {
          endLine = j;
          break;
        }
      }
      blocks.push({ name, startLine, endLine, exported });
      idx = endLine;
    } else {
      idx++;
    }
  }
  return blocks;
}

/**
 * Main function: identify OpenSCAD parts based on export markers.
 */
export function identifyParts(sourceCode: string): Record<string, OpenSCADPart> {
  // Normalize line endings and split into lines
  const normalized = sourceCode.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  // Determine preserved vs export-detection slices
  const firstExportIdx = lines.findIndex(line => EXPORT_REGEX.test(line));
  if (firstExportIdx === -1) {
    return { Full: { ownSourceCode: normalized, exported: false } };
  }
  const preservedLines = lines.slice(0, firstExportIdx);
  const exportDetectionLines = lines.slice(firstExportIdx);

  // Parse blocks using helper
  const blocks = parseExportBlocks(exportDetectionLines);

  // Build parts map
  const parts: Record<string, OpenSCADPart> = Object.create(null);
  for (const block of blocks) {
    const blockLines = exportDetectionLines.slice(block.startLine, block.endLine);
    const partLines = [...preservedLines, "", "", ...blockLines];
    const ownSourceCode = partLines.join("\n");

    const blockText = blockLines.join("\n");
    const colorMatch = blockText.match(COLOR_REGEX);
    const color = colorMatch ? (colorMatch[1] || colorMatch[2] || colorMatch[3]).trim() : undefined;

    parts[block.name] = { ownSourceCode, exported: block.exported };
    if (color) parts[block.name].color = color;
  }

  return parts;
}
