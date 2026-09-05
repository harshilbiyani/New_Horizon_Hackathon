import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let SIM_CONFIG = { WORLD_BOUNDARY: 350, GRID_SIZE: 40 };
fetch('http://localhost:3001/api/config')
    .then(res => res.json())
    .then(cfg => { SIM_CONFIG = cfg; })
    .catch(() => { });

let loadedDroneModel = null;
const _droneLoader = new GLTFLoader();
_droneLoader.load('../drone.glb', (gltf) => {
    loadedDroneModel = gltf.scene;
    // Optional: scale your custom drone if it's too big/small
    // loadedDroneModel.scale.set(5, 5, 5); 
}, undefined, (err) => console.error('Error loading drone:', err));

// --- Follow Mode Detection ---
const urlParams = new URLSearchParams(window.location.search);
const followDroneId = urlParams.get('follow');
const isFollowMode = !!followDroneId;
let followTarget = { x: 0, y: 80, z: 0 };

if (isFollowMode) {
    const uiLayer = document.getElementById('ui-layer');
    if (uiLayer) uiLayer.style.display = 'none';
}

// --- Scene Setup ---
const container = document.getElementById('webgl-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9ebfa); // Matches horizon
// Fog completely removed!

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2500);
camera.position.set(0, 250, 150);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1)); // PERFORMANCE: Capped at 1 to prevent lag on 4K/Retina displays
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // Reduced from 1.4 for clarity
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12; // PERFORMANCE: Increased damping makes camera controls feel snappier and less "floaty"
controls.maxPolarAngle = Math.PI / 2.1;
controls.target.set(0, 15, 0);
controls.minDistance = 20;
controls.maxDistance = 800;

if (isFollowMode) {
    controls.enabled = true;
    // Let OrbitControls handle lookAt, just move the target
}

// --- Post Processing ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.25, 0.4, 0.8
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- Lighting ---
// Clean, bright daytime lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const sunLight = new THREE.DirectionalLight(0xfff5e6, 3.2);
sunLight.position.set(-150, 250, 100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -200;
sunLight.shadow.camera.right = 200;
sunLight.shadow.camera.top = 200;
sunLight.shadow.camera.bottom = -200;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x99ccff, 0.8);
rimLight.position.set(200, 80, -80);
scene.add(rimLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x667788, 0.6);
scene.add(hemiLight);

// --- Atmosphere and Tactical Rings ---
const atmosphereUniforms = {
    uTime: { value: 0 },
};

const skyDomeGeo = new THREE.SphereGeometry(1350, 48, 48);
const skyDomeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    uniforms: atmosphereUniforms,
    vertexShader: `
        varying vec3 vPos;
        void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        varying vec3 vPos;
        uniform float uTime;

        void main() {
            float h = normalize(vPos).y * 0.5 + 0.5;
            // Clean daytime sky gradient
            vec3 zenith = vec3(0.2, 0.55, 0.95);
            vec3 horizon = vec3(0.85, 0.92, 0.98);
            vec3 grad = mix(horizon, zenith, smoothstep(0.45, 0.9, h));
            gl_FragColor = vec4(grad, 1.0);
        }
    `,
});

const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
scene.add(skyDome);
// Floor completely removed!

const tacticalRingGroup = new THREE.Group();
scene.add(tacticalRingGroup);
for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.TorusGeometry(130 + i * 24, 0.42, 8, 128);
    const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x6ef0da : 0xff7b6b,
        transparent: true,
        opacity: 0.16 - i * 0.03,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4 + i * 8;
    ring.userData.spin = (i % 2 === 0 ? 1 : -1) * (0.0008 + i * 0.0002);
    tacticalRingGroup.add(ring);
}

// --- Elevation Color Helper (returns color by height) ---
function getTerrainColor(height, maxHeight) {
    const ratio = height / maxHeight;
    const color = new THREE.Color();

    if (ratio < 0.08) {
        color.setHSL(0.58, 0.7, 0.18);
    } else if (ratio < 0.15) {
        color.lerpColors(new THREE.Color(0x1a4a5e), new THREE.Color(0x2a6040), (ratio - 0.08) / 0.07);
    } else if (ratio < 0.35) {
        const t = (ratio - 0.15) / 0.20;
        color.lerpColors(new THREE.Color(0x1e5a28), new THREE.Color(0x3d7a3a), t);
    } else if (ratio < 0.55) {
        const t = (ratio - 0.35) / 0.20;
        color.lerpColors(new THREE.Color(0x3d7a3a), new THREE.Color(0x6b5a3e), t);
    } else if (ratio < 0.72) {
        const t = (ratio - 0.55) / 0.17;
        color.lerpColors(new THREE.Color(0x5a4a38), new THREE.Color(0x7a6a58), t);
    } else if (ratio < 0.88) {
        const t = (ratio - 0.72) / 0.16;
        color.lerpColors(new THREE.Color(0x7a6a58), new THREE.Color(0x505058), t); // Making tall areas dark grey
    } else {
        const t = (ratio - 0.88) / 0.12;
        color.lerpColors(new THREE.Color(0x505058), new THREE.Color(0x909095), t); // Very top is rocky/snowy
    }

    // Highlight impassable/very high matrix regions (Height > 55 usually)
    // We mix a slight red/warning tint for these extreme heights so matrix obstacles are visible
    if (height > 55) {
        color.lerp(new THREE.Color(0x772222), 0.3); // Add a subtle dark red hue to "obstacle" terrain
    }

    return color;
}

// --- Terrain Variables ---
let terrain;
let waterPlane;
let gridSize = 64;
let worldBoundary = 140;
let storedHeightMap = null;
const personGroup = new THREE.Group();
const obstacleGroup = new THREE.Group();
scene.add(personGroup);
scene.add(obstacleGroup);

function mapPyCoord(v) {
    return ((v - (gridSize / 2)) / (gridSize / 2)) * worldBoundary;
}

