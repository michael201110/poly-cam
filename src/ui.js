import { MODES } from "./rigs.js";

const STYLE = `
#poly-cam-panel{position:fixed;z-index:2147483000;top:12px;right:12px;width:min(292px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:14px;color:#f4f7fa;background:rgba(10,16,22,.94);border:1px solid #ffffff30;border-radius:10px;font:12px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px #0008}
#poly-cam-panel *{box-sizing:border-box;font-family:inherit}
#poly-cam-panel header{display:flex;justify-content:space-between;align-items:center;gap:12px;font-weight:800;letter-spacing:.1em;margin-bottom:8px}
#poly-cam-panel .header-controls{display:flex;align-items:center;gap:6px}
#poly-cam-panel button,#poly-cam-panel select,#poly-cam-panel input,#poly-cam-panel textarea{font:inherit;color:inherit;background:#202c36;border:1px solid #60707e;border-radius:5px;padding:6px;min-width:0}
#poly-cam-panel button{cursor:pointer}#poly-cam-panel button:hover{background:#334553}
#poly-cam-panel .state{font-size:10px}#poly-cam-panel .state[aria-pressed=true]{color:#85e0a3}
#poly-cam-panel .minimize{width:26px;height:26px;padding:0;font-size:18px;line-height:1}
#poly-cam-panel .hook-status{font-size:10px;color:#b2c4d0;margin:4px 0 10px}#poly-cam-panel .hook-status.active{color:#85e0a3}
#poly-cam-panel .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:7px 0}
#poly-cam-panel select{width:150px}#poly-cam-panel input[type=range]{width:140px;padding:0}
#poly-cam-panel input[type=range]{appearance:none;height:6px;border:0;background:#60707e;outline:none}
#poly-cam-panel input[type=range]::-webkit-slider-thumb{appearance:none;width:14px;height:14px;border:1px solid #bdd0de;border-radius:50%;background:#8fdaff;box-shadow:none}
#poly-cam-panel input[type=range]::-moz-range-thumb{width:14px;height:14px;border:1px solid #bdd0de;border-radius:50%;background:#8fdaff}
#poly-cam-panel .mount{width:120px}#poly-cam-panel .actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}
#poly-cam-panel .timeline{width:100%;resize:vertical;min-height:58px}#poly-cam-panel .timeline-load,#poly-cam-panel .bookmark{width:100%;margin:5px 0}
#poly-cam-panel .small{opacity:.75;font-size:10px}#poly-cam-panel .notice{color:#8fdaff;min-height:15px;letter-spacing:0}
#poly-cam-panel.collapsed{width:auto;padding:9px 12px}#poly-cam-panel.collapsed header{margin:0}#poly-cam-panel.collapsed>*:not(header){display:none!important}
body.poly-cam-clean #poly-cam-panel{display:none}`;

