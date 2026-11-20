import * as THREE from 'three';
import { SpatialLocation } from '../shared/p1-contracts';
import { ProductionAsset, VehicleProfile } from '../shared/p2-contracts';

export interface ProceduralSceneTextures {
  stainlessTex: THREE.CanvasTexture;
  hazardTex: THREE.CanvasTexture;
  palletWoodTex: THREE.CanvasTexture;
  cartonTex: THREE.CanvasTexture;
  floorRoughnessTex: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAniso: number): ProceduralSceneTextures {
  // 1. Brushed 316L Stainless Steel Grain
  const ssCanvas = document.createElement('canvas');
  ssCanvas.width = 256;
  ssCanvas.height = 256;
  const ssCtx = ssCanvas.getContext('2d')!;
  ssCtx.fillStyle = '#cbd5e1';
  ssCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const shade = 192 + ((y * 17) % 32);
    ssCtx.fillStyle = `rgba(${shade}, ${shade + 6}, ${shade + 12}, 0.28)`;
    ssCtx.fillRect(0, y, 256, 1);
  }
  const stainlessTex = new THREE.CanvasTexture(ssCanvas);
  stainlessTex.wrapS = THREE.RepeatWrapping;
  stainlessTex.wrapT = THREE.RepeatWrapping;
  stainlessTex.anisotropy = maxAniso;

  // 2. Industrial Hazard Chevron Stripes
  const hzCanvas = document.createElement('canvas');
  hzCanvas.width = 256;
  hzCanvas.height = 64;
  const hzCtx = hzCanvas.getContext('2d')!;
  hzCtx.fillStyle = '#f59e0b';
  hzCtx.fillRect(0, 0, 256, 64);
  hzCtx.fillStyle = '#0f172a';
  for (let x = -64; x < 320; x += 32) {
    hzCtx.beginPath();
    hzCtx.moveTo(x, 64);
    hzCtx.lineTo(x + 16, 64);
    hzCtx.lineTo(x + 48, 0);
    hzCtx.lineTo(x + 32, 0);
    hzCtx.closePath();
    hzCtx.fill();
  }
  const hazardTex = new THREE.CanvasTexture(hzCanvas);
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  hazardTex.wrapS = THREE.RepeatWrapping;
  hazardTex.wrapT = THREE.RepeatWrapping;
  hazardTex.anisotropy = maxAniso;

  // 3. Euro-Pallet Timber Planks
  const wdCanvas = document.createElement('canvas');
  wdCanvas.width = 256;
  wdCanvas.height = 256;
  const wdCtx = wdCanvas.getContext('2d')!;
  wdCtx.fillStyle = '#b98349';
  wdCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    const tone = 140 + ((y * 23) % 35);
    wdCtx.fillStyle = `rgba(${tone}, ${Math.round(tone * 0.68)}, ${Math.round(tone * 0.35)}, 0.35)`;
    wdCtx.fillRect(0, y, 256, 2);
  }
  const palletWoodTex = new THREE.CanvasTexture(wdCanvas);
  palletWoodTex.colorSpace = THREE.SRGBColorSpace;
  palletWoodTex.anisotropy = maxAniso;

  // 4. Strapped Pharma Carton Box with GS1 Shipping Label
  const bxCanvas = document.createElement('canvas');
  bxCanvas.width = 256;
  bxCanvas.height = 256;
  const bxCtx = bxCanvas.getContext('2d')!;
  bxCtx.fillStyle = '#e2e8f0';
  bxCtx.fillRect(0, 0, 256, 256);
  // Corrugated subtle seam
  bxCtx.strokeStyle = 'rgba(71, 85, 105, 0.25)';
  bxCtx.lineWidth = 4;
  bxCtx.strokeRect(6, 6, 244, 244);
  // Blue poly strapping bands
  bxCtx.fillStyle = '#0284c7';
  bxCtx.fillRect(58, 0, 10, 256);
  bxCtx.fillRect(188, 0, 10, 256);
  // White GS1 shipping label
  bxCtx.fillStyle = '#ffffff';
  bxCtx.fillRect(92, 76, 72, 54);
  bxCtx.fillStyle = '#0f172a';
  for (let i = 0; i < 14; i++) {
    bxCtx.fillRect(98 + i * 4, 102, i % 3 === 0 ? 2 : 1, 20);
  }
  bxCtx.fillStyle = '#0369a1';
  bxCtx.fillRect(98, 84, 48, 8);
  const cartonTex = new THREE.CanvasTexture(bxCanvas);
  cartonTex.colorSpace = THREE.SRGBColorSpace;
  cartonTex.anisotropy = maxAniso;

  // 5. Epoxy Floor Roughness Micro-Detail
  const rgCanvas = document.createElement('canvas');
  rgCanvas.width = 256;
  rgCanvas.height = 256;
  const rgCtx = rgCanvas.getContext('2d')!;
  rgCtx.fillStyle = '#b8b8b8';
  rgCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const v = 150 + (i % 55);
    rgCtx.fillStyle = `rgb(${v},${v},${v})`;
    rgCtx.fillRect(x, y, 3, 3);
  }
  const floorRoughnessTex = new THREE.CanvasTexture(rgCanvas);
  floorRoughnessTex.wrapS = THREE.RepeatWrapping;
  floorRoughnessTex.wrapT = THREE.RepeatWrapping;
  floorRoughnessTex.repeat.set(8, 5);

  return {
    stainlessTex,
    hazardTex,
    palletWoodTex,
    cartonTex,
    floorRoughnessTex,
    dispose: () => {
      stainlessTex.dispose();
      hazardTex.dispose();
      palletWoodTex.dispose();
      cartonTex.dispose();
      floorRoughnessTex.dispose();
    },
  };
}

