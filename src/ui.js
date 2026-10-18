import { MODES } from "./rigs.js";
import { MONTAGE_PACES } from "./shot-director.js";
import { attachPolyCaptureUI } from "./capture-ui.js";

const STYLE = `
/* Same glass tokens as PolyBot's in-game HUD; no runtime mod dependency. */
#poly-cam-panel{
 --poly-tools-top:12px;--poly-glass-fg:#f1f7fc;--poly-glass-muted:#c9d6e1;
 position:fixed;z-index:2147483000;top:var(--poly-tools-top);right:12px;
 width:min(292px,calc(100vw - 24px));max-height:calc(100dvh - var(--poly-tools-top) - 12px);
 overflow:auto;overscroll-behavior:contain;padding:14px 16px;box-sizing:border-box;
 color:var(--poly-glass-fg);background:linear-gradient(135deg,rgba(230,247,255,.14),rgba(40,70,105,.08)),rgba(9,19,32,.26);
 border:1px solid rgba(235,248,255,.3);border-radius:20px;font:12px/1.35 ui-monospace,Consolas,monospace;
 backdrop-filter:blur(12px) saturate(150%);-webkit-backdrop-filter:blur(12px) saturate(150%);
 text-shadow:0 1px 3px rgba(0,0,0,.8);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.34),inset 0 -1px 0 rgba(255,255,255,.07),0 12px 38px rgba(0,0,0,.18)
}
#poly-cam-panel,#poly-cam-panel *{box-sizing:border-box;font-family:ui-monospace,Consolas,monospace!important;font-style:normal!important;scrollbar-width:thin;scrollbar-color:rgba(223,244,255,.48) transparent}
@supports selector(::-webkit-scrollbar){#poly-cam-panel,#poly-cam-panel *{scrollbar-width:auto;scrollbar-color:auto}}
#poly-cam-panel::-webkit-scrollbar,#poly-cam-panel *::-webkit-scrollbar{width:7px;height:7px;background:transparent}
#poly-cam-panel::-webkit-scrollbar-track,#poly-cam-panel *::-webkit-scrollbar-track{background:transparent;margin:12px 0}
#poly-cam-panel::-webkit-scrollbar-thumb,#poly-cam-panel *::-webkit-scrollbar-thumb{border-radius:999px;background:linear-gradient(180deg,rgba(240,252,255,.55),rgba(170,217,241,.28));border:1px solid rgba(255,255,255,.25)}
#poly-cam-panel::-webkit-scrollbar-button,#poly-cam-panel *::-webkit-scrollbar-button{display:none;width:0;height:0}
#poly-cam-panel::-webkit-scrollbar-corner,#poly-cam-panel *::-webkit-scrollbar-corner{background:transparent}
#poly-cam-panel header{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px;font-weight:700;letter-spacing:0;margin-bottom:10px}
#poly-cam-panel header>span:first-child{font-size:14px;font-weight:700}
#poly-cam-panel .header-controls{display:flex;align-items:center;gap:6px}
#poly-cam-panel button,#poly-cam-panel select,#poly-cam-panel input,#poly-cam-panel textarea{
 font:inherit;color:inherit;background:rgba(15,28,44,.28);border:1px solid rgba(235,248,255,.38);border-radius:10px;padding:6px 8px;min-width:0;max-width:100%;
 box-shadow:inset 0 1px 0 rgba(255,255,255,.18);transition:background-color 140ms ease,border-color 140ms ease
}
#poly-cam-panel button{cursor:pointer}#poly-cam-panel button:hover{background:rgba(125,175,215,.28);border-color:rgba(235,248,255,.6)}
#poly-cam-panel :is(button,select,input,textarea,summary):focus-visible{outline:2px solid #8ed7ff;outline-offset:2px}
#poly-cam-panel option{background:#16273a;color:#edf4fa}
#poly-cam-panel .state{font-size:11px;border-radius:999px}#poly-cam-panel .state[aria-pressed=true]{color:#85e0a3;border-color:rgba(133,224,163,.55)}
#poly-cam-panel .minimize{width:28px;height:28px;padding:0;font-size:18px;line-height:1;border-radius:999px}
#poly-cam-panel .hook-status{font-size:11px;color:var(--poly-glass-muted);margin:4px 0 10px}#poly-cam-panel .hook-status.active{color:#85e0a3}
#poly-cam-panel .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:8px 0}
#poly-cam-panel .row>label{min-width:0;overflow-wrap:anywhere}
#poly-cam-panel select{width:150px}#poly-cam-panel input[type=range]{width:140px;padding:0}
#poly-cam-panel input[type=checkbox]{appearance:none;flex-shrink:0;width:14px;height:14px;padding:0;border-radius:4px;accent-color:#8ed7ff;vertical-align:middle}
#poly-cam-panel input[type=checkbox]:checked{background:#8ed7ff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m3.5 8 3 3 6-6' fill='none' stroke='%2316273a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/12px 12px no-repeat}
#poly-cam-panel input[type=range]{appearance:none;height:5px;border:0;border-radius:999px;background:rgba(211,232,250,.22);box-shadow:none}
#poly-cam-panel input[type=range]::-webkit-slider-thumb{appearance:none;width:13px;height:13px;border:1px solid rgba(235,248,255,.65);border-radius:50%;background:#8ed7ff;box-shadow:0 1px 5px rgba(0,0,0,.2)}
#poly-cam-panel input[type=range]::-moz-range-thumb{width:13px;height:13px;border:1px solid rgba(235,248,255,.65);border-radius:50%;background:#8ed7ff}
#poly-cam-panel input[type=range]::-webkit-slider-runnable-track{height:5px;border:0;border-radius:999px;background:rgba(211,232,250,.22);box-shadow:none}
#poly-cam-panel input[type=range]::-webkit-slider-thumb{box-sizing:border-box;margin-top:-4px}
#poly-cam-panel input[type=range]::-moz-range-track{height:5px;border:0;border-radius:999px;background:rgba(211,232,250,.22)}
#poly-cam-panel .mount{width:110px}#poly-cam-panel .actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;margin:10px 0}
#poly-cam-panel .timeline{width:100%;resize:vertical;min-height:58px;background:rgba(9,19,32,.2)}#poly-cam-panel .timeline-load,#poly-cam-panel .bookmark{width:100%;margin:5px 0}
#poly-cam-panel .small{color:var(--poly-glass-muted);font-size:10px}#poly-cam-panel .notice{color:#8ed7ff;min-height:15px;letter-spacing:0}
#poly-cam-panel.collapsed{width:auto;padding:9px 12px}#poly-cam-panel.collapsed header{margin:0}#poly-cam-panel.collapsed>*:not(header){display:none!important}
#poly-cam-panel.panel-hidden{display:none!important}
:root[data-poly-capture-ui="hidden"] #poly-cam-panel{display:none!important}
#poly-cam-panel .capture{display:flex;align-items:center;gap:7px;margin:8px 0;color:var(--poly-glass-muted)}
body.poly-cam-clean #poly-cam-panel{display:none}
/* Leave PolyBot's HUD launcher and mode selector clear. */
body:has(.polybot-ai-hud-toggle:not([hidden])) #poly-cam-panel{--poly-tools-top:92px}
@media(min-width:680px){body:has(#polyshade-panel:not([hidden])) #poly-cam-panel{right:344px}}
@media(max-width:679px){
 body:has(#polyshade-panel:not([hidden])) #poly-cam-panel{max-height:calc((100dvh - var(--poly-tools-top) - 36px)/2)}
}
@media(prefers-reduced-motion:reduce){#poly-cam-panel *{transition:none!important}}
`;