function createPerson(x, y, z) {
    const group = new THREE.Group();

    const torsoGeo = new THREE.BoxGeometry(1.5, 2.8, 1.0);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xff6633, roughness: 0.8, metalness: 0.1
    });
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 3.0;
    group.add(torso);

    const headGeo = new THREE.SphereGeometry(0.8, 12, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xdda87a });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 5.0;
    group.add(head);

    const armGeo = new THREE.CylinderGeometry(0.25, 0.2, 2.4, 6);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xff5522 });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-1.2, 4.2, 0);
    leftArm.rotation.z = Math.PI / 4;
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(1.0, 2.8, 0);
    rightArm.rotation.z = -Math.PI / 12;
    group.add(rightArm);

    const pillarGeo = new THREE.CylinderGeometry(0.2, 0.2, 40, 6);
    const pillarMat = new THREE.MeshBasicMaterial({
        color: 0xff3300, transparent: true, opacity: 0.25
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 20;
    pillar.userData.isPillar = true;
    group.add(pillar);

    group.position.set(x, z, y);
    return group;
}

fetch('http://localhost:3001/api/mission/map')
    .then(res => res.json())
    .then(data => {
        const { heightMap, rawSurvivors, gridSize: gSize, worldBoundary: wBound } = data;
        if (!heightMap || heightMap.length === 0) return;
        gridSize = gSize;
        worldBoundary = wBound;
        storedHeightMap = heightMap;

        const width = heightMap[0].length;
        const height = heightMap.length;
        const terrainSize = worldBoundary * 2;

        const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, width - 1, height - 1);
        terrainGeo.rotateX(-Math.PI / 2);

        const pos = terrainGeo.attributes.position;
        let maxH = 0;
        for (let row of heightMap) {
            for (let v of row) {
                if (v > maxH) maxH = v;
            }
        }
        if (maxH === 0) maxH = 1;

        const colors = new Float32Array(pos.count * 3);
        const obstacleSpikes = []; // Will hold points for procedural rocks

        for (let i = 0; i < pos.count; i++) {
            const xi = i % width;
            const yi = Math.floor(i / width);
            const h = heightMap[yi][xi];
            pos.setY(i, h);

            const color = getTerrainColor(h, maxH);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            // Generate procedural rocks/spikes on very high terrain to emphasize Matrix height obstacles
            if (h > 55 && Math.random() < 0.15) {
                const worldX = (xi / (width - 1)) * terrainSize - terrainSize / 2;
                const worldZ = (yi / (height - 1)) * terrainSize - terrainSize / 2;
                obstacleSpikes.push({ x: worldX, y: h, z: worldZ });
            }
        }

        terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        terrainGeo.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.78,
            metalness: 0.12,
            emissive: new THREE.Color(0x041018),
            emissiveIntensity: 0.45,
            flatShading: true,
        });
        terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.receiveShadow = true;
        terrain.castShadow = true;
        // scene.add(terrain); // Disabled procedural terrain

        const wireTerrain = new THREE.Mesh(
            terrainGeo.clone(),
            new THREE.MeshBasicMaterial({
                color: 0x9cf7f3,
                transparent: true,
                opacity: 0.06,
                wireframe: true,
            })
        );
        wireTerrain.position.y += 0.3;
        // scene.add(wireTerrain); // Disabled procedural wireframe

        // --- Load Custom GLB Model ---
        const loader = new GLTFLoader();
        loader.load('../city_circular.glb', (gltf) => {
            const cityModel = gltf.scene;

            // Auto-scale and auto-center the model to guarantee visibility
            const box = new THREE.Box3().setFromObject(cityModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            if (maxDim > 0) {
                // To change the size, adjust the multiplier at the end of this line (currently * 4)
                const scaleFactor = (250 / maxDim) * 4;
                cityModel.scale.setScalar(scaleFactor);
            }

            // Recalculate bounds after scaling to center it
            const scaledBox = new THREE.Box3().setFromObject(cityModel);
            const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

            cityModel.position.x -= scaledCenter.x;
            cityModel.position.y -= scaledBox.min.y; // Align bottom to Y=0
            cityModel.position.z -= scaledCenter.z;

            // Make the city cast and receive shadows
            cityModel.traverse((node) => {
                if (node.isMesh) {
                    // PERFORMANCE: Massive models casting shadows destroys FPS. 
                    // We only let it receive shadows (so drones cast shadows on it).
                    node.castShadow = false;
                    node.receiveShadow = true;
                }
            });

            scene.add(cityModel);
            window.cityModelForRaycasting = cityModel;
            setTimeout(scanCityMesh, 500); // Give the renderer a moment to attach before scanning
        }, undefined, (error) => {
            console.error('Error loading city.glb:', error);
            const errDiv = document.createElement('div');
            errDiv.style.position = 'absolute';
            errDiv.style.top = '20%';
            errDiv.style.left = '20%';
            errDiv.style.color = 'red';
            errDiv.style.background = 'black';
            errDiv.style.padding = '20px';
            errDiv.style.fontSize = '24px';
            errDiv.style.zIndex = '9999';
            errDiv.innerText = 'FAILED TO LOAD CITY.GLB: ' + error.message;
            document.body.appendChild(errDiv);
        });

        // Render Matrix height terrain obstacles
        const rockGeo = new THREE.DodecahedronGeometry(2);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x443333, roughness: 1.0 });
        obstacleSpikes.forEach(p => {
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.scale.set(1 + Math.random(), 3 + Math.random() * 4, 1 + Math.random());
            rock.position.set(p.x, p.y + rock.scale.y, p.z);
            rock.rotation.y = Math.random() * Math.PI;
            rock.castShadow = true;
            // obstacleGroup.add(rock); // Disabled old procedural rocks
        });

        const waterGeo = new THREE.PlaneGeometry(terrainSize * 1.3, terrainSize * 1.3, 64, 64);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x051a2e,
            roughness: 0.1,
            metalness: 0.8,
            transparent: true,
            opacity: 0.8,
        });
        waterPlane = new THREE.Mesh(waterGeo, waterMat);
        waterPlane.rotation.x = -Math.PI / 2;
        waterPlane.position.y = 5;
        // scene.add(waterPlane); // Disabled old water plane

        const peopleModels = ['../people/female2.glb'];

        const spawnedSurvivors = new Map(); // Track by ID to avoid respawning

        // Helper to load, perfectly auto-scale, and auto-center any messy model
        function spawnPerson(worldX, worldZ, isTarget, survivorId = null) {
            if (survivorId && spawnedSurvivors.has(survivorId)) return; // Already spawned

            const randomModelPath = peopleModels[0];
            const loader = new GLTFLoader();

            loader.load(randomModelPath, (gltf) => {
                const rawMesh = gltf.scene;

                const box = new THREE.Box3().setFromObject(rawMesh);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);

                if (maxDim > 0 && maxDim < Infinity) {
                    rawMesh.scale.setScalar(0.025 / maxDim);
                } else {
                    rawMesh.scale.setScalar(0.025);
                }

                const scaledBox = new THREE.Box3().setFromObject(rawMesh);
                const center = scaledBox.getCenter(new THREE.Vector3());

                if (isFinite(center.x)) {
                    rawMesh.position.x = -center.x;
                    rawMesh.position.y = -scaledBox.min.y;
                    rawMesh.position.z = -center.z;
                }

                const wrapper = new THREE.Group();
                wrapper.add(rawMesh);

                // Start them high in the sky so we can drop them onto the city mesh
                wrapper.position.set(worldX, 2000, worldZ);
                wrapper.rotation.y = Math.random() * Math.PI * 2;

                // Add a very prominent red pillar to ALL females so they are easy to spot
                const pillarGeo = new THREE.CylinderGeometry(0.8, 0.8, 120, 8); // much thicker and taller
                const pillarMat = new THREE.MeshBasicMaterial({
                    color: isTarget ? 0x00ffcc : 0xff0000, transparent: true, opacity: 0.8 // target is cyan, hidden is red
                });
                const pillar = new THREE.Mesh(pillarGeo, pillarMat);
                pillar.position.y = 60;
                wrapper.add(pillar);

                personGroup.add(wrapper);
                if (survivorId) spawnedSurvivors.set(survivorId, wrapper);

                // Raycast downward to put them precisely on the street or roof!
                function dropToGround() {
                    if (window.cityModelForRaycasting) {
                        const raycaster = new THREE.Raycaster();
                        raycaster.set(new THREE.Vector3(worldX, 2000, worldZ), new THREE.Vector3(0, -1, 0));
                        const intersects = raycaster.intersectObject(window.cityModelForRaycasting, true);
                        if (intersects.length > 0) {
                            wrapper.position.y = intersects[0].point.y;
                        } else {
                            wrapper.visible = false; // Hide them if they spawned off the edge of the city!
                        }
                    } else {
                        setTimeout(dropToGround, 250);
                    }
                }
                dropToGround();

            }, undefined, (error) => {
                console.error('FAILED TO LOAD PERSON:', randomModelPath, error);
            });
        }

        // Spawn the Mission Targets (only if we have a rawSurvivors array — real worldMap won't have this)
        if (Array.isArray(rawSurvivors)) {
            rawSurvivors.forEach((surv, idx) => {
                const worldX = mapPyCoord(surv[0]);
                const worldZ = mapPyCoord(surv[1]);
                spawnPerson(worldX, worldZ, true, `RAW-${idx}`); // true = isTarget
            });
        }

        // Listen to Socket.IO for hiddenSurvivors updates
        if (window.io) {
            const socket = window.io('http://localhost:3001', {
                transports: ['websocket', 'polling']
            });
            socket.on('telemetrySnapshot', (snapshot) => {
                if (snapshot.hiddenSurvivors && Array.isArray(snapshot.hiddenSurvivors)) {
                    snapshot.hiddenSurvivors.forEach(surv => {
                        const worldX = surv.x; // Already in world coords
                        const worldZ = surv.y; // Already in world coords
                        spawnPerson(worldX, worldZ, false, surv.id);
                    });
                }
            });
        }
    })
    .catch(err => console.error('Map data fetch error:', err));

// --- Telemetry Obstacle System ---
const obstacleMeshes = {};
let lastAiFetchAt = 0;

function createObstacleAsset(obs) {
    const severityColor = obs.severity === 'high' ? 0xff5f5f : (obs.severity === 'medium' ? 0xffb85c : 0x8fe8bd);
    const group = new THREE.Group();
    const seed = Math.abs(Math.floor((obs.x * 31 + obs.y * 17 + obs.radius * 13) * 1000));
    const scale = Math.max(0.9, obs.radius / 10);
    const kind = obs.kind || ['boulder_field', 'deadwood', 'ruin_tower'][seed % 3];

    if (kind === 'boulder_field') {
        const clusterCount = 6 + (seed % 5);
        for (let i = 0; i < clusterCount; i++) {
            const size = (obs.radius * 0.24) + ((seed + i * 17) % 9) * 0.22;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(1 + size, 0),
                new THREE.MeshStandardMaterial({
                    color: 0x4a515f,
                    roughness: 0.94,
                    metalness: 0.06,
                })
            );
            const rx = Math.sin(seed * 0.013 + i * 1.7) * obs.radius * 0.64;
            const rz = Math.cos(seed * 0.009 + i * 1.2) * obs.radius * 0.62;
            rock.position.set(rx, 1.7 + size * 2.05, rz);
            rock.rotation.set(i * 0.4, i * 0.6, i * 0.2);
            rock.castShadow = true;
            group.add(rock);
        }
    } else if (kind === 'deadwood') {
        const trunkCount = 4 + (seed % 4);
        for (let i = 0; i < trunkCount; i++) {
            const h = 10 + ((seed + i * 23) % 11);
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.45, 0.8, h, 7),
                new THREE.MeshStandardMaterial({
                    color: 0x4c4036,
                    roughness: 1.0,
                    metalness: 0,
                })
            );
            const rx = Math.sin(seed * 0.015 + i) * obs.radius * 0.58;
            const rz = Math.cos(seed * 0.011 + i * 2) * obs.radius * 0.58;
            trunk.position.set(rx, h / 2, rz);
            trunk.rotation.z = 0.1 + (i % 2 ? 0.08 : -0.06);
            trunk.castShadow = true;
            group.add(trunk);
        }
    } else if (kind === 'wall_segment') {
        const wallSegments = 2 + (seed % 3);
        for (let i = 0; i < wallSegments; i++) {
            const len = obs.radius * (0.75 + i * 0.2);
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(len, 6 + i * 2, 2.5),
                new THREE.MeshStandardMaterial({ color: 0x5c6470, roughness: 0.82, metalness: 0.22 })
            );
            wall.position.set((i - 1) * (len * 0.3), 3 + i, (i % 2 === 0 ? -1 : 1) * obs.radius * 0.2);
            wall.rotation.y = 0.3 + i * 0.2;
            wall.castShadow = true;
            group.add(wall);
        }
    } else if (kind === 'vehicle_wreck') {
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(obs.radius * 0.9, 3.2, obs.radius * 0.5),
            new THREE.MeshStandardMaterial({ color: 0x646d79, roughness: 0.68, metalness: 0.4 })
        );
        hull.position.y = 2;
        hull.rotation.y = (seed % 30) * 0.03;
        hull.castShadow = true;
        group.add(hull);

        const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x8a939f, roughness: 0.6, metalness: 0.55 })
        );
        antenna.position.set(obs.radius * 0.2, 6.5, -obs.radius * 0.05);
        antenna.rotation.z = 0.4;
        antenna.castShadow = true;
        group.add(antenna);
    } else {
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(obs.radius * 0.75, 14 + obs.radius * 1.7, obs.radius * 0.75),
            new THREE.MeshStandardMaterial({
                color: 0x545d69,
                roughness: 0.75,
                metalness: 0.3,
            })
        );
        tower.position.y = 8 + obs.radius * 0.58;
        tower.castShadow = true;
        group.add(tower);

        const brace = new THREE.Mesh(
            new THREE.TorusGeometry(obs.radius * 1.12, 0.35, 8, 28),
            new THREE.MeshStandardMaterial({ color: 0x6d7885, roughness: 0.7, metalness: 0.35 })
        );
        brace.rotation.x = Math.PI / 2;
        brace.position.y = 2.6;
        group.add(brace);
    }

    const scar = new THREE.Mesh(
        new THREE.CircleGeometry(obs.radius * 1.36, 36),
        new THREE.MeshBasicMaterial({
            color: 0x1a1516,
            transparent: true,
            opacity: obs.severity === 'high' ? 0.45 : 0.32,
            side: THREE.DoubleSide,
        })
    );
    scar.rotation.x = -Math.PI / 2;
    scar.position.y = 0.04;
    group.add(scar);

    const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(obs.radius * 1.02, obs.radius * 1.38, 46),
        new THREE.MeshBasicMaterial({
            color: severityColor,
            transparent: true,
            opacity: obs.severity === 'high' ? 0.38 : 0.24,
            side: THREE.DoubleSide,
        })
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.15;
    baseRing.userData.isHazardRing = true;
    group.add(baseRing);

    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 10, 10),
        new THREE.MeshBasicMaterial({ color: severityColor })
    );
    beacon.position.y = 2.3;
    beacon.userData.isHazardBeacon = true;
    beacon.userData.baseColor = severityColor;
    group.add(beacon);

    // 3D Danger Zone Volume for Altitude-Aware Avoidance
    if (obs.height) {
        const volHeight = obs.height;
        const volGeo = new THREE.CylinderGeometry(obs.radius, obs.radius, volHeight, 16);
        const volMat = new THREE.MeshBasicMaterial({
            color: severityColor,
            transparent: true,
            opacity: 0.12,
            wireframe: true,
            depthWrite: false
        });
        const vol = new THREE.Mesh(volGeo, volMat);
        vol.position.y = volHeight / 2; // Center vertically on base
        group.add(vol);

        // Add a subtle glowing top cap
        const capGeo = new THREE.CircleGeometry(obs.radius, 16);
        const capMat = new THREE.MeshBasicMaterial({
            color: severityColor,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.rotation.x = -Math.PI / 2;
        cap.position.y = volHeight;
        group.add(cap);
    }

    group.scale.set(scale, 1, scale);

    group.userData.seed = seed;
    group.userData.severity = obs.severity;
    return group;
}

function updateObstacles(obsList) {
    if (!obsList) return;
    const keepKeys = new Set(obsList.map(o => o.id));
    for (const id in obstacleMeshes) {
        if (!keepKeys.has(id)) {
            obstacleGroup.remove(obstacleMeshes[id]);
            delete obstacleMeshes[id];
        }
    }

    obsList.forEach(obs => {
        if (!obstacleMeshes[obs.id]) {
            const group = createObstacleAsset(obs);
            // obstacleGroup.add(group); // Disabled old generated obstacles (trees, wrecks, etc)
            obstacleMeshes[obs.id] = group;
        }

        // Find terrain height at this coordinate roughly
        const group = obstacleMeshes[obs.id];
        let h = 5;
        if (storedHeightMap) {
            const mapX = Math.round((obs.x / worldBoundary) * (gridSize / 2) + (gridSize / 2));
            const mapY = Math.round((obs.y / worldBoundary) * (gridSize / 2) + (gridSize / 2));
            if (storedHeightMap[mapY] && storedHeightMap[mapY][mapX]) {
                h = storedHeightMap[mapY][mapX];
            }
        }
        group.position.set(obs.x, h, obs.y); // Set Y to 0 or height based on terrain mapping
    });
}

// --- Drone System ---
const droneMeshes = {};

function createDroneGroup() {
    const group = new THREE.Group();

    if (loadedDroneModel) {
        const customDrone = loadedDroneModel.clone();
        customDrone.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        group.add(customDrone);
    } else {
        // Fallback box if model hasn't loaded yet
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const mainBody = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3.5), bodyMat);
        group.add(mainBody);
        group.userData.isFallback = true;
    }

    // Downward Spotlight - much softer and realistic
    const light = new THREE.SpotLight(0xaaddff, 3, 100, Math.PI / 6, 0.6, 1.5);
    light.position.set(0, -0.5, 1.2);
    light.target.position.set(0, -40, 1.2);
    group.add(light);
    group.add(light.target);

    // Drone Navigation Light (Red/Green blinking)
    const navGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const navMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    const navLight = new THREE.Mesh(navGeo, navMat);
    navLight.position.set(0, 0.6, -1.5);
    navLight.userData.isNavLight = true;
    group.add(navLight);

    const scanRingGeo = new THREE.RingGeometry(2.2, 2.7, 36);
    const scanRingMat = new THREE.MeshBasicMaterial({
        color: 0x6bfaf4,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
    });
    const scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
    scanRing.rotation.x = -Math.PI / 2;
    scanRing.position.y = -0.8;
    scanRing.userData.isScanRing = true;
    group.add(scanRing);

    const beamGeo = new THREE.CylinderGeometry(0.18, 1.8, 26, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0x55f5ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = -13;
    beam.userData.isBeam = true;
    group.add(beam);

    return group;
}