export function buildEuroPalletWithCargo(
  width: number,
  depth: number,
  cargoHeight: number,
  tex: ProceduralSceneTextures
): { group: THREE.Group; cargoBoxMesh: THREE.Mesh } {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    map: tex.palletWoodTex,
    roughness: 0.86,
    metalness: 0.04,
  });

  // 3 longitudinal stringer runners
  for (const rx of [-width * 0.4, 0, width * 0.4]) {
    const runner = new THREE.Mesh(new THREE.BoxGeometry(width * 0.1, 0.08, depth * 0.96), woodMat);
    runner.position.set(rx, 0.04, 0);
    runner.castShadow = true;
    group.add(runner);
  }

  // 5 top deck slats
  for (let i = -2; i <= 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, 0.03, depth * 0.14), woodMat);
    slat.position.set(0, 0.095, i * (depth * 0.2));
    slat.castShadow = true;
    slat.receiveShadow = true;
    group.add(slat);
  }

  // Shrink-wrapped pharma carton load (palletBox handle preserved for QA tinting)
  const cargoMat = new THREE.MeshStandardMaterial({
    map: tex.cartonTex,
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.05,
  });
  const cargoBoxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.84, cargoHeight, depth * 0.84),
    cargoMat
  );
  cargoBoxMesh.name = 'palletBox';
  cargoBoxMesh.position.y = 0.11 + cargoHeight / 2;
  cargoBoxMesh.castShadow = true;
  cargoBoxMesh.receiveShadow = true;
  group.add(cargoBoxMesh);

  // Top protective cap lid
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.87, 0.04, depth * 0.87),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })
  );
  cap.position.y = 0.11 + cargoHeight + 0.02;
  group.add(cap);

  return { group, cargoBoxMesh };
}

