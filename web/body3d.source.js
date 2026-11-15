import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const viewport = document.getElementById('body3d-viewport');
const loading = document.getElementById('body3d-loading');
const failure = document.getElementById('body3d-error');
const modelSelect = document.getElementById('anatomy-model-select');
const modelCaption = document.getElementById('body3d-caption');

if (!viewport) throw new Error('Missing 3D model viewport');

const MODELS = {
  muscular: {
    path: '/models/human-muscular.glb',
    label: 'Modelo muscular humano fornecido para o SISP.'
  },
  skeleton: {
    path: '/models/human-skeleton.glb',
    label: 'Modelo do esqueleto humano fornecido para o SISP.'
  }
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'Modelo humano 3D; arraste para girar e use a roda para aproximar');
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b111a);

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI - 0.08;

scene.add(new THREE.HemisphereLight(0xffffff, 0x776f66, 2.25));
const keyLight = new THREE.DirectionalLight(0xfff4e8, 3.6);
keyLight.position.set(4, 6, 5);
keyLight.castShadow = true;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xd9e8ff, 2.1);
fillLight.position.set(-4, 3, 4);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 2.3);
rimLight.position.set(0, 4, -5);
scene.add(rimLight);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let modelRoot = null;
let currentModel = '';
let cardiacAlertMode = false;

const cardiacMarker = new THREE.Group();
const cardiacDisc = new THREE.Mesh(
  new THREE.CircleGeometry(1, 64),
  new THREE.MeshBasicMaterial({ color: 0xef493e, transparent: true, opacity: 0.16, depthTest: false, depthWrite: false })
);
const cardiacRing = new THREE.Mesh(
  new THREE.RingGeometry(0.72, 1, 64),
  new THREE.MeshBasicMaterial({ color: 0xff5147, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
);
cardiacDisc.renderOrder = 100;
cardiacRing.renderOrder = 101;
cardiacMarker.add(cardiacDisc, cardiacRing);
cardiacMarker.visible = false;
scene.add(cardiacMarker);

function positionCardiacMarker() {
  if (!modelRoot) return;
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  cardiacMarker.position.set(
    center.x + size.x * 0.035,
    bounds.min.y + size.y * 0.72,
    bounds.max.z + size.z * 0.045
  );
  const markerSize = Math.max(size.x * 0.078, size.y * 0.015);
  cardiacMarker.userData.baseScale = markerSize;
  cardiacMarker.scale.setScalar(markerSize);
}

function setCardiacAlert(mode) {
  cardiacAlertMode = mode;
  cardiacMarker.visible = Boolean(mode);
  cardiacRing.material.color.set(0xff5147);
  cardiacDisc.material.color.set(0xef493e);
  positionCardiacMarker();
}

window.sispBody3D = { setCardiacAlert };

function disposeModel(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    materials.forEach(material => material.dispose());
  });
}

function frameModel() {
  if (!modelRoot) return;
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const verticalDistance = size.y / 2 / Math.tan(verticalFov / 2);
  const horizontalDistance = size.x / 2 / Math.tan(horizontalFov / 2);
  const distance = Math.max(verticalDistance, horizontalDistance, size.z) * 1.1;

  controls.target.copy(center);
  controls.minDistance = Math.max(distance * 0.12, 0.01);
  controls.maxDistance = Math.max(distance * 4, 1);
  camera.near = Math.max(distance / 1000, 0.001);
  camera.far = Math.max(distance * 20, 100);
  camera.position.set(center.x + size.x * 0.04, center.y, center.z + distance);
  camera.updateProjectionMatrix();
  controls.update();
}

async function loadModel(kind) {
  const model = MODELS[kind] || MODELS.muscular;
  if (currentModel === kind && modelRoot) return;

  loading.hidden = false;
  failure.hidden = true;
  modelSelect.disabled = true;

  if (modelRoot) {
    scene.remove(modelRoot);
    disposeModel(modelRoot);
    modelRoot = null;
  }

  try {
    const gltf = await loader.loadAsync(model.path);
    modelRoot = gltf.scene;
    modelRoot.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    scene.add(modelRoot);
    if (cardiacAlertMode) setCardiacAlert(cardiacAlertMode);
    currentModel = kind;
    if (modelCaption) modelCaption.textContent = model.label;
    frameModel();
  } catch (error) {
    console.error(`Falha ao carregar ${model.path}:`, error);
    failure.hidden = false;
  } finally {
    loading.hidden = true;
    modelSelect.disabled = false;
  }
}

function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(viewport);
modelSelect?.addEventListener('change', event => loadModel(event.target.value));
document.getElementById('body3d-reset')?.addEventListener('click', frameModel);

resize();
const dashboardScreen = document.getElementById('dashboard-screen');
if (!dashboardScreen?.hidden) loadModel(modelSelect?.value || 'muscular');

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (cardiacMarker.visible) {
    cardiacMarker.quaternion.copy(camera.quaternion);
    const pulse = 1 + Math.sin(performance.now() * 0.009) * (cardiacAlertMode === 'recovery' ? 0.06 : 0.13);
    cardiacMarker.scale.setScalar((cardiacMarker.userData.baseScale || 1) * pulse);
    cardiacRing.material.opacity = 0.78 + Math.sin(performance.now() * 0.012) * 0.2;
  }
  renderer.render(scene, camera);
}

animate();
