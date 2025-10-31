/// <reference types="./openscad.d.ts" />
let wasmModule;
async function OpenSCAD(options) {
    if (!wasmModule) {
        // const url = new URL(`./openscad.wasm.js`, import.meta.url).href;
        // Load from public directory
        const url = "/openscad.wasm.js"
        const request = await fetch(url);
        const requestText = await request.text();
        wasmModule = "data:text/javascript;base64," + btoa(requestText);
    }
    const module = {
        noInitialRun: true,
        // locateFile: (path) => new URL(`./${path}`, import.meta.url).href,
        // Load from public directory
        locateFile: (path)=>  `/${path}`,
        ...options,
    };
    // globalThis.OpenSCAD = module;
    const getInstance = (await import( /* @vite-ignore */ wasmModule + `#${Math.random()}`)).default;
    
    const instance = getInstance(module);
    
    return instance
}

export { OpenSCAD as default };
