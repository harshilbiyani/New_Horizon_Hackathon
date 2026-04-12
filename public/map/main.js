import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
// Softer, more realistic night/dusk sky
scene.background = new THREE.Color(0x060810);
scene.fog = new THREE.FogExp2(0x060810, 0.002);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2500);
camera.position.set(0, 180, 300);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // Reduced from 1.4 for clarity
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
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
// Natural, softer lighting
const ambient = new THREE.AmbientLight(0x223344, 1.0);
scene.add(ambient);

const sunLight = new THREE.DirectionalLight(0xfff0dd, 2.5);
sunLight.position.set(-150, 250, 100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -200;
sunLight.shadow.camera.right = 200;
sunLight.shadow.camera.top = 200;
sunLight.shadow.camera.bottom = -200;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x00ccff, 1.2);
rimLight.position.set(200, 80, -80);
scene.add(rimLight);

const hemiLight = new THREE.HemisphereLight(0x88aacc, 0x112211, 0.6);
scene.add(hemiLight);

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
                const worldX = (xi / (width - 1)) * terrainSize - terrainSize/2;
                const worldZ = (yi / (height - 1)) * terrainSize - terrainSize/2;
                obstacleSpikes.push({x: worldX, y: h, z: worldZ});
            }
        }

        terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        terrainGeo.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            metalness: 0.05,
            flatShading: true,
        });
        terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.receiveShadow = true;
        terrain.castShadow = true;
        scene.add(terrain);

        // Render Matrix height terrain obstacles
        const rockGeo = new THREE.DodecahedronGeometry(2);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x443333, roughness: 1.0 });
        obstacleSpikes.forEach(p => {
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.scale.set(1 + Math.random(), 3 + Math.random()*4, 1 + Math.random());
            rock.position.set(p.x, p.y + rock.scale.y, p.z);
            rock.rotation.y = Math.random() * Math.PI;
            rock.castShadow = true;
            obstacleGroup.add(rock);
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
        scene.add(waterPlane);

        rawSurvivors.forEach(surv => {
            const px = surv[0];
            const py = surv[1];
            const worldX = mapPyCoord(px);
            const worldZ = mapPyCoord(py);
            const h = heightMap[py] ? (heightMap[py][px] || 0) : 0;
            const person = createPerson(worldX, worldZ, Math.max(h, 6));
            personGroup.add(person);
        });
    })
    .catch(err => console.error('Map data fetch error:', err));

// --- Telemetry Obstacle System ---
const obstacleMeshes = {};
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
            const group = new THREE.Group();
            
            // Tower/Barrier to represent telemetry obstacle
            const geo = new THREE.CylinderGeometry(obs.radius * 0.5, obs.radius * 0.8, 40, 8);
            const colorHex = obs.severity === 'high' ? 0xff2222 : (obs.severity === 'medium' ? 0xffaa00 : 0x22ff22);
            const mat = new THREE.MeshStandardMaterial({
                color: colorHex,
                roughness: 0.7,
                metalness: 0.3
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = 20;
            mesh.castShadow = true;
            group.add(mesh);
            
            // Warning ring
            const ringGeo = new THREE.TorusGeometry(obs.radius + 1, 0.4, 4, 16);
            const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.5 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 2;
            group.add(ring);
            
            obstacleGroup.add(group);
            obstacleMeshes[obs.id] = group;
        }
        
        // Find terrain height at this coordinate roughly
        const group = obstacleMeshes[obs.id];
        let h = 5;
        if (storedHeightMap) {
            const mapX = Math.round((obs.x / worldBoundary) * (gridSize/2) + (gridSize/2));
            const mapY = Math.round((obs.y / worldBoundary) * (gridSize/2) + (gridSize/2));
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
    
    // Core mainframe
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        metalness: 0.8,
        roughness: 0.4,
    });
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3.5), bodyMat);
    group.add(mainBody);
    
    // Camera dome
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.9, roughness: 0.1 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16, 0, Math.PI*2, 0, Math.PI/2), domeMat);
    dome.position.set(0, -0.4, 1.2);
    dome.rotation.x = Math.PI;
    group.add(dome);

    // Arms & Rotors
    const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.5, 8);
    armGeo.rotateZ(Math.PI / 2);
    
    const rotorPositions = [
        [1.8, 0.2, 1.5], [-1.8, 0.2, 1.5],
        [1.8, 0.2, -1.5], [-1.8, 0.2, -1.5]
    ];
    
    rotorPositions.forEach((pos, i) => {
        // Arm
        const arm = new THREE.Mesh(armGeo, bodyMat);
        arm.position.set(pos[0]/2, 0, pos[2]);
        if (i % 2 === 0) arm.scale.x = 0.8; 
        group.add(arm);
        
        // Motor
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12), bodyMat);
        motor.position.set(...pos);
        group.add(motor);
        
        // Spinning Blades (visual blur)
        const bladeGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.05, 16);
        const bladeMat = new THREE.MeshBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.3 });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.set(pos[0], pos[1] + 0.3, pos[2]);
        blade.userData.isRotor = true;
        group.add(blade);
    });
    
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
        droneGroup.position.set(d.x, Math.max(d.z, 20), d.y);
        
        // Drone heading smoothly mapped
        const rad = (-d.heading * Math.PI) / 180 + Math.PI/2; 
        droneGroup.rotation.y = rad;
        
        if (isFollowMode && d.id === followDroneId) {
            followTarget = { x: d.x, y: Math.max(d.z, 20), z: d.y };
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
            }
        })
        .catch(err => console.error('Telemetry fetch error:', err));
}
setInterval(fetchTelemetry, 700);

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

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

    if (waterPlane) {
        waterPlane.position.y = 4.5 + Math.sin(elapsed * 0.8) * 0.3;
    }

    personGroup.children.forEach(person => {
        person.children.forEach(child => {
            if (child.userData.isPillar) {
                child.material.opacity = 0.1 + Math.sin(elapsed * 3) * 0.15;
            }
        });
    });

    for (const id in droneMeshes) {
        const group = droneMeshes[id];
        // Bobbing effect
        group.position.y += Math.sin(elapsed * 4 + parseFloat(id || "0")) * 0.05;
        // Pitch mapping for "movement"
        group.rotation.x = Math.sin(elapsed * 2) * 0.05; 
        
        group.children.forEach(child => {
            if (child.userData.isRotor) {
                child.rotation.y += 0.4; 
            }
            if (child.userData.isNavLight) {
                child.material.color.setHex((Math.floor(elapsed * 2) % 2 === 0) ? 0xff0000 : 0x00ff00);
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
