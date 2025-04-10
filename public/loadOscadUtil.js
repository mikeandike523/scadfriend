// OPTIONAL: add fonts to the FS
import { addFonts } from "/openscad.fonts.js";

// OPTIONAL: add MCAD library to the FS
import { addMCAD } from "/openscad.mcad.js";


globalThis.oscadUtil = {
  createInstance: async (
    {
      fonts=true,
      mcad=true,
    }={}
  )=>{
    const instance = await OpenScad({
      noInitialRun: true // The README example on the openscad-wasm repo shows noInitialRun
      // Previous testing shows noInitialRun should be true for it to work at all
      // I don't really understand what this is for
    });
    if(fonts){
      addFonts(instance)
    }
    if(mcad){
      addMCAD(instance)
    }
    return instance
  }

}