export class UIController {
    constructor(owner) {
        this.owner = owner; this.root = null; this.style = null; this.lastCamera = null; this.activeRuntime = null;
        this.notice = ""; this.hookStatus = "Waiting for a run"; this.nativeHudHidden = false; this.collapsed = false;
    }
    mount() {
        if (this.root || !document.body) return;
        this.style = document.createElement("style"); this.style.textContent = STYLE; document.head.appendChild(this.style);
        const root = document.createElement("section"); root.id = "poly-cam-panel";
        root.setAttribute("aria-label", "Poly-Cam camera controls");
        root.innerHTML = `
            <header><span>POLY-CAM</span><span class="header-controls">
                <button class="state" data-action="toggle" title="Enable or disable Poly-Cam" aria-pressed="false">OFF</button>
                <button class="minimize" data-action="collapse" title="Minimize" aria-label="Minimize Poly-Cam" aria-expanded="true">−</button>
            </span></header>
            <div class="hook-status" role="status"></div>
            <div class="row"><label for="poly-cam-mode">Mode</label><select id="poly-cam-mode" class="mode">${MODES.map((m, i) => `<option value="${i}">${m}</option>`).join("")}</select></div>
            <div class="row"><label for="poly-cam-fov">FOV <span class="fov-label">72</span></label><input id="poly-cam-fov" class="fov" type="range" min="35" max="105" value="72"></div>
            <div class="row"><label>Transition</label><select class="transition"><option>CUT</option><option selected>BLEND</option></select></div>
            <div class="row"><label>Side / mount</label><button data-action="side">Right</button><select class="mount"><option>Front bumper</option><option>Rear bumper</option><option>Bonnet</option><option selected>Roof</option><option>Front-left wheel</option><option>Front-right wheel</option><option>Rear wheel</option></select></div>
            <div class="row"><label>Fixed trackside orientation</label><input class="trackside-fixed" type="checkbox"></div>
            <div class="actions">
                <button data-action="previous">Previous</button><button data-action="next">Next</button>
                <button data-action="montage">Montage</button><button data-action="bookmark">Save Camera</button>
                <button data-action="trackside">Place Trackside</button><button data-action="clean">Clean Capture</button>
                <button data-action="timeline">Play Timeline</button><button data-action="timeline-reset">Reset Timeline</button>
            </div>
            <div class="row"><label>Loop timeline</label><input class="timeline-loop" type="checkbox"></div>
            <label for="poly-cam-timeline">Timeline JSON</label>
            <textarea id="poly-cam-timeline" class="timeline">[{"time":0,"mode":"Trackside Cam"},{"time":2.2,"mode":"Low Chase"},{"time":4.8,"mode":"Drone Cam"}]</textarea>
            <button class="timeline-load" data-action="timeline-load">Load timeline</button>
            <select class="bookmark" aria-label="Camera bookmarks"><option value="">Bookmarks</option></select>
            <div class="notice" role="status"></div>
            <div class="small">F6 toggle · F7 cameras · F8 montage · F9 clean · F10 freecam<br>Freecam: drag mouse to look · wheel changes speed</div>`;
        document.body.appendChild(root); this.root = root;
        root.addEventListener("click", (event) => {
            event.stopPropagation();
            const action = event.target.closest("button[data-action]")?.dataset.action;
            if (action === "toggle") this.owner.toggleEnabled();
            if (action === "collapse") this.toggleCollapsed();
            if (action === "next") this.owner.nextMode(1);
            if (action === "previous") this.owner.nextMode(-1);
            if (action === "montage") this.owner.toggleMontage();
            if (action === "bookmark") {
                if (!this.lastCamera) { this.setNotice("Enable Poly-Cam in a run before saving a camera."); return; }
                const name = prompt("Bookmark name", `Camera ${this.owner.bookmarks.length + 1}`); if (name) this.owner.saveBookmark(name);
            }
            if (action === "trackside") this.placeTrackside();
            if (action === "clean") this.owner.toggleCleanCapture();
            if (action === "timeline") {
                try { if (!this.owner.timeline.length) this.owner.loadTimeline(root.querySelector(".timeline").value); this.owner.toggleTimeline(); }
                catch (error) { this.setNotice(error.message); }
            }
            if (action === "timeline-reset") { this.owner.resetTimeline(); this.refresh(); }
            if (action === "side") { this.owner.side *= -1; this.refresh(); }
            if (action === "timeline-load") {
                try { this.owner.loadTimeline(root.querySelector(".timeline").value); this.setNotice("Timeline loaded."); }
                catch (error) { this.setNotice(error.message); }
            }
        });
        root.addEventListener("pointerdown", event => event.stopPropagation());
        root.addEventListener("wheel", event => event.stopPropagation());
        for (const type of ["keydown", "keyup"]) root.addEventListener(type, event => { if (!/^F\d+$/.test(event.code)) event.stopPropagation(); });
        root.querySelector(".mode").addEventListener("change", e => this.owner.setMode(Number(e.target.value)));
        root.querySelector(".fov").addEventListener("input", e => { this.owner.baseFov = Number(e.target.value); root.querySelector(".fov-label").textContent = e.target.value; });
        root.querySelector(".mount").addEventListener("change", e => { this.owner.mount = e.target.value; });
        root.querySelector(".trackside-fixed").addEventListener("change", e => { this.owner.fixedTracksideOrientation = e.target.checked; if (this.activeRuntime) this.activeRuntime.tracksideFixed = e.target.checked; });
        root.querySelector(".timeline-loop").addEventListener("change", e => { this.owner.timelineState.loop = e.target.checked; });
        root.querySelector(".transition").addEventListener("change", e => { this.owner.transitionMode = e.target.value; });
        root.querySelector(".bookmark").addEventListener("change", e => { if (e.target.value !== "") this.owner.restoreBookmark(Number(e.target.value)); });
        this.refresh(); this.setHookStatus(this.hookStatus);
    }
    toggleCollapsed() {
        this.collapsed = !this.collapsed; this.root.classList.toggle("collapsed", this.collapsed);
        const button = this.root.querySelector(".minimize"); button.textContent = this.collapsed ? "+" : "−";
        button.title = this.collapsed ? "Expand" : "Minimize";
        button.setAttribute("aria-label", this.collapsed ? "Expand Poly-Cam" : "Minimize Poly-Cam");
        button.setAttribute("aria-expanded", String(!this.collapsed));
    }
    refresh() {
        if (!this.root) return;
        this.root.querySelector(".mode").value = String(this.owner.modeIndex);
        const state = this.root.querySelector(".state"); state.textContent = this.owner.enabled ? "ON" : "OFF"; state.setAttribute("aria-pressed", String(this.owner.enabled));
        this.root.querySelector("[data-action=montage]").textContent = this.owner.montage ? "Montage: ON" : "Montage";
        this.root.querySelector("[data-action=timeline]").textContent = this.owner.timelineState.playing ? "Pause Timeline" : "Play Timeline";
        this.root.querySelector(".fov").value = String(this.owner.baseFov); this.root.querySelector(".fov-label").textContent = String(this.owner.baseFov);
        this.root.querySelector(".mount").value = this.owner.mount; this.root.querySelector("[data-action=side]").textContent = this.owner.side > 0 ? "Right" : "Left";
        this.root.querySelector(".trackside-fixed").checked = this.owner.fixedTracksideOrientation; this.root.querySelector(".timeline-loop").checked = this.owner.timelineState.loop;
        this.root.querySelector(".transition").value = this.owner.transitionMode;
        this.root.querySelector(".bookmark").innerHTML = `<option value="">Bookmarks</option>${this.owner.bookmarks.map((b, i) => `<option value="${i}">${this.escape(b.name)}</option>`).join("")}`;
    }
    setClean(enabled) {
        if (!document.body) return;
        document.body.classList.toggle("poly-cam-clean", enabled);
        if (enabled) { this.previousCursor = document.body.style.cursor; document.body.style.cursor = "none"; } else document.body.style.cursor = this.previousCursor || "";
        if (this.nativeHudHidden !== enabled) {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true, cancelable: true })); this.nativeHudHidden = enabled;
        }
    }
    setHookStatus(message) {
        this.hookStatus = message; const status = this.root?.querySelector(".hook-status"); if (!status || status.textContent === message) return;
        if (status.textContent !== message) status.textContent = message; status.classList.toggle("active", message === "Camera connected");
    }
    setTransitionMode(mode) { if (this.root) this.root.querySelector(".transition").value = mode; }
    setNotice(message) { this.notice = message; if (this.root) this.root.querySelector(".notice").textContent = message; }
    placeTrackside() {
        if (this.owner.mode !== "Freecam" || !this.activeRuntime) { this.setNotice("Enter Freecam, position the camera, then place Trackside."); return; }
        const rt = this.activeRuntime; Object.assign(rt.trackside, rt.freePosition); const e = rt.freeEuler;
        rt.tracksideLook.x = rt.freePosition.x - Math.sin(e.y) * Math.cos(e.x) * 40;
        rt.tracksideLook.y = rt.freePosition.y + Math.sin(e.x) * 40;
        rt.tracksideLook.z = rt.freePosition.z - Math.cos(e.y) * Math.cos(e.x) * 40;
        rt.tracksideFixed = this.owner.fixedTracksideOrientation; rt.tracksidePlaced = true; this.owner.setMode(6); this.setNotice("Trackside camera placed.");
    }
    escape(value) { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
    dispose() { this.setClean(false); this.root?.remove(); this.root = null; this.style?.remove(); this.style = null; }
}
