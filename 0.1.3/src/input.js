import { clamp } from "./math.js";

export class InputController {
    constructor(owner) {
        this.owner = owner;
        this.keys = new Set();
        this.speed = 18;
        this.mouseSensitivity = 0.0022;
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onWheel = this.onWheel.bind(this);
    }

    initialize(pml) {
        pml.registerBindCategory("Poly-Cam");
        const bind = (name, id, key, callback) => pml.registerKeybind(name, id, "keydown", key, null, (event) => {
            if (event.repeat) return;
            event.preventDefault();
            event.stopPropagation();
            callback(event);
        });
        bind("Toggle Poly-Cam", "polyCamToggle", "F6", () => this.owner.toggleEnabled());
        bind("Next camera", "polyCamNext", "F7", (e) => this.owner.nextMode(e.shiftKey ? -1 : 1));
        bind("Montage Mode", "polyCamMontage", "F8", () => this.owner.toggleMontage());
        bind("Clean Capture", "polyCamClean", "F9", () => this.owner.toggleCleanCapture());
        bind("Freecam", "polyCamFreecam", "F10", () => this.toggleFreecam());
        window.addEventListener("keydown", this.onKeyDown, true);
        window.addEventListener("keyup", this.onKeyUp, true);
        window.addEventListener("mousemove", this.onMouseMove, true);
        window.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
    }

    isFreecam() { return this.owner.enabled && this.owner.mode === "Freecam"; }
    toggleFreecam() {
        if (!this.owner.enabled) { this.owner.enabled = true; this.owner.activationSerial++; }
        this.owner.setMode(this.owner.mode === "Freecam" ? 0 : 9);
        this.owner.ui.refresh();
    }

    onKeyDown(event) {
        if (event.code === "Escape" && this.isFreecam()) { event.preventDefault(); this.owner.setMode(0); this.keys.clear(); return; }
        if (this.isFreecam() && ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight"].includes(event.code)) {
            this.keys.add(event.code); event.preventDefault(); event.stopImmediatePropagation();
        }
    }
    onKeyUp(event) {
        this.keys.delete(event.code);
        if (this.isFreecam() && ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight"].includes(event.code)) {
            event.preventDefault(); event.stopImmediatePropagation();
        }
    }
    onMouseMove(event) {
        if (!this.isFreecam() || !event.buttons) return;
        const rt = this.owner.ui.activeRuntime;
        if (!rt) return;
        rt.freeEuler.y -= event.movementX * this.mouseSensitivity;
        rt.freeEuler.x = clamp(rt.freeEuler.x - event.movementY * this.mouseSensitivity, -1.45, 1.45);
    }
    onWheel(event) {
        if (!this.isFreecam()) return;
        this.speed = clamp(this.speed * (event.deltaY < 0 ? 1.15 : 0.87), 0.5, 250);
        event.preventDefault(); event.stopImmediatePropagation();
    }
    stepFreecam(rt, dt) {
        this.owner.ui.activeRuntime = rt;
        const e = rt.freeEuler;
        const forward = this.keys.has("KeyW") ? 1 : this.keys.has("KeyS") ? -1 : 0;
        const side = this.keys.has("KeyD") ? 1 : this.keys.has("KeyA") ? -1 : 0;
        const vertical = this.keys.has("Space") ? 1 : (this.keys.has("ControlLeft") || this.keys.has("ControlRight")) ? -1 : 0;
        const multiplier = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 4 : (this.keys.has("AltLeft") || this.keys.has("AltRight")) ? 0.2 : 1;
        const distance = this.speed * multiplier * dt;
        rt.freePosition.x += (Math.sin(e.y) * forward + Math.cos(e.y) * side) * distance;
        rt.freePosition.z += (-Math.cos(e.y) * forward + Math.sin(e.y) * side) * distance;
        rt.freePosition.y += vertical * distance;
    }

    dispose() {
        window.removeEventListener("keydown", this.onKeyDown, true);
        window.removeEventListener("keyup", this.onKeyUp, true);
        window.removeEventListener("mousemove", this.onMouseMove, true);
        window.removeEventListener("wheel", this.onWheel, true);
        this.keys.clear();
    }
}
