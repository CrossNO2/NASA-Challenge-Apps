// File: frontend/src/components/Lunar3DViewport.tsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Compass,
  Crosshair,
  Globe,
  Mountain,
  Radio,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import type {
  EphemerisSeries,
  HorizonProfile,
  InstantState,
  UnifiedLunarSite,
} from '../types/lunar';

export type Viewport3DMode = 'globe' | 'terrain';

interface Lunar3DViewportProps {
  sites: UnifiedLunarSite[];
  selectedSite: UnifiedLunarSite;
  instant: InstantState | null;
  series: EphemerisSeries | null;
  horizonProfile: HorizonProfile | null;
  currentTimeIso: string;
  maxSlopeDeg: number;
  onSelectSite: (site: UnifiedLunarSite) => void;
}

const GLOBE_RADIUS = 2.2;
const SKY_DOME_RADIUS = 7.5;

/**
 * Convert selenographic (lat, lon) in degrees to 3D Cartesian on sphere of radius R.
 * Convention: +Y = North Pole (+90°), -Y = South Pole (-90°),
 * +Z = Near-side sub-Earth prime meridian (lat=0°, lon=0°), +X = East (+90°E).
 */
function latLonToVector3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const latRad = THREE.MathUtils.degToRad(latDeg);
  const lonRad = THREE.MathUtils.degToRad(lonDeg);
  const cosLat = Math.cos(latRad);
  const x = radius * cosLat * Math.sin(lonRad);
  const y = radius * Math.sin(latRad);
  const z = radius * cosLat * Math.cos(lonRad);
  return new THREE.Vector3(x, y, z);
}

/**
 * Convert local topocentric (az_deg, el_deg) to 3D local coordinates on sky dome.
 * Convention in local terrain scene:
 * -Z = North (Az 0°), +X = East (Az 90°), +Z = South (Az 180°), -X = West (Az 270°), +Y = Zenith (+90° El).
 */
function azElToLocalVector3(azDeg: number, elDeg: number, radius: number): THREE.Vector3 {
  const azRad = THREE.MathUtils.degToRad(azDeg);
  const elRad = THREE.MathUtils.degToRad(elDeg);
  const cosEl = Math.cos(elRad);
  const x = radius * cosEl * Math.sin(azRad);
  const y = radius * Math.sin(elRad);
  const z = -radius * cosEl * Math.cos(azRad);
  return new THREE.Vector3(x, y, z);
}

/**
 * Compute global 3D Sun direction in the Moon-fixed frame from the site's local Sun (az, el)
 * so the 3D orbital globe's solar terminator matches the selected site's real-time sky state.
 */
function computeGlobalSunDirection(
  siteLatDeg: number,
  siteLonDeg: number,
  sunAzDeg: number,
  sunElDeg: number,
): THREE.Vector3 {
  const up = latLonToVector3(siteLatDeg, siteLonDeg, 1).normalize();
  const worldNorthPole = new THREE.Vector3(0, 1, 0);
  let east = new THREE.Vector3().crossVectors(worldNorthPole, up);
  if (east.lengthSq() < 1e-6) {
    east = new THREE.Vector3(1, 0, 0);
  } else {
    east.normalize();
  }
  const north = new THREE.Vector3().crossVectors(up, east).normalize();

  const azRad = THREE.MathUtils.degToRad(sunAzDeg);
  const elRad = THREE.MathUtils.degToRad(sunElDeg);
  const cosEl = Math.cos(elRad);

  const dir = new THREE.Vector3()
    .addScaledVector(north, cosEl * Math.cos(azRad))
    .addScaledVector(east, cosEl * Math.sin(azRad))
    .addScaledVector(up, Math.sin(elRad));

  return dir.normalize();
}

/**
 * Deterministic Mulberry32 PRNG so the 3D Moon Globe and starfield are 100% reproducible across renders.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate procedural high-contrast Lunar Albedo + Bump maps on offscreen HTML5 canvases.
 * Renders recognizable mapped selenographic features (Tycho ray system at 43.3°S 11.2°W,
 * Copernicus at 9.6°N 20.1°W, Mare Imbrium, Mare Serenitatis, Mare Tranquillitatis,
 * Oceanus Procellarum, and South Pole-Aitken Basin darkening near the South Pole).
 */
function createProceduralLunarTextures(): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const width = 1024;
  const height = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base lunar highland regolith tone
  ctx.fillStyle = '#9E9B95';
  ctx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  const rand = mulberry32(421069);

  // Subtle latitude/longitude albedo mottling
  for (let i = 0; i < 1600; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 4 + rand() * 32;
    const shade = Math.floor(135 + rand() * 45);
    const alpha = 0.04 + rand() * 0.06;
    ctx.fillStyle = `rgba(${shade}, ${shade - 2}, ${shade - 5}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // South Pole-Aitken Basin regional darkening band near the South Pole (-50°S to -88°S on far side)
  const spaGrad = ctx.createLinearGradient(0, ((90 - -45) / 180) * height, 0, height);
  spaGrad.addColorStop(0, 'rgba(62, 60, 58, 0)');
  spaGrad.addColorStop(0.65, 'rgba(58, 56, 53, 0.22)');
  spaGrad.addColorStop(1, 'rgba(48, 46, 44, 0.34)');
  ctx.fillStyle = spaGrad;
  ctx.fillRect(0, ((90 - -45) / 180) * height, width, height);

  // Major Named Lunar Maria Basins: [lonDeg, latDeg, radiusPx, darkness]
  const mariaBasins: [number, number, number, number][] = [
    [-55.0, 18.0, 118, 0.44],  // Oceanus Procellarum
    [-16.0, 33.0, 74, 0.49],   // Mare Imbrium
    [18.0, 28.0, 54, 0.47],    // Mare Serenitatis
    [28.0, 9.0, 58, 0.46],     // Mare Tranquillitatis (Apollo 11)
    [59.0, 17.0, 36, 0.48],    // Mare Crisium
    [48.0, -10.0, 46, 0.42],   // Mare Fecunditatis
    [-15.0, -22.0, 54, 0.40],  // Mare Nubium
    [-38.0, -18.0, 42, 0.41],  // Mare Humorum
    [32.0, -26.0, 35, 0.39],   // Mare Nectaris
    [-10.0, 52.0, 62, 0.34],   // Mare Frigoris
    [-165.0, -53.0, 135, 0.30], // South Pole-Aitken Basin (Far Side West)
    [165.0, -53.0, 135, 0.30],  // South Pole-Aitken Basin (Far Side East wrap)
  ];

  for (const [lon, lat, rad, dark] of mariaBasins) {
    const cx = ((lon + 180) / 360) * width;
    const cy = ((90 - lat) / 180) * height;
    const grad = ctx.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad);
    grad.addColorStop(0, `rgba(64, 62, 59, ${dark})`);
    grad.addColorStop(0.65, `rgba(74, 72, 68, ${dark * 0.72})`);
    grad.addColorStop(1, 'rgba(150, 147, 141, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();

    const bGrad = bCtx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
    bGrad.addColorStop(0, 'rgba(65, 65, 65, 0.5)');
    bGrad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    bCtx.fillStyle = bGrad;
    bCtx.beginPath();
    bCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Multi-scale impact craters with bright rims and dark floors on bump + color maps
  for (let i = 0; i < 650; i++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const r = 1.5 + Math.pow(rand(), 3.2) * 24;

    bCtx.strokeStyle = `rgba(225, 225, 225, ${0.25 + rand() * 0.35})`;
    bCtx.lineWidth = Math.max(1, r * 0.22);
    bCtx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    bCtx.arc(cx, cy, r, 0, Math.PI * 2);
    bCtx.stroke();

    bCtx.fillStyle = `rgba(55, 55, 55, ${0.25 + rand() * 0.3})`;
    bCtx.beginPath();
    bCtx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    bCtx.fill();

    ctx.strokeStyle = `rgba(210, 206, 198, ${0.12 + rand() * 0.18})`;
    ctx.lineWidth = Math.max(0.8, r * 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Prominent Named Ray Craters: [lonDeg, latDeg, radiusPx]
  // Tycho (43.3°S, 11.2°W), Copernicus (9.6°N, 20.1°W), Kepler (8.1°N, 38.0°W), Aristarchus (23.7°N, 47.4°W)
  const rayCraters: [number, number, number][] = [
    [-11.2, -43.3, 19],  // Tycho ray system
    [-20.1, 9.6, 16],    // Copernicus ray system
    [-38.0, 8.1, 11],    // Kepler
    [-47.4, 23.7, 10],   // Aristarchus plateau
  ];
  for (const [lon, lat, r] of rayCraters) {
    const cx = ((lon + 180) / 360) * width;
    const cy = ((90 - lat) / 180) * height;
    for (let k = 0; k < 20; k++) {
      const angle = (k / 20) * Math.PI * 2 + rand() * 0.18;
      const len = r * (2.8 + rand() * 4.5);
      ctx.strokeStyle = 'rgba(228, 225, 218, 0.18)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r * 0.55, cy + Math.sin(angle) * r * 0.55);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(235, 232, 225, 0.58)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.ClampToEdgeWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;

  return { colorMap, bumpMap };
}

/**
 * Create a crisp 2D canvas sprite for 3D cardinal labels ("N 0°", "E 90°", "S 180°", "W 270°")
 */
function createLabelSprite(text: string, colorHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20, 20, 19, 0.85)';
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 240, 48);
  ctx.fillRect(8, 8, 240, 48);

  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillStyle = colorHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}

export const Lunar3DViewport: React.FC<Lunar3DViewportProps> = ({
  sites,
  selectedSite,
  instant,
  series,
  horizonProfile,
  currentTimeIso,
  maxSlopeDeg,
  onSelectSite,
}) => {
  const [mode, setMode] = useState<Viewport3DMode>('globe');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Refs to Three.js scene objects for real-time updates without tearing down the WebGL context
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const terrainGroupRef = useRef<THREE.Group | null>(null);

  const globeSunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const beaconsGroupRef = useRef<THREE.Group | null>(null);
  const selectedRingRef = useRef<THREE.Mesh | null>(null);
  const selectedPulseRef = useRef<THREE.Mesh | null>(null);

  // Local Terrain & Sky Dome refs
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const terrainWireRef = useRef<THREE.LineSegments | null>(null);
  const landerGroupRef = useRef<THREE.Group | null>(null);
  const skyTrajectoryGroupRef = useRef<THREE.Group | null>(null);
  const sunSphereRef = useRef<THREE.Mesh | null>(null);
  const earthSphereRef = useRef<THREE.Mesh | null>(null);
  const sunLaserRef = useRef<THREE.Line | null>(null);
  const earthLaserRef = useRef<THREE.Line | null>(null);
  const localSunLightRef = useRef<THREE.DirectionalLight | null>(null);

  // Camera smooth animation target
  const camAnimRef = useRef<{
    active: boolean;
    targetPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
  }>({
    active: false,
    targetPos: new THREE.Vector3(0, 0, 5.8),
    targetLookAt: new THREE.Vector3(0, 0, 0),
  });

  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // 1. Initialize WebGLRenderer, Scene, Camera, OrbitControls, Globe Group, and Terrain Group once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B0C0E');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    camera.position.set(0, -2.6, 5.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.6;
    controls.maxDistance = 18;
    controlsRef.current = controls;

    // Subtle deep-space starfield (100% deterministic via mulberry32)
    const starRand = mulberry32(900137);
    const starGeo = new THREE.BufferGeometry();
    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 45 + starRand() * 40;
      const theta = starRand() * Math.PI * 2;
      const phi = Math.acos(2 * starRand() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xe7e5e4,
      size: 0.12,
      transparent: true,
      opacity: 0.65,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Ambient fill so the lunar night side remains subtly legible for telemetry inspection
    const ambientLight = new THREE.AmbientLight(0xd6d3d1, 0.24);
    scene.add(ambientLight);

    // ========================================================================
    // MODE A: 3D ORBITAL GLOBE GROUP
    // ========================================================================
    const globeGroup = new THREE.Group();
    globeGroupRef.current = globeGroup;
    scene.add(globeGroup);

    const { colorMap, bumpMap } = createProceduralLunarTextures();
    const moonGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96);
    // Align SphereGeometry UV seam so lon=0° faces +Z and lon=±180° is at -Z
    moonGeo.rotateY(-Math.PI / 2);

    const moonMat = new THREE.MeshStandardMaterial({
      map: colorMap,
      bumpMap: bumpMap,
      bumpScale: 0.035,
      roughness: 0.92,
      metalness: 0.04,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    globeGroup.add(moonMesh);

    // Selenographic Graticule Cage (Lat/Lon lines every 30°)
    const graticuleGroup = new THREE.Group();
    const gratMat = new THREE.LineBasicMaterial({
      color: 0xa8a29e,
      transparent: true,
      opacity: 0.18,
    });
    const primeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.38,
    });

    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 4) {
        pts.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.003));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      graticuleGroup.add(new THREE.Line(geo, lat === 0 ? primeMat : gratMat));
    }

    for (let lon = -150; lon <= 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 4) {
        pts.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.003));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      graticuleGroup.add(new THREE.Line(geo, lon === 0 ? primeMat : gratMat));
    }

    // Highlighted Artemis III South Pole Tactical Ring (-80°S) in NASA International Orange (#FF4F00)
    const southPolePts: THREE.Vector3[] = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      southPolePts.push(latLonToVector3(-80, lon, GLOBE_RADIUS * 1.006));
    }
    const southPoleGeo = new THREE.BufferGeometry().setFromPoints(southPolePts);
    const southPoleMat = new THREE.LineBasicMaterial({
      color: 0xff4f00,
      transparent: true,
      opacity: 0.85,
    });
    graticuleGroup.add(new THREE.Line(southPoleGeo, southPoleMat));
    globeGroup.add(graticuleGroup);

    // Globe Solar Terminator Directional Light
    const globeSunLight = new THREE.DirectionalLight(0xfff7ed, 2.5);
    globeSunLight.position.set(10, 2, 8);
    globeGroup.add(globeSunLight);
    globeSunLightRef.current = globeSunLight;

    // Beacons Group for Landing Sites
    const beaconsGroup = new THREE.Group();
    beaconsGroupRef.current = beaconsGroup;
    globeGroup.add(beaconsGroup);

    // Selected site pulsing target ring + vertical spike
    const ringGeo = new THREE.RingGeometry(0.06, 0.095, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4f00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const selectedRing = new THREE.Mesh(ringGeo, ringMat);
    selectedRingRef.current = selectedRing;
    globeGroup.add(selectedRing);

    const pulseGeo = new THREE.RingGeometry(0.095, 0.14, 32);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xff4f00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const selectedPulse = new THREE.Mesh(pulseGeo, pulseMat);
    selectedPulseRef.current = selectedPulse;
    globeGroup.add(selectedPulse);

    // ========================================================================
    // MODE B: 3D LOCAL TERRAIN & SKY DOME GROUP
    // ========================================================================
    const terrainGroup = new THREE.Group();
    terrainGroup.visible = false;
    terrainGroupRef.current = terrainGroup;
    scene.add(terrainGroup);

    // Local directional sunlight casting shadows across crater ridges
    const localSunLight = new THREE.DirectionalLight(0xfffbeb, 2.4);
    localSunLight.position.set(6, 4, -6);
    localSunLight.castShadow = true;
    localSunLight.shadow.mapSize.width = 1024;
    localSunLight.shadow.mapSize.height = 1024;
    terrainGroup.add(localSunLight);
    localSunLightRef.current = localSunLight;

    // 3D Radial Terrain Mesh (16x16 units, 120x120 grid)
    const planeGeo = new THREE.PlaneGeometry(16, 16, 120, 120);
    planeGeo.rotateX(-Math.PI / 2);
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x78716c,
      roughness: 0.94,
      metalness: 0.06,
      flatShading: true,
    });
    const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    terrainMeshRef.current = terrainMesh;
    terrainGroup.add(terrainMesh);

    // Subtle topographic wireframe overlay
    const wireGeo = new THREE.WireframeGeometry(planeGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0xd6d3d1,
      transparent: true,
      opacity: 0.11,
    });
    const terrainWire = new THREE.LineSegments(wireGeo, wireMat);
    terrainWireRef.current = terrainWire;
    terrainGroup.add(terrainWire);

    // 10° Lander Safety Limit Ring on ground around origin
    const safetyRingGeo = new THREE.RingGeometry(1.15, 1.22, 64);
    safetyRingGeo.rotateX(-Math.PI / 2);
    const safetyRingMat = new THREE.MeshBasicMaterial({
      color: 0xff4f00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const safetyRing = new THREE.Mesh(safetyRingGeo, safetyRingMat);
    safetyRing.position.y = 0.03;
    terrainGroup.add(safetyRing);

    // 3D Lunar Lander Model at (0, 0, 0)
    const landerGroup = new THREE.Group();
    landerGroupRef.current = landerGroup;

    // Descent stage octagonal thermal gold foil body
    const descentGeo = new THREE.CylinderGeometry(0.36, 0.42, 0.34, 8);
    const goldFoilMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.32,
      metalness: 0.78,
    });
    const descentMesh = new THREE.Mesh(descentGeo, goldFoilMat);
    descentMesh.position.y = 0.32;
    descentMesh.castShadow = true;
    landerGroup.add(descentMesh);

    // Ascent / Avionics Titanium Core
    const ascentGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.32, 8);
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xe7e5e4,
      roughness: 0.45,
      metalness: 0.5,
    });
    const ascentMesh = new THREE.Mesh(ascentGeo, titaniumMat);
    ascentMesh.position.y = 0.64;
    ascentMesh.castShadow = true;
    landerGroup.add(ascentMesh);

    // Vertical Polar Solar Array Mast
    const mastGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.8 });
    const mastMesh = new THREE.Mesh(mastGeo, mastMat);
    mastMesh.position.y = 1.12;
    landerGroup.add(mastMesh);

    const panelGeo = new THREE.BoxGeometry(0.75, 0.46, 0.02);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.25,
      metalness: 0.7,
    });
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.set(0, 1.25, 0);
    landerGroup.add(panelMesh);

    // High-Gain DTE Parabolic Dish
    const dishGeo = new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45);
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f4,
      side: THREE.DoubleSide,
      metalness: 0.4,
      roughness: 0.3,
    });
    const dishMesh = new THREE.Mesh(dishGeo, dishMat);
    dishMesh.position.set(0.26, 0.82, 0.15);
    dishMesh.rotation.x = Math.PI * 0.35;
    landerGroup.add(dishMesh);

    // 4 Landing Legs + Footpads
    const legMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, metalness: 0.6, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.56, 8);
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(Math.cos(angle) * 0.46, 0.2, Math.sin(angle) * 0.46);
      leg.rotation.z = -Math.cos(angle) * 0.52;
      leg.rotation.x = Math.sin(angle) * 0.52;
      landerGroup.add(leg);

      const padGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.03, 12);
      const pad = new THREE.Mesh(padGeo, goldFoilMat);
      pad.position.set(Math.cos(angle) * 0.64, 0.02, Math.sin(angle) * 0.64);
      landerGroup.add(pad);
    }

    terrainGroup.add(landerGroup);

    // Translucent 3D Sky-Dome Wireframe Hemisphere (radius = 7.5)
    const domeGeo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeWire = new THREE.WireframeGeometry(domeGeo);
    const domeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
    });
    terrainGroup.add(new THREE.LineSegments(domeWire, domeMat));

    // 0° Astronomical Horizon Ring on Sky-Dome Base
    const horizonRingPts: THREE.Vector3[] = [];
    for (let az = 0; az <= 360; az += 3) {
      horizonRingPts.push(azElToLocalVector3(az, 0, SKY_DOME_RADIUS));
    }
    const horizonRingGeo = new THREE.BufferGeometry().setFromPoints(horizonRingPts);
    const horizonRingMat = new THREE.LineBasicMaterial({
      color: 0x15803d,
      transparent: true,
      opacity: 0.65,
    });
    terrainGroup.add(new THREE.Line(horizonRingGeo, horizonRingMat));

    // 3D Cardinal Direction Markers (N 0°, E 90°, S 180°, W 270°)
    const cardinals: [number, string, string][] = [
      [0, 'N 0°', '#FF4F00'],
      [90, 'E 90°', '#E7E5E4'],
      [180, 'S 180°', '#E7E5E4'],
      [270, 'W 270°', '#E7E5E4'],
    ];
    for (const [az, text, col] of cardinals) {
      const sprite = createLabelSprite(text, col);
      const pos = azElToLocalVector3(az, 4, SKY_DOME_RADIUS * 0.96);
      sprite.position.copy(pos);
      terrainGroup.add(sprite);
    }

    // Group for Sun & Earth Trajectory Ribbons across Sky-Dome
    const skyTrajectoryGroup = new THREE.Group();
    skyTrajectoryGroupRef.current = skyTrajectoryGroup;
    terrainGroup.add(skyTrajectoryGroup);

    // Live 3D Sun Sphere (#F59E0B) & 3D Earth Sphere (#38BDF8) on Sky-Dome
    const sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    );
    sunSphereRef.current = sunSphere;
    terrainGroup.add(sunSphere);

    const earthSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    );
    earthSphereRef.current = earthSphere;
    terrainGroup.add(earthSphere);

    // Line-of-Sight Laser Vectors from Lander to Sun & Earth
    const sunLaserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Vector3(0, 3, -5),
    ]);
    const sunLaserMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
    const sunLaser = new THREE.Line(sunLaserGeo, sunLaserMat);
    sunLaserRef.current = sunLaser;
    terrainGroup.add(sunLaser);

    const earthLaserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Vector3(2, 2, -5),
    ]);
    const earthLaserMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
    const earthLaser = new THREE.Line(earthLaserGeo, earthLaserMat);
    earthLaserRef.current = earthLaser;
    terrainGroup.add(earthLaser);

    // Raycasting for clicking 3D site beacons on the orbital globe
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: MouseEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: MouseEvent) => {
      if (modeRef.current !== 'globe' || !beaconsGroupRef.current) return;
      const distMoved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (distMoved > 6) return; // Ignore orbit drag gestures

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(beaconsGroupRef.current.children, true);
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData?.siteId) {
          obj = obj.parent;
        }
        const siteId = obj?.userData?.siteId;
        if (siteId) {
          const found = sitesRef.current.find((s) => s.id === siteId);
          if (found) {
            onSelectSiteRef.current(found);
          }
        }
      }
    };

    renderer.domElement.addEventListener('mousedown', handlePointerDown);
    renderer.domElement.addEventListener('mouseup', handlePointerUp);

    // Stop camera preset auto-lerp if user manually grabs OrbitControls
    const stopCamAnim = () => {
      camAnimRef.current.active = false;
    };
    controls.addEventListener('start', stopCamAnim);

    // Animation Loop
    let rafId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();

      // Pulse target ring on 3D globe
      if (selectedPulseRef.current) {
        const s = 1 + 0.35 * Math.sin(elapsed * 4.0);
        selectedPulseRef.current.scale.set(s, s, 1);
      }

      // Smoothly interpolate camera toward preset/target if active
      if (camAnimRef.current.active) {
        camera.position.lerp(camAnimRef.current.targetPos, 0.08);
        controls.target.lerp(camAnimRef.current.targetLookAt, 0.1);
        if (camera.position.distanceTo(camAnimRef.current.targetPos) < 0.04) {
          camAnimRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    // Responsive ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousedown', handlePointerDown);
      renderer.domElement.removeEventListener('mouseup', handlePointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // 2. Switch between Mode A (3D Orbital Globe) and Mode B (3D Local Terrain & Sky Dome)
  useEffect(() => {
    if (!globeGroupRef.current || !terrainGroupRef.current || !cameraRef.current || !controlsRef.current) return;

    if (mode === 'globe') {
      globeGroupRef.current.visible = true;
      terrainGroupRef.current.visible = false;
      controlsRef.current.minDistance = 2.65;
      controlsRef.current.maxDistance = 14;
      focusCameraOnSite(selectedSite);
    } else {
      globeGroupRef.current.visible = false;
      terrainGroupRef.current.visible = true;
      controlsRef.current.minDistance = 1.8;
      controlsRef.current.maxDistance = 18;
      camAnimRef.current = {
        active: true,
        targetPos: new THREE.Vector3(0, 3.6, 8.2),
        targetLookAt: new THREE.Vector3(0, 0.8, 0),
      };
    }
  }, [mode]);

  // Helper to orient 3D globe camera smoothly toward any (lat, lon)
  const focusCameraOnLatLon = (latDeg: number, lonDeg: number, distance = 5.4) => {
    const pos = latLonToVector3(latDeg, lonDeg, distance);
    camAnimRef.current = {
      active: true,
      targetPos: pos,
      targetLookAt: new THREE.Vector3(0, 0, 0),
    };
  };

  const focusCameraOnSite = (site: UnifiedLunarSite) => {
    focusCameraOnLatLon(site.lat, site.lon, 5.1);
  };

  // 3. Rebuild 3D Site Beacons on Globe whenever `sites` or `selectedSite` changes
  useEffect(() => {
    const beaconsGroup = beaconsGroupRef.current;
    if (!beaconsGroup) return;

    while (beaconsGroup.children.length > 0) {
      beaconsGroup.remove(beaconsGroup.children[0]);
    }

    for (const site of sites) {
      const isSelected = site.id === selectedSite.id;
      const surfacePos = latLonToVector3(site.lat, site.lon, GLOBE_RADIUS);
      const normal = surfacePos.clone().normalize();

      const colorHex = isSelected
        ? 0xff4f00
        : site.site_type === 'artemis-candidate'
          ? 0xf59e0b
          : site.site_type === 'crewed'
            ? 0x10b981
            : site.site_type === 'robotic'
              ? 0x38bdf8
              : 0xfafaf9;

      const markerGroup = new THREE.Group();
      markerGroup.userData = { siteId: site.id };

      // Base sphere pin on lunar surface
      const pinGeo = new THREE.SphereGeometry(isSelected ? 0.045 : 0.028, 14, 14);
      const pinMat = new THREE.MeshBasicMaterial({ color: colorHex });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(surfacePos);
      markerGroup.add(pinMesh);

      // Vertical telemetry spike for selected or Artemis candidate sites
      if (isSelected || site.site_type === 'artemis-candidate') {
        const spikeHeight = isSelected ? 0.34 : 0.16;
        const spikePts = [
          surfacePos,
          surfacePos.clone().addScaledVector(normal, spikeHeight),
        ];
        const spikeGeo = new THREE.BufferGeometry().setFromPoints(spikePts);
        const spikeMat = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: isSelected ? 1.0 : 0.7,
        });
        markerGroup.add(new THREE.Line(spikeGeo, spikeMat));
      }

      beaconsGroup.add(markerGroup);
    }

    // Position the pulsing target rings tangent to the selected site on the sphere
    const selPos = latLonToVector3(selectedSite.lat, selectedSite.lon, GLOBE_RADIUS * 1.008);
    const selNormal = selPos.clone().normalize();
    const lookTarget = selPos.clone().add(selNormal);

    if (selectedRingRef.current) {
      selectedRingRef.current.position.copy(selPos);
      selectedRingRef.current.lookAt(lookTarget);
    }
    if (selectedPulseRef.current) {
      selectedPulseRef.current.position.copy(selPos);
      selectedPulseRef.current.lookAt(lookTarget);
    }

    if (mode === 'globe') {
      focusCameraOnSite(selectedSite);
    }
  }, [sites, selectedSite]);

  // 4. Update 3D Local Terrain Mesh & Lander Tilt when `selectedSite` or `horizonProfile` changes
  useEffect(() => {
    const terrainMesh = terrainMeshRef.current;
    const terrainWire = terrainWireRef.current;
    const landerGroup = landerGroupRef.current;
    if (!terrainMesh || !landerGroup) return;

    const geo = terrainMesh.geometry as THREE.PlaneGeometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;

    const elevations = horizonProfile?.elevations_deg ?? [];
    const hasLola = elevations.length > 0;
    const slopeRad = THREE.MathUtils.degToRad(selectedSite.slope_deg);

    // Deterministic site-specific seed for micro-crater relief
    const siteSeed =
      Math.abs(Math.round(selectedSite.lat * 100) * 31 + Math.round(selectedSite.lon * 100) * 17) % 1000;

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const dist = Math.hypot(x, z);

      // Compute azimuth in degrees (0 = North = -Z, 90 = East = +X)
      const azRad = Math.atan2(x, -z);
      const azDeg = ((THREE.MathUtils.radToDeg(azRad) % 360) + 360) % 360;

      // Sample 360-deg horizon elevation profile (or realistic polar ridge relief)
      let horizonElDeg = 0;
      if (hasLola) {
        const idx = Math.floor(azDeg) % elevations.length;
        horizonElDeg = Math.max(0, elevations[idx] ?? 0);
      } else {
        const isPolar = selectedSite.lat < -65;
        horizonElDeg = isPolar
          ? 4.5 + 3.5 * Math.sin(azRad * 3 + siteSeed) + 2.0 * Math.cos(azRad * 5)
          : 1.2 + 0.8 * Math.sin(azRad * 4 + siteSeed);
      }

      // Near center (dist < 2.2), terrain tilts smoothly by `selectedSite.slope_deg`
      const centerSlopeY = -x * Math.tan(slopeRad) * Math.exp(-dist * 0.45);

      // Outer crater rim / massif height rises smoothly to match the horizon elevation angle
      const rimFactor = Math.max(0, (dist - 2.0) / 6.0);
      const rimHeight =
        Math.pow(rimFactor, 1.55) *
        dist *
        Math.tan(THREE.MathUtils.degToRad(Math.min(28, horizonElDeg))) *
        0.55;

      // Subtle regolith roughness
      const microRough =
        0.06 * Math.sin(x * 1.9 + siteSeed) * Math.cos(z * 1.9 + siteSeed) * Math.min(1, dist / 1.5);

      posAttr.setY(i, centerSlopeY + rimHeight + microRough);
    }

    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    if (terrainWire) {
      terrainWire.geometry.dispose();
      terrainWire.geometry = new THREE.WireframeGeometry(geo);
    }

    // Tilt the 3D Lunar Lander by `selectedSite.slope_deg`
    landerGroup.rotation.set(0, 0, -slopeRad);
  }, [selectedSite, horizonProfile]);

  // 5. Update Sky-Dome Sun & Earth Trajectory Ribbons when `series` changes
  useEffect(() => {
    const group = skyTrajectoryGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const sunSeries = series?.bodies.sun ?? [];
    const earthSeries = series?.bodies.earth ?? [];

    if (sunSeries.length > 1) {
      const sunPts = sunSeries.map((pt) =>
        azElToLocalVector3(pt.az_deg, Math.max(-12, pt.el_deg), SKY_DOME_RADIUS * 0.98),
      );
      const sunGeo = new THREE.BufferGeometry().setFromPoints(sunPts);
      const sunMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.65,
      });
      group.add(new THREE.Line(sunGeo, sunMat));
    }

    if (earthSeries.length > 1) {
      const earthPts = earthSeries.map((pt) =>
        azElToLocalVector3(pt.az_deg, Math.max(-12, pt.el_deg), SKY_DOME_RADIUS * 0.96),
      );
      const earthGeo = new THREE.BufferGeometry().setFromPoints(earthPts);
      const earthMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
      });
      group.add(new THREE.Line(earthGeo, earthMat));
    }
  }, [series]);

  // 6. Real-Time Update of Solar Terminator, 3D Sun/Earth Spheres, and Line-of-Sight Laser Vectors
  useEffect(() => {
    const sun = instant?.bodies.sun;
    const earth = instant?.bodies.earth;
    if (!sun || !earth) return;

    // A) Update 3D Orbital Globe Solar Terminator Light
    if (globeSunLightRef.current) {
      const globalSunDir = computeGlobalSunDirection(
        selectedSite.lat,
        selectedSite.lon,
        sun.az_deg,
        sun.el_deg,
      );
      globeSunLightRef.current.position.copy(globalSunDir.multiplyScalar(15));
    }

    // B) Update Local Sky-Dome Sun & Earth Spheres + Laser Beams + Terrain Shadow Light
    const sunPos = azElToLocalVector3(sun.az_deg, Math.max(-14, sun.el_deg), SKY_DOME_RADIUS * 0.98);
    const earthPos = azElToLocalVector3(earth.az_deg, Math.max(-14, earth.el_deg), SKY_DOME_RADIUS * 0.96);

    if (sunSphereRef.current) {
      sunSphereRef.current.position.copy(sunPos);
    }
    if (earthSphereRef.current) {
      earthSphereRef.current.position.copy(earthPos);
    }

    if (localSunLightRef.current) {
      const lightPos = azElToLocalVector3(sun.az_deg, Math.max(4, sun.el_deg), 12);
      localSunLightRef.current.position.copy(lightPos);
      localSunLightRef.current.intensity = sun.visible ? 2.4 : 0.35;
    }

    const landerOrigin = new THREE.Vector3(0, 0.85, 0);

    if (sunLaserRef.current) {
      sunLaserRef.current.geometry.setFromPoints([landerOrigin, sunPos]);
      const mat = sunLaserRef.current.material as THREE.LineBasicMaterial;
      mat.color.setHex(sun.visible ? 0xf59e0b : 0xdc2626);
      mat.opacity = sun.visible ? 0.9 : 0.45;
    }

    if (earthLaserRef.current) {
      earthLaserRef.current.geometry.setFromPoints([landerOrigin, earthPos]);
      const mat = earthLaserRef.current.material as THREE.LineBasicMaterial;
      mat.color.setHex(earth.visible ? 0x38bdf8 : 0xdc2626);
      mat.opacity = earth.visible ? 0.9 : 0.45;
    }
  }, [instant, selectedSite, currentTimeIso]);

  const sun = instant?.bodies.sun;
  const earth = instant?.bodies.earth;
  const slopeSafe = selectedSite.slope_deg <= maxSlopeDeg;
  const terrainSource = instant?.terrain_source ?? (horizonProfile ? 'synthetic' : 'none');
  const terrainBadgeText =
    terrainSource === 'lola'
      ? 'LOLA 360° DEM'
      : terrainSource === 'synthetic'
        ? 'SYNTHETIC 360° HORIZON (ILLUSTRATIVE)'
        : 'FLAT 0° HORIZON';

  return (
    <section className="nasa-panel flex flex-col justify-between h-full">
      {/* Top Industrial Titanium Module Header */}
      <div className="px-3.5 py-2.5 bg-[#EAE7E0] border-b border-[#CFCBC2] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-[#141413] text-[#FF4F00] font-mono text-[10px] font-bold tracking-wider">
            MOD-01
          </span>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#141413] m-0">
              ORBITAL &amp; SURFACE 3D TELEMETRY ENGINE
            </h2>
            <p className="text-[10px] font-mono text-[#57534E] m-0">
              WEBGL SPICE DE421 TERMINATOR · 3D TOPOGRAPHIC HORIZON SANDBOX
            </p>
          </div>
        </div>

        {/* Mode Switcher: Mode A (3D Orbital Globe) vs Mode B (3D Local Terrain & Sky Dome) */}
        <div className="flex items-center bg-[#F4F3EF] p-0.5 border border-[#CFCBC2]">
          <button
            type="button"
            onClick={() => setMode('globe')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-semibold uppercase transition cursor-pointer ${
              mode === 'globe'
                ? 'bg-[#FF4F00] text-white'
                : 'text-[#57534E] hover:text-[#141413]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            3D Orbital Globe
          </button>
          <button
            type="button"
            onClick={() => setMode('terrain')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-semibold uppercase transition cursor-pointer ${
              mode === 'terrain'
                ? 'bg-[#FF4F00] text-white'
                : 'text-[#57534E] hover:text-[#141413]'
            }`}
          >
            <Mountain className="w-3.5 h-3.5" />
            3D Terrain &amp; Sky Dome
          </button>
        </div>
      </div>

      {/* Center 3D WebGL Viewport Container */}
      <div className="relative w-full h-[420px] sm:h-[460px] bg-[#0B0C0E] overflow-hidden select-none">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Top-Left Floating Dark-Glass Telemetry HUD */}
        <div className="absolute top-3 left-3 z-10 bg-[#141413]/88 backdrop-blur-sm border border-white/15 px-3 py-2 text-[#F4F3EF] font-mono text-[11px] max-w-[305px] pointer-events-none">
          <div className="flex items-center justify-between gap-3 text-[10px] text-[#FF4F00] font-bold uppercase tracking-wider border-b border-white/10 pb-1 mb-1.5">
            <span>{mode === 'globe' ? 'SELENOGRAPHIC ORBITAL VIEW' : 'LOCAL TOPOCENTRIC SANDBOX'}</span>
            <span>LIVE 3D</span>
          </div>
          <div className="font-sans font-bold text-xs text-white truncate">{selectedSite.name}</div>
          <div className="text-[10px] text-stone-300 mt-0.5">
            LAT {selectedSite.lat >= 0 ? `+${selectedSite.lat.toFixed(3)}°N` : `${selectedSite.lat.toFixed(3)}°S`} · LON{' '}
            {selectedSite.lon >= 0 ? `+${selectedSite.lon.toFixed(3)}°E` : `${selectedSite.lon.toFixed(3)}°W`}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-white/10 flex flex-col gap-1 text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[#F59E0B]">
                <Sun className="w-3 h-3" /> SUN VECTOR:
              </span>
              <span className={sun?.visible ? 'text-[#22C55E] font-bold' : 'text-[#EF4444] font-bold'}>
                {sun ? `EL ${sun.el_deg.toFixed(1)}° / AZ ${sun.az_deg.toFixed(0)}°` : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[#38BDF8]">
                <Radio className="w-3 h-3" /> EARTH DTE:
              </span>
              <span className={earth?.visible ? 'text-[#38BDF8] font-bold' : 'text-[#EF4444] font-bold'}>
                {earth ? `EL ${earth.el_deg.toFixed(1)}° (${earth.visible ? 'LOS' : 'OCCL'})` : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-stone-300">
                <Compass className="w-3 h-3" /> LANDER TILT:
              </span>
              <span className={slopeSafe ? 'text-[#22C55E] font-bold' : 'text-[#EF4444] font-bold'}>
                {selectedSite.slope_deg.toFixed(1)}° / ≤{maxSlopeDeg.toFixed(0)}°
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-stone-400">TERRAIN:</span>
              <span className="text-stone-200 font-semibold truncate">{terrainBadgeText}</span>
            </div>
          </div>
        </div>

        {/* Top-Right Camera Preset Buttons (in Globe Mode) or Legend (in Terrain Mode) */}
        {mode === 'globe' ? (
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            {[
              { label: 'FOCUS TARGET', action: () => focusCameraOnSite(selectedSite) },
              { label: 'SOUTH POLE (-90°S)', action: () => focusCameraOnLatLon(-88, 0, 4.8) },
              { label: 'NEAR SIDE (0°E)', action: () => focusCameraOnLatLon(0, 0, 5.6) },
              { label: 'FAR SIDE (180°E)', action: () => focusCameraOnLatLon(0, 180, 5.6) },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={btn.action}
                className="px-2.5 py-1 bg-[#141413]/85 hover:bg-[#FF4F00] text-[#F4F3EF] hover:text-white border border-white/20 text-[10px] font-mono font-semibold tracking-wider uppercase text-right transition cursor-pointer"
              >
                {btn.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="absolute top-3 right-3 z-10 bg-[#141413]/88 border border-white/15 px-3 py-2 text-[10px] font-mono text-stone-200 flex flex-col gap-1 pointer-events-none">
            <div className="text-[#FF4F00] font-bold uppercase">3D SANDBOX VECTORS</div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block" />
              <span>Solar Ray &amp; Sky Path</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8] inline-block" />
              <span>Earth DTE Laser &amp; Libration</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#78716C] inline-block" />
              <span>
                360° Topographic Horizon Mask
                {terrainSource === 'synthetic' ? ' (Synthetic Illustrative)' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF4F00] inline-block" />
              <span>≤{maxSlopeDeg}° Lander Tilt Limit Ring</span>
            </div>
          </div>
        )}

        {/* Bottom Floating Controls & Terminator Epoch Bar */}
        <div className="absolute bottom-2.5 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 bg-[#141413]/85 border border-white/15 px-3 py-1.5 text-[10px] font-mono text-stone-300 pointer-events-none">
          <span className="inline-flex items-center gap-1.5">
            <Crosshair className="w-3 h-3 text-[#FF4F00]" />
            {mode === 'globe'
              ? 'Left-Click Drag: Orbit Moon · Scroll: Zoom · Click Any 3D Beacon: Select Site'
              : 'Left-Click Drag: Orbit Lander & Crater Rim · Scroll: Zoom · Scrub Timeline Below'}
          </span>
          <span className="text-[#F59E0B] font-semibold">
            TERMINATOR UTC: {currentTimeIso.slice(0, 19).replace('T', ' ')}Z
          </span>
        </div>
      </div>

      {/* Bottom Technical Status Strip */}
      <div className="px-3.5 py-2 bg-[#FAF9F5] border-t border-[#CFCBC2] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#57534E]">
        <div className="flex items-center gap-3">
          <span>
            RING: <strong className="text-[#FF4F00]">-80°S TO -90°S ARTEMIS TARGET ZONE</strong>
          </span>
          <span>
            TERRAIN:{' '}
            <strong className="text-[#141413]">{terrainBadgeText}</strong>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {!slopeSafe && <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626]" />}
          <span>
            LANDER ATTITUDE:{' '}
            <strong className={slopeSafe ? 'text-[#15803D]' : 'text-[#DC2626]'}>
              {slopeSafe ? 'NOMINAL (WITHIN ENVELOPE)' : 'EXCEEDS MAX SLOPE'}
            </strong>
          </span>
        </div>
      </div>
    </section>
  );
};
