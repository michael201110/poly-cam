import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";

const pmlRoot = process.env.POLYCAM_PML_ROOT;
if (!pmlRoot) throw new Error("Set POLYCAM_PML_ROOT to a PolyModLoader 0.6.3 checkout (game assets are not included in this repo).");
const repoRoot = resolve(".");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const mime = { ".js": "application/javascript", ".json": "application/json", ".html": "text/html", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".glb": "model/gltf-binary" };
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, "http://localhost");
        const isMod = url.pathname.startsWith("/mod/");
        const root = resolve(isMod ? repoRoot : pmlRoot);
        const path = resolve(root, "." + (isMod ? url.pathname.slice(4) : url.pathname === "/" ? "/index.html" : url.pathname));
        if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
        let body = await readFile(path);
        if (isMod && path.endsWith("main.mod.js")) body = Buffer.from(body.toString("utf8").replaceAll("https://cdn.polymodloader.com/cb/polytrackmods/PolyModLoader/0.6.3/PolyTypes.js", "/PolyTypes.js"));
        res.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream", "Cache-Control": "no-store", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" });
        res.end(body);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.POLYCAM_BROWSER, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("pageerror", err => { errors.push(err.message); console.error("PAGE ERROR:", err.message); });
    page.on("dialog", async dialog => { console.error("DIALOG:", dialog.message()); errors.push(dialog.message()); await dialog.dismiss(); });
    await page.addInitScript(({ base, version }) => {
        localStorage.setItem("polyMods", JSON.stringify([{ base, version, loaded: true }]));
    }, { base: origin + "/mod", version });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#poly-cam-panel", { timeout: 60000 });
    await page.waitForFunction(() => globalThis.__polyCamControllerV1?.cameraHookSeen, null, { timeout: 60000 });
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/game-menu.png" });
    await page.evaluate(() => {
        const controller = globalThis.__polyCamControllerV1;
        const update = controller.handleCameraUpdate.bind(controller);
        window.__polyCamTest = { hits: 0, physicsMutations: 0 };
        controller.handleCameraUpdate = (car, dt) => {
            const selected = car.cameraOrbit === controller.selectedCamera || car.cameraCockpit === controller.selectedCamera;
            if (!selected) { update(car, dt); return; }
            const before = JSON.stringify([car.getPosition(), car.getQuaternion(), car.getSpeedKmh(), car.getCarState()]);
            const native = { position: car.cameraOrbit.position.toArray(), quaternion: car.cameraOrbit.quaternion.toArray(), fov: car.cameraOrbit.fov };
            update(car, dt);
            if (before !== JSON.stringify([car.getPosition(), car.getQuaternion(), car.getSpeedKmh(), car.getCarState()])) window.__polyCamTest.physicsMutations++;
            window.__polyCamTest.car = car;
            window.__polyCamTest.native = native;
            window.__polyCamTest.hits++;
        };
        window.__polyCamSnapshot = () => {
            const car = window.__polyCamTest.car;
            const rt = controller.runtimes.get(car);
            const cam = car.cameraOrbit;
            return {
                mode: controller.modeIndex, appliedMode: rt?.lastMode, enabled: controller.enabled,
                position: cam.position.toArray(), quaternion: cam.quaternion.toArray(), fov: cam.fov,
                projection: cam.projectionMatrix.elements[5],
                carPosition: car.getPosition(), speed: car.getSpeedKmh(),
                local: cam.position.clone().sub(car.getPosition()).applyQuaternion(car.getQuaternion().clone().invert()).toArray(),
                native: window.__polyCamTest.native, hits: window.__polyCamTest.hits,
                physicsMutations: window.__polyCamTest.physicsMutations
            };
        };
    });
    await page.waitForFunction(() => window.__polyCamTest.hits > 0);
    const panel = page.locator("#poly-cam-panel");
    await panel.locator(".minimize").click();
    assert.equal(await panel.locator(".mode").isVisible(), false, "minimize hides controls");
    assert.ok((await panel.boundingBox()).height < 70, "minimized panel is compact");
    await panel.locator(".minimize").click();
    assert.equal(await panel.locator(".mode").isVisible(), true, "expand restores controls");
    await panel.locator(".state").click();
    await panel.locator(".transition").selectOption("CUT");
    for (let mode = 0; mode < 10; mode++) {
        await panel.locator(".mode").selectOption(String(mode));
        await page.waitForFunction(mode => window.__polyCamSnapshot().appliedMode === mode, mode);
        await page.waitForTimeout(mode === 0 ? 1800 : 100);
        const state = await page.evaluate(() => window.__polyCamSnapshot());
        assert.ok([...state.position, ...state.quaternion, state.fov].every(Number.isFinite), `rig ${mode} produces finite camera values`);
        assert.equal(state.physicsMutations, 0, `rig ${mode} preserves vehicle state`);
        assert.ok(Math.abs(state.projection - 1 / Math.tan(state.fov * Math.PI / 360)) < 1e-6, `rig ${mode} updates the rendered FOV projection`);
        if (mode === 0) assert.ok(state.local[2] < -6, "chase camera is behind the car");
        if (mode === 2) assert.ok(state.local[2] > 6, "front camera is ahead of the car");
        if (mode === 3) {
            assert.ok(state.local[0] > 5, "right side tracking");
            await panel.locator("[data-action=side]").click();
            await page.waitForTimeout(1800);
            assert.ok((await page.evaluate(() => window.__polyCamSnapshot())).local[0] < -5, "left side button moves camera");
        }
        if (mode === 5) await page.screenshot({ path: "artifacts/game-drone.png" });
    }
    await panel.locator(".fov").evaluate(el => { el.value = "45"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForFunction(() => Math.abs(window.__polyCamSnapshot().fov - 45) < 0.2);
    const freeStart = await page.evaluate(() => window.__polyCamSnapshot());
    await page.locator("canvas").first().click({ position: { x: 350, y: 300 } });
    await page.keyboard.down("w");
    await page.waitForTimeout(700);
    await page.keyboard.up("w");
    const freeEnd = await page.evaluate(() => window.__polyCamSnapshot());
    assert.ok(Math.hypot(...freeEnd.position.map((x, i) => x - freeStart.position[i])) > 3, "W moves freecam");
    assert.equal(freeEnd.speed, 0, "freecam movement does not drive the car");
    await page.mouse.move(350, 300);
    await page.mouse.down();
    await page.mouse.move(440, 340, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const looked = await page.evaluate(() => window.__polyCamSnapshot());
    assert.ok(looked.quaternion.some((x, i) => Math.abs(x - freeEnd.quaternion[i]) > 0.02), "mouse drag changes freecam orientation");
    await panel.locator("[data-action=trackside]").click();
    await page.waitForFunction(() => window.__polyCamSnapshot().appliedMode === 6);
    assert.match(await panel.locator(".notice").innerText(), /placed/);
    await page.evaluate(() => globalThis.__polyCamControllerV1.saveBookmark("Smoke test"));
    assert.equal(await panel.locator(".bookmark option").count(), 2);
    await panel.locator(".mode").selectOption("5");
    await panel.locator(".bookmark").selectOption("0");
    await page.waitForFunction(() => window.__polyCamSnapshot().appliedMode === 9);
    const restored = await page.evaluate(() => ({ state: window.__polyCamSnapshot(), bookmark: globalThis.__polyCamControllerV1.bookmarks[0] }));
    assert.ok(Math.hypot(...restored.state.position.map((x, i) => x - [restored.bookmark.position.x, restored.bookmark.position.y, restored.bookmark.position.z][i])) < 0.1, "bookmark restores camera position");
    await panel.locator(".timeline").fill('[{"time":0,"mode":"Front Chase"},{"time":0.6,"mode":"Drone Cam"}]');
    await panel.locator("[data-action=timeline-load]").click();
    await panel.locator("[data-action=timeline]").click();
    await page.waitForFunction(() => window.__polyCamSnapshot().appliedMode === 2);
    await page.waitForFunction(() => window.__polyCamSnapshot().appliedMode === 5 && !globalThis.__polyCamControllerV1.timelineState.playing);
    await panel.locator("[data-action=montage]").click();
    const montageStart = await page.evaluate(() => window.__polyCamSnapshot().mode);
    await page.waitForFunction(mode => window.__polyCamSnapshot().mode !== mode, montageStart, { timeout: 15000 });
    await panel.locator("[data-action=montage]").click();
    await page.locator("canvas").first().click({ position: { x: 350, y: 300 } });
    await page.keyboard.press("F9");
    assert.equal(await panel.isVisible(), false, "clean capture hides panel");
    await page.screenshot({ path: "artifacts/game-clean-capture.png" });
    await page.keyboard.press("F9");
    assert.equal(await panel.isVisible(), true, "F9 restores panel");
    await page.keyboard.press("F6");
    await page.waitForFunction(() => !globalThis.__polyCamControllerV1.enabled);
    const nativeRestored = await page.evaluate(() => window.__polyCamSnapshot());
    assert.deepEqual(nativeRestored.position, nativeRestored.native.position, "disable restores native position");
    assert.deepEqual(nativeRestored.quaternion, nativeRestored.native.quaternion, "disable restores native rotation");
    assert.equal(nativeRestored.fov, nativeRestored.native.fov, "disable restores native FOV");
    await page.keyboard.press("F6");
    await page.locator("#ui").getByText("Next Track", { exact: true }).click();
    await page.waitForFunction(() => document.getElementById("ui").innerText.includes("Summer 2"));
    await page.waitForTimeout(1200);
    const nextTrack = await page.evaluate(() => window.__polyCamSnapshot());
    assert.ok(nextTrack.enabled && nextTrack.hits > nativeRestored.hits, "camera hook continues after track changes");
    await page.screenshot({ path: "artifacts/game-next-track.png" });
    await panel.locator(".mode").selectOption("0");
    await page.locator("canvas").first().click({ position: { x: 350, y: 300 } });
    await page.keyboard.down("w");
    await page.waitForFunction(() => window.__polyCamSnapshot().speed > 10);
    await page.keyboard.up("w");
    await page.keyboard.press("c");
    await page.waitForFunction(() => globalThis.__polyCamControllerV1.selectedCamera === window.__polyCamTest.car.cameraCockpit);
    const cockpit = await page.evaluate(() => ({ orbit: window.__polyCamTest.car.cameraOrbit.position.toArray(), cockpit: window.__polyCamTest.car.cameraCockpit.position.toArray() }));
    assert.deepEqual(cockpit.orbit, cockpit.cockpit, "native cockpit selection also uses the cinematic camera");
    await page.screenshot({ path: "artifacts/game-driving.png" });
    await panel.locator(".mode").focus();
    await page.keyboard.press("F6");
    await page.waitForFunction(() => !globalThis.__polyCamControllerV1.enabled);
    await page.keyboard.press("F6");
    await page.waitForFunction(() => globalThis.__polyCamControllerV1.enabled);
    assert.equal(nextTrack.physicsMutations, 0);
    assert.equal((await page.evaluate(() => window.__polyCamSnapshot())).physicsMutations, 0);
    console.log("PASS: real PolyTrack 0.6.3 startup, all ten rigs, side control, FOV projection, freecam keys/mouse, bookmarks, timeline, montage, minimize, clean capture, native restore, track reload, live driving and cockpit selection; no vehicle-state mutations.");
    assert.equal(errors.length, 0, errors.join("\n"));
} finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
