import { PolyMod, MixinType } from "https://cdn.polymodloader.com/cb/polytrackmods/PolyModLoader/0.6.3/PolyTypes.js";
// PML may reload this entry module from a blob URL when using its cache.
// Keep this import absolute so it resolves both from the CDN and from a blob.
import { PolyCam } from "https://cdn.polymodloader.com/gh/michael201110/poly-cam/v0.1.2/0.1.2/src/poly-cam.js";

class PolyCamMod extends PolyMod {
    init = (pml) => {
        this.pml = pml;
        this.controller = new PolyCam();

        // Patch the unique PolyTrack 0.6.3 camera update call. A global mixin avoids
        // relying on a minified class name, which is not available through PML's
        // class lookup for this webpack module.
        pml.registerGlobalMixin({
            type: MixinType.INSERT,
            token: '(0,l.gn)(this,J,"f").update(t,n,i)',
            func: ';if (globalThis.__polyCamControllerV1?.enabled) globalThis.__polyCamControllerV1.updateVehicleCamera(this,e);'
        });

        this.controller.initialize(pml);
    };

    onGameLoad = () => this.controller?.mountUI();
    dispose = () => this.controller?.dispose();
}

export let polyMod = new PolyCamMod();
