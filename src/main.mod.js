import { PolyMod, MixinType } from "https://cdn.polymodloader.com/cb/polytrackmods/PolyModLoader/0.6.3/PolyTypes.js";
import { PolyCam } from "./poly-cam.js";

function getMethodToken(pml, name) {
    const globalFunc = pml.getFromPolyTrackGlobal("globalFunc");
    const source = typeof globalFunc === "function" ? globalFunc.toString() : "";
    const signature = new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
    if (!signature) throw new Error(`Could not find PolyTrack's ${name} method in globalFunc.`);

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
    throw new Error(`Could not find the end of PolyTrack's ${name} method.`);
}

class PolyCamMod extends PolyMod {
    // globalFunc is executed between preInit and init. Patch it before execution;
    // changing its source during init does not change the already-created classes.
    preInit = (pml) => {
        pml.registerGlobalMixin({
            type: MixinType.INSERT,
            token: getMethodToken(pml, "updateCameras"),
            func: ';globalThis.__polyCamControllerV1?.handleCameraUpdate(this,arguments[0]);'
        });
        pml.registerGlobalMixin({
            type: MixinType.INSERT,
            token: getMethodToken(pml, "setCamera"),
            func: ';globalThis.__polyCamControllerV1?.selectCamera(arguments[0]);'
        });
    };

    init = (pml) => {
        this.pml = pml;
        this.controller = new PolyCam();
        this.controller.initialize(pml);
        if (document.body) this.controller.mountUI();
        else document.addEventListener("DOMContentLoaded", () => this.controller?.mountUI(), { once: true });
    };

    onGameLoad = () => this.controller?.mountUI();
    dispose = () => this.controller?.dispose();
}

export let polyMod = new PolyCamMod();