export function buildRealisticVehicle(
  vehicle: VehicleProfile,
  tex: ProceduralSceneTextures
): THREE.Group {
  const group = new THREE.Group();
  group.name = `vehicle-${vehicle.id}`;

  const { lengthM, widthM, heightM } = vehicle.dimensions;

  const darkChassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.65,
    metalness: 0.55,
  });
  const rubberTireMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.92,
    metalness: 0.08,
  });
  const alloyHubMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.25,
    metalness: 0.88,
  });
  const stainlessMat = new THREE.MeshStandardMaterial({
    map: tex.stainlessTex,
    color: 0xe2e8f0,
    roughness: 0.24,
    metalness: 0.85,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: tex.hazardTex,
    roughness: 0.5,
    metalness: 0.15,
  });

  const hullColor =
    vehicle.type === 'AMR'
      ? 0x0284c7
      : vehicle.type === 'AGV'
        ? 0xd97706
        : 0xea580c;

  const hullMat = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.3,
    metalness: 0.35,
  });

  // Wheels with rims
  const isForklift = vehicle.type === 'Forklift';
  const wheelRadius = isForklift ? 0.22 : 0.14;
  const wheelWidth = isForklift ? 0.14 : 0.09;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelRadius * 0.52, wheelRadius * 0.52, wheelWidth + 0.015, 16);
  hubGeo.rotateZ(Math.PI / 2);

  const wx = widthM * 0.47;
  const wz = lengthM * 0.34;
  for (const [sx, sz] of [
    [-wx, -wz],
    [wx, -wz],
    [-wx, wz],
    [wx, wz],
  ]) {
    const wheelPivot = new THREE.Group();
    wheelPivot.name = 'vehicleWheel';
    wheelPivot.position.set(sx, wheelRadius, sz);

    const tire = new THREE.Mesh(wheelGeo, rubberTireMat);
    tire.castShadow = true;
    wheelPivot.add(tire);

    const hub = new THREE.Mesh(hubGeo, alloyHubMat);
    wheelPivot.add(hub);

    group.add(wheelPivot);
  }

  // Soft floor contact shadow grounding vehicle
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(widthM * 1.25, lengthM * 1.25),
    new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  group.add(contactShadow);

  let deckTopY = 0.72;

  if (vehicle.type === 'AMR') {
    // Low-profile cleanroom AMR with chamfered bumpers, safety LiDAR curtains, and lift deck
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.96, 0.16, lengthM * 0.96),
      darkChassisMat
    );
    skirt.position.y = 0.16;
    skirt.castShadow = true;
    group.add(skirt);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.88, 0.28, lengthM * 0.86),
      hullMat
    );
    body.position.y = 0.38;
    body.castShadow = true;
    group.add(body);

    // Clean white fairing trim band
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.9, 0.06, lengthM * 0.88),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.1 })
    );
    trim.position.y = 0.51;
    group.add(trim);

    // Front & rear recessed LiDAR optical laser scanner bars
    const lidarStripMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.9,
      roughness: 0.15,
    });
    for (const lz of [lengthM * 0.485, -lengthM * 0.485]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.55, 0.045, 0.03), lidarStripMat);
      strip.position.set(0, 0.19, lz);
      group.add(strip);
    }

    // Subtle floor safety-scanner fan ahead of AMR
    const scanFan = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 24, Math.PI * 0.25, Math.PI * 0.5),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    scanFan.rotation.x = -Math.PI / 2;
    scanFan.position.set(0, 0.02, lengthM * 0.38);
    group.add(scanFan);

    // Top stainless steel pallet transfer deck with 4 corner alignment pins
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.86, 0.06, lengthM * 0.82),
      stainlessMat
    );
    deck.position.y = 0.56;
    deck.castShadow = true;
    group.add(deck);
    for (const [px, pz] of [
      [-widthM * 0.38, -lengthM * 0.36],
      [widthM * 0.38, -lengthM * 0.36],
      [-widthM * 0.38, lengthM * 0.36],
      [widthM * 0.38, lengthM * 0.36],
    ]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 10), alloyHubMat);
      pin.position.set(px, 0.61, pz);
      group.add(pin);
    }

    // Optical LiDAR turret dome at front edge
    const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 16), darkChassisMat);
    turretBase.position.set(0, 0.65, lengthM * 0.38);
    group.add(turretBase);

    deckTopY = 0.59;
  } else if (vehicle.type === 'AGV') {
    // Heavy Pallet AGV with hazard bumpers, battery louvers & roller cradle
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.94, 0.22, lengthM * 0.94),
      darkChassisMat
    );
    chassis.position.y = 0.2;
    chassis.castShadow = true;
    group.add(chassis);

    // Front & rear hazard impact bumpers
    for (const bz of [lengthM * 0.48, -lengthM * 0.48]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.96, 0.12, 0.08), hazardMat);
      bumper.position.set(0, 0.16, bz);
      group.add(bumper);
    }

    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.88, 0.38, lengthM * 0.84),
      hullMat
    );
    hull.position.y = 0.48;
    hull.castShadow = true;
    group.add(hull);

    // Side battery compartment panel + charge bar
    const batPanel = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.91, 0.2, lengthM * 0.45),
      darkChassisMat
    );
    batPanel.position.y = 0.44;
    group.add(batPanel);

    // Top roller bed & guide rails
    const rollerBed = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.84, 0.07, lengthM * 0.78),
      stainlessMat
    );
    rollerBed.position.y = 0.7;
    group.add(rollerBed);
    for (const rx of [-widthM * 0.41, widthM * 0.41]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, lengthM * 0.76), alloyHubMat);
      rail.position.set(rx, 0.76, 0);
      group.add(rail);
    }

    // Sensor mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 10), alloyHubMat);
    mast.position.set(-widthM * 0.34, 0.88, -lengthM * 0.34);
    group.add(mast);

    deckTopY = 0.74;
  } else {
    // Counterbalance Warehouse Forklift with ROPS safety cage, seat, mast & tapered forks
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.88, 0.36, lengthM * 0.76),
      hullMat
    );
    frame.position.set(0, 0.4, -lengthM * 0.06);
    frame.castShadow = true;
    group.add(frame);

    // Heavy rounded rear cast-iron counterweight with hazard stripe
    const counterweight = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.9, 0.56, lengthM * 0.26),
      darkChassisMat
    );
    counterweight.position.set(0, 0.52, -lengthM * 0.36);
    counterweight.castShadow = true;
    group.add(counterweight);

    const rearHazard = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.86, 0.12, 0.04),
      hazardMat
    );
    rearHazard.position.set(0, 0.36, -lengthM * 0.495);
    group.add(rearHazard);

    // Driver seat & steering column inside open cab
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.42, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    );
    seat.position.set(0, 0.82, -0.14);
    group.add(seat);

    const steeringPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.55, 10),
      darkChassisMat
    );
    steeringPost.rotation.x = -0.3;
    steeringPost.position.set(0, 0.88, 0.32);
    group.add(steeringPost);

    const wheelRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.025, 8, 18),
      rubberTireMat
    );
    wheelRing.rotation.x = Math.PI / 2.4;
    wheelRing.position.set(0, 1.14, 0.24);
    group.add(wheelRing);

    // Overhead ROPS Safety Guard Cage (4 pillars + slatted steel roof)
    const cageH = heightM * 0.92;
    for (const [cx, cz] of [
      [-widthM * 0.38, -lengthM * 0.32],
      [widthM * 0.38, -lengthM * 0.32],
      [-widthM * 0.36, lengthM * 0.22],
      [widthM * 0.36, lengthM * 0.22],
    ]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, cageH - 0.55, 0.06),
        darkChassisMat
      );
      post.position.set(cx, 0.55 + (cageH - 0.55) / 2, cz);
      post.castShadow = true;
      group.add(post);
    }
    const roofRim = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.82, 0.06, lengthM * 0.6),
      darkChassisMat
    );
    roofRim.position.set(0, cageH, -lengthM * 0.05);
    roofRim.castShadow = true;
    group.add(roofRim);

    // Twin-channel vertical hydraulic mast + hydraulic lift cylinder
    const mastZ = lengthM * 0.42;
    for (const mx of [-widthM * 0.26, widthM * 0.26]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, heightM * 0.94, 0.11),
        darkChassisMat
      );
      rail.position.set(mx, heightM * 0.49, mastZ);
      rail.castShadow = true;
      group.add(rail);
    }
    const liftCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, heightM * 0.72, 12),
      alloyHubMat
    );
    liftCylinder.position.set(0, heightM * 0.4, mastZ);
    group.add(liftCylinder);

    // Carriage backrest grille & tapered steel forks inside animatable forkCarriage group
    const forkCarriage = new THREE.Group();
    forkCarriage.name = 'forkCarriage';

    const backrest = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.72, 0.52, 0.06),
      alloyHubMat
    );
    backrest.position.set(0, 0.52, mastZ + 0.08);
    forkCarriage.add(backrest);

    for (const fx of [-widthM * 0.22, widthM * 0.22]) {
      const shank = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.38, 0.04), alloyHubMat);
      shank.position.set(fx, 0.36, mastZ + 0.11);
      forkCarriage.add(shank);

      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.92), alloyHubMat);
      tine.position.set(fx, 0.18, mastZ + 0.57);
      tine.castShadow = true;
      forkCarriage.add(tine);
    }

    group.add(forkCarriage);
    deckTopY = 0.2;
  }

  // Headlights (+Z forward)
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfef08a,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  for (const hx of [-widthM * 0.3, widthM * 0.3]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, 0.04), headlightMat);
    lamp.position.set(hx, isForklift ? 1.15 : 0.36, isForklift ? lengthM * 0.24 : lengthM * 0.44);
    group.add(lamp);
  }

  // Status beacon dome (named 'beacon' for live telemetry tinting)
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.0,
    roughness: 0.2,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 14), beaconMat);
  if (isForklift) {
    beacon.position.set(0, heightM * 0.98, -lengthM * 0.24);
  } else if (vehicle.type === 'AGV') {
    beacon.position.set(-widthM * 0.34, 1.12, -lengthM * 0.34);
  } else {
    beacon.position.set(0, 0.68, -lengthM * 0.36);
  }
  beacon.name = 'beacon';
  group.add(beacon);

  // Dynamic cargo pallet attachment (toggled via visibility, attached to forkCarriage for forklifts)
  const { group: cargoGroup } = buildEuroPalletWithCargo(
    widthM * 0.86,
    widthM * 0.86,
    0.52,
    tex
  );
  cargoGroup.name = 'cargoAttachment';
  cargoGroup.position.set(0, deckTopY, isForklift ? lengthM * 0.68 : 0);
  cargoGroup.visible = false;
  if (isForklift) {
    const carriage = group.getObjectByName('forkCarriage');
    (carriage || group).add(cargoGroup);
  } else {
    group.add(cargoGroup);
  }

  group.traverse((obj) => {
    obj.layers.enable(1);
    obj.userData = { entityKind: 'vehicle', entityId: vehicle.id };
  });

  return group;
}