function updateDrones(drones) {
    const keepKeys = new Set(drones.map(d => d.id));
    for (const id in droneMeshes) {
        if (!keepKeys.has(id)) {
            scene.remove(droneMeshes[id]);
            delete droneMeshes[id];
        }
    }

    drones.forEach(d => {
        if (!droneMeshes[d.id]) {
            const group = createDroneGroup();
            scene.add(group);
            droneMeshes[d.id] = group;
        }

        const droneGroup = droneMeshes[d.id];

        // Upgrade fallback drones once the custom model finishes downloading!
        if (loadedDroneModel && droneGroup.userData.isFallback) {
            const fallback = droneGroup.children.find(c => c.geometry && c.geometry.type === 'BoxGeometry');
            if (fallback) droneGroup.remove(fallback);

            const customDrone = loadedDroneModel.clone();
            customDrone.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            droneGroup.add(customDrone);
            droneGroup.userData.isFallback = false;
        }
        // Smooth position lerp for fluid drone motion in 3D map
        const targetX = d.x;
        const targetZ = d.y;
        const targetY = Math.max(d.z || 25, 20);

        if (!droneGroup.userData.initialized) {
            droneGroup.position.set(targetX, targetY, targetZ);
            droneGroup.userData.initialized = true;
        } else {
            droneGroup.position.x += (targetX - droneGroup.position.x) * 0.35;
            droneGroup.position.z += (targetZ - droneGroup.position.z) * 0.35;
            droneGroup.position.y += (targetY - droneGroup.position.y) * 0.35;
        }

        // Drone heading smoothly mapped
        const rad = (-d.heading * Math.PI) / 180 + Math.PI / 2;
        droneGroup.rotation.y = rad;

        // Visual indicator based on Python role
        let indicatorLight = droneGroup.children.find(c => c.isPointLight);
        if (!indicatorLight) {
            indicatorLight = new THREE.PointLight(0xffffff, 1.5, 30);
            indicatorLight.position.set(0, -2, 0);
            droneGroup.add(indicatorLight);
        }

        let mesh = droneGroup.children.find(c => c.isMesh && !c.userData.isNavLight && !c.userData.isScanRing && !c.userData.isBeam);

        if (d.status === 'failed' || d.task === 'crashed') {
            indicatorLight.color.setHex(0xff0000);
            indicatorLight.intensity = 0.8;
            if (mesh) mesh.material.color.setHex(0x222222); // Make it dark gray
        } else if (d.task === 'relay') {
            indicatorLight.color.setHex(0xffaa00); // Orange for relay
            indicatorLight.intensity = 1.0;
            if (mesh) mesh.material.color.setHex(0xe8e9ed);
        } else if (d.task === 'exploring' || d.task === 'searcher') {
            indicatorLight.color.setHex(0x00ffcc); // Cyan/Green for searcher
            indicatorLight.intensity = 1.0;
            if (mesh) mesh.material.color.setHex(0xe8e9ed);
        } else {
            indicatorLight.color.setHex(0xaaaaaa);
            if (mesh) mesh.material.color.setHex(0xe8e9ed);
        }

        if (isFollowMode && d.id === followDroneId) {
            followTarget = { x: d.x, y: Math.max(d.z, 20), z: d.y };
        }
    });
}

// --- Jammer Rendering ---
const jammerMeshes = {};
function updateJammers(zones) {
    if (!zones) return;
    zones.forEach(z => {
        if (!jammerMeshes[z.id]) {
            const geo = new THREE.SphereGeometry(z.radius, 16, 16);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(z.cx, z.radius / 2, z.cy);
            scene.add(mesh);
            jammerMeshes[z.id] = mesh;
        } else {
            // Pulsing effect
            const mesh = jammerMeshes[z.id];
            mesh.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.05);
            mesh.material.opacity = 0.1 + Math.sin(Date.now() * 0.005) * 0.05;
        }
    });
}

// --- Telemetry Polling ---
function fetchTelemetry() {
    fetch('http://localhost:3001/api/mission/snapshot')
        .then(res => res.json())
        .then(data => {
            if (data.drones) updateDrones(data.drones);
            if (data.obstacles) updateObstacles(data.obstacles);
            if (data.gpsDenialZones) updateJammers(data.gpsDenialZones);

            if (!isFollowMode && data.missionData) {
                const activeCount = data.drones ? data.drones.filter(d => d.status === 'active').length : 0;
                const el = (id) => document.getElementById(id);

                const hudDrones = el('hud-drone-count');
                if (hudDrones) hudDrones.textContent = `🚁 ${activeCount} / ${data.drones.length} Drones Active`;

                const hudCoverage = el('hud-coverage');
                if (hudCoverage) hudCoverage.textContent = `📡 Coverage: ${data.missionData.coverage}%`;

                const hudBattery = el('hud-battery');
                if (hudBattery) hudBattery.textContent = `🔋 Avg Battery: ${data.missionData.avgBattery.toFixed(0)}%`;

                const hudSignal = el('hud-signal');
                if (hudSignal) hudSignal.textContent = `📶 Signal: ${data.missionData.avgSignal.toFixed(0)}%`;

                const hudTime = el('hud-time');
                if (hudTime) hudTime.textContent = `⏱ Mission: ${data.missionData.missionTimeSec}s`;

                const hudSurvivors = el('hud-survivors');
                if (hudSurvivors) hudSurvivors.textContent = `👤 Found: ${data.missionData.foundSurvivors} Targets`;

                const hudObstacles = el('hud-obstacles');
                if (hudObstacles) {
                    const obstacleCount = data.obstacles ? data.obstacles.length : 0;
                    hudObstacles.textContent = `🪨 Obstacles: ${obstacleCount}`;
                }
            }

            const now = Date.now();
            if (!isFollowMode && now - lastAiFetchAt > 1800) {
                lastAiFetchAt = now;
                fetchAiInsights();
            }
        })
        .catch(err => console.error('Telemetry fetch error:', err));
}
setInterval(fetchTelemetry, 200);

function fetchAiInsights() {
    fetch('http://localhost:3001/api/mission/ai-insights')
        .then(res => res.json())
        .then(data => {
            if (!data) return;
            const topZone = data.topZones && data.topZones[0];
            const command = data.commandSuggestions && data.commandSuggestions[0];
            const health = data.health;

            const el = (id) => document.getElementById(id);
            const aiTopZone = el('hud-ai-top-zone');
            const aiCommand = el('hud-ai-command');
            const aiHealth = el('hud-ai-health');

            if (aiTopZone) {
                aiTopZone.textContent = topZone
                    ? `Top Zone: Z${topZone.zone} (${topZone.label}) score ${Number(topZone.score).toFixed(2)}`
                    : 'Top Zone: --';
            }

            if (aiCommand) {
                aiCommand.textContent = command ? `Command: ${command}` : 'Command: --';
            }

            if (aiHealth) {
                const healthPct = health ? Number(health.health_pct || 0).toFixed(1) : '--';
                aiHealth.textContent = `🧠 AI Health: ${healthPct}%`;
            }
        })
        .catch(err => console.error('AI insights fetch error:', err));
}

