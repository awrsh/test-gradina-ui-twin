import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Mission, TwinFullSnapshot } from '../shared/p2-contracts';
import { CameraFocusTarget } from './useTwinClient';
import { Lang, ThemeMode } from './i18n';
import {
  buildFacilityArchitecture,
  buildRealisticProductionAsset,
  buildRealisticVehicle,
  buildWarehouseLocationGroup,
  createProceduralTextures,
} from './twin-scene-objects';

export type TwinOverlayMode = {
  lanes: boolean;
  occupancy: boolean;
  heatmaps: boolean;
  oee: boolean;
  batchJourney: boolean;
};

export type SelectedEntityRef =
  | { kind: 'vehicle'; id: string }
  | { kind: 'location'; id: string }
  | { kind: 'asset'; id: string }
  | { kind: 'pallet'; id: string };

interface Props {
  snapshot: TwinFullSnapshot | null;
  overlays: TwinOverlayMode;
  selected: SelectedEntityRef | null;
  onSelect: (sel: SelectedEntityRef | null) => void;
  focusTarget: CameraFocusTarget | null;
  theme: ThemeMode;
  lang: Lang;
}

// Module-scope reusable math objects (Zero GC in render loop)
const _mouse = new THREE.Vector2();
const _targetCamGoal = new THREE.Vector3();
const _targetLookGoal = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createFacilityFloorTexture(
  maxAniso: number,
  theme: ThemeMode,
  lang: Lang
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const isLight = theme === 'light';
  const isFa = lang === 'fa';

  // Facility world: x in [-28, 28] (56m), z in [-18, 18] (36m)
  const toPxX = (x: number) => ((x + 28) / 56) * canvas.width;
  const toPxZ = (z: number) => ((z + 18) / 36) * canvas.height;
  const toW = (w: number) => (w / 56) * canvas.width;
  const toH = (h: number) => (h / 36) * canvas.height;

  // Base industrial floor
  ctx.fillStyle = isLight ? '#cbd5e1' : '#141c2b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle concrete tile grid (1m x 1m)
  ctx.strokeStyle = isLight ? 'rgba(51, 65, 85, 0.12)' : 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let x = -28; x <= 28; x += 2) {
    ctx.beginPath();
    ctx.moveTo(toPxX(x), 0);
    ctx.lineTo(toPxX(x), canvas.height);
    ctx.stroke();
  }
  for (let z = -18; z <= 18; z += 2) {
    ctx.beginPath();
    ctx.moveTo(0, toPxZ(z));
    ctx.lineTo(canvas.width, toPxZ(z));
    ctx.stroke();
  }

  // Warehouse Main Floor Zone
  ctx.fillStyle = isLight ? '#e2e8f0' : '#1a2436';
  ctx.fillRect(toPxX(-25), toPxZ(-15), toW(27), toH(30));

  // QA Quarantine Cage Floor
  ctx.fillStyle = isLight ? 'rgba(245, 158, 11, 0.22)' : 'rgba(180, 83, 9, 0.16)';
  ctx.fillRect(toPxX(-16.5), toPxZ(4), toW(5), toH(4.5));
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 3;
  ctx.strokeRect(toPxX(-16.5), toPxZ(4), toW(5), toH(4.5));

  // Airlock Zone
  ctx.fillStyle = isLight ? '#ccfbf1' : '#13313c';
  ctx.fillRect(toPxX(2), toPxZ(-4), toW(6), toH(8));
  ctx.strokeStyle = isLight ? '#0d9488' : '#14b8a6';
  ctx.lineWidth = 3;
  ctx.strokeRect(toPxX(2), toPxZ(-4), toW(6), toH(8));

  // Production Prep Suite (Grade C)
  ctx.fillStyle = isLight ? '#e0f2fe' : '#162840';
  ctx.fillRect(toPxX(8), toPxZ(-15), toW(18), toH(15));
  ctx.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(toPxX(8), toPxZ(-15), toW(18), toH(15));

  // Production Filling Suite (Grade B)
  ctx.fillStyle = isLight ? '#dbeafe' : '#14203b';
  ctx.fillRect(toPxX(8), toPxZ(0), toW(18), toH(15));
  ctx.strokeStyle = isLight ? '#2563eb' : '#60a5fa';
  ctx.lineWidth = 2;
  ctx.strokeRect(toPxX(8), toPxZ(0), toW(18), toH(15));

  // Safety aisle stripes along central spine (z = 0)
  ctx.strokeStyle = isLight ? 'rgba(217, 119, 6, 0.65)' : 'rgba(245, 158, 11, 0.45)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.moveTo(toPxX(-22), toPxZ(-1.3));
  ctx.lineTo(toPxX(2), toPxZ(-1.3));
  ctx.moveTo(toPxX(-22), toPxZ(1.3));
  ctx.lineTo(toPxX(2), toPxZ(1.3));
  ctx.stroke();
  ctx.setLineDash([]);

  // Zone typography painted sharply onto floor
  const fontFamily = isFa ? '"Vazirmatn", sans-serif' : '"Plus Jakarta Sans", sans-serif';
  ctx.direction = isFa ? 'rtl' : 'ltr';
  ctx.textAlign = isFa ? 'right' : 'left';
  ctx.font = `600 22px ${fontFamily}`;
  ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.55)' : 'rgba(226, 232, 240, 0.36)';
  ctx.fillText(
    isFa ? 'سالن اصلی انبار' : 'WAREHOUSE · WH-MAIN',
    isFa ? toPxX(1) : toPxX(-24),
    toPxZ(-13.2)
  );
  ctx.fillStyle = isLight ? 'rgba(180, 83, 9, 0.85)' : 'rgba(251, 191, 36, 0.6)';
  ctx.font = `600 16px ${fontFamily}`;
  ctx.fillText(
    isFa ? 'قرنطینه کنترل کیفیت' : 'QA QUARANTINE',
    isFa ? toPxX(-11.9) : toPxX(-16.1),
    toPxZ(8.1)
  );
  ctx.fillStyle = isLight ? 'rgba(13, 148, 136, 0.9)' : 'rgba(45, 212, 191, 0.65)';
  ctx.fillText(
    isFa ? 'هوابند دارویی ۰۱' : 'AIRLOCK-01',
    isFa ? toPxX(7.5) : toPxX(2.6),
    toPxZ(-2.8)
  );
  ctx.fillStyle = isLight ? 'rgba(3, 105, 161, 0.78)' : 'rgba(56, 189, 248, 0.5)';
  ctx.font = `600 20px ${fontFamily}`;
  ctx.fillText(
    isFa ? 'سوئیت گرانولاسیون · کلاس تمیزی ج' : 'GRANULATION SUITE · GRADE C',
    isFa ? toPxX(25) : toPxX(9.2),
    toPxZ(-13.2)
  );
  ctx.fillStyle = isLight ? 'rgba(29, 78, 216, 0.78)' : 'rgba(96, 165, 250, 0.5)';
  ctx.fillText(
    isFa ? 'سوئیت پرکنی استریل · کلاس تمیزی ب' : 'ASEPTIC FILLING · GRADE B',
    isFa ? toPxX(25) : toPxX(9.2),
    toPxZ(13.8)
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}