export function buildWarehouseLocationGroup(
  loc: SpatialLocation,
  tex: ProceduralSceneTextures
): { group: THREE.Group; palletGroup: THREE.Group } {
  const g = new THREE.Group();
  g.position.set(loc.pose.x, 0, loc.pose.z);

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.78,
    roughness: 0.34,
  });
  const orangeBeamMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    metalness: 0.28,
    roughness: 0.45,
  });
  const galvanizedMat = new THREE.MeshStandardMaterial({
    map: tex.stainlessTex,
    color: 0x94a3b8,
    metalness: 0.72,
    roughness: 0.38,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: tex.hazardTex,
    roughness: 0.48,
    metalness: 0.15,
  });

  if (loc.kind === 'bin') {
    // Selective industrial pallet rack with baseplates, X-bracing, orange beams, wire deck & corner bollards
    for (const [px, pz] of [
      [-1.02, -0.82],
      [1.02, -0.82],
      [-1.02, 0.82],
      [1.02, 0.82],
    ]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.95, 0.11), steelMat);
      post.position.set(px, 1.475, pz);
      post.castShadow = true;
      g.add(post);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), steelMat);
      foot.position.set(px, 0.015, pz);
      g.add(foot);
    }

    // Side cross-braces connecting front & back posts
    for (const sx of [-1.02, 1.02]) {
      for (const sy of [0.85, 2.15]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.64), steelMat);
        brace.position.set(sx, sy, 0);
        g.add(brace);
      }
    }

    // Safety-orange box beams + galvanized shelf decks
    for (const sy of [0.22, 1.62]) {
      for (const bz of [-0.8, 0.8]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.1, 0.08), orangeBeamMat);
        beam.position.set(0, sy, bz);
        beam.castShadow = true;
        g.add(beam);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.04, 1.56), galvanizedMat);
      deck.position.set(0, sy + 0.03, 0);
      deck.receiveShadow = true;
      g.add(deck);
    }

    // Corner yellow-black rack guard bollards
    for (const bx of [-1.14, 1.14]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 10), hazardMat);
      bollard.position.set(bx, 0.275, 0.94);
      g.add(bollard);
    }
  } else if (loc.kind === 'dock_in' || loc.kind === 'dock_out') {
    const isInbound = loc.kind === 'dock_in';
    const accentColor = isInbound ? 0x0284c7 : 0x10b981;

    // Dock floor bay + recessed steel leveler plate
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(2.9, 0.05, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78 })
    );
    apron.position.y = 0.025;
    apron.receiveShadow = true;
    g.add(apron);

    const leveler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 1.8), galvanizedMat);
    leveler.position.set(0, 0.035, 0.15);
    g.add(leveler);

    // Overhead sectional roll-up dock portal & rubber bumpers on west edge
    for (const pz of [-1.18, 1.18]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), steelMat);
      post.position.set(-1.35, 1.5, pz);
      post.castShadow = true;
      g.add(post);

      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.45, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
      );
      bumper.position.set(-1.22, 0.35, pz * 0.72);
      g.add(bumper);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 2.6), steelMat);
    header.position.set(-1.35, 2.78, 0);
    g.add(header);

    const statusStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 2.2),
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.75,
      })
    );
    statusStrip.position.set(-1.22, 2.52, 0);
    g.add(statusStrip);
  } else {
    // Outbound Staging Bay with floor weigh-scale & barcode scan arch
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.06, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.55, metalness: 0.25 })
    );
    pad.position.y = 0.03;
    pad.receiveShadow = true;
    g.add(pad);

    const scaleDeck = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 1.55), galvanizedMat);
    scaleDeck.position.y = 0.04;
    g.add(scaleDeck);

    for (const [bx, bz] of [
      [-1.22, -1.0],
      [1.22, -1.0],
      [-1.22, 1.0],
      [1.22, 1.0],
    ]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.7, 12), hazardMat);
      bollard.position.set(bx, 0.35, bz);
      g.add(bollard);
    }
  }

  // Euro-pallet cargo container on shelf / bay
  const { group: palletGroup } = buildEuroPalletWithCargo(1.18, 1.18, 0.76, tex);
  palletGroup.position.set(0, loc.kind === 'bin' ? 0.28 : 0.08, 0);
  palletGroup.visible = false;
  g.add(palletGroup);

  // Operational task indicator ring on floor (shown when an ObjectTask is active)
  const locRing = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.42, 32),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  locRing.rotation.x = -Math.PI / 2;
  locRing.position.y = 0.04;
  locRing.name = 'locationProcessRing';
  locRing.visible = false;
  g.add(locRing);

  g.traverse((obj) => {
    obj.layers.enable(1);
    obj.userData = { entityKind: 'location', entityId: loc.id };
  });

  return { group: g, palletGroup };
}

