/// <reference types="./openscad.d.ts" />
let wasmModule;
async function OpenSCAD(options) {
    if (!wasmModule) {
        const url = new URL(`./openscad.wasm.js`, import.meta.url).href;
        const request = await fetch(url);
        const moduleCode = await request.text()
        wasmModule = "data:text/javascript;base64," + btoa(moduleCode);
    }
    const module = {
        noInitialRun: true,
        locateFile: (path) => new URL(`./${path}`, import.meta.url).href,
        ...options,
    };
    return ((await import(/* @vite-ignore */ wasmModule+ `#${Math.random()}`)).default)(module);

}

export default OpenSCAD;