// --- Ambient Particles (dust/snow) ---
const particleCount = 600;
const particlesGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 400;
    particlePositions[i * 3 + 1] = Math.random() * 150 + 5;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 400;
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particlesMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.8,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
});
const particles = new THREE.Points(particlesGeo, particlesMat);
scene.add(particles);

// --- Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}, false);

// Interactive Raycasting for Manual Deploy
window.addEventListener('pointerdown', (event) => {
    if (!event.shiftKey) return; // Only trigger if holding Shift

    // Convert mouse position to normalized device coordinates
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    if (window.cityModelForRaycasting) {
        const intersects = raycaster.intersectObject(window.cityModelForRaycasting, true);
        if (intersects.length > 0) {
            const hitPoint = intersects[0].point;

            const mode = document.querySelector('input[name="clickMode"]:checked').value;

            if (mode === 'survivor') {
                console.log(`[UI INTERACT] Manual deploy survivor at X:${hitPoint.x.toFixed(1)}, Y:${hitPoint.z.toFixed(1)}`);
                fetch('http://localhost:3001/api/mission/add-survivor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x: hitPoint.x, y: hitPoint.z, severity: 'critical' })
                }).then(res => res.json()).then(data => {
                    if (data.ok) spawnPerson(hitPoint.x, hitPoint.z, false, data.survivor.id);
                }).catch(console.error);
            } else if (mode === 'jammer') {
                console.log(`[UI INTERACT] Manual deploy jammer at X:${hitPoint.x.toFixed(1)}, Y:${hitPoint.z.toFixed(1)}`);
                fetch('http://localhost:3001/api/mission/add-jammer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cx: hitPoint.x, cy: hitPoint.z, radius: 45 })
                }).catch(console.error);
            }
        }
    }
});

// --- UI Sidebar Button Wiring ---
const postApi = (endpoint) => fetch(`http://localhost:3001/api/mission/${endpoint}`, { method: 'POST' }).catch(console.error);

document.getElementById('btn-start').addEventListener('click', () => postApi('start'));
document.getElementById('btn-stop').addEventListener('click', () => postApi('stop'));
document.getElementById('btn-reset').addEventListener('click', () => postApi('reset'));
document.getElementById('btn-emp').addEventListener('click', () => postApi('kill-drone'));

// --- Animation Loop ---
const clock = new THREE.Clock();

function droneSeed(id) {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i) * (i + 1);
    return sum * 0.013;
}

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    atmosphereUniforms.uTime.value = elapsed;

    if (waterPlane) {
        waterPlane.position.y = 4.5 + Math.sin(elapsed * 0.8) * 0.3;
    }

    tacticalRingGroup.children.forEach((ring, idx) => {
        ring.rotation.z += ring.userData.spin;
        ring.position.y = 4 + idx * 8 + Math.sin(elapsed * 0.5 + idx) * 0.7;
    });

    obstacleGroup.children.forEach((group, idx) => {
        const wobble = Math.sin(elapsed * 1.8 + (group.userData.seed || idx) * 0.002);
        group.children.forEach((child) => {
            if (child.userData.isHazardRing) {
                const pulse = 1 + 0.06 * wobble;
                child.scale.set(pulse, pulse, pulse);
                child.material.opacity = group.userData.severity === 'high'
                    ? 0.28 + 0.08 * wobble
                    : 0.18 + 0.06 * wobble;
            }
            if (child.userData.isHazardBeacon) {
                const intensity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 3.8 + idx));
                const baseColor = new THREE.Color(child.userData.baseColor || 0xffffff);
                child.material.color.copy(baseColor).multiplyScalar(0.7 + intensity * 0.6);
                child.scale.setScalar(0.92 + intensity * 0.25);
            }
        });
    });

    personGroup.children.forEach(person => {
        person.children.forEach(child => {
            if (child.userData.isPillar) {
                child.material.opacity = 0.1 + Math.sin(elapsed * 3) * 0.15;
            }
        });
    });

    for (const id in droneMeshes) {
        const group = droneMeshes[id];
        const seed = droneSeed(id);
        group.position.y += Math.sin(elapsed * 4 + seed) * 0.05;
        group.rotation.x = Math.sin(elapsed * 2 + seed) * 0.05;

        group.children.forEach(child => {
            if (child.userData.isRotor) {
                child.rotation.y += 0.4;
            }
            if (child.userData.isNavLight) {
                child.material.color.setHex((Math.floor(elapsed * 2) % 2 === 0) ? 0xff0000 : 0x00ff00);
            }
            if (child.userData.isScanRing) {
                const pulse = 1 + (Math.sin(elapsed * 3 + seed) + 1) * 0.25;
                child.scale.setScalar(pulse);
                child.material.opacity = 0.18 + Math.sin(elapsed * 3 + seed) * 0.08;
            }
            if (child.userData.isBeam) {
                child.material.opacity = 0.08 + (Math.sin(elapsed * 2.4 + seed) + 1) * 0.05;
            }
        });
    }

    const pPos = particles.geometry.attributes.position;
    for (let i = 0; i < particleCount; i++) {
        let y = pPos.getY(i);
        y -= 0.12;
        if (y < 5) y = 150;
        pPos.setY(i, y);
        pPos.setX(i, pPos.getX(i) + Math.sin(elapsed + i) * 0.02);
    }
    pPos.needsUpdate = true;

    if (isFollowMode) {
        const camTargetX = followTarget.x;
        const camTargetZ = followTarget.z;
        if (followTarget) {
            // Camera target smoothly interpolates to the drone's position
            controls.target.lerp(new THREE.Vector3(camTargetX, followTarget.y, camTargetZ), 0.1);
            controls.update();
        }
    } else {
        controls.update();
    }

    composer.render();
}
animate();

// --- Dynamic GLB Mesh Scanner & Heatmap ---
function scanCityMesh() {
    if (!window.cityModelForRaycasting) return;
    console.log("Scanning city mesh for full occupancy grid & collision boundaries...");

    const raycaster = new THREE.Raycaster();
    const scannedObstacles = [];
    const boundary = SIM_CONFIG.WORLD_BOUNDARY || 350;
    const gridSize = SIM_CONFIG.GRID_SIZE || 40;
    const cellSize = (boundary * 2) / gridSize;

    const heatmapGroup = new THREE.Group();
    heatmapGroup.position.y = 1.0; // Slightly above ground to prevent Z-fighting

    // Initialize worldMap 2D array [cellX][cellY]
    const worldMap = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));

    for (let cellX = 0; cellX < gridSize; cellX++) {
        for (let cellY = 0; cellY < gridSize; cellY++) {
            const worldX = -boundary + (cellX + 0.5) * cellSize;
            const worldY = -boundary + (cellY + 0.5) * cellSize;

            raycaster.set(new THREE.Vector3(worldX, 1500, worldY), new THREE.Vector3(0, -1, 0));
            const intersects = raycaster.intersectObject(window.cityModelForRaycasting, true);

            const hitY = intersects.length > 0 ? intersects[0].point.y : 0;
            const occupied = hitY > 10;

            worldMap[cellX][cellY] = {
                height: Number(hitY.toFixed(2)),
                occupied,
                obstacleId: occupied ? `GLB-${cellX}-${cellY}` : null,
            };

            if (occupied) {
                scannedObstacles.push({
                    id: `GLB-${cellX}-${cellY}`,
                    x: Number(worldX.toFixed(2)),
                    y: Number(worldY.toFixed(2)),
                    radius: Number((cellSize * 0.7).toFixed(2)),
                    height: Number(hitY.toFixed(2)),
                    severity: hitY > 150 ? 'high' : hitY > 80 ? 'medium' : 'low',
                });

                // Add tactical heatmap tile
                const tileGeo = new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9);
                const color = hitY > 150 ? 0xff0000 : hitY > 80 ? 0xffaa00 : 0xffff00;
                const tileMat = new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.28,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                });
                const tile = new THREE.Mesh(tileGeo, tileMat);
                tile.rotation.x = -Math.PI / 2;
                tile.position.set(worldX, 0, worldY);
                heatmapGroup.add(tile);
            }
        }
    }

    scene.add(heatmapGroup);

    // Post scanned obstacles to Node.js physics engine
    fetch('http://localhost:3001/api/mission/set-obstacles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obstacles: scannedObstacles }),
    }).then(res => res.json())
        .then(data => console.log('[PHYSICS SYNC] Synced ' + data.count + ' physical building collisions!'))
        .catch(err => console.error('Failed to sync obstacles:', err));

    // Post full worldMap matrix to Node.js backend
    fetch('http://localhost:3001/api/mission/world-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldMap }),
    }).then(res => res.json())
        .then(data => console.log('[WORLD MAP SYNC] Synced full ' + gridSize + 'x' + gridSize + ' occupancy grid to server!'))
        .catch(err => console.error('Failed to sync worldMap:', err));

    // Place 3D survivors exclusively on unoccupied ground cells
    const unoccupiedCells = [];
    for (let cx = 0; cx < gridSize; cx++) {
        for (let cy = 0; cy < gridSize; cy++) {
            if (!worldMap[cx][cy].occupied) {
                const wx = -boundary + (cx + 0.5) * cellSize;
                const wy = -boundary + (cy + 0.5) * cellSize;
                unoccupiedCells.push({ cx, cy, x: Number(wx.toFixed(2)), y: Number(wy.toFixed(2)) });
            }
        }
    }

    const realSurvivors = [];
    const severities = ['critical', 'stable', 'unknown', 'critical', 'stable'];
    const survivorGroup = new THREE.Group();

    for (let i = 0; i < Math.min(5, unoccupiedCells.length); i++) {
        const randomIndex = Math.floor(Math.random() * unoccupiedCells.length);
        const cell = unoccupiedCells.splice(randomIndex, 1)[0];
        const survivorId = `HSV-00${i + 1}`;
        const severity = severities[i % severities.length];

        realSurvivors.push({
            id: survivorId,
            x: cell.x,
            y: cell.y,
            severity,
        });

        // Visual 3D marker in scene at cell ground height
        const markerGeo = new THREE.CylinderGeometry(2, 0, 8, 8);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(cell.x, 4, cell.y);
        survivorGroup.add(marker);
    }
    scene.add(survivorGroup);

    fetch('http://localhost:3001/api/mission/survivor-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survivors: realSurvivors }),
    }).then(res => res.json())
        .then(data => console.log('[SURVIVOR SYNC] Synced ' + data.count + ' real 3D survivor positions on unoccupied ground cells!'))
        .catch(err => console.error('Failed to sync survivor positions:', err));
}








