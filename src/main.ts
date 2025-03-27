import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { DragControls } from 'three/examples/jsm/Addons.js';
import { sliceGeometry } from './utils/slice';

import { LoadingManager } from 'three';

import "./style.css";


const modelsElement = document.querySelector('.models');
const modelButtons = modelsElement ? Array.from(modelsElement.children) : [];
const modelPaths = {
  car : "models/car.glb",
  cat : "models/cat.glb",
  box : "models/box.glb",
  monkey : "models/monkey.glb"
}
// Setting up three js scene________________________________________________________________
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdda15e);

const size = {
  width: window.innerWidth,
  height: window.innerHeight
};

const camera = new THREE.PerspectiveCamera(
  75,
  size.width / size.height,
  0.1,
  100
);
camera.position.set(0, 0, 4);

const originalPositions = new Map<THREE.Object3D, THREE.Vector3>();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(size.width, size.height);
renderer.setPixelRatio(window.devicePixelRatio || 1);
document.body.appendChild(renderer.domElement);

// setting up slice svg_____________________________________________________________________
const svgPath =  "http://www.w3.org/2000/svg";
const svg = document.createElementNS(svgPath, "svg");
svg.classList.add("svg");
document.body.appendChild(svg)

const line = document.createElementNS(svgPath, "line")
line.setAttribute("stroke", "white");
line.setAttribute("stroke-width", "2");
line.setAttribute("stroke-dasharray", "5,5");
line.setAttribute("display", "none");
svg.appendChild(line);

// SVG Variables____________________________________________________________________________
let isDragging = false;
let startX:number = 0;
let startY:number = 0;
let endX = 0;
let endY = 0;

let canCut = true;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const startPoint3D = new THREE.Vector3();
const endPoint3D = new THREE.Vector3();

const selector = new THREE.Raycaster();

function toNDC(x:number, y:number) {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: ((x - rect.left) / rect.width) * 2 - 1,
    y: -((y - rect.top) / rect.height) * 2 + 1,
  };
}

let draggableObjects: THREE.Object3D[] = []
let selectedObjects: THREE.Object3D[] = [];

let dragControls = new DragControls(draggableObjects, camera, renderer.domElement)
dragControls.enabled = false;

let sliced:THREE.Object3D[] = [];
// Cutting events____________________________________________________________________________
renderer.domElement.addEventListener("mousedown", (event) => {
  if(canCut){
    selectedObjects = [];
    sliced = [];
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
  
    line.setAttribute("x1", startX.toString());
    line.setAttribute("y1", startY.toString());
    line.setAttribute("x2", startX.toString());
    line.setAttribute("y2", startY.toString());
    line.setAttribute("display", "block");
  
    const ndc = toNDC(startX, startY);
    mouse.x = ndc.x;
    mouse.y = ndc.y;
    raycaster.setFromCamera(mouse, camera);
  
    startPoint3D.copy(raycaster.ray.origin).addScaledVector(
      raycaster.ray.direction,
      -raycaster.ray.origin.z / raycaster.ray.direction.z
    )
  }
})

window.addEventListener("mousemove", (event) => {
  if(isDragging) {
    endX = event.clientX;
    endY = event.clientY;

    line.setAttribute("x2", endX.toString());
    line.setAttribute("y2", endY.toString());

    const ndc = toNDC(endX, endY);
    mouse.x = ndc.x;
    mouse.y = ndc.y;
    raycaster.setFromCamera(mouse, camera);

    endPoint3D
      .copy(raycaster.ray.origin)
      .addScaledVector(
        raycaster.ray.direction,
        -raycaster.ray.origin.z / raycaster.ray.direction.z
      );
    selectSplitModel(mouse)
  }
})

// let splitObj = null;

function selectSplitModel(mouse:THREE.Vector2){
  selector.setFromCamera(mouse, camera);
  const intersects = selector.intersectObjects(
      scene.children.filter((obj) => obj instanceof THREE.Mesh || obj instanceof THREE.Group),
      true
    );
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      
      // Tracking objects to slice
      if (!selectedObjects.some(selectedObj => selectedObj === obj)) {
        selectedObjects.push(obj);
      }
    }
}

window.addEventListener("mouseup", () => {
  if(isDragging){
    isDragging = false;
    line.setAttribute("display", "none");

    if(Math.abs(startX - endX) > 5 || Math.abs(startY - endY) > 5){
      const direction = new THREE.Vector3()
        .subVectors(endPoint3D, startPoint3D)
        .normalize();

      const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(
        camera.quaternion
      );
      const normal = new THREE.Vector3()
        .crossVectors(direction, cameraDirection)
        .normalize();

      const midPoint = new THREE.Vector3()
        .addVectors(startPoint3D, endPoint3D)
        .multiplyScalar(0.5);
      const distance = normal.dot(midPoint);

      // const offsets = {
      //   front: normal.clone().multiplyScalar(0.1),
      //   back: normal.clone().negate().multiplyScalar(0.1)
      // }

      const plane = new THREE.Plane(normal.clone(), -distance);
      // const planeHelper = new THREE.PlaneHelper(plane);
      // scene.add(planeHelper)

      Array.from(selectedObjects).forEach((obj) => {
        // splitModel(obj, plane, offsets);
        splitModel(obj, plane);
      });
  
      // selectedObjects.clear();
    }
  }
})


// loading manager
const loadingSpiral = document.querySelector(".loader-overlay") as HTMLDivElement | null;
if (!loadingSpiral) {
  throw new Error("Loader overlay element not found");
}