export const ThreeTwinViewport: React.FC<Props> = ({
  snapshot,
  overlays,
  selected,
  onSelect,
  focusTarget,
  theme,
  lang,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglLost, setWebglLost] = useState(false);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const langRef = useRef(lang);
  langRef.current = lang;

  // Dynamic Three.js handles
  const sceneRef = useRef<THREE.Scene | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const floorMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const floorTexRef = useRef<THREE.CanvasTexture | null>(null);
  const maxAnisoRef = useRef<number>(1);

  const vehicleGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const machineGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const locationGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const routeOverlayGroupRef = useRef<THREE.Group | null>(null);
  const heatmapOverlayGroupRef = useRef<THREE.Group | null>(null);
  const occupancyOverlayGroupRef = useRef<THREE.Group | null>(null);
  const oeeOverlayGroupRef = useRef<THREE.Group | null>(null);
  const batchOverlayGroupRef = useRef<THREE.Group | null>(null);
  const rackPalletMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const worldBuiltRef = useRef(false);

  const cameraFocusActiveRef = useRef(false);
  const prevFocusNonceRef = useRef<number>(-1);

  useEffect(() => {
    if (focusTarget && focusTarget.nonce !== prevFocusNonceRef.current) {
      prevFocusNonceRef.current = focusTarget.nonce;
      const d = focusTarget.distance ?? 13;
      _targetLookGoal.set(focusTarget.x, focusTarget.y + 0.6, focusTarget.z);
      _targetCamGoal.set(focusTarget.x + d * 0.55, d * 0.65, focusTarget.z + d * 0.85);
      cameraFocusActiveRef.current = true;
    }
  }, [focusTarget]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const isLightInit = themeRef.current === 'light';
    const bgHex = isLightInit ? 0xe2e8f0 : 0x0b1120;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, isLightInit ? 0.0055 : 0.0085);
    sceneRef.current = scene;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 220);
    camera.position.set(-4, 24, 30);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 3-point balanced studio rig
    const hemi = new THREE.HemisphereLight(
      isLightInit ? 0xf8fafc : 0xcbd5e1,
      isLightInit ? 0x64748b : 0x1e293b,
      isLightInit ? 0.95 : 0.75
    );
    scene.add(hemi);
    hemiLightRef.current = hemi;

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.55);
    keyLight.position.set(-18, 34, 22);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -32;
    keyLight.shadow.camera.right = 32;
    keyLight.shadow.camera.top = 24;
    keyLight.shadow.camera.bottom = -24;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(24, 18, -24);
    scene.add(rimLight);

    // Facility Floor & Procedural PBR Textures
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    maxAnisoRef.current = maxAniso;
    const procTex = createProceduralTextures(maxAniso);
    const floorTex = createFacilityFloorTexture(maxAniso, themeRef.current, langRef.current);
    floorTexRef.current = floorTex;
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughnessMap: procTex.floorRoughnessTex,
      roughness: 0.72,
      metalness: 0.1,
    });
    floorMatRef.current = floorMat;
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(56, 36), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Cleanroom glass walls with brushed mullions, transoms & structural columns
    buildFacilityArchitecture(scene, procTex);

    // Overlay container groups
    const routeGroup = new THREE.Group();
    const heatmapGroup = new THREE.Group();
    const occupancyGroup = new THREE.Group();
    const oeeGroup = new THREE.Group();
    const batchGroup = new THREE.Group();
    scene.add(routeGroup, heatmapGroup, occupancyGroup, oeeGroup, batchGroup);
    routeOverlayGroupRef.current = routeGroup;
    heatmapOverlayGroupRef.current = heatmapGroup;
    occupancyOverlayGroupRef.current = occupancyGroup;
    oeeOverlayGroupRef.current = oeeGroup;
    batchOverlayGroupRef.current = batchGroup;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.minDistance = 6;
    controls.maxDistance = 68;
    controls.target.set(0, 0, 0);

    controls.addEventListener('start', () => {
      cameraFocusActiveRef.current = false;
    });

    // Raycaster on Layer 1
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);

    let pointerDownPos = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 5) return; // drag orbit, not click
      const rect = renderer.domElement.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_mouse, camera);

      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length > 0) {
        const ud = hits[0].object.userData;
        if (ud?.entityKind && ud?.entityId) {
          onSelectRef.current({ kind: ud.entityKind, id: ud.entityId });
          return;
        }
      }
      onSelectRef.current(null);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onContextRestored = () => setWebglLost(false);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Sync world geometry once snapshot arrives
    const ensureWorldBuilt = (snap: TwinFullSnapshot) => {
      if (worldBuiltRef.current) return;
      worldBuiltRef.current = true;

      // Build realistic Selective Racks, Recessed Docks & Weigh-Scale Staging Bays
      for (const loc of snap.world.locations) {
        if (loc.kind === 'bin' || loc.kind === 'staging' || loc.kind === 'dock_in' || loc.kind === 'dock_out') {
          const { group, palletGroup } = buildWarehouseLocationGroup(loc, procTex);
          rackPalletMeshesRef.current.set(loc.id, palletGroup);
          locationGroupsRef.current.set(loc.id, group);
          scene.add(group);
        }
      }

      // Build realistic Production Assets (MES: GMP Airlocks, Stainless Vessels, Isolators & Conveyors)
      for (const asset of snap.mes.assets) {
        if (asset.kind === 'line') continue;
        const ag = buildRealisticProductionAsset(asset, procTex);
        machineGroupsRef.current.set(asset.id, ag);
        scene.add(ag);
      }

      // Build realistic Vehicles (AMR, AGV, Counterbalance Forklift)
      for (const veh of snap.vehicles) {
        const vg = buildRealisticVehicle(veh, procTex);
        vg.position.set(veh.pose.x, 0, veh.pose.z);
        vg.rotation.y = veh.pose.headingRad;
        vehicleGroupsRef.current.set(veh.id, vg);
        scene.add(vg);
      }
    };

    const clock = new THREE.Clock();
    let frameId = 0;
    let elapsed = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      const dt = Math.min(0.1, clock.getDelta());
      elapsed += dt;
      const snap = snapshotRef.current;

      if (snap) {
        ensureWorldBuilt(snap);

        // Smooth vehicle pose & heading interpolation (EP06-F02: no teleporting)
        for (const v of snap.vehicles) {
          const vg = vehicleGroupsRef.current.get(v.id);
          if (!vg) continue;

          const lambda = isSoftwareGl ? 18 : 10;
          vg.position.x = THREE.MathUtils.damp(vg.position.x, v.pose.x, lambda, dt);
          vg.position.z = THREE.MathUtils.damp(vg.position.z, v.pose.z, lambda, dt);

          // Shortest-angle heading interpolation
          let diff = v.pose.headingRad - vg.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          vg.rotation.y += diff * (1 - Math.exp(-lambda * dt));

          // Update beacon color for operational state
          const beacon = vg.getObjectByName('beacon') as THREE.Mesh | undefined;
          if (beacon) {
            const mat = beacon.material as THREE.MeshStandardMaterial;
            const hex = v.eStopActive
              ? 0xef4444
              : v.isStale
                ? 0xf59e0b
                : v.status === 'busy'
                  ? 0x06b6d4
                  : v.status === 'paused'
                    ? 0xfbbf24
                    : 0x10b981;
            mat.color.setHex(hex);
            mat.emissive.setHex(hex);
          }

          // Toggle attached cargo geometry (EP06-F04)
          const cargo = vg.getObjectByName('cargoAttachment');
          if (cargo) {
            cargo.visible = v.attachment !== null;
          }

          // Spin vehicle wheels proportional to live velocity
          if (v.velocityMps > 0.02) {
            const wheelRadius = v.type === 'Forklift' ? 0.22 : 0.14;
            const deltaAngle = (v.velocityMps * dt) / wheelRadius;
            for (const child of vg.children) {
              if (child.name === 'vehicleWheel') {
                child.rotation.x += deltaAngle;
              }
            }
          }

          // Smooth hydraulic fork lift when carrying a pallet
          if (v.type === 'Forklift') {
            const forkCarriage = vg.getObjectByName('forkCarriage');
            if (forkCarriage) {
              const targetLiftY = v.attachment !== null ? 0.26 : 0;
              forkCarriage.position.y = THREE.MathUtils.damp(
                forkCarriage.position.y,
                targetLiftY,
                6,
                dt
              );
            }
          }
        }

        // Update pallet occupancy visuals & active task rings on locations
        for (const [locId, palletGrp] of rackPalletMeshesRef.current.entries()) {
          const pallet = snap.wms.pallets.find(
            (p) => p.locationId === locId && !p.inTransitVehicleId
          );
          palletGrp.visible = Boolean(pallet);
          if (pallet) {
            const box = palletGrp.getObjectByName('palletBox') as THREE.Mesh | undefined;
            if (box) {
              const mat = box.material as THREE.MeshStandardMaterial;
              mat.color.setHex(pallet.qaStatus === 'quarantine' ? 0xd97706 : 0x0ea5e9);
            }
          }

          const locGrp = locationGroupsRef.current.get(locId);
          const locRing = locGrp?.getObjectByName('locationProcessRing') as THREE.Mesh | undefined;
          if (locRing) {
            const activeLocTask = (snap.tasks ?? []).find(
              (tk) => tk.targetKind === 'location' && tk.targetId === locId && tk.status === 'in_progress'
            );
            locRing.visible = Boolean(activeLocTask);
            if (activeLocTask) {
              const mat = locRing.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.45 + 0.35 * Math.sin(elapsed * 4.2);
              const pulse = 1 + 0.045 * Math.sin(elapsed * 4.2);
              locRing.scale.set(pulse, pulse, 1);
            }
          }
        }

        // Update MES devices: beacons, rotating mechanical rotors, sight-glass/LED glow & active process scanner
        for (const asset of snap.mes.assets) {
          const ag = machineGroupsRef.current.get(asset.id);
          if (!ag) continue;

          const activeTask = (snap.tasks ?? []).find(
            (tk) => tk.targetKind === 'asset' && tk.targetId === asset.id && tk.status === 'in_progress'
          );
          const pendingTask = (snap.tasks ?? []).find(
            (tk) => tk.targetKind === 'asset' && tk.targetId === asset.id && tk.status === 'pending'
          );
          const activeWindow = snap.mes.maintenanceWindows.find(
            (mw) => mw.assetId === asset.id && mw.active
          );

          const isProcessing = Boolean(activeTask || activeWindow);
          const isRunning = asset.machineState === 'run' || isProcessing;

          const categoryColor =
            activeTask?.category === 'sanitation'
              ? 0x14b8a6
              : activeTask?.category === 'qa_sampling' || activeTask?.category === 'inspection'
                ? 0x38bdf8
                : activeTask?.category === 'maintenance' ||
                    (activeWindow && activeWindow.type !== 'production_run')
                  ? 0xf59e0b
                  : 0x10b981;

          // 1. Andon Beacon Light
          const beacon = ag.getObjectByName('machineBeacon') as THREE.Mesh | undefined;
          if (beacon) {
            const mat = beacon.material as THREE.MeshStandardMaterial;
            const hex = activeTask
              ? categoryColor
              : asset.machineState === 'run'
                ? 0x10b981
                : asset.machineState === 'idle'
                  ? 0x38bdf8
                  : asset.machineState === 'maintenance'
                    ? 0xf59e0b
                    : 0xef4444;
            mat.color.setHex(hex);
            mat.emissive.setHex(hex);
            mat.emissiveIntensity = isProcessing
              ? 0.9 + 0.85 * Math.abs(Math.sin(elapsed * 5.0))
              : asset.machineState === 'run'
                ? 0.95
                : 0.55;
          }

          // 2. Mechanical Rotor (turret / agitator impeller / HEPA fan / conveyor drive wheel)
          const rotor = ag.getObjectByName('assetRotor');
          if (rotor && isRunning) {
            const speed = activeTask ? 3.4 : activeWindow ? 1.5 : 1.9;
            if (asset.kind === 'buffer') {
              rotor.rotation.z -= dt * speed;
            } else {
              rotor.rotation.y += dt * speed;
            }
          }

          // 3. Sight-glass / Isolator LED / HEPA Plenum Glow
          const glowMesh = ag.getObjectByName('processGlow') as THREE.Mesh | undefined;
          if (glowMesh) {
            const mat = glowMesh.material as THREE.MeshStandardMaterial;
            if (isProcessing) {
              mat.color.setHex(categoryColor);
              mat.emissive.setHex(categoryColor);
              mat.emissiveIntensity = 0.65 + 0.75 * (0.5 + 0.5 * Math.sin(elapsed * 4.5));
            } else if (asset.machineState === 'run') {
              mat.color.setHex(0x38bdf8);
              mat.emissive.setHex(0x0284c7);
              mat.emissiveIntensity = 0.55 + 0.25 * Math.sin(elapsed * 2.2);
            } else {
              mat.emissiveIntensity = 0.2;
            }
          }

          // 4. HMI Touchscreen Activity Pulse
          const hmi = ag.getObjectByName('hmiScreen') as THREE.Mesh | undefined;
          if (hmi) {
            const mat = hmi.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = isProcessing
              ? 0.8 + 0.45 * Math.sin(elapsed * 6.0)
              : asset.machineState === 'run'
                ? 0.7
                : 0.35;
          }

          // 5. Base Halo Ring & Vertical Process Scanner Ring
          const processRing = ag.getObjectByName('processRing') as THREE.Mesh | undefined;
          const processScanner = ag.getObjectByName('processScanner') as THREE.Mesh | undefined;
          if (processRing && processScanner) {
            if (isProcessing) {
              processRing.visible = true;
              const rMat = processRing.material as THREE.MeshBasicMaterial;
              rMat.color.setHex(categoryColor);
              rMat.opacity = 0.5 + 0.35 * Math.sin(elapsed * 4.0);
              const pulse = 1 + 0.04 * Math.sin(elapsed * 4.0);
              processRing.scale.set(pulse, pulse, 1);

              processScanner.visible = true;
              const sMat = processScanner.material as THREE.MeshStandardMaterial;
              sMat.color.setHex(categoryColor);
              sMat.emissive.setHex(categoryColor);
              sMat.emissiveIntensity = 1.15;
              const maxH = asset.kind === 'airlock' ? 2.85 : asset.kind === 'buffer' ? 0.85 : 2.55;
              processScanner.position.y = 0.28 + (0.5 + 0.5 * Math.sin(elapsed * 2.6)) * maxH;
            } else if (pendingTask) {
              processRing.visible = true;
              const rMat = processRing.material as THREE.MeshBasicMaterial;
              rMat.color.setHex(0x38bdf8);
              rMat.opacity = 0.25 + 0.15 * Math.sin(elapsed * 2.0);
              processRing.scale.set(1, 1, 1);
              processScanner.visible = false;
            } else {
              processRing.visible = false;
              processScanner.visible = false;
            }
          }

          // 6. Sliding cartons along active roller buffer conveyors
          if (asset.kind === 'buffer' && isRunning) {
            for (let i = 0; i < 2; i++) {
              const parcel = ag.getObjectByName(`conveyorParcel${i}`);
              if (parcel) {
                const phase = (elapsed * 0.42 + i * 0.5) % 1;
                parcel.position.x = -0.75 + phase * 1.5;
              }
            }
          }
        }

        // Subtle animated emissive pulse on active mission route splines
        const routeGroup = routeOverlayGroupRef.current;
        if (routeGroup) {
          for (const child of routeGroup.children) {
            if (child.name === 'activeRouteTube') {
              const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
              mat.emissiveIntensity = 0.55 + 0.35 * Math.sin(elapsed * 3.4);
            }
          }
        }
      }

      // Smooth damped camera focus transition
      if (cameraFocusActiveRef.current) {
        const k = isSoftwareGl ? 14 : 7;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamGoal.x, k, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamGoal.y, k, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamGoal.z, k, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLookGoal.x, k, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLookGoal.y, k, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLookGoal.z, k, dt);
        if (camera.position.distanceTo(_targetCamGoal) < 0.08) {
          cameraFocusActiveRef.current = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      procTex.dispose();
      floorTexRef.current?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Synchronize 3D backdrop, fog, lighting & localized floor labels when theme or language changes
  useEffect(() => {
    const scene = sceneRef.current;
    const floorMat = floorMatRef.current;
    const hemi = hemiLightRef.current;
    if (!scene || !floorMat) return;

    const isLight = theme === 'light';
    const bgHex = isLight ? 0xe2e8f0 : 0x0b1120;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, isLight ? 0.0055 : 0.0085);

    if (hemi) {
      hemi.color.setHex(isLight ? 0xf8fafc : 0xcbd5e1);
      hemi.groundColor.setHex(isLight ? 0x64748b : 0x1e293b);
      hemi.intensity = isLight ? 0.95 : 0.75;
    }

    const nextTex = createFacilityFloorTexture(maxAnisoRef.current, theme, lang);
    const prevTex = floorTexRef.current;
    floorMat.map = nextTex;
    floorMat.needsUpdate = true;
    floorTexRef.current = nextTex;
    prevTex?.dispose();
  }, [theme, lang]);

  // Rebuild dynamic 3D overlays whenever snapshot or overlay toggles change
  useEffect(() => {
    if (!snapshot) return;

    const clearGroup = (g: THREE.Group | null) => {
      if (!g) return;
      while (g.children.length > 0) {
        const child = g.children.pop()!;
        g.remove(child);
      }
    };

    // 1. Lane Graph, Closures & Active Mission Routes
    const routeGroup = routeOverlayGroupRef.current;
    clearGroup(routeGroup);
    if (routeGroup && overlays.lanes) {
      const nodeMap = new Map(snapshot.world.navNodes.map((n) => [n.id, n]));
      for (const edge of snapshot.world.navEdges) {
        const a = nodeMap.get(edge.fromNodeId);
        const b = nodeMap.get(edge.toNodeId);
        if (!a || !b) continue;
        const pts = [new THREE.Vector3(a.x, 0.04, a.z), new THREE.Vector3(b.x, 0.04, b.z)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMat = new THREE.LineBasicMaterial({
          color: edge.closed ? 0xef4444 : edge.preferredAisle ? 0x38bdf8 : 0x475569,
          transparent: true,
          opacity: edge.closed ? 0.95 : 0.48,
        });
        routeGroup.add(new THREE.Line(lineGeo, lineMat));

        if (edge.closed) {
          // Physical barrier cone marker at midpoint of closed edge
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.32, 0.75, 12),
            new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, roughness: 0.4 })
          );
          cone.position.set((a.x + b.x) / 2, 0.38, (a.z + b.z) / 2);
          routeGroup.add(cone);
        }
      }

      // Active Mission Splines
      const activeMissions = snapshot.missions.filter(
        (m: Mission) => (m.state === 'executing' || m.state === 'planned' || m.state === 'paused') && m.route
      );
      for (const m of activeMissions) {
        const pts = m.route!.nodeIds
          .map((nid) => nodeMap.get(nid))
          .filter(Boolean)
          .map((n) => new THREE.Vector3(n!.x, 0.12, n!.z));
        if (pts.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15);
          const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, Math.max(12, pts.length * 6), 0.1, 8, false),
            new THREE.MeshStandardMaterial({
              color: m.state === 'paused' ? 0xf59e0b : 0x22d3ee,
              emissive: m.state === 'paused' ? 0xb45309 : 0x0891b2,
              emissiveIntensity: 0.75,
              roughness: 0.28,
            })
          );
          tube.name = 'activeRouteTube';
          routeGroup.add(tube);
        }
      }
    }

    // 2. WMS Congestion & Travel Heatmap Overlay
    const heatmapGroup = heatmapOverlayGroupRef.current;
    clearGroup(heatmapGroup);
    if (heatmapGroup && overlays.heatmaps) {
      for (const cell of snapshot.wms.heatmaps) {
        const intensity = cell.congestionScore;
        const color =
          intensity > 0.75 ? 0xef4444 : intensity > 0.45 ? 0xf59e0b : 0x10b981;
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(cell.width, cell.depth),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.18 + intensity * 0.28,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
          })
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(cell.x, 0.03, cell.z);
        heatmapGroup.add(pad);
      }
    }

    // 3. WMS Occupancy Utilization Columns
    const occGroup = occupancyOverlayGroupRef.current;
    clearGroup(occGroup);
    if (occGroup && overlays.occupancy) {
      const locMap = new Map(snapshot.world.locations.map((l) => [l.id, l]));
      for (const occ of snapshot.wms.occupancy) {
        const loc = locMap.get(occ.locationId);
        if (!loc) continue;
        const h = Math.max(0.25, (occ.utilizationPct / 100) * 2.2);
        const colColor =
          occ.qaStatusSummary === 'quarantine'
            ? 0xf59e0b
            : occ.utilizationPct > 80
              ? 0xef4444
              : occ.utilizationPct > 0
                ? 0x06b6d4
                : 0x334155;
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, h, 0.42),
          new THREE.MeshStandardMaterial({
            color: colColor,
            emissive: colColor,
            emissiveIntensity: 0.35,
            transparent: true,
            opacity: 0.75,
          })
        );
        bar.position.set(loc.pose.x + 1.25, h / 2, loc.pose.z);
        occGroup.add(bar);
      }
    }

    // 4. MES OEE Utilization Columns
    const oeeGroup = oeeOverlayGroupRef.current;
    clearGroup(oeeGroup);
    if (oeeGroup && overlays.oee) {
      for (const asset of snapshot.mes.assets) {
        if (asset.kind !== 'machine') continue;
        const h = Math.max(0.3, asset.oee.overall * 2.6);
        const color =
          asset.oee.overall >= 0.8
            ? 0x10b981
            : asset.oee.overall >= 0.6
              ? 0xf59e0b
              : 0xef4444;
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, h, 14),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.85,
          })
        );
        col.position.set(asset.pose.x, h / 2 + 2.8, asset.pose.z);
        oeeGroup.add(col);
      }
    }

    // 5. Batch Spatial Journey Path (EP09-F03)
    const batchGroup = batchOverlayGroupRef.current;
    clearGroup(batchGroup);
    if (batchGroup && overlays.batchJourney && snapshot.mes.batches.length > 0) {
      const locMap = new Map(snapshot.world.locations.map((l) => [l.id, l]));
      const batch = snapshot.mes.batches[0];
      const pts = batch.spatialJourney
        .map((step) => locMap.get(step.locationId))
        .filter(Boolean)
        .map((l) => new THREE.Vector3(l!.pose.x, 0.35, l!.pose.z));
      if (pts.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 36, 0.08, 8, false),
          new THREE.MeshStandardMaterial({
            color: 0xa855f7,
            emissive: 0x7e22ce,
            emissiveIntensity: 0.8,
          })
        );
        batchGroup.add(tube);
      }
    }
  }, [snapshot, overlays]);

  if (webglLost) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300">
        <div className="text-center space-y-2 max-w-md px-6">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            {lang === 'fa' ? 'زمینه گرافیکی سه‌بعدی متوقف شد' : '3D Viewport Context Suspended'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {lang === 'fa'
              ? 'ارتباط پردازشگر گرافیکی موقتاً قطع شد. در حال بازیابی خودکار تصویر...'
              : 'WebGL rendering context was interrupted. Waiting for GPU restoration.'}
          </p>
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
};