import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let SIM_CONFIG = { WORLD_BOUNDARY: 350, GRID_SIZE: 40 };
fetch('http://localhost:3001/api/config')
    .then(res => res.json())
    .then(cfg => { SIM_CONFIG = cfg; })
    .catch(() => { });

let loadedDroneModel = null;
const _droneLoader = new GLTFLoader();
_droneLoader.load('../drone.glb', (gltf) => {
    loadedDroneModel = gltf.scene;
    // Optional: scale your custom drone if it's too big/small
    // loadedDroneModel.scale.set(5, 5, 5); 
}, undefined, (err) => console.error('Error loading drone:', err));

// --- Follow Mode Detection ---
const urlParams = new URLSearchParams(window.location.search);
const followDroneId = urlParams.get('follow');
const isFollowMode = !!followDroneId;
let followTarget = { x: 0, y: 80, z: 0 };

if (isFollowMode) {
    const uiLayer = document.getElementById('ui-layer');
    if (uiLayer) uiLayer.style.display = 'none';
}

// --- Scene Setup ---
const container = document.getElementById('webgl-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9ebfa); // Matches horizon
// Fog completely removed!

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2500);
camera.position.set(0, 180, 300);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1)); // PERFORMANCE: Capped at 1 to prevent lag on 4K/Retina displays
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // Reduced from 1.4 for clarity
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12; // PERFORMANCE: Increased damping makes camera controls feel snappier and less "floaty"
controls.maxPolarAngle = Math.PI / 2.1;
controls.target.set(0, 15, 0);
controls.minDistance = 20;
controls.maxDistance = 800;

if (isFollowMode) {
    controls.enabled = false;
    // Follow camera: tilted slightly, not purely top-down, to avoid blinding flat reflections
    camera.position.set(0, 100, 30);
    camera.lookAt(0, 0, 0);
    camera.fov = 55;
    camera.updateProjectionMatrix();
}

// --- Post Processing ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Significantly reduced bloom: Strength to 0.25 (from 1.2)
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.25, 0.4, 0.8
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- Lighting ---
// Clean, bright daytime lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const sunLight = new THREE.DirectionalLight(0xfff5e6, 3.2);
sunLight.position.set(-150, 250, 100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -200;
sunLight.shadow.camera.right = 200;
sunLight.shadow.camera.top = 200;
sunLight.shadow.camera.bottom = -200;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x99ccff, 0.8);
rimLight.position.set(200, 80, -80);
scene.add(rimLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x667788, 0.6);
scene.add(hemiLight);

// --- Atmosphere and Tactical Rings ---
const atmosphereUniforms = {
    uTime: { value: 0 },
};

const skyDomeGeo = new THREE.SphereGeometry(1350, 48, 48);
const skyDomeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    uniforms: atmosphereUniforms,
    vertexShader: `
        varying vec3 vPos;
        void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        varying vec3 vPos;
        uniform float uTime;

        void main() {
            float h = normalize(vPos).y * 0.5 + 0.5;
            // Clean daytime sky gradient
            vec3 zenith = vec3(0.2, 0.55, 0.95);
            vec3 horizon = vec3(0.85, 0.92, 0.98);
            vec3 grad = mix(horizon, zenith, smoothstep(0.45, 0.9, h));
            gl_FragColor = vec4(grad, 1.0);
        }
    `,
});

const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
scene.add(skyDome);
// Floor completely removed!

const tacticalRingGroup = new THREE.Group();
scene.add(tacticalRingGroup);
for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.TorusGeometry(130 + i * 24, 0.42, 8, 128);
    const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x6ef0da : 0xff7b6b,
        transparent: true,
        opacity: 0.16 - i * 0.03,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4 + i * 8;
    ring.userData.spin = (i % 2 === 0 ? 1 : -1) * (0.0008 + i * 0.0002);
    tacticalRingGroup.add(ring);
}

// --- Elevation Color Helper (returns color by height) ---
function getTerrainColor(height, maxHeight) {
    const ratio = height / maxHeight;
    const color = new THREE.Color();

    if (ratio < 0.08) {
        color.setHSL(0.58, 0.7, 0.18);
    } else if (ratio < 0.15) {
        color.lerpColors(new THREE.Color(0x1a4a5e), new THREE.Color(0x2a6040), (ratio - 0.08) / 0.07);
    } else if (ratio < 0.35) {
        const t = (ratio - 0.15) / 0.20;
        color.lerpColors(new THREE.Color(0x1e5a28), new THREE.Color(0x3d7a3a), t);
    } else if (ratio < 0.55) {
        const t = (ratio - 0.35) / 0.20;
        color.lerpColors(new THREE.Color(0x3d7a3a), new THREE.Color(0x6b5a3e), t);
    } else if (ratio < 0.72) {
        const t = (ratio - 0.55) / 0.17;
        color.lerpColors(new THREE.Color(0x5a4a38), new THREE.Color(0x7a6a58), t);
    } else if (ratio < 0.88) {
        const t = (ratio - 0.72) / 0.16;
        color.lerpColors(new THREE.Color(0x7a6a58), new THREE.Color(0x505058), t); // Making tall areas dark grey
    } else {
        const t = (ratio - 0.88) / 0.12;
        color.lerpColors(new THREE.Color(0x505058), new THREE.Color(0x909095), t); // Very top is rocky/snowy
    }

    // Highlight impassable/very high matrix regions (Height > 55 usually)
    // We mix a slight red/warning tint for these extreme heights so matrix obstacles are visible
    if (height > 55) {
        color.lerp(new THREE.Color(0x772222), 0.3); // Add a subtle dark red hue to "obstacle" terrain
    }

    return color;
}

// --- Terrain Variables ---
let terrain;
let waterPlane;
let gridSize = 64;
let worldBoundary = 140;
let storedHeightMap = null;
const personGroup = new THREE.Group();
const obstacleGroup = new THREE.Group();
scene.add(personGroup);
scene.add(obstacleGroup);

function mapPyCoord(v) {
    return ((v - (gridSize / 2)) / (gridSize / 2)) * worldBoundary;
}

