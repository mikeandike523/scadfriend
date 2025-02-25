declare module 'troika-three-text' {
    import * as THREE from 'three';
  
    export class Text extends THREE.Object3D {
      /**
       * The text string to display.
       */
      text: string;
      /**
       * The font size of the text.
       */
      fontSize: number;
      /**
       * The CSS color value to use for the text.
       */
      color: string;
      /**
       * Horizontal text anchor. Typical values: 'left', 'center', 'right'.
       */
      anchorX: string;
      /**
       * Vertical text anchor. Typical values: 'top', 'middle', 'bottom'.
       */
      anchorY: string;
  
      /**
       * Forces the text to update its layout and geometry.
       */
      sync(): void;
    }
  }
  