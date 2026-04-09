import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- Set up Scene, Renderer & Camera ---
const container = document.getElementById('webgl-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a101d);
scene.fog = new THREE.FogExp2(0x0a101d, 0.0035);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(0, 150, 250);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3; // Boosted for visible colors
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2.1;
controls.target.set(0, 20, 0);

// --- Post Processing ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Intensified bloom for glowing features
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.6, 0.2);
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// --- Advanced Lighting (Synthwave / Tech-Noir Dual Tone) ---
const ambient = new THREE.AmbientLight(0x1a2135, 1.8); // Brighter ambient
scene.add(ambient);

// EXTREMELY intense Orange/Red Lava light from Left
const lightRed = new THREE.DirectionalLight(0xff4411, 8.0);
lightRed.position.set(-200, 60, 50);
lightRed.castShadow = true;
lightRed.shadow.mapSize.width = 2048;
lightRed.shadow.mapSize.height = 2048;
lightRed.shadow.camera.left = -150;
lightRed.shadow.camera.right = 150;
lightRed.shadow.camera.top = 150;
lightRed.shadow.camera.bottom = -150;
scene.add(lightRed);

// EXTREMELY intense Cyan/Teal Moonlight from Right
const lightTeal = new THREE.DirectionalLight(0x00ffff, 6.0);
lightTeal.position.set(200, 100, -50);
lightTeal.castShadow = true;
lightTeal.shadow.mapSize.width = 2048;
lightTeal.shadow.mapSize.height = 2048;
lightTeal.shadow.camera.left = -150;
lightTeal.shadow.camera.right = 150;
lightTeal.shadow.camera.top = 150;
lightTeal.shadow.camera.bottom = -150;
scene.add(lightTeal);

const fillLight = new THREE.DirectionalLight(0x3355ee, 2.0);
fillLight.position.set(0, 150, 0);
scene.add(fillLight);

// --- Procedural Terrain Generation ---
// Same high-quality noise generation
function fract(n) { return n - Math.floor(n); }
function random(x, y) { return fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123); }
function noise(x, y) {
    const ix = Math.floor(x); const iy = Math.floor(y);
    const fx = fract(x); const fy = fract(y);
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);
    const a = random(ix, iy); const b = random(ix + 1, iy);
    const c = random(ix, iy + 1); const d = random(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy * (1.0 - ux) + (d - c) * ux * uy;
}
function fbm(x, y) {
    let v = 0.0; let a = 0.5; let pX = x; let pY = y;
    for (let i = 0; i < 6; i++) {
        v += a * noise(pX, pY);
        let nx = pX * 0.8 - pY * 0.6;
        let ny = pX * 0.6 + pY * 0.8;
        pX = nx * 2.0 + 100.0; pY = ny * 2.0 + 100.0;
        a *= 0.5;
    }
    return v;
}
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3.0 - 2.0 * t);
}

const terrainSize = 600;
const segments = 300;
const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
terrainGeo.rotateX(-Math.PI / 2);

const pos = terrainGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    
    let n = fbm(x * 0.005, z * 0.005);
    let h = n * 160;
    
    let distFromCenter = Math.abs((x * 0.8) + (z * 0.6)); 
    let valley = smoothstep(0, 120, distFromCenter);
    
    h = h * (0.05 + 0.95 * Math.pow(valley, 1.5));
    h += fbm(x * 0.04, z * 0.04) * 10.0; 
    h += fbm(x * 0.1, z * 0.1) * 2.5;

    if (h < 5) h = h * 0.3; 
    pos.setY(i, h);
}
terrainGeo.computeVertexNormals();

// Make terrain lighter so it reflects the orange/teal lights intensely
const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x333b4d, // Lighter base to catch colors well
    roughness: 0.8,
    metalness: 0.2,
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// High-Tech Wireframe Overlay (Teal)
const wireframeGeo = terrainGeo.clone();
const wireframeMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    wireframe: true,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const wireframe = new THREE.Mesh(wireframeGeo, wireframeMat);
wireframe.position.y += 0.3;
scene.add(wireframe);

// --- Flooded Area / Cyber River ---
const waterGeo = new THREE.PlaneGeometry(terrainSize, terrainSize);
const waterMat = new THREE.MeshStandardMaterial({
    color: 0x00ffee,
    roughness: 0.0,
    metalness: 1.0,
    transparent: true,
    opacity: 0.45,
    emissive: 0x001122,
    emissiveIntensity: 0.5
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = 8;
water.receiveShadow = true;
scene.add(water);

const waterGrid = new THREE.Mesh(
    waterGeo,
    new THREE.MeshBasicMaterial({
        color: 0x00ffff, 
        wireframe: true, 
        transparent: true, 
        opacity: 0.25, 
        blending: THREE.AdditiveBlending
    })
);
waterGrid.rotation.x = -Math.PI / 2;
waterGrid.position.y = 8.2;
scene.add(waterGrid);

// --- Controllable Drone Framework ---

// Drone Object
const playerDrone = new THREE.Group();
playerDrone.position.set(0, 60, 0);

// Core geometry
const droneCoreGeo = new THREE.OctahedronGeometry(2, 1);
const droneCoreMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.1 });
const droneCore = new THREE.Mesh(droneCoreGeo, droneCoreMat);
playerDrone.add(droneCore);

// Glowing Halo ring around core
const droneHaloGeo = new THREE.RingGeometry(3.5, 4, 32);
const droneHaloMat = new THREE.MeshBasicMaterial({ 
    color: 0x00ff88, side: THREE.DoubleSide, 
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending 
});
const droneHalo = new THREE.Mesh(droneHaloGeo, droneHaloMat);
droneHalo.rotation.x = Math.PI / 2;
playerDrone.add(droneHalo);