function createPerson(x, y, z) {
    const group = new THREE.Group();

    const torsoGeo = new THREE.BoxGeometry(1.5, 2.8, 1.0);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xff6633, roughness: 0.8, metalness: 0.1
    });
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 3.0;
    group.add(torso);

    const headGeo = new THREE.SphereGeometry(0.8, 12, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xdda87a });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 5.0;
    group.add(head);

    const armGeo = new THREE.CylinderGeometry(0.25, 0.2, 2.4, 6);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xff5522 });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-1.2, 4.2, 0);
    leftArm.rotation.z = Math.PI / 4;
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(1.0, 2.8, 0);
    rightArm.rotation.z = -Math.PI / 12;
    group.add(rightArm);

    const pillarGeo = new THREE.CylinderGeometry(0.2, 0.2, 40, 6);
    const pillarMat = new THREE.MeshBasicMaterial({
        color: 0xff3300, transparent: true, opacity: 0.25
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 20;
    pillar.userData.isPillar = true;
    group.add(pillar);

    group.position.set(x, z, y);
    return group;
}

fetch('http://localhost:3001/api/mission/map')
    .then(res => res.json())
    .then(data => {
        const { heightMap, rawSurvivors, gridSize: gSize, worldBoundary: wBound } = data;
        if (!heightMap || heightMap.length === 0) return;
        gridSize = gSize;
        worldBoundary = wBound;
        storedHeightMap = heightMap;

        const width = heightMap[0].length;
        const height = heightMap.length;
        const terrainSize = worldBoundary * 2;

        const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, width - 1, height - 1);
        terrainGeo.rotateX(-Math.PI / 2);

        const pos = terrainGeo.attributes.position;
        let maxH = 0;
        for (let row of heightMap) {
            for (let v of row) {
                if (v > maxH) maxH = v;
            }
        }
        if (maxH === 0) maxH = 1;

        const colors = new Float32Array(pos.count * 3);
        const obstacleSpikes = []; // Will hold points for procedural rocks

        for (let i = 0; i < pos.count; i++) {
            const xi = i % width;
            const yi = Math.floor(i / width);
            const h = heightMap[yi][xi];
            pos.setY(i, h);

            const color = getTerrainColor(h, maxH);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            // Generate procedural rocks/spikes on very high terrain to emphasize Matrix height obstacles
            if (h > 55 && Math.random() < 0.15) {
                const worldX = (xi / (width - 1)) * terrainSize - terrainSize / 2;
                const worldZ = (yi / (height - 1)) * terrainSize - terrainSize / 2;
                obstacleSpikes.push({ x: worldX, y: h, z: worldZ });
            }
        }

        terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        terrainGeo.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.78,
            metalness: 0.12,
            emissive: new THREE.Color(0x041018),
            emissiveIntensity: 0.45,
            flatShading: true,
        });
        terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.receiveShadow = true;
        terrain.castShadow = true;
        // scene.add(terrain); // Disabled procedural terrain

        const wireTerrain = new THREE.Mesh(
            terrainGeo.clone(),
            new THREE.MeshBasicMaterial({
                color: 0x9cf7f3,
                transparent: true,
                opacity: 0.06,
                wireframe: true,
            })
        );
        wireTerrain.position.y += 0.3;
        // scene.add(wireTerrain); // Disabled procedural wireframe

        // --- Load Custom GLB Model ---
        const loader = new GLTFLoader();
        loader.load('../city_circular.glb', (gltf) => {
            const cityModel = gltf.scene;

            // Auto-scale and auto-center the model to guarantee visibility
            const box = new THREE.Box3().setFromObject(cityModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            if (maxDim > 0) {
                // To change the size, adjust the multiplier at the end of this line (currently * 4)
                const scaleFactor = (250 / maxDim) * 4;
                cityModel.scale.setScalar(scaleFactor);
            }

            // Recalculate bounds after scaling to center it
            const scaledBox = new THREE.Box3().setFromObject(cityModel);
            const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

            cityModel.position.x -= scaledCenter.x;
            cityModel.position.y -= scaledBox.min.y; // Align bottom to Y=0
            cityModel.position.z -= scaledCenter.z;

            // Make the city cast and receive shadows
            cityModel.traverse((node) => {
                if (node.isMesh) {
                    // PERFORMANCE: Massive models casting shadows destroys FPS. 
                    // We only let it receive shadows (so drones cast shadows on it).
                    node.castShadow = false;
                    node.receiveShadow = true;
                }
            });

            scene.add(cityModel);
            window.cityModelForRaycasting = cityModel;
            setTimeout(scanCityMesh, 500); // Give the renderer a moment to attach before scanning
        }, undefined, (error) => {
            console.error('Error loading city.glb:', error);
            const errDiv = document.createElement('div');
            errDiv.style.position = 'absolute';
            errDiv.style.top = '20%';
            errDiv.style.left = '20%';
            errDiv.style.color = 'red';
            errDiv.style.background = 'black';
            errDiv.style.padding = '20px';
            errDiv.style.fontSize = '24px';
            errDiv.style.zIndex = '9999';
            errDiv.innerText = 'FAILED TO LOAD CITY.GLB: ' + error.message;
            document.body.appendChild(errDiv);
        });

        // Render Matrix height terrain obstacles
        const rockGeo = new THREE.DodecahedronGeometry(2);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x443333, roughness: 1.0 });
        obstacleSpikes.forEach(p => {
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.scale.set(1 + Math.random(), 3 + Math.random() * 4, 1 + Math.random());
            rock.position.set(p.x, p.y + rock.scale.y, p.z);
            rock.rotation.y = Math.random() * Math.PI;
            rock.castShadow = true;
            // obstacleGroup.add(rock); // Disabled old procedural rocks
        });

        const waterGeo = new THREE.PlaneGeometry(terrainSize * 1.3, terrainSize * 1.3, 64, 64);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x051a2e,
            roughness: 0.1,
            metalness: 0.8,
            transparent: true,
            opacity: 0.8,
        });
        waterPlane = new THREE.Mesh(waterGeo, waterMat);
        waterPlane.rotation.x = -Math.PI / 2;
        waterPlane.position.y = 5;
        // scene.add(waterPlane); // Disabled old water plane

        const peopleModels = ['../people/female2.glb'];

        const spawnedSurvivors = new Map(); // Track by ID to avoid respawning

        // Helper to load, perfectly auto-scale, and auto-center any messy model
        function spawnPerson(worldX, worldZ, isTarget, survivorId = null) {
            if (survivorId && spawnedSurvivors.has(survivorId)) return; // Already spawned

            const randomModelPath = peopleModels[0];
            const loader = new GLTFLoader();

            loader.load(randomModelPath, (gltf) => {
                const rawMesh = gltf.scene;

                const box = new THREE.Box3().setFromObject(rawMesh);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);

                if (maxDim > 0 && maxDim < Infinity) {
                    rawMesh.scale.setScalar(0.025 / maxDim);
                } else {
                    rawMesh.scale.setScalar(0.025);
                }

                const scaledBox = new THREE.Box3().setFromObject(rawMesh);
                const center = scaledBox.getCenter(new THREE.Vector3());

                if (isFinite(center.x)) {
                    rawMesh.position.x = -center.x;
                    rawMesh.position.y = -scaledBox.min.y;
                    rawMesh.position.z = -center.z;
                }

                const wrapper = new THREE.Group();
                wrapper.add(rawMesh);

                // Start them high in the sky so we can drop them onto the city mesh
                wrapper.position.set(worldX, 2000, worldZ);
                wrapper.rotation.y = Math.random() * Math.PI * 2;

                // Add a very prominent red pillar to ALL females so they are easy to spot
                const pillarGeo = new THREE.CylinderGeometry(0.8, 0.8, 120, 8); // much thicker and taller
                const pillarMat = new THREE.MeshBasicMaterial({
                    color: isTarget ? 0x00ffcc : 0xff0000, transparent: true, opacity: 0.8 // target is cyan, hidden is red
                });
                const pillar = new THREE.Mesh(pillarGeo, pillarMat);
                pillar.position.y = 60;
                wrapper.add(pillar);

                personGroup.add(wrapper);
                if (survivorId) spawnedSurvivors.set(survivorId, wrapper);

                // Raycast downward to put them precisely on the street or roof!
                function dropToGround() {
                    if (window.cityModelForRaycasting) {
                        const raycaster = new THREE.Raycaster();
                        raycaster.set(new THREE.Vector3(worldX, 2000, worldZ), new THREE.Vector3(0, -1, 0));
                        const intersects = raycaster.intersectObject(window.cityModelForRaycasting, true);
                        if (intersects.length > 0) {
                            wrapper.position.y = intersects[0].point.y;
                        } else {
                            wrapper.visible = false; // Hide them if they spawned off the edge of the city!
                        }
                    } else {
                        setTimeout(dropToGround, 250);
                    }
                }
                dropToGround();

            }, undefined, (error) => {
                console.error('FAILED TO LOAD PERSON:', randomModelPath, error);
            });
        }

        // Spawn the Mission Targets (only if we have a rawSurvivors array — real worldMap won't have this)
        if (Array.isArray(rawSurvivors)) {
            rawSurvivors.forEach((surv, idx) => {
                const worldX = mapPyCoord(surv[0]);
                const worldZ = mapPyCoord(surv[1]);
                spawnPerson(worldX, worldZ, true, `RAW-${idx}`); // true = isTarget
            });
        }

        // Listen to Socket.IO for hiddenSurvivors updates
        if (window.io) {
            const socket = window.io('http://localhost:3001', {
                transports: ['websocket', 'polling']
            });
            socket.on('telemetrySnapshot', (snapshot) => {
                if (snapshot.hiddenSurvivors && Array.isArray(snapshot.hiddenSurvivors)) {
                    snapshot.hiddenSurvivors.forEach(surv => {
                        const worldX = surv.x; // Already in world coords
                        const worldZ = surv.y; // Already in world coords
                        spawnPerson(worldX, worldZ, false, surv.id);
                    });
                }
            });
        }
    })
    .catch(err => console.error('Map data fetch error:', err));

// --- Telemetry Obstacle System ---
const obstacleMeshes = {};
let lastAiFetchAt = 0;

function createObstacleAsset(obs) {
    const severityColor = obs.severity === 'high' ? 0xff5f5f : (obs.severity === 'medium' ? 0xffb85c : 0x8fe8bd);
    const group = new THREE.Group();
    const seed = Math.abs(Math.floor((obs.x * 31 + obs.y * 17 + obs.radius * 13) * 1000));
    const scale = Math.max(0.9, obs.radius / 10);
    const kind = obs.kind || ['boulder_field', 'deadwood', 'ruin_tower'][seed % 3];

    if (kind === 'boulder_field') {
        const clusterCount = 6 + (seed % 5);
        for (let i = 0; i < clusterCount; i++) {
            const size = (obs.radius * 0.24) + ((seed + i * 17) % 9) * 0.22;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(1 + size, 0),
                new THREE.MeshStandardMaterial({
                    color: 0x4a515f,
                    roughness: 0.94,
                    metalness: 0.06,
                })
            );
            const rx = Math.sin(seed * 0.013 + i * 1.7) * obs.radius * 0.64;
            const rz = Math.cos(seed * 0.009 + i * 1.2) * obs.radius * 0.62;
            rock.position.set(rx, 1.7 + size * 2.05, rz);
            rock.rotation.set(i * 0.4, i * 0.6, i * 0.2);
            rock.castShadow = true;
            group.add(rock);
        }
    } else if (kind === 'deadwood') {
        const trunkCount = 4 + (seed % 4);
        for (let i = 0; i < trunkCount; i++) {
            const h = 10 + ((seed + i * 23) % 11);
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.45, 0.8, h, 7),
                new THREE.MeshStandardMaterial({
                    color: 0x4c4036,
                    roughness: 1.0,
                    metalness: 0,
                })
            );
            const rx = Math.sin(seed * 0.015 + i) * obs.radius * 0.58;
            const rz = Math.cos(seed * 0.011 + i * 2) * obs.radius * 0.58;
            trunk.position.set(rx, h / 2, rz);
            trunk.rotation.z = 0.1 + (i % 2 ? 0.08 : -0.06);
            trunk.castShadow = true;
            group.add(trunk);
        }
    } else if (kind === 'wall_segment') {
        const wallSegments = 2 + (seed % 3);
        for (let i = 0; i < wallSegments; i++) {
            const len = obs.radius * (0.75 + i * 0.2);
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(len, 6 + i * 2, 2.5),
                new THREE.MeshStandardMaterial({ color: 0x5c6470, roughness: 0.82, metalness: 0.22 })
            );
            wall.position.set((i - 1) * (len * 0.3), 3 + i, (i % 2 === 0 ? -1 : 1) * obs.radius * 0.2);
            wall.rotation.y = 0.3 + i * 0.2;
            wall.castShadow = true;
            group.add(wall);
        }
    } else if (kind === 'vehicle_wreck') {
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(obs.radius * 0.9, 3.2, obs.radius * 0.5),
            new THREE.MeshStandardMaterial({ color: 0x646d79, roughness: 0.68, metalness: 0.4 })
        );
        hull.position.y = 2;
        hull.rotation.y = (seed % 30) * 0.03;
        hull.castShadow = true;
        group.add(hull);

        const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x8a939f, roughness: 0.6, metalness: 0.55 })
        );
        antenna.position.set(obs.radius * 0.2, 6.5, -obs.radius * 0.05);
        antenna.rotation.z = 0.4;
        antenna.castShadow = true;
        group.add(antenna);
    } else {
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(obs.radius * 0.75, 14 + obs.radius * 1.7, obs.radius * 0.75),
            new THREE.MeshStandardMaterial({
                color: 0x545d69,
                roughness: 0.75,
                metalness: 0.3,
            })
        );
        tower.position.y = 8 + obs.radius * 0.58;
        tower.castShadow = true;
        group.add(tower);

        const brace = new THREE.Mesh(
            new THREE.TorusGeometry(obs.radius * 1.12, 0.35, 8, 28),
            new THREE.MeshStandardMaterial({ color: 0x6d7885, roughness: 0.7, metalness: 0.35 })
        );
        brace.rotation.x = Math.PI / 2;
        brace.position.y = 2.6;
        group.add(brace);
    }

    const scar = new THREE.Mesh(
        new THREE.CircleGeometry(obs.radius * 1.36, 36),
        new THREE.MeshBasicMaterial({
            color: 0x1a1516,
            transparent: true,
            opacity: obs.severity === 'high' ? 0.45 : 0.32,
            side: THREE.DoubleSide,
        })
    );
    scar.rotation.x = -Math.PI / 2;
    scar.position.y = 0.04;
    group.add(scar);

    const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(obs.radius * 1.02, obs.radius * 1.38, 46),
        new THREE.MeshBasicMaterial({
            color: severityColor,
            transparent: true,
            opacity: obs.severity === 'high' ? 0.38 : 0.24,
            side: THREE.DoubleSide,
        })
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.15;
    baseRing.userData.isHazardRing = true;
    group.add(baseRing);

    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 10, 10),
        new THREE.MeshBasicMaterial({ color: severityColor })
    );
    beacon.position.y = 2.3;
    beacon.userData.isHazardBeacon = true;
    beacon.userData.baseColor = severityColor;
    group.add(beacon);

    // 3D Danger Zone Volume for Altitude-Aware Avoidance
    if (obs.height) {
        const volHeight = obs.height;
        const volGeo = new THREE.CylinderGeometry(obs.radius, obs.radius, volHeight, 16);
        const volMat = new THREE.MeshBasicMaterial({
            color: severityColor,
            transparent: true,
            opacity: 0.12,
            wireframe: true,
            depthWrite: false
        });
        const vol = new THREE.Mesh(volGeo, volMat);
        vol.position.y = volHeight / 2; // Center vertically on base
        group.add(vol);

        // Add a subtle glowing top cap
        const capGeo = new THREE.CircleGeometry(obs.radius, 16);
        const capMat = new THREE.MeshBasicMaterial({
            color: severityColor,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.rotation.x = -Math.PI / 2;
        cap.position.y = volHeight;
        group.add(cap);
    }

    group.scale.set(scale, 1, scale);

    group.userData.seed = seed;
    group.userData.severity = obs.severity;
    return group;
}

function updateObstacles(obsList) {
    if (!obsList) return;
    const keepKeys = new Set(obsList.map(o => o.id));
    for (const id in obstacleMeshes) {
        if (!keepKeys.has(id)) {
            obstacleGroup.remove(obstacleMeshes[id]);
            delete obstacleMeshes[id];
        }
    }

    obsList.forEach(obs => {
        if (!obstacleMeshes[obs.id]) {
            const group = createObstacleAsset(obs);
            // obstacleGroup.add(group); // Disabled old generated obstacles (trees, wrecks, etc)
            obstacleMeshes[obs.id] = group;
        }

        // Find terrain height at this coordinate roughly
        const group = obstacleMeshes[obs.id];
        let h = 5;
        if (storedHeightMap) {
            const mapX = Math.round((obs.x / worldBoundary) * (gridSize / 2) + (gridSize / 2));
            const mapY = Math.round((obs.y / worldBoundary) * (gridSize / 2) + (gridSize / 2));
            if (storedHeightMap[mapY] && storedHeightMap[mapY][mapX]) {
                h = storedHeightMap[mapY][mapX];
            }
        }
        group.position.set(obs.x, h, obs.y); // Set Y to 0 or height based on terrain mapping
    });
}

// --- Drone System ---
const droneMeshes = {};

function createDroneGroup() {
    const group = new THREE.Group();

    if (loadedDroneModel) {
        const customDrone = loadedDroneModel.clone();
        customDrone.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        group.add(customDrone);
    } else {
        // Fallback box if model hasn't loaded yet
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const mainBody = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3.5), bodyMat);
        group.add(mainBody);
        group.userData.isFallback = true;
    }

    // Downward Spotlight - much softer and realistic
    const light = new THREE.SpotLight(0xaaddff, 3, 100, Math.PI / 6, 0.6, 1.5);
    light.position.set(0, -0.5, 1.2);
    light.target.position.set(0, -40, 1.2);
    group.add(light);
    group.add(light.target);

    // Drone Navigation Light (Red/Green blinking)
    const navGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const navMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    const navLight = new THREE.Mesh(navGeo, navMat);
    navLight.position.set(0, 0.6, -1.5);
    navLight.userData.isNavLight = true;
    group.add(navLight);

    const scanRingGeo = new THREE.RingGeometry(2.2, 2.7, 36);
    const scanRingMat = new THREE.MeshBasicMaterial({
        color: 0x6bfaf4,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
    });
    const scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
    scanRing.rotation.x = -Math.PI / 2;
    scanRing.position.y = -0.8;
    scanRing.userData.isScanRing = true;
    group.add(scanRing);

    const beamGeo = new THREE.CylinderGeometry(0.18, 1.8, 26, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0x55f5ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = -13;
    beam.userData.isBeam = true;
    group.add(beam);

    return group;
}

function updateDrones(drones) {
    const keepKeys = new Set(drones.map(d => d.id));
    for (const id in droneMeshes) {
        if (!keepKeys.has(id)) {
            scene.remove(droneMeshes[id]);
            delete droneMeshes[id];
        }
    }

    drones.forEach(d => {
        if (!droneMeshes[d.id]) {
            const group = createDroneGroup();
            scene.add(group);
            droneMeshes[d.id] = group;
        }

        const droneGroup = droneMeshes[d.id];

        // Upgrade fallback drones once the custom model finishes downloading!
        if (loadedDroneModel && droneGroup.userData.isFallback) {
            const fallback = droneGroup.children.find(c => c.geometry && c.geometry.type === 'BoxGeometry');
            if (fallback) droneGroup.remove(fallback);

            const customDrone = loadedDroneModel.clone();
            customDrone.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            droneGroup.add(customDrone);
            droneGroup.userData.isFallback = false;
        }
        droneGroup.position.set(d.x, Math.max(d.z, 20), d.y);

        // Drone heading smoothly mapped
        const rad = (-d.heading * Math.PI) / 180 + Math.PI / 2;
        droneGroup.rotation.y = rad;

        // Visual indicator based on Python role
        let indicatorLight = droneGroup.children.find(c => c.isPointLight);
        if (!indicatorLight) {
            indicatorLight = new THREE.PointLight(0xffffff, 1.5, 30);
            indicatorLight.position.set(0, -2, 0);
            droneGroup.add(indicatorLight);
        }

        let mesh = droneGroup.children.find(c => c.isMesh && !c.userData.isNavLight && !c.userData.isScanRing && !c.userData.isBeam);

        if (d.status === 'failed' || d.task === 'crashed') {
            indicatorLight.color.setHex(0xff0000);
            indicatorLight.intensity = 0.8;
            if (mesh) mesh.material.color.setHex(0x222222); // Make it dark gray
        } else if (d.task === 'relay') {
            indicatorLight.color.setHex(0xffaa00); // Orange for relay
            indicatorLight.intensity = 1.0;
            if (mesh) mesh.material.color.setHex(0xe8e9ed);
        } else if (d.task === 'exploring' || d.task === 'searcher') {
            indicatorLight.color.setHex(0x00ffcc); // Cyan/Green for searcher
            indicatorLight.intensity = 1.0;
            if (mesh) mesh.material.color.setHex(0xe8e9ed);
        } else {
            indicatorLight.color.setHex(0xaaaaaa);
            if (mesh) mesh.material.color.setHex(0xe8e9ed);
        }

        if (isFollowMode && d.id === followDroneId) {
            followTarget = { x: d.x, y: Math.max(d.z, 20), z: d.y };
        }
    });
}

// --- Jammer Rendering ---
const jammerMeshes = {};
function updateJammers(zones) {
    if (!zones) return;
    zones.forEach(z => {
        if (!jammerMeshes[z.id]) {
            const geo = new THREE.SphereGeometry(z.radius, 16, 16);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(z.cx, z.radius / 2, z.cy);
            scene.add(mesh);
            jammerMeshes[z.id] = mesh;
        } else {
            // Pulsing effect
            const mesh = jammerMeshes[z.id];
            mesh.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.05);
            mesh.material.opacity = 0.1 + Math.sin(Date.now() * 0.005) * 0.05;
        }
    });
}

// --- Telemetry Polling ---
function fetchTelemetry() {
    fetch('http://localhost:3001/api/mission/snapshot')
        .then(res => res.json())
        .then(data => {
            if (data.drones) updateDrones(data.drones);
            if (data.obstacles) updateObstacles(data.obstacles);
            if (data.gpsDenialZones) updateJammers(data.gpsDenialZones);

            if (!isFollowMode && data.missionData) {
                const activeCount = data.drones ? data.drones.filter(d => d.status === 'active').length : 0;
                const el = (id) => document.getElementById(id);

                const hudDrones = el('hud-drone-count');
                if (hudDrones) hudDrones.textContent = `🚁 ${activeCount} / ${data.drones.length} Drones Active`;

                const hudCoverage = el('hud-coverage');
                if (hudCoverage) hudCoverage.textContent = `📡 Coverage: ${data.missionData.coverage}%`;

                const hudBattery = el('hud-battery');
                if (hudBattery) hudBattery.textContent = `🔋 Avg Battery: ${data.missionData.avgBattery.toFixed(0)}%`;

                const hudSignal = el('hud-signal');
                if (hudSignal) hudSignal.textContent = `📶 Signal: ${data.missionData.avgSignal.toFixed(0)}%`;

                const hudTime = el('hud-time');
                if (hudTime) hudTime.textContent = `⏱ Mission: ${data.missionData.missionTimeSec}s`;

                const hudSurvivors = el('hud-survivors');
                if (hudSurvivors) hudSurvivors.textContent = `👤 Found: ${data.missionData.foundSurvivors} Targets`;

                const hudObstacles = el('hud-obstacles');
                if (hudObstacles) {
                    const obstacleCount = data.obstacles ? data.obstacles.length : 0;
                    hudObstacles.textContent = `🪨 Obstacles: ${obstacleCount}`;
                }
            }

            const now = Date.now();
            if (!isFollowMode && now - lastAiFetchAt > 1800) {
                lastAiFetchAt = now;
                fetchAiInsights();
            }
        })
        .catch(err => console.error('Telemetry fetch error:', err));
}
setInterval(fetchTelemetry, 700);

function fetchAiInsights() {
    fetch('http://localhost:3001/api/mission/ai-insights')
        .then(res => res.json())
        .then(data => {
            if (!data) return;
            const topZone = data.topZones && data.topZones[0];
            const command = data.commandSuggestions && data.commandSuggestions[0];
            const health = data.health;

            const el = (id) => document.getElementById(id);
            const aiTopZone = el('hud-ai-top-zone');
            const aiCommand = el('hud-ai-command');
            const aiHealth = el('hud-ai-health');

            if (aiTopZone) {
                aiTopZone.textContent = topZone
                    ? `Top Zone: Z${topZone.zone} (${topZone.label}) score ${Number(topZone.score).toFixed(2)}`
                    : 'Top Zone: --';
            }

            if (aiCommand) {
                aiCommand.textContent = command ? `Command: ${command}` : 'Command: --';
            }

            if (aiHealth) {
                const healthPct = health ? Number(health.health_pct || 0).toFixed(1) : '--';
                aiHealth.textContent = `🧠 AI Health: ${healthPct}%`;
            }
        })
        .catch(err => console.error('AI insights fetch error:', err));
}