export function buildRealisticProductionAsset(
  asset: ProductionAsset,
  tex: ProceduralSceneTextures
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(asset.pose.x, 0, asset.pose.z);

  const stainlessMat = new THREE.MeshStandardMaterial({
    map: tex.stainlessTex,
    color: 0xdbeafe,
    metalness: 0.88,
    roughness: 0.22,
  });
  const darkBaseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.58,
    roughness: 0.55,
  });
  const cabinetMat = new THREE.MeshStandardMaterial({
    map: tex.stainlessTex,
    color: 0x94a3b8,
    metalness: 0.72,
    roughness: 0.32,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.28,
    roughness: 0.08,
    metalness: 0.05,
    depthWrite: false,
  });

  if (asset.kind === 'airlock') {
    // Pressurized GMP Decontamination Airlock Chamber with HEPA plenum, glass doors & DP gauge
    const floorGrate = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.05, 3.8),
      new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.5, roughness: 0.45 })
    );
    floorGrate.position.y = 0.025;
    group.add(floorGrate);

    for (const [px, pz] of [
      [-1.8, -1.8],
      [1.8, -1.8],
      [-1.8, 1.8],
      [1.8, 1.8],
    ]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), stainlessMat);
      col.position.set(px, 1.5, pz);
      col.castShadow = true;
      group.add(col);
    }

    // Side insulated wall panels + clear inspection glass
    for (const sz of [-1.8, 1.8]) {
      const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 0.14), cabinetMat);
      lowerWall.position.set(0, 0.55, sz);
      group.add(lowerWall);

      const glassPane = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.55, 0.06), glassMat);
      glassPane.position.set(0, 1.88, sz);
      group.add(glassPane);
    }

    // Overhead HEPA VHP decontamination plenum roof
    const plenum = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.42, 3.9), stainlessMat);
    plenum.position.y = 2.95;
    plenum.castShadow = true;
    group.add(plenum);

    const statusHalo = new THREE.Mesh(
      new THREE.BoxGeometry(3.94, 0.08, 3.94),
      new THREE.MeshStandardMaterial({
        color: 0x14b8a6,
        emissive: 0x0d9488,
        emissiveIntensity: 0.7,
      })
    );
    statusHalo.position.y = 2.72;
    statusHalo.name = 'processGlow';
    group.add(statusHalo);

    // Top HEPA Laminar Flow Fan Assembly ('assetRotor' rotates during active process)
    const fanShroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.72, 0.14, 20),
      darkBaseMat
    );
    fanShroud.position.y = 3.22;
    group.add(fanShroud);

    const fanRotor = new THREE.Group();
    fanRotor.name = 'assetRotor';
    fanRotor.position.y = 3.3;
    const fanHub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), stainlessMat);
    fanRotor.add(fanHub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.03, 0.14), cabinetMat);
      blade.rotation.y = (i * Math.PI) / 4;
      fanRotor.add(blade);
    }
    group.add(fanRotor);

    // Interlocking door arch portals at entry/exit
    for (const dx of [-1.8, 1.8]) {
      const doorFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 2.5, 2.2),
        new THREE.MeshStandardMaterial({
          color: 0x2dd4bf,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        })
      );
      doorFrame.position.set(dx, 1.25, 0);
      group.add(doorFrame);
    }
  } else if (asset.kind === 'buffer') {
    // Sanitary Stainless Roller Conveyor Transfer Buffer
    const baseFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.8), darkBaseMat);
    baseFrame.position.y = 0.24;
    baseFrame.castShadow = true;
    group.add(baseFrame);

    for (const [lx, lz] of [
      [-0.95, -0.78],
      [0.95, -0.78],
      [-0.95, 0.78],
      [0.95, 0.78],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 10), stainlessMat);
      leg.position.set(lx, 0.14, lz);
      group.add(leg);
    }

    // 7 cylindrical stainless gravity rollers
    const rollerGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.56, 12);
    rollerGeo.rotateX(Math.PI / 2);
    for (let i = -3; i <= 3; i++) {
      const roller = new THREE.Mesh(rollerGeo, stainlessMat);
      roller.position.set(i * 0.28, 0.34, 0);
      group.add(roller);
    }

    // Top animated drive sprocket / transfer rotor indicator
    const driveWheel = new THREE.Group();
    driveWheel.name = 'assetRotor';
    driveWheel.position.set(0.95, 0.48, 0);
    const wheelDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), cabinetMat);
    wheelDisc.rotation.x = Math.PI / 2;
    driveWheel.add(wheelDisc);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.08), darkBaseMat);
    driveWheel.add(spoke);
    group.add(driveWheel);

    // Side safety guide rails + optical photo-eye LED
    for (const rz of [-0.85, 0.85]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.06), stainlessMat);
      rail.position.set(0, 0.4, rz);
      group.add(rail);
    }
    const sensorLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.18, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.85 })
    );
    sensorLed.position.set(-0.98, 0.56, 0.85);
    sensorLed.name = 'processGlow';
    group.add(sensorLed);

    // Animated pharma cartons gliding smoothly on roller conveyor
    const parcelMat = new THREE.MeshStandardMaterial({
      map: tex.cartonTex,
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.06,
    });
    for (let i = 0; i < 2; i++) {
      const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), parcelMat);
      parcel.name = `conveyorParcel${i}`;
      parcel.position.set(-0.5 + i * 1.0, 0.54, 0);
      parcel.castShadow = true;
      group.add(parcel);
    }
  } else if (asset.kind === 'machine') {
    const isIsolatorLine = asset.id.includes('FILLER') || asset.id.includes('CAPPER');

    // Heavy machine plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 2.3), darkBaseMat);
    plinth.position.y = 0.1;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    if (isIsolatorLine) {
      // Grade B Sterile RABS / Isolator Cabinet (Filler / Capper)
      const lowerBase = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, 1.55), stainlessMat);
      lowerBase.position.set(-0.15, 0.67, 0);
      lowerBase.castShadow = true;
      group.add(lowerBase);

      // Clear glass isolator chamber with stainless corner mullions
      const chamberGlass = new THREE.Mesh(new THREE.BoxGeometry(2.18, 1.05, 1.42), glassMat);
      chamberGlass.position.set(-0.15, 1.67, 0);
      group.add(chamberGlass);

      for (const [mx, mz] of [
        [-1.22, -0.72],
        [0.92, -0.72],
        [-1.22, 0.72],
        [0.92, 0.72],
      ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), stainlessMat);
        post.position.set(mx, 1.68, mz);
        group.add(post);
      }

      // Internal stainless rotary filling/capping turret + starwheel arms ('assetRotor')
      const turretGroup = new THREE.Group();
      turretGroup.name = 'assetRotor';
      turretGroup.position.set(-0.15, 1.52, 0);
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.72, 18), cabinetMat);
      turretGroup.add(turret);
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.48, 8), stainlessMat);
        nozzle.position.set(Math.cos(angle) * 0.46, 0.15, Math.sin(angle) * 0.46);
        turretGroup.add(nozzle);
      }
      group.add(turretGroup);

      // Chamber interior operational LED strip ('processGlow')
      const chamberLed = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.06, 0.12),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0ea5e9,
          emissiveIntensity: 0.7,
        })
      );
      chamberLed.position.set(-0.15, 2.15, 0);
      chamberLed.name = 'processGlow';
      group.add(chamberLed);

      // 3 circular glove-port rings along front glass
      for (const gx of [-0.72, -0.15, 0.42]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 18), darkBaseMat);
        ring.position.set(gx, 1.58, 0.73);
        group.add(ring);
      }

      // Overhead HEPA laminar-flow hood
      const hepaHood = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.34, 1.56), stainlessMat);
      hepaHood.position.set(-0.15, 2.36, 0);
      hepaHood.castShadow = true;
      group.add(hepaHood);
    } else {
      // Grade C 316L Stainless Reactor / Mixer / Fluid-Bed Coater
      const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 1.45, 24), stainlessMat);
      vessel.position.set(-0.42, 1.12, 0);
      vessel.castShadow = true;
      group.add(vessel);

      // Conical bottom skirt
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.34, 0.42, 24), stainlessMat);
      cone.position.set(-0.42, 0.38, 0);
      group.add(cone);

      // Top domed head + flange collar
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.1, 24), cabinetMat);
      flange.position.set(-0.42, 1.85, 0);
      group.add(flange);

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.75, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        stainlessMat
      );
      dome.position.set(-0.42, 1.88, 0);
      group.add(dome);

      // Top agitator gearbox & finned drive motor
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.46, 16), darkBaseMat);
      motor.position.set(-0.42, 2.48, 0);
      motor.castShadow = true;
      group.add(motor);

      // Visible top cooling impeller / agitator drive indicator ('assetRotor')
      const agitatorRotor = new THREE.Group();
      agitatorRotor.name = 'assetRotor';
      agitatorRotor.position.set(-0.42, 2.74, 0);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), cabinetMat);
      agitatorRotor.add(cap);
      for (let i = 0; i < 2; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.09), stainlessMat);
        fin.rotation.y = (i * Math.PI) / 2;
        agitatorRotor.add(fin);
      }
      group.add(agitatorRotor);

      // Illuminated inspection sight-glass porthole ('processGlow')
      const portholeRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 10, 20), cabinetMat);
      portholeRing.position.set(-0.42, 1.28, 0.76);
      group.add(portholeRing);

      const portholeGlow = new THREE.Mesh(
        new THREE.CircleGeometry(0.14, 16),
        new THREE.MeshStandardMaterial({
          color: 0x7dd3fc,
          emissive: 0x0284c7,
          emissiveIntensity: 0.45,
        })
      );
      portholeGlow.position.set(-0.42, 1.28, 0.765);
      portholeGlow.name = 'processGlow';
      group.add(portholeGlow);

      // Sanitary transfer pipe arch
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 10), stainlessMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0.28, 1.72, -0.25);
      group.add(pipe);
    }

    // Stainless Control Cabinet + HMI Touchscreen Pedestal + 4-tier Andon Stack Light
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.55, 1.18), cabinetMat);
    cabinet.position.set(0.95, 0.97, -0.15);
    cabinet.castShadow = true;
    group.add(cabinet);

    // HMI Operator Touchscreen Stand on front right
    const hmiScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.26, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x0284c7,
        emissiveIntensity: 0.75,
        roughness: 0.18,
      })
    );
    hmiScreen.rotation.x = -0.35;
    hmiScreen.position.set(0.95, 1.42, 0.62);
    hmiScreen.name = 'hmiScreen';
    group.add(hmiScreen);

    // Andon stack-light mast + named 'machineBeacon' element
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 10), darkBaseMat);
    mast.position.set(0.95, 1.95, -0.15);
    group.add(mast);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.26, 14),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.95,
      })
    );
    beacon.position.set(0.95, 2.24, -0.15);
    beacon.name = 'machineBeacon';
    group.add(beacon);
  }

  // Floor operational halo + vertical sweeping scan ring (visible when task/process is running)
  const ringRadius = asset.kind === 'airlock' ? 2.25 : asset.kind === 'buffer' ? 1.35 : 1.65;
  const processRing = new THREE.Mesh(
    new THREE.RingGeometry(ringRadius - 0.12, ringRadius, 40),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  processRing.rotation.x = -Math.PI / 2;
  processRing.position.y = 0.05;
  processRing.name = 'processRing';
  processRing.visible = false;
  group.add(processRing);

  const processScanner = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius * 0.85, 0.035, 10, 44),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.85,
    })
  );
  processScanner.rotation.x = Math.PI / 2;
  processScanner.position.y = 1.2;
  processScanner.name = 'processScanner';
  processScanner.visible = false;
  group.add(processScanner);

  group.traverse((obj) => {
    obj.layers.enable(1);
    obj.userData = { entityKind: 'asset', entityId: asset.id };
  });

  return group;
}

