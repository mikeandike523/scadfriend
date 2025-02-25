// AxisVisualizer.ts
import * as THREE from 'three';
import { Text } from 'troika-three-text';

export interface AxisOptions {
  scene: THREE.Scene;
  start?: THREE.Vector3;            // Starting point (default: 0,0,0)
  direction: THREE.Vector3;         // Axis direction (should be normalized)
  length?: number;                  // Total axis length (default: 100)
  tickSpacing?: number;             // Spacing between ticks (default: 10)
  tickLength?: number;              // Length of minor ticks (default: 2)
  majorTickInterval?: number;       // Every nth tick is major (default: 5)
  majorTickLength?: number;         // Length of major ticks (default: 4)
  mainLineColor?: THREE.Color;      // Color of the main axis (default: white)
  tickColor?: THREE.Color;          // Color of the tick marks (default: light gray)
  labelText?: string;               // Optional axis label (e.g., "X-Axis")
  labelFontSize?: number;           // Font size for the label (default: 4)
  labelOffset?: THREE.Vector3;      // Offset to position the label from the end
  name?: string;                    // An optional ThreeJS name for later identification during traversal
  visible?: boolean;               // Whether the axis should start visible (default: true)
}

export function createLabeledAxis(options: AxisOptions) {
  const {
    scene,
    start = new THREE.Vector3(0, 0, 0),
    direction,
    length = 100,
    tickSpacing = 10,
    tickLength = 2,
    majorTickInterval = 5,
    majorTickLength = 4,
    mainLineColor = new THREE.Color(0xffffff),
    tickColor = new THREE.Color(0xaaaaaa),
    labelText = '',
    labelFontSize = 4,
    labelOffset = new THREE.Vector3(0, 0, 0),
    name=undefined,
    visible = true
  } = options;

  // Compute the end point of the axis.
  const end = new THREE.Vector3()
    .copy(direction)
    .normalize()
    .multiplyScalar(length)
    .add(start);

  // Create the main axis line.
  const mainLineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const mainLineMaterial = new THREE.LineBasicMaterial({ color: mainLineColor });
  const mainLine = new THREE.Line(mainLineGeometry, mainLineMaterial);
  // Mark as permanent so our update logic can skip it.
  mainLine.userData.keep = true;
  if(typeof name ==='string'){
    mainLine.name = name;
  }
  mainLine.visible = visible;
  scene.add(mainLine);

  // Determine a perpendicular direction for tick marks.
  const arbitrary = new THREE.Vector3(0, 1, 0);
  if (Math.abs(direction.dot(arbitrary)) > 0.99) {
    arbitrary.set(1, 0, 0);
  }
  const tickDir = new THREE.Vector3().crossVectors(direction, arbitrary).normalize();

  // Create tick marks along the axis.
  const numTicks = Math.floor(length / tickSpacing);
  for (let i = 0; i <= numTicks; i++) {
    const tickPos = new THREE.Vector3()
      .copy(direction)
      .normalize()
      .multiplyScalar(i * tickSpacing)
      .add(start);
    const isMajor = i % majorTickInterval === 0;
    const currentTickLength = isMajor ? majorTickLength : tickLength;

    // Each tick is drawn perpendicular to the axis.
    const tickStart = new THREE.Vector3()
      .copy(tickPos)
      .addScaledVector(tickDir, -currentTickLength / 2);
    const tickEnd = new THREE.Vector3()
      .copy(tickPos)
      .addScaledVector(tickDir, currentTickLength / 2);

    const tickGeometry = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd]);
    const tickMaterial = new THREE.LineBasicMaterial({ color: tickColor });
    const tickLine = new THREE.Line(tickGeometry, tickMaterial);
    tickLine.userData.keep = true;
    mainLine.add(tickLine);
  }

  // If a label is provided, add it at the end of the axis (with the given offset).
  if (labelText) {
    const text = new Text();
    text.text = labelText;
    text.fontSize = labelFontSize;
    text.color = mainLineColor.getStyle();
    text.anchorX = 'center';
    text.anchorY = 'middle';
    text.position.copy(end).add(labelOffset);
    // Call sync() to update the layout.
    text.sync();
    text.userData.keep = true;
    mainLine.add(text);
  }

  scene.add(mainLine);
}
