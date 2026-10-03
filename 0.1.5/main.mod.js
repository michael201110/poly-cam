import { PolyMod, MixinType } from "https://cdn.polymodloader.com/cb/polytrackmods/PolyModLoader/0.6.3/PolyTypes.js";
// PML may reload this entry module from a blob URL when using its cache.
// Keep this import absolute so it resolves both from the CDN and from a blob.
import { PolyCam } from "https://cdn.polymodloader.com/gh/michael201110/poly-cam/v0.1.5/0.1.5/src/poly-cam.js";

function getCameraUpdateToken(pml) {
    const globalFunc = pml.getFromPolyTrackGlobal("globalFunc");
    const source = typeof globalFunc === "function" ? globalFunc.toString() : "";
    const signature = /\bupdateCameras\s*\([^)]*\)\s*\{/.exec(source);
    if (!signature) throw new Error("Could not find PolyTrack's updateCameras method in globalFunc.");

    const openBrace = source.indexOf("{", signature.index);
    let depth = 0;
    let quote = "";
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let i = openBrace; i < source.length; i++) {
        const current = source[i];
        const next = source[i + 1];
        if (lineComment) { if (current === "\n") lineComment = false; continue; }
        if (blockComment) {
            if (current === "*" && next === "/") { blockComment = false; i++; }
            continue;
        }
        if (quote) {
            if (escaped) { escaped = false; continue; }
            if (current === "\\") { escaped = true; continue; }
            if (current === quote) quote = "";
            continue;
        }
        if (current === "/" && next === "/") { lineComment = true; i++; continue; }
        if (current === "/" && next === "*") { blockComment = true; i++; continue; }
        if (current === "'" || current === "\"" || current === "`") { quote = current; continue; }
        if (current === "{") depth++;
        if (current === "}" && --depth === 0) return source.slice(signature.index, i);
    }
    throw new Error("Could not find the end of PolyTrack's updateCameras method.");
}

class PolyCamMod extends PolyMod {
    init = (pml) => {
        this.pml = pml;
        this.controller = new PolyCam();

        // Read the actual method source from PML so this hook follows minifier changes.
        pml.registerGlobalMixin({
            type: MixinType.INSERT,
            token: getCameraUpdateToken(pml),
            func: ';globalThis.__polyCamControllerV1?.handleCameraUpdate(this,arguments[0]);'
        });

        this.controller.initialize(pml);
        if (document.body) this.controller.mountUI();
        else document.addEventListener("DOMContentLoaded", () => this.controller?.mountUI(), { once: true });
    };

    onGameLoad = () => this.controller?.mountUI();
    dispose = () => this.controller?.dispose();
}

export let polyMod = new PolyCamMod();
