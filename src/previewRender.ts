import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GCodeCoord } from "./gcode";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const container = document.getElementById("pipe-preview")!;

const camera = new THREE.PerspectiveCamera(
  55,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(0, 50, 30);
scene.add(dirLight);

const sceneObjects: THREE.Object3D[] = [];

function clearScene() {
  for (const obj of sceneObjects) {
    scene.remove(obj);
    if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    const mat = (obj as THREE.Mesh).material;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else (mat as THREE.Material).dispose();
    }
  }
  sceneObjects.length = 0;
}

function add(obj: THREE.Object3D) {
  scene.add(obj);
  sceneObjects.push(obj);
  return obj;
}

function projectOntoOD(
  gcX: number,
  gcY: number,
  gcZ: number,
  radius: number
): THREE.Vector3 {
  const len = Math.sqrt(gcY * gcY + gcZ * gcZ);
  const ny = len > 1e-9 ? gcY / len : 0;
  const nz = len > 1e-9 ? gcZ / len : 1;
  return new THREE.Vector3(gcX, ny * radius, nz * radius);
}

function buildPipe(length: number, radius: number, xOffset: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 64, 1, true);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4466aa,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.x = xOffset + length / 2;
  return mesh;
}

function buildLine(
  points: THREE.Vector3[],
  color: number,
  dashed: boolean
): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.05, gapSize: 0.05, linewidth: 2 })
    : new THREE.LineBasicMaterial({ color, linewidth: 2 });
  const line = new THREE.Line(geo, mat);
  if (dashed) line.computeLineDistances();
  return line;
}

function buildCutPath(coords: GCodeCoord[], radius: number): THREE.Line {
  const points = coords.map((c) => projectOntoOD(c.x, c.y, c.z, radius));
  return buildLine(points, 0x00eeff, false);
}

function buildTransition(from: GCodeCoord, to: GCodeCoord, radius: number): THREE.Line {
  const points = [
    projectOntoOD(from.x, from.y, from.z, radius),
    projectOntoOD(to.x, to.y, to.z, radius),
  ];
  return buildLine(points, 0xffaa00, true);
}

function frameCamera(xMin: number, xMax: number, radius: number) {
  const pipeLength = xMax - xMin;
  const midX = xMin + pipeLength / 2;
  const dist = Math.max(pipeLength, radius * 4) * 1.5;

  camera.position.set(midX, radius * 2, dist);

  controls.target.set(midX, 0, 0);
  controls.update();
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
}

export function display(
  gcodeCoords: GCodeCoord[][] | null,
  pipeOD: number,
  xStart: number
): void {
  clearScene();

  if (!gcodeCoords || gcodeCoords.length === 0) {
    renderer.setAnimationLoop(null);
    return;
  }

  const radius = pipeOD / 2;

  let xMin = Infinity;
  let xMax = -Infinity;
  for (const cut of gcodeCoords) {
    for (const c of cut) {
      if (c.x < xMin) xMin = c.x;
      if (c.x > xMax) xMax = c.x;
    }
  }

  xMin = Math.min(xMin, xStart) - radius * 0.5;
  xMax = xMax + radius * 0.5;

  add(buildPipe(xMax - xMin, radius, xMin));

  for (let i = 0; i < gcodeCoords.length; i++) {
    add(buildCutPath(gcodeCoords[i]!, radius));

    if (i < gcodeCoords.length - 1) {
      const lastPoint = gcodeCoords[i]![gcodeCoords[i]!.length - 1]!;
      const firstPoint = gcodeCoords[i + 1]![0]!;
      add(buildTransition(lastPoint, firstPoint, radius));
    }
  }

  frameCamera(xMin, xMax, radius);
  renderer.setAnimationLoop(animate);
  renderer.setSize(container.clientWidth, container.clientHeight);
}