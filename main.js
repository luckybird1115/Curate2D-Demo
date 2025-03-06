
// Remove the old onOpenCvReady definition
// async function onOpenCvReady() { window.cv = await window.cv }

// We'll keep references to some DOM elements
const imageLoader = document.getElementById('imageLoader');
const imageCanvas = document.getElementById('imageCanvas');
const warpedCanvas = document.getElementById('warpedCanvas');
const warpButton = document.getElementById('warpButton');
const realWidthInput = document.getElementById('realWidth');
const realHeightInput = document.getElementById('realHeight');

const ctx = imageCanvas.getContext('2d');
const warpCtx = warpedCanvas.getContext('2d');

let img = new Image();
let imgLoaded = false;
let clickCount = 0;
const srcPoints = []; // will store [{x, y}, ...]

// --- Load the image when user selects it ---
imageLoader.addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

// Once the image is loaded, draw it on imageCanvas
img.onload = function () {
  imgLoaded = true;
  imageCanvas.width = img.width;
  imageCanvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  clickCount = 0;
  srcPoints.length = 0;
};

// Listen for clicks on the imageCanvas
imageCanvas.addEventListener('click', function (evt) {
  if (!imgLoaded) return;
  if (clickCount >= 4) {
    alert("You've already selected 4 points. Press 'Warp & Show in 3D' or reload image.");
    return;
  }

  // Get canvas bounding rect
  const rect = imageCanvas.getBoundingClientRect();
  // Mouse coordinates relative to canvas top-left corner
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;

  srcPoints.push({ x, y });
  clickCount++;

  // Draw a small marker
  ctx.fillStyle = "red";
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.fill();

  // Optionally label them
  ctx.fillStyle = "yellow";
  ctx.font = "16px sans-serif";
  ctx.fillText(clickCount, x + 8, y + 5);

  if (clickCount === 4) {
    console.log("4 points selected: ", srcPoints);
  }
});

// --- Perform warp and show in 3D when user clicks "Warp & Show in 3D" ---
warpButton.addEventListener('click', function () {
  if (!imgLoaded || srcPoints.length < 4) {
    alert("Please load an image and select 4 points first.");
    return;
  }
  if (typeof cv === 'undefined') {
    alert("OpenCV.js is not ready yet. Please wait a moment and try again.");
    return;
  }

  // We get real size from the user
  const realWidth = parseFloat(realWidthInput.value);
  const realHeight = parseFloat(realHeightInput.value);

  // Perform perspective transform in OpenCV.js
  // 1) Create OpenCV.js Mats
  let srcMat = cv.imread(imageCanvas);
  let dstMat = new cv.Mat();
  let dsize = new cv.Size(realWidth, realHeight);

  // 2) Set src/dst point data (in pixel coords).
  // We want the warped output to have a dimension of realWidth x realHeight (in pixels).
  // In practice, you might map them to some standard pixel dimension, e.g. 1000x500, 
  // or scale by some factor. For demonstration, let's do 1:1 pixel to "units."
  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    srcPoints[0].x, srcPoints[0].y,
    srcPoints[1].x, srcPoints[1].y,
    srcPoints[2].x, srcPoints[2].y,
    srcPoints[3].x, srcPoints[3].y
  ]);

  // We'll map to these corners in the warped image:
  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    realWidth, 0,
    realWidth, realHeight,
    0, realHeight
  ]);

  // 3) Compute perspective transform
  let M = cv.getPerspectiveTransform(srcTri, dstTri);

  // 4) Warp perspective
  cv.warpPerspective(
    srcMat, dstMat, M, dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  // Display result in #warpedCanvas
  warpedCanvas.width = realWidth;
  warpedCanvas.height = realHeight;
  cv.imshow(warpedCanvas, dstMat);

  // Free memory
  srcMat.delete();
  dstMat.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();

  // Then use three.js to display a plane of size (realWidth x realHeight)
  // textured with the warped image
  renderThreeScene(warpedCanvas, realWidth, realHeight);
});

// --- three.js scene creation ---
let renderer, scene, camera;
function initThree() {
  const container = document.getElementById('threeContainer');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Create a basic scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  // Create camera
  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    10000
  );
  camera.position.set(0, 0, 600);
  scene.add(camera);

  // Add a simple directional light
  const light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.position.set(0, 0, 1000).normalize();
  scene.add(light);
}

function renderThreeScene(warpCanvas, realW, realH) {
  // If first time, init the scene
  if (!renderer) {
    initThree();
  } else {
    // Clear existing objects from the scene if you want a fresh update
    // This is optional, depending on your design
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
    scene.add(camera);
  }

  // Create texture from the warpedCanvas
  const texture = new THREE.Texture(warpCanvas);
  // Must flag for update
  texture.needsUpdate = true;

  // Plane geometry with dimension = realW x realH
  const geometry = new THREE.PlaneGeometry(realW, realH);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);

  // Adjust mesh position so it's centered in the scene
  mesh.position.set(0, 0, 0);

  scene.add(mesh);

  // Now re-render
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}