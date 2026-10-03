import { MODES } from "./rigs.js";

const STYLE = `
#poly-cam-panel{position:fixed;z-index:2147483000;top:16px;right:16px;width:276px;padding:14px;color:#f4f7fa;background:rgba(10,16,22,.92);border:1px solid rgba(255,255,255,.18);border-radius:10px;font:12px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px #0008;backdrop-filter:blur(10px)}
#poly-cam-panel *{box-sizing:border-box}#poly-cam-panel header{display:flex;justify-content:space-between;align-items:center;font-weight:800;letter-spacing:.14em;margin-bottom:9px}#poly-cam-panel .header-controls{display:flex;align-items:center;gap:8px}#poly-cam-panel .hook-status{font-size:9px;letter-spacing:0;opacity:.75}#poly-cam-panel .hook-status.active{color:#85e0a3;opacity:1}#poly-cam-panel button,#poly-cam-panel select,#poly-cam-panel input{font:inherit;color:inherit;background:#202c36;border:1px solid #60707e;border-radius:5px;padding:6px}#poly-cam-panel button{cursor:pointer}#poly-cam-panel button:hover{background:#334553}#poly-cam-panel .minimize{width:25px;height:25px;padding:0;font-size:17px;line-height:1}#poly-cam-panel .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:7px 0}#poly-cam-panel select{width:150px}#poly-cam-panel input[type=range]{width:126px;padding:0}#poly-cam-panel .actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}#poly-cam-panel .small{opacity:.72;font-size:10px}#poly-cam-panel .notice{color:#8fdaff;min-height:15px}#poly-cam-panel.collapsed{width:auto;min-width:150px;padding:9px 12px}#poly-cam-panel.collapsed header{margin-bottom:0}#poly-cam-panel.collapsed>*:not(header){display:none!important}body.poly-cam-clean #poly-cam-panel{display:none}`;

