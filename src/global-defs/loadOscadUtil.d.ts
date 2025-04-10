import { type OpenSCAD } from "../third-party-defs/openscad-interface";


// Declare the global utility object
interface OscadUtil {
    createInstance(options?: {
      fonts?: boolean;
      mcad?: boolean;
    }): Promise<OpenSCAD>;
  }
  
declare global {
const oscadUtil: OscadUtil;
}