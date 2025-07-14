export interface ResizeSvgOptions {
  /** Vertical size of each arrowhead (px) */
  arrowHeadWidth?: number;
  /** Horizontal length of each arrowhead (px) */
  arrowHeadLength?: number;
  /** Vertical thickness of the connecting shaft (px) */
  shaftWidth?: number;
  /** Horizontal length of the connecting shaft (px) */
  shaftLength?: number;
  /** Horizontal padding on each side (px) */
  paddingX?: number;
  /** Vertical padding on each side (px) */
  paddingY?: number;
}

/**
 * Builds a single closed path for a horizontal double‑headed resize arrow
 * by computing an ordered list of 2D points and respecting polygon winding.
 */
export default class ResizeSvgHelper {
  arrowHeadWidth: number;
  arrowHeadLength: number;
  shaftWidth: number;
  shaftLength: number;
  paddingX: number;
  paddingY: number;

  constructor({
    arrowHeadWidth = 12,
    arrowHeadLength = 4,
    shaftWidth = 2,
    shaftLength = 2,
    paddingX = 2,
    paddingY = 2,
  }: ResizeSvgOptions = {}) {
    this.arrowHeadWidth = arrowHeadWidth;
    this.arrowHeadLength = arrowHeadLength;
    this.shaftWidth = shaftWidth;
    this.shaftLength = shaftLength;
    this.paddingX = paddingX;
    this.paddingY = paddingY;
  }

  /**
   * Computes the total SVG width based on options.
   */
  getComputedWidth(): number {
    return this.paddingX * 2 + this.arrowHeadLength * 2 + this.shaftLength;
  }

  /**
   * Computes the total SVG height based on options.
   */
  getComputedHeight(): number {
    return this.paddingY * 2 + this.arrowHeadWidth;
  }

  /**
   * Computes vertices A→J around the double‑headed arrow polygon.
   */
  private getPoints(): { x: number; y: number }[] {
    const {
      arrowHeadWidth,
      arrowHeadLength,
      shaftWidth,
      shaftLength,
      paddingX,
      paddingY,
    } = this;

    const height = this.getComputedHeight();
    const midY = height / 2;
    const topY = paddingY;
    const bottomY = paddingY + arrowHeadWidth;
    const shaftTopY = midY - shaftWidth / 2;
    const shaftBottomY = midY + shaftWidth / 2;

    const x0 = paddingX;
    const x1 = paddingX + arrowHeadLength;
    const x2 = x1 + shaftLength;
    const x3 = x2 + arrowHeadLength;

    return [
      { x: x0, y: midY },        // A: left tip
      { x: x1, y: topY },        // B: left base top
      { x: x1, y: shaftTopY },   // C: shaft top left
      { x: x2, y: shaftTopY },   // D: shaft top right
      { x: x2, y: topY },        // E: right base top
      { x: x3, y: midY },        // F: right tip
      { x: x2, y: bottomY },     // G: right base bottom
      { x: x2, y: shaftBottomY },// H: shaft bottom right
      { x: x1, y: shaftBottomY },// I: shaft bottom left
      { x: x1, y: bottomY },     // J: left base bottom
    ];
  }

  /**
   * Returns the SVG "d" attribute for the closed polygon.
   */
  getPathData(): string {
    const pts = this.getPoints();
    const [first, ...rest] = pts;
    const cmds = [`M${first.x},${first.y}`];
    for (const p of rest) cmds.push(`L${p.x},${p.y}`);
    cmds.push('Z');
    return cmds.join(' ');
  }

  /**
   * Wraps the path in an SVG element using computed dimensions.
   */
  getSvg(fill: string = '#333'): string {
    const width = this.getComputedWidth();
    const height = this.getComputedHeight();
    const path = this.getPathData();
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <path d="${path}" fill="${fill}" />
</svg>`;
  }

  /**
   * Encodes the SVG for CSS usage as a data URI.
   */
  getDataUri(fill: string = '#333'): string {
    const svg = this.getSvg(fill);
    const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
    return `data:image/svg+xml;utf8,${encoded}`;
  }
}