const manager = new LoadingManager();
manager.onStart = function(){
  loadingSpiral.style.display = "inline-block"
}
manager.onLoad = function(){
  loadingSpiral.style.display = "none"
}

function splitModel(obj:THREE.Object3D, plane:THREE.Plane){

  const meshes = []

  let currentParent = obj;
  
  while (currentParent.parent && currentParent.parent !== scene) {
    currentParent = currentParent.parent;
  }
  if(sliced.includes(currentParent)) return;
  sliced.push(currentParent);

  if(currentParent instanceof THREE.Group){
    
    const frontGroup = new THREE.Group()
    const backGroup = new THREE.Group()

    currentParent.traverse((child) => {
      if(child instanceof THREE.Mesh){
        const material = child.material;
        const {front, back} = sliceGeometry(child.geometry, plane, true, child);
        
        const frontMesh = new THREE.Mesh(front, material);
        const backMesh = new THREE.Mesh(back, material);
        
        // frontMesh.position.add(offsets.front);
        // backMesh.position.add(offsets.back);
        
        frontGroup.add(frontMesh);
        backGroup.add(backMesh);
        // meshes.push(frontMesh);
        // meshes.push(backMesh);
        
        //Storing positions
        originalPositions.set(frontMesh, frontMesh.position.clone());
        originalPositions.set(backMesh, backMesh.position.clone());
      }
    })
    scene.add(frontGroup);
    scene.add(backGroup);
    draggableObjects.push(frontGroup)
    draggableObjects.push(backGroup)
  }
  else if(currentParent instanceof THREE.Mesh){
    const material = currentParent.material;
    const {front, back} = sliceGeometry(currentParent.geometry, plane, true, currentParent);
    
    const frontMesh = new THREE.Mesh(front, material);
    const backMesh = new THREE.Mesh(back, material);
    
    // frontMesh.position.add(offsets.front);
    // backMesh.position.add(offsets.back);
    // Store original positions for new meshes
    originalPositions.set(frontMesh, frontMesh.position.clone());
    originalPositions.set(backMesh, backMesh.position.clone());
    
    meshes.push(frontMesh);
    meshes.push(backMesh);
    scene.add(...meshes)
    draggableObjects.push(...meshes)
  }
  scene.remove(currentParent);
  originalPositions.delete(currentParent);
  const index = draggableObjects.indexOf(currentParent);
  if (index !== -1) {
    draggableObjects.splice(index, 1);
  }
  console.log(draggableObjects)
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;

const modeToggler = document.querySelector(".mode-toggle");

modeToggler?.addEventListener("click", function(){
  modeToggler.innerHTML = modeToggler.innerHTML === "CUTTING"?"DRAGGING":"CUTTING";
  dragControls.enabled = !dragControls.enabled;
  if(dragControls.enabled){
    canCut = false
  }
  else{
    canCut = true;
    originalPositions.forEach((originalPosition, child) => {
      child.position.copy(originalPosition);
    });
  }
})

// const geometry = new THREE.BoxGeometry(1, 1, 1);
// const material = new THREE.MeshNormalMaterial();
// const box = new THREE.Mesh(geometry, material);
// scene.add(box)


// const axis = new THREE.AxesHelper();
// scene.add(axis)

const loader = new GLTFLoader(manager);
loader.load("models/monkey.glb", function(gltf){
  const model = gltf.scene;
  draggableObjects.push(model);
  model.traverse((child) => {
    originalPositions.set(child, child.position.clone());
  })
  scene.add(model)
})

function removeAllModels(){
  draggableObjects = [];
  const objects = Array.from(originalPositions.keys())
  objects.forEach((child)=>{
    if (child.parent) {
      child.parent.remove(child);
    }
    
    if (child instanceof THREE.Mesh && child.geometry) {
      child.geometry.dispose();
    }
    if (child instanceof THREE.Mesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(material => material.dispose());
      } else {
        child.material.dispose();
      }
    }
    originalPositions.delete(child);
    scene.remove(child);
  })
}

function reuploadModel(modelName:string){

  removeAllModels();

  loader.load(modelPaths[modelName as keyof typeof modelPaths], function(gltf){
    const model = gltf.scene;
    if(modelName === "box"){
      const nrmlMaterial = new THREE.MeshNormalMaterial();
      model.traverse((child) => {
        originalPositions.set(child, child.position.clone());
        if(child instanceof THREE.Mesh){
          child.material = nrmlMaterial;
          child.material.side = THREE.DoubleSide;
        }
      })
    }
    else{
      model.traverse((child) => {
        originalPositions.set(child, child.position.clone());
      })
    }
    draggableObjects.push(model);
    dragControls.dispose();
    dragControls = new DragControls(draggableObjects, camera, renderer.domElement);
    dragControls.enabled = !canCut;
    scene.add(model)
  })
}

const ambient = new THREE.AmbientLight(0xdddddd, 2);
scene.add(ambient);

const point = new THREE.PointLight("white", 0.5);
scene.add(point)

const direction = new THREE.DirectionalLight(0xffffff, 1);
scene.add(direction)

window.addEventListener("resize", () => {
  size.width = window.innerWidth;
  size.height = window.innerHeight;
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  renderer.setSize(size.width, size.height);
});

modelButtons.forEach((btn) => {
  btn.addEventListener("click", function(){
    const btnText = btn.textContent?.toLowerCase();
    if (btnText) {
      reuploadModel(btnText);
    }
  })
})


// const clock = new THREE.Clock();
function animate() {
  // const deltaTime = clock.getDelta();

  // controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