export class UIController {
    constructor(owner) {
        this.owner = owner; this.root = null; this.style = null; this.lastCamera = null; this.activeRuntime = null;
        this.notice = ""; this.hookStatus = "Waiting for a run"; this.nativeHudHidden = false; this.collapsed = false;
        this.hidden = false;
    }
    mount() {
        if (this.root || !document.body) return;
        this.style = document.createElement("style"); this.style.textContent = STYLE; document.head.appendChild(this.style);
        const root = document.createElement("section"); root.id = "poly-cam-panel";
        root.setAttribute("aria-label", "PolyCam camera controls");
        root.innerHTML = `
            <header><span>PolyCam</span><span class="header-controls">
                <button class="state" data-action="toggle" title="Enable or disable PolyCam" aria-pressed="false">OFF</button>
                <button class="minimize" data-action="collapse" title="Minimize" aria-label="Minimize PolyCam" aria-expanded="true">−</button>
            </span></header>
            <div class="hook-status" role="status"></div>
            <label class="capture"><input type="checkbox" class="capture-windows"><span>Hide windows for recording (F2)</span></label>
            <div class="row"><label for="poly-cam-mode">Mode</label><select id="poly-cam-mode" class="mode">${MODES.map((m, i) => `<option value="${i}">${m}</option>`).join("")}</select></div>
            <div class="row"><label for="poly-cam-fov">FOV <span class="fov-label">72</span></label><input id="poly-cam-fov" class="fov" type="range" min="35" max="105" value="72"></div>
            <div class="row"><label>Transition</label><select class="transition"><option>CUT</option><option selected>BLEND</option></select></div>
            <div class="row"><label for="poly-cam-pace">Montage pace</label><select id="poly-cam-pace" class="montage-pace">${Object.keys(MONTAGE_PACES).map(p => `<option>${p}</option>`).join("")}</select></div>
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
            <div class="small">F6 toggle · F7 cameras · F8 montage · F9 clean · F10 freecam<br>F4 hide/show window · Freecam: drag to look · wheel changes speed</div>`;
        document.body.appendChild(root); this.root = root;
        const captureCheck = root.querySelector(".capture-windows");
        this.captureUI = attachPolyCaptureUI(globalThis, hidden => { captureCheck.checked = hidden; });
        captureCheck.addEventListener("change", () => this.captureUI.setHidden(captureCheck.checked));
        root.classList.toggle("panel-hidden", this.hidden);
        root.addEventListener("click", (event) => {
            event.stopPropagation();
            const action = event.target.closest("button[data-action]")?.dataset.action;
            if (action === "toggle") this.owner.toggleEnabled();
            if (action === "collapse") this.toggleCollapsed();
            if (action === "next") this.owner.nextMode(1);
            if (action === "previous") this.owner.nextMode(-1);
            if (action === "montage") this.owner.toggleMontage();
            if (action === "bookmark") {
                if (!this.lastCamera) { this.setNotice("Enable PolyCam in a run before saving a camera."); return; }
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
        root.querySelector(".montage-pace").addEventListener("change", e => this.owner.setMontagePace(e.target.value));
        root.querySelector(".bookmark").addEventListener("change", e => { if (e.target.value !== "") this.owner.restoreBookmark(Number(e.target.value)); });
        this.refresh(); this.setHookStatus(this.hookStatus);
    }
    toggleCollapsed() {
        this.collapsed = !this.collapsed; this.root.classList.toggle("collapsed", this.collapsed);
        const button = this.root.querySelector(".minimize"); button.textContent = this.collapsed ? "+" : "−";
        button.title = this.collapsed ? "Expand" : "Minimize";
        button.setAttribute("aria-label", this.collapsed ? "Expand PolyCam" : "Minimize PolyCam");
        button.setAttribute("aria-expanded", String(!this.collapsed));
    }
    toggleHidden() {
        this.hidden = !this.hidden;
        if (this.hidden && this.root?.contains(document.activeElement)) document.activeElement.blur();
        this.root?.classList.toggle("panel-hidden", this.hidden);
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
        this.root.querySelector(".montage-pace").value = this.owner.montagePace;
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
    dispose() { this.captureUI?.dispose(); this.captureUI = null; this.setClean(false); this.root?.remove(); this.root = null; this.style?.remove(); this.style = null; }
}