export class UIController {
    constructor(owner) { this.owner = owner; this.root = null; this.style = null; this.lastCamera = null; this.activeRuntime = null; this.notice = ""; this.nativeHudHidden = false; }
    mount() {
        if (this.root || !document.body) return;
        const style = document.createElement("style"); style.textContent = STYLE; document.head.appendChild(style); this.style = style;
        const root = document.createElement("section"); root.id = "poly-cam-panel";
        root.innerHTML = `<header><span>POLY-CAM</span><span class="header-controls"><span class="hook-status">Hook: waiting</span><span class="state"></span><button class="minimize" type="button" aria-label="Minimize Poly-Cam" title="Minimize">−</button></span></header><div class="row"><label>Mode</label><select class="mode">${MODES.map((m, i) => `<option value="${i}">${m}</option>`).join("")}</select></div><div class="row"><label>FOV <span class="fov-label">72</span></label><input class="fov" type="range" min="35" max="105" value="72"></div><div class="row"><label>Transition</label><select class="transition"><option>CUT</option><option selected>BLEND</option></select></div><div class="row"><label>Side / mount</label><button data-action="side">Right</button><select class="mount"><option>Front bumper</option><option>Rear bumper</option><option>Bonnet</option><option selected>Roof</option><option>Front-left wheel</option><option>Front-right wheel</option><option>Rear wheel</option></select></div><div class="row"><label>Fixed trackside orientation</label><input class="trackside-fixed" type="checkbox"></div><div class="actions"><button data-action="previous">Previous</button><button data-action="next">Next</button><button data-action="montage">Montage</button><button data-action="bookmark">Save Camera</button><button data-action="trackside">Place Trackside</button><button data-action="clean">Clean Capture</button><button data-action="timeline">Play Timeline</button><button data-action="timeline-reset">Reset Timeline</button></div><div class="row"><label>Loop timeline</label><input class="timeline-loop" type="checkbox"></div><div class="row"><label>Timeline JSON</label></div><input class="timeline" style="width:100%" value='[{"time":0,"mode":"Trackside Cam"},{"time":2.2,"mode":"Low Chase"},{"time":4.8,"mode":"Drone Cam"}]'><button class="timeline-load" style="width:100%;margin-top:5px">Load timeline</button><div class="row"><select class="bookmark" style="width:100%"><option value="">Bookmarks</option></select></div><div class="notice"></div><div class="small">F6 toggle | F7 cameras | F8 montage | F9 clean | F10 freecam</div>`;
        document.body.appendChild(root); this.root = root;
        root.querySelector(".minimize").addEventListener("click", (event) => {
            const collapsed = root.classList.toggle("collapsed");
            event.currentTarget.textContent = collapsed ? "+" : "−";
            event.currentTarget.title = collapsed ? "Expand" : "Minimize";
            event.currentTarget.setAttribute("aria-label", collapsed ? "Expand Poly-Cam" : "Minimize Poly-Cam");
        });
        root.querySelector(".mode").addEventListener("change", e => this.owner.setMode(Number(e.target.value)));
        root.querySelector(".fov").addEventListener("input", e => { this.owner.baseFov = Number(e.target.value); root.querySelector(".fov-label").textContent = e.target.value; });
        root.querySelector(".mount").addEventListener("change", e => { this.owner.mount = e.target.value; });
        root.querySelector(".trackside-fixed").addEventListener("change", e => { this.owner.fixedTracksideOrientation = e.target.checked; if (this.activeRuntime) this.activeRuntime.tracksideFixed = e.target.checked; });
        root.querySelector(".timeline-loop").addEventListener("change", e => { this.owner.timelineState.loop = e.target.checked; });
        root.querySelector(".transition").addEventListener("change", e => { this.owner.transitionMode = e.target.value; });
        root.querySelector(".actions").addEventListener("click", e => {
            const action = e.target.dataset.action;
            if (action === "next") this.owner.nextMode(1);
            if (action === "previous") this.owner.nextMode(-1);
            if (action === "montage") this.owner.toggleMontage();
            if (action === "bookmark") { const name = prompt("Bookmark name", `Camera ${this.owner.bookmarks.length + 1}`); if (name) this.owner.saveBookmark(name); }
            if (action === "trackside") this.placeTrackside();
            if (action === "clean") this.owner.toggleCleanCapture();
            if (action === "timeline") this.owner.toggleTimeline();
            if (action === "timeline-reset") this.owner.resetTimeline();
            if (action === "side") { this.owner.side *= -1; e.target.textContent = this.owner.side > 0 ? "Right" : "Left"; }
        });
        root.querySelector(".timeline-load").addEventListener("click", () => { try { this.owner.loadTimeline(root.querySelector(".timeline").value); this.setNotice("Timeline loaded."); } catch (error) { this.setNotice(error.message); } });
        root.querySelector(".bookmark").addEventListener("change", e => { if (e.target.value !== "") this.owner.restoreBookmark(Number(e.target.value)); });
        this.refresh();
    }
    refresh() {
        if (!this.root) return;
        this.root.querySelector(".mode").value = String(this.owner.modeIndex);
        this.root.querySelector(".state").textContent = this.owner.enabled ? "ON" : "OFF";
        this.root.querySelector("[data-action=montage]").textContent = this.owner.montage ? "Montage: ON" : "Montage";
        this.root.querySelector(".fov").value = String(this.owner.baseFov);
        this.root.querySelector(".fov-label").textContent = String(this.owner.baseFov);
        this.root.querySelector(".mount").value = this.owner.mount;
        this.root.querySelector("[data-action=side]").textContent = this.owner.side > 0 ? "Right" : "Left";
        this.root.querySelector(".trackside-fixed").checked = !!this.owner.fixedTracksideOrientation;
        this.root.querySelector(".timeline-loop").checked = this.owner.timelineState.loop;
        const select = this.root.querySelector(".bookmark");
        select.innerHTML = `<option value="">Bookmarks</option>${this.owner.bookmarks.map((b, i) => `<option value="${i}">${this.escape(b.name)}</option>`).join("")}`;
    }
    setClean(enabled) {
        document.body.classList.toggle("poly-cam-clean", enabled);
        if (enabled) { this.previousCursor = document.body.style.cursor; document.body.style.cursor = "none"; }
        else document.body.style.cursor = this.previousCursor || "";
        if (this.nativeHudHidden !== enabled) {
            // PolyTrack 0.6.3 binds ToggleUI to KeyH; use its own reversible UI toggle.
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true, cancelable: true }));
            this.nativeHudHidden = enabled;
        }
    }
    setHookStatus(message) {
        const status = this.root?.querySelector(".hook-status");
        if (!status || status.textContent === message) return;
        status.textContent = message;
        status.classList.toggle("active", message === "Hook: active");
    }
    setTransitionMode(mode) { if (this.root) this.root.querySelector(".transition").value = mode; }
    setNotice(message) { this.notice = message; if (this.root) this.root.querySelector(".notice").textContent = message; }
    placeTrackside() {
        if (this.owner.mode !== "Freecam") { this.setNotice("Switch to Freecam, position the camera, then place Trackside."); return; }
        if (!this.activeRuntime) { this.setNotice("Enable Poly-Cam and enter Freecam to place a camera."); return; }
        const rt = this.activeRuntime;
        rt.trackside.x = rt.freePosition.x; rt.trackside.y = rt.freePosition.y; rt.trackside.z = rt.freePosition.z;
        const e = rt.freeEuler;
        rt.tracksideLook.x = rt.freePosition.x + Math.sin(e.y) * Math.cos(e.x) * 40;
        rt.tracksideLook.y = rt.freePosition.y + Math.sin(e.x) * 40;
        rt.tracksideLook.z = rt.freePosition.z - Math.cos(e.y) * Math.cos(e.x) * 40;
        rt.tracksideFixed = this.owner.fixedTracksideOrientation;
        rt.tracksidePlaced = true; this.setNotice("Trackside position saved.");
    }
    escape(value) { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
    dispose() { this.setClean(false); this.root?.remove(); this.root = null; this.style?.remove(); this.style = null; }
}