export function buildFacilityArchitecture(
  scene: THREE.Scene,
  tex: ProceduralSceneTextures
): void {
  const frameMat = new THREE.MeshStandardMaterial({
    map: tex.stainlessTex,
    color: 0x64748b,
    roughness: 0.36,
    metalness: 0.78,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.2,
    roughness: 0.08,
    depthWrite: false,
  });

  // Cleanroom glass walls with aluminum mullions & transoms
  const addPartition = (
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mullionAxis: 'x' | 'z',
    spanLen: number
  ) => {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat);
    glass.position.set(x, h / 2, z);
    scene.add(glass);

    // Top & bottom aluminum transom rails
    for (const ry of [0.08, h]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(mullionAxis === 'x' ? spanLen : w + 0.06, 0.14, mullionAxis === 'z' ? spanLen : d + 0.06),
        frameMat
      );
      rail.position.set(x, ry, z);
      scene.add(rail);
    }

    // Vertical mullions every ~3.5m
    const count = Math.max(2, Math.round(spanLen / 3.5));
    for (let i = 0; i <= count; i++) {
      const offset = -spanLen / 2 + (i / count) * spanLen;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), frameMat);
      post.position.set(
        mullionAxis === 'x' ? x + offset : x,
        h / 2,
        mullionAxis === 'z' ? z + offset : z
      );
      post.castShadow = true;
      scene.add(post);
    }
  };

  // North & south cleanroom glass partitions around Airlock at x = 8
  addPartition(8, -9.5, 0.12, 3.1, 11, 'z', 11);
  addPartition(8, 9.5, 0.12, 3.1, 11, 'z', 11);
  // Dividing glass wall between Prep Suite (z < 0) and Filling Suite (z > 0)
  addPartition(17, 0, 17, 2.9, 0.12, 'x', 17);

  // Peripheral structural steel columns grounding the high-bay facility
  for (const [cx, cz] of [
    [-25, -15],
    [-25, 15],
    [2, -15],
    [2, 15],
    [26, -15],
    [26, 15],
  ]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.36, 4.8, 0.36), frameMat);
    col.position.set(cx, 2.4, cz);
    col.castShadow = true;
    scene.add(col);
  }

  // Sleek perimeter architectural header beams & linear factory light bars (high at y=4.85)
  const luminaireMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.45,
    roughness: 0.2,
  });
  for (const bx of [-25, 2, 26]) {
    const beamZ = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 30.4), frameMat);
    beamZ.position.set(bx, 4.85, 0);
    scene.add(beamZ);
  }
  for (const bz of [-15, 15]) {
    const beamX = new THREE.Mesh(new THREE.BoxGeometry(51.4, 0.22, 0.24), frameMat);
    beamX.position.set(0.5, 4.85, bz);
    scene.add(beamX);
  }
  for (const lx of [-18, -6, 17]) {
    for (const lz of [-11, 11]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 0.18), luminaireMat);
      strip.position.set(lx, 4.72, lz);
      scene.add(strip);
    }
  }
}