// --- Ambient Particles (dust/snow) ---
const particleCount = 600;
const particlesGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 400;
    particlePositions[i * 3 + 1] = Math.random() * 150 + 5;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 400;
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particlesMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.8,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
});
const particles = new THREE.Points(particlesGeo, particlesMat);
scene.add(particles);

// --- Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}, false);

// Interactive Raycasting for Manual Deploy
window.addEventListener('pointerdown', (event) => {
    if (!event.shiftKey) return; // Only trigger if holding Shift

    // Convert mouse position to normalized device coordinates
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    if (window.cityModelForRaycasting) {
        const intersects = raycaster.intersectObject(window.cityModelForRaycasting, true);
        if (intersects.length > 0) {
            const hitPoint = intersects[0].point;

            const mode = document.querySelector('input[name="clickMode"]:checked').value;

            if (mode === 'survivor') {
                console.log(`[UI INTERACT] Manual deploy survivor at X:${hitPoint.x.toFixed(1)}, Y:${hitPoint.z.toFixed(1)}`);
                fetch('http://localhost:3001/api/mission/add-survivor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x: hitPoint.x, y: hitPoint.z, severity: 'critical' })
                }).then(res => res.json()).then(data => {
                    if (data.ok) spawnPerson(hitPoint.x, hitPoint.z, false, data.survivor.id);
                }).catch(console.error);
            } else if (mode === 'jammer') {
                console.log(`[UI INTERACT] Manual deploy jammer at X:${hitPoint.x.toFixed(1)}, Y:${hitPoint.z.toFixed(1)}`);
                fetch('http://localhost:3001/api/mission/add-jammer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cx: hitPoint.x, cy: hitPoint.z, radius: 45 })
                }).catch(console.error);
            }
        }
    }
});

// --- UI Sidebar Button Wiring ---
const postApi = (endpoint) => fetch(`http://localhost:3001/api/mission/${endpoint}`, { method: 'POST' }).catch(console.error);

document.getElementById('btn-start').addEventListener('click', () => postApi('start'));
document.getElementById('btn-stop').addEventListener('click', () => postApi('stop'));
document.getElementById('btn-reset').addEventListener('click', () => postApi('reset'));
document.getElementById('btn-emp').addEventListener('click', () => postApi('kill-drone'));

// --- Animation Loop ---
const clock = new THREE.Clock();

function droneSeed(id) {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i) * (i + 1);
    return sum * 0.013;
}

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    atmosphereUniforms.uTime.value = elapsed;

    if (waterPlane) {
        waterPlane.position.y = 4.5 + Math.sin(elapsed * 0.8) * 0.3;
    }

    tacticalRingGroup.children.forEach((ring, idx) => {
        ring.rotation.z += ring.userData.spin;
        ring.position.y = 4 + idx * 8 + Math.sin(elapsed * 0.5 + idx) * 0.7;
    });

    obstacleGroup.children.forEach((group, idx) => {
        const wobble = Math.sin(elapsed * 1.8 + (group.userData.seed || idx) * 0.002);
        group.children.forEach((child) => {
            if (child.userData.isHazardRing) {
                const pulse = 1 + 0.06 * wobble;
                child.scale.set(pulse, pulse, pulse);
                child.material.opacity = group.userData.severity === 'high'
                    ? 0.28 + 0.08 * wobble
                    : 0.18 + 0.06 * wobble;
            }
            if (child.userData.isHazardBeacon) {
                const intensity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 3.8 + idx));
                const baseColor = new THREE.Color(child.userData.baseColor || 0xffffff);
                child.material.color.copy(baseColor).multiplyScalar(0.7 + intensity * 0.6);
                child.scale.setScalar(0.92 + intensity * 0.25);
            }
        });
    });

    personGroup.children.forEach(person => {
        person.children.forEach(child => {
            if (child.userData.isPillar) {
                child.material.opacity = 0.1 + Math.sin(elapsed * 3) * 0.15;
            }
        });
    });

    for (const id in droneMeshes) {
        const group = droneMeshes[id];
        const seed = droneSeed(id);
        group.position.y += Math.sin(elapsed * 4 + seed) * 0.05;
        group.rotation.x = Math.sin(elapsed * 2 + seed) * 0.05;

        group.children.forEach(child => {
            if (child.userData.isRotor) {
                child.rotation.y += 0.4;
            }
            if (child.userData.isNavLight) {
                child.material.color.setHex((Math.floor(elapsed * 2) % 2 === 0) ? 0xff0000 : 0x00ff00);
            }
            if (child.userData.isScanRing) {
                const pulse = 1 + (Math.sin(elapsed * 3 + seed) + 1) * 0.25;
                child.scale.setScalar(pulse);
                child.material.opacity = 0.18 + Math.sin(elapsed * 3 + seed) * 0.08;
            }
            if (child.userData.isBeam) {
                child.material.opacity = 0.08 + (Math.sin(elapsed * 2.4 + seed) + 1) * 0.05;
            }
        });
    }

    const pPos = particles.geometry.attributes.position;
    for (let i = 0; i < particleCount; i++) {
        let y = pPos.getY(i);
        y -= 0.12;
        if (y < 5) y = 150;
        pPos.setY(i, y);
        pPos.setX(i, pPos.getX(i) + Math.sin(elapsed + i) * 0.02);
    }
    pPos.needsUpdate = true;

    if (isFollowMode) {
        const camTargetX = followTarget.x;
        const camTargetZ = followTarget.z;
        // Camera smoothly follows but stays behind and above the drone (like a chase cam)
        camera.position.lerp(new THREE.Vector3(camTargetX, followTarget.y + 40, camTargetZ + 20), 0.1);
        camera.lookAt(camTargetX, followTarget.y - 10, camTargetZ - 30);
    } else {
        controls.update();
    }

    composer.render();
}
animate();

// --- Dynamic GLB Mesh Scanner & Heatmap ---
function scanCityMesh() {
    if (!window.cityModelForRaycasting) return;
    console.log("Scanning city mesh for full occupancy grid & collision boundaries...");

    const raycaster = new THREE.Raycaster();
    const scannedObstacles = [];
    const boundary = SIM_CONFIG.WORLD_BOUNDARY || 350;
    const gridSize = SIM_CONFIG.GRID_SIZE || 40;
    const cellSize = (boundary * 2) / gridSize;

    const heatmapGroup = new THREE.Group();
    heatmapGroup.position.y = 1.0; // Slightly above ground to prevent Z-fighting

    // Initialize worldMap 2D array [cellX][cellY]
    const worldMap = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));

    for (let cellX = 0; cellX < gridSize; cellX++) {
        for (let cellY = 0; cellY < gridSize; cellY++) {
            const worldX = -boundary + (cellX + 0.5) * cellSize;
            const worldY = -boundary + (cellY + 0.5) * cellSize;

            raycaster.set(new THREE.Vector3(worldX, 1500, worldY), new THREE.Vector3(0, -1, 0));
            const intersects = raycaster.intersectObject(window.cityModelForRaycasting, true);

            const hitY = intersects.length > 0 ? intersects[0].point.y : 0;
            const occupied = hitY > 10;

            worldMap[cellX][cellY] = {
                height: Number(hitY.toFixed(2)),
                occupied,
                obstacleId: occupied ? `GLB-${cellX}-${cellY}` : null,
            };

            if (occupied) {
                scannedObstacles.push({
                    id: `GLB-${cellX}-${cellY}`,
                    x: Number(worldX.toFixed(2)),
                    y: Number(worldY.toFixed(2)),
                    radius: Number((cellSize * 0.7).toFixed(2)),
                    height: Number(hitY.toFixed(2)),
                    severity: hitY > 150 ? 'high' : hitY > 80 ? 'medium' : 'low',
                });

                // Add tactical heatmap tile
                const tileGeo = new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9);
                const color = hitY > 150 ? 0xff0000 : hitY > 80 ? 0xffaa00 : 0xffff00;
                const tileMat = new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.28,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                });
                const tile = new THREE.Mesh(tileGeo, tileMat);
                tile.rotation.x = -Math.PI / 2;
                tile.position.set(worldX, 0, worldY);
                heatmapGroup.add(tile);
            }
        }
    }

    scene.add(heatmapGroup);

    // Post scanned obstacles to Node.js physics engine
    fetch('http://localhost:3001/api/mission/set-obstacles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obstacles: scannedObstacles }),
    }).then(res => res.json())
        .then(data => console.log('[PHYSICS SYNC] Synced ' + data.count + ' physical building collisions!'))
        .catch(err => console.error('Failed to sync obstacles:', err));

    // Post full worldMap matrix to Node.js backend
    fetch('http://localhost:3001/api/mission/world-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldMap }),
    }).then(res => res.json())
        .then(data => console.log('[WORLD MAP SYNC] Synced full ' + gridSize + 'x' + gridSize + ' occupancy grid to server!'))
        .catch(err => console.error('Failed to sync worldMap:', err));

    // Place 3D survivors exclusively on unoccupied ground cells
    const unoccupiedCells = [];
    for (let cx = 0; cx < gridSize; cx++) {
        for (let cy = 0; cy < gridSize; cy++) {
            if (!worldMap[cx][cy].occupied) {
                const wx = -boundary + (cx + 0.5) * cellSize;
                const wy = -boundary + (cy + 0.5) * cellSize;
                unoccupiedCells.push({ cx, cy, x: Number(wx.toFixed(2)), y: Number(wy.toFixed(2)) });
            }
        }
    }

    const realSurvivors = [];
    const severities = ['critical', 'stable', 'unknown', 'critical', 'stable'];
    const survivorGroup = new THREE.Group();

    for (let i = 0; i < Math.min(5, unoccupiedCells.length); i++) {
        const randomIndex = Math.floor(Math.random() * unoccupiedCells.length);
        const cell = unoccupiedCells.splice(randomIndex, 1)[0];
        const survivorId = `HSV-00${i + 1}`;
        const severity = severities[i % severities.length];

        realSurvivors.push({
            id: survivorId,
            x: cell.x,
            y: cell.y,
            severity,
        });

        // Visual 3D marker in scene at cell ground height
        const markerGeo = new THREE.CylinderGeometry(2, 0, 8, 8);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(cell.x, 4, cell.y);
        survivorGroup.add(marker);
    }
    scene.add(survivorGroup);

    fetch('http://localhost:3001/api/mission/survivor-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survivors: realSurvivors }),
    }).then(res => res.json())
        .then(data => console.log('[SURVIVOR SYNC] Synced ' + data.count + ' real 3D survivor positions on unoccupied ground cells!'))
        .catch(err => console.error('Failed to sync survivor positions:', err));
}


