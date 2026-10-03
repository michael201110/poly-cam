import { PolyMod, MixinType } from "https://cdn.polymodloader.com/cb/polytrackmods/PolyModLoader/0.6.3/PolyTypes.js";
// PML may reload this entry module from a blob URL when using its cache.
// Keep this import absolute so it resolves both from the CDN and from a blob.
import { PolyCam } from "https://cdn.polymodloader.com/gh/michael201110/poly-cam/stable/0.1.1/src/poly-cam.js";

class PolyCamMod extends PolyMod {
    init = (pml) => {
        this.pml = pml;
        this.controller = new PolyCam();

        // PolyTrack 0.6.3's car class exposes cameraOrbit and public transform getters.
        // Insert after native orbit/cockpit updates, so disabling Poly-Cam leaves the
        // vanilla update path completely intact.
        pml.registerClassMixin("ot.prototype", "updateCameras", {
            type: MixinType.INSERT,
            token: '(0, l.gn)(this, J, "f").update(t, n, i));\n                }',
            func: 'if (globalThis.__polyCamControllerV1?.enabled) globalThis.__polyCamControllerV1.updateVehicleCamera(this, e);'
        });

        this.controller.initialize(pml);
    };

    onGameLoad = () => this.controller?.mountUI();
    dispose = () => this.controller?.dispose();
}

export let polyMod = new PolyCamMod();