// 4 Rotor Indicators
const axes = [
    [3.5, 3.5], [-3.5, 3.5], [3.5, -3.5], [-3.5, -3.5]
];
const rotors = [];
axes.forEach(pos => {
    const rotor = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.5, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    rotor.position.set(pos[0], 0, pos[1]);
    rotor.rotation.x = Math.PI / 2;
    rotors.push(rotor);
    playerDrone.add(rotor);
});

// Drone Pointlight & Spotlight pointing down
const dronePointLight = new THREE.PointLight(0x00ff88, 3, 40);
playerDrone.add(dronePointLight);

const droneSpotLight = new THREE.SpotLight(0x00ff88, 10, 150, Math.PI / 8, 0.5, 1);
droneSpotLight.position.set(0, 0, 0);
droneSpotLight.target.position.set(0, -20, 0); // Point down
playerDrone.add(droneSpotLight);
playerDrone.add(droneSpotLight.target);

scene.add(playerDrone);

// Movement logic variables
const movementSpeed = 60.0; // Units per second
const velocity = new THREE.Vector3();
const keyState = {
    w: false, a: false, s: false, d: false, 
    arrowUp: false, arrowDown: false,
    space: false, shift: false,
    arrowLeft: false, arrowRight: false
};

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w') keyState.w = true;
    if (key === 's') keyState.s = true;
    if (key === 'a') keyState.a = true;
    if (key === 'd') keyState.d = true;
    if (key === ' ') keyState.space = true;
    if (e.key === 'Shift') keyState.shift = true;
    if (e.key === 'ArrowUp') keyState.arrowUp = true;
    if (e.key === 'ArrowDown') keyState.arrowDown = true;
    if (e.key === 'ArrowLeft') keyState.arrowLeft = true;
    if (e.key === 'ArrowRight') keyState.arrowRight = true;
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w') keyState.w = false;
    if (key === 's') keyState.s = false;
    if (key === 'a') keyState.a = false;
    if (key === 'd') keyState.d = false;
    if (key === ' ') keyState.space = false;
    if (e.key === 'Shift') keyState.shift = false;
    if (e.key === 'ArrowUp') keyState.arrowUp = false;
    if (e.key === 'ArrowDown') keyState.arrowDown = false;
    if (e.key === 'ArrowLeft') keyState.arrowLeft = false;
    if (e.key === 'ArrowRight') keyState.arrowRight = false;
});

// Markers & 'Secret Base' Pin
const baseGeo = new THREE.SphereGeometry(1.5, 32, 32);
const baseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const basePeak = new THREE.Mesh(baseGeo, baseMat);
basePeak.position.set(-60, 85, -80); 
scene.add(basePeak);

const baseLight = new THREE.PointLight(0xffffff, 50, 200);
baseLight.position.copy(basePeak.position);
scene.add(baseLight);

const floatingLabel = document.querySelector('.floating-label');
const labelTarget = basePeak.position.clone();


// --- Resize Handling ---
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // 1. Water animation
    water.position.y = 8 + Math.sin(time * 0.8) * 0.5;
    waterGrid.position.y = water.position.y + 0.2;

    // 2. Secret Base Marker animation
    // baseRing.scale.setScalar(1.0 + Math.sin(time * 3) * 0.1);

    // 3. Drone Movement System
    velocity.set(0, 0, 0);

    // Forward/Backward (relative to World for simple W A S D) 
    // Usually developers want W to go "forward" along Z axis.
    if (keyState.w || keyState.arrowUp) velocity.z -= movementSpeed * delta;
    if (keyState.s || keyState.arrowDown) velocity.z += movementSpeed * delta;
    
    // Left/Right
    if (keyState.a || keyState.arrowLeft) velocity.x -= movementSpeed * delta;
    if (keyState.d || keyState.arrowRight) velocity.x += movementSpeed * delta;

    // Up/Down Height
    if (keyState.space) velocity.y += movementSpeed * delta;
    if (keyState.shift) velocity.y -= movementSpeed * delta;

    // Apply movement
    playerDrone.position.add(velocity);

    // Prevent drone from going below ground (simple mock bounding)
    if (playerDrone.position.y < 12) playerDrone.position.y = 12;

    // Drone visual animations
    droneHalo.rotation.z -= delta * 3;
    rotors.forEach(r => r.rotation.z += delta * 15);
    
    // Tilt drone slightly based on velocity
    playerDrone.rotation.x = THREE.MathUtils.lerp(playerDrone.rotation.x, velocity.z * 0.3, 0.1);
    playerDrone.rotation.z = THREE.MathUtils.lerp(playerDrone.rotation.z, -velocity.x * 0.3, 0.1);

    // Make the spotlight target track below it
    droneSpotLight.target.position.set(
        playerDrone.position.x, 
        playerDrone.position.y - 20, 
        playerDrone.position.z
    );

    // 4. Update UI label projection
    if (floatingLabel) {
        const p = labelTarget.clone();
        p.project(camera);
        if (p.z < 1) { 
            const x = (p.x *  .5 + .5) * window.innerWidth;
            const y = (p.y * -.5 + .5) * window.innerHeight;
            floatingLabel.style.transform = `translate(-50%, -150%)`;
            floatingLabel.style.left = `${x}px`;
            floatingLabel.style.top = `${y}px`;
            floatingLabel.style.opacity = '1';
        } else {
            floatingLabel.style.opacity = '0';
        }
    }

    // Smoothly follow the drone slightly if it moves
    controls.target.lerp(playerDrone.position, 0.05);

    controls.update();
    composer.render();
}

animate();