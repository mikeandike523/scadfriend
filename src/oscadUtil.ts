import OpenSCAD from "./openscad.js";

// // OPTIONAL: add fonts to the FS
// import { addFonts } from "./openscad.fonts.js";

// // OPTIONAL: add MCAD library to the FS
// import { addMCAD } from "./openscad.mcad.js";

const createInstance = async (
    {
      fonts=true,
      mcad=true,
    }={}
  )=>{
    const instance = await OpenSCAD({
      noInitialRun: true // The README example on the openscad-wasm repo shows noInitialRun
      // Previous testing shows noInitialRun should be true for it to work at all
      // I don't really understand what this is for
    });
    if(fonts){
      const addFonts = (await import("./openscad.fonts.js")).addFonts
      addFonts(instance)
    }
    if(mcad){
      const addMCAD = (await import("./openscad.mcad.js")).addMCAD
      addMCAD(instance)
    }
    return instance
  }

const oscadUtil = {
  createInstance
}

export default oscadUtil;



