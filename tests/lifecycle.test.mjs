import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRigs } from "../src/rigs.js";
import { InputController } from "../src/input.js";
import { PolyCam } from "../src/poly-cam.js";

test("camera patch is installed before game classes are created, and native update is preserved", async () => {
    const code = (await readFile("0.1.6/main.mod.js", "utf8")).replace(
        /import \{ PolyMod, MixinType \} from "https:[^"]+";/,
        "class PolyMod { preInit = () => {}; } const MixinType = { INSERT: 4 };"
    );
    const { polyMod } = await import("data:text/javascript," + encodeURIComponent(code));
    let globalFunc = function () {
        globalThis.PolyCamTestCar = class {
            constructor() { this.nativeCalls = 0; }
            updateCameras(dt) { this.nativeCalls++; this.lastNativeDt = dt; }
        };
        globalThis.PolyCamTestRenderer = class { setCamera(camera) { this.camera = camera; } };
    };
    let registrations = 0;
    const pml = {
        getFromPolyTrackGlobal: () => globalFunc,
        registerGlobalMixin({ token, func }) {
            registrations++;
            const source = globalFunc.toString();
            const index = source.indexOf(token);
            assert.ok(index >= 0);
            globalFunc = (0, eval)("(" + source.slice(0, index + token.length) + func + source.slice(index + token.length) + ")");
        },
        registerBindCategory() {}, registerKeybind() {}
    };
    globalThis.document = { body: null, addEventListener() {} };
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    try {
        await polyMod.preInit(pml);
        assert.equal(registrations, 2, "preInit must install both camera patches");
        globalFunc();
        await polyMod.init(pml);
        assert.equal(registrations, 2, "init must not patch the already-executing globalFunc");
        const hits = [];
        polyMod.controller.handleCameraUpdate = (car, dt) => hits.push({ car, dt });
        const car = new globalThis.PolyCamTestCar();
        const camera = {};
        new globalThis.PolyCamTestRenderer().setCamera(camera);
        assert.equal(polyMod.controller.selectedCamera, camera);
        car.updateCameras(1 / 60);
        assert.equal(car.nativeCalls, 1);
        assert.equal(hits.length, 1);
        assert.equal(hits[0].car, car);
        assert.equal(hits[0].dt, 1 / 60);
        polyMod.dispose();
    } finally {
        delete globalThis.PolyCamTestCar;
        delete globalThis.PolyCamTestRenderer;
        delete globalThis.__polyCamControllerV1;
        delete globalThis.document;
        delete globalThis.window;
    }
});

test("distributed entry has no relative imports that break PML's blob cache", async () => {
    const code = await readFile("0.1.6/main.mod.js", "utf8");
    assert.doesNotMatch(code, /(?:import|export).*?from\s*["']\./);
    assert.match(code, /export\s*\{\s*polyMod\s*\}/);
});

test("chase and front cameras use PolyTrack's +Z vehicle forward convention", () => {
    const rigs = createRigs();
    const context = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, speed: 0 };
    const runtime = { fov: 72 };
    const output = () => ({ position: {}, target: {} });
    const chase = rigs[0].compose(context, runtime, output());
    const front = rigs[2].compose(context, runtime, output());
    assert.ok(chase.position.z < 0 && chase.target.z > 0);
    assert.ok(front.position.z > 0 && front.target.z < 0);
});

test("freecam forward follows its yaw rather than moving sideways away from its view", () => {
    const input = new InputController({ ui: {} });
    input.keys.add("KeyW");
    const runtime = { freeEuler: { x: 0, y: Math.PI / 2 }, freePosition: { x: 0, y: 0, z: 0 } };
    input.stepFreecam(runtime, 1);
    assert.ok(runtime.freePosition.x < 0);
    assert.ok(Math.abs(runtime.freePosition.z) < 1e-6);
});

test("replay ghosts cannot consume input or advance the selected car's camera", () => {
    const controller = new PolyCam();
    const selected = { cameraOrbit: {}, cameraCockpit: {}, getPosition() {} };
    const ghost = { cameraOrbit: {}, cameraCockpit: {}, getPosition() {} };
    controller.enabled = true;
    controller.selectCamera(selected.cameraCockpit);
    const updates = [];
    controller.updateVehicleCamera = (car, dt) => updates.push({ car, dt });
    controller.handleCameraUpdate(ghost, 0.016);
    controller.handleCameraUpdate(selected, 0.016);
    assert.deepEqual(updates, [{ car: selected, dt: 0.016 }]);
    assert.equal(controller.ui.lastCamera, selected.cameraOrbit);
});

test("freecam right strafe is perpendicular to forward at a rotated yaw", () => {
    const input = new InputController({ ui: {} });
    input.keys.add("KeyD");
    const runtime = { freeEuler: { x: 0, y: Math.PI / 2 }, freePosition: { x: 0, y: 0, z: 0 } };
    input.stepFreecam(runtime, 1);
    assert.ok(runtime.freePosition.z < 0);
    assert.ok(Math.abs(runtime.freePosition.x) < 1e-6);
});
