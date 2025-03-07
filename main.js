// Remove the old onOpenCvReady definition
// async function onOpenCvReady() { window.cv = await window.cv }

// We'll keep references to some DOM elements
const imageLoader = document.getElementById('imageLoader');
const drawButton = document.getElementById('drawButton');
const artworkLoader = document.getElementById('artworkLoader');
const artworkCanvas = document.getElementById('artworkCanvas');
const imageCanvas = document.getElementById('imageCanvas');
const warpedCanvas = document.getElementById('warpedCanvas');
const warpButton = document.getElementById('warpButton');
const realWidthInput = document.getElementById('realWidth');
const realHeightInput = document.getElementById('realHeight');

const ctx = imageCanvas.getContext('2d');
const artworkCtx = artworkCanvas.getContext('2d');
const warpCtx = warpedCanvas.getContext('2d');

let img = new Image();
let artworkImg = new Image();
let imgLoaded = false;
let clickCount = 0;
const srcPoints = []; // will store [{x, y}, ...]

// Add these variables at the top with other global variables
let isDragging = false;
let selectedPoint = null;
const dragRadius = 10; // Distance within which clicking will select a point
let artworkScale = 1.0;
const MAX_ARTWORK_DIMENSION = 200; // Maximum width or height in pixels
let artworkMesh = null;
let isDragging3D = false;
let previousMousePosition = { x: 0, y: 0 };

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

artworkLoader.addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    artworkImg.src = evt.target.result;
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

artworkImg.onload = function () {
  artworkLoaded = true;

  // Calculate scale to fit within MAX_ARTWORK_DIMENSION while maintaining aspect ratio
  const scaleW = MAX_ARTWORK_DIMENSION / artworkImg.width;
  const scaleH = MAX_ARTWORK_DIMENSION / artworkImg.height;
  artworkScale = Math.min(scaleW, scaleH, 1.0); // Don't scale up, only down

  // Set canvas size to scaled dimensions
  artworkCanvas.width = artworkImg.width * artworkScale;
  artworkCanvas.height = artworkImg.height * artworkScale;

  // Clear and draw scaled image
  artworkCtx.clearRect(0, 0, artworkCanvas.width, artworkCanvas.height);
  artworkCtx.save();
  artworkCtx.scale(artworkScale, artworkScale);
  artworkCtx.drawImage(artworkImg, 0, 0);
  artworkCtx.restore();

  // Add scale indicator text
  artworkCtx.fillStyle = 'yellow';
  artworkCtx.font = '14px Arial';
  artworkCtx.textAlign = 'left';
  artworkCtx.textBaseline = 'top';
  artworkCtx.fillText(`Scale: ${(artworkScale * 100).toFixed(1)}%`, 10, 10);
};

drawButton.addEventListener('click', function () {
  if (!imgLoaded) return;
  if (clickCount >= 4) {
    alert("You've already selected 4 points. Press 'Warp & Show in 3D' or reload image.");
    return;
  }

  // Calculate center of canvas
  const centerX = imageCanvas.width / 2;
  const centerY = imageCanvas.height / 2;

  // Rectangle dimensions
  const width = 300;
  const height = 150;

  // Calculate corner points
  const points = [
    { x: centerX - width / 2, y: centerY - height / 2 }, // top-left
    { x: centerX + width / 2, y: centerY - height / 2 }, // top-right
    { x: centerX + width / 2, y: centerY + height / 2 }, // bottom-right
    { x: centerX - width / 2, y: centerY + height / 2 }  // bottom-left
  ];

  // Draw rectangle
  ctx.beginPath();
  ctx.strokeStyle = 'black';
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Draw corner points and labels
  points.forEach((point, index) => {
    // Draw the point circle
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Draw the number label
    ctx.fillStyle = 'blue';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((index + 1).toString(), point.x + 10, point.y + 10);

    // Add point to srcPoints array
    srcPoints.push(point);
    clickCount++;
  });
});

// Modify the existing imageCanvas click listener to this:
imageCanvas.addEventListener('mousedown', function (evt) {
  if (!imgLoaded) return;

  const rect = imageCanvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;

  // Check if we clicked near any existing point
  for (let i = 0; i < srcPoints.length; i++) {
    const point = srcPoints[i];
    const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
    if (distance < dragRadius) {
      isDragging = true;
      selectedPoint = i;
      return;
    }
  }
});

// Add a mousemove event listener for hover effect
imageCanvas.addEventListener('mousemove', function (evt) {
  if (!imgLoaded) return;

  const rect = imageCanvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;

  // Check if we're hovering over any point
  let isOverPoint = false;
  for (let i = 0; i < srcPoints.length; i++) {
    const point = srcPoints[i];
    const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
    if (distance < dragRadius) {
      isOverPoint = true;
      break;
    }
  }

  // Change cursor style based on hover and drag state
  if (isDragging) {
    imageCanvas.style.cursor = 'grabbing';
  } else if (isOverPoint) {
    imageCanvas.style.cursor = 'grab';
  } else {
    imageCanvas.style.cursor = 'default';
  }

  // If we're dragging, update point position
  if (isDragging && selectedPoint !== null) {
    // Update the point position
    srcPoints[selectedPoint].x = x;
    srcPoints[selectedPoint].y = y;
    // Redraw everything
    redrawCanvas();
  }
});

// Update mouseup to reset cursor
imageCanvas.addEventListener('mouseup', function () {
  isDragging = false;
  selectedPoint = null;
  imageCanvas.style.cursor = 'default';
});

// Add this new function to redraw the canvas
function redrawCanvas() {
  // Clear canvas
  ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);

  // Redraw image
  ctx.drawImage(img, 0, 0);

  // Draw rectangle
  if (srcPoints.length === 4) {
    ctx.beginPath();
    ctx.strokeStyle = 'black';
    ctx.moveTo(srcPoints[0].x, srcPoints[0].y);
    for (let i = 1; i < srcPoints.length; i++) {
      ctx.lineTo(srcPoints[i].x, srcPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw corner points and labels
    srcPoints.forEach((point, index) => {
      // Draw the point circle
      ctx.fillStyle = selectedPoint === index ? 'yellow' : 'red';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
      ctx.fill();

      // Draw the number label - changed color to blue and position follows point
      ctx.fillStyle = 'blue';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), point.x + 10, point.y + 10);
    });
  }
}

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

  // Get real size from the user
  const realWidth = parseFloat(realWidthInput.value);
  const realHeight = parseFloat(realHeightInput.value);

  // 1) Transform the background image first
  let srcMat = cv.imread(imageCanvas);
  let dstMat = new cv.Mat();
  let dsize = new cv.Size(realWidth, realHeight);

  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    srcPoints[0].x, srcPoints[0].y,
    srcPoints[1].x, srcPoints[1].y,
    srcPoints[2].x, srcPoints[2].y,
    srcPoints[3].x, srcPoints[3].y
  ]);

  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    realWidth, 0,
    realWidth, realHeight,
    0, realHeight
  ]);

  // Compute perspective transform matrix
  let M = cv.getPerspectiveTransform(srcTri, dstTri);

  // Warp background image
  cv.warpPerspective(
    srcMat, dstMat, M, dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  // 2) Transform the artwork if it's loaded
  if (artworkLoaded) {
    // Create Mat from artwork canvas
    let artworkMat = cv.imread(artworkCanvas);
    let artworkWarped = new cv.Mat();

    // Split the artwork into channels (including alpha)
    let channels = new cv.MatVector();
    cv.split(artworkMat, channels);

    // Calculate artwork position in the warped space
    const artworkX = artworkMesh ? artworkMesh.position.x + realWidth / 2 : realWidth / 2;
    const artworkY = artworkMesh ? -artworkMesh.position.y + realHeight / 2 : realHeight / 2;

    // Create transformation matrix for artwork
    let artworkDstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      artworkX - (artworkCanvas.width / 2), artworkY - (artworkCanvas.height / 2),
      artworkX + (artworkCanvas.width / 2), artworkY - (artworkCanvas.height / 2),
      artworkX + (artworkCanvas.width / 2), artworkY + (artworkCanvas.height / 2),
      artworkX - (artworkCanvas.width / 2), artworkY + (artworkCanvas.height / 2)
    ]);

    // Get perspective transform for artwork
    let artworkM = cv.getPerspectiveTransform(dstTri, srcTri);

    // Warp artwork
    cv.warpPerspective(
      artworkMat,
      artworkWarped,
      artworkM,
      new cv.Size(imageCanvas.width, imageCanvas.height),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 0)  // Transparent background
    );

    // Split the warped result into channels
    let warpedChannels = new cv.MatVector();
    cv.split(artworkWarped, warpedChannels);

    // Create a mask from the alpha channel
    let mask = warpedChannels.get(3);  // Alpha channel
    let maskInv = new cv.Mat();
    cv.bitwise_not(mask, maskInv);

    // Apply the mask to blend images
    let tempMat = new cv.Mat();
    srcMat.copyTo(tempMat);
    artworkWarped.copyTo(tempMat, mask);
    tempMat.copyTo(srcMat);

    // Clean up
    channels.delete();
    warpedChannels.delete();
    mask.delete();
    maskInv.delete();
    tempMat.delete();
    artworkMat.delete();
    artworkWarped.delete();
    artworkM.delete();
  }

  // Display result in imageCanvas
  cv.imshow(imageCanvas, srcMat);

  // Display warped result in warpedCanvas
  cv.imshow(warpedCanvas, dstMat);

  // Free memory
  srcMat.delete();
  dstMat.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();

  // Update three.js scene
  renderThreeScene(warpedCanvas, realWidth, realHeight);
  if (artworkLoaded) {
    addArtworkToScene();
  }
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

  // Add event listeners for dragging AFTER renderer is initialized
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
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
  const bgMesh = new THREE.Mesh(geometry, material);
  bgMesh.userData.name = "background";

  // Adjust mesh position so it's centered in the scene
  bgMesh.position.set(0, 0, 0);

  scene.add(bgMesh);

  // Now re-render
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

// Add these new functions
function addArtworkToScene() {
  const artworkTexture = new THREE.Texture(artworkCanvas);
  artworkTexture.needsUpdate = true;

  const geometry = new THREE.PlaneGeometry(
    artworkCanvas.width,
    artworkCanvas.height
  );
  const material = new THREE.MeshBasicMaterial({
    map: artworkTexture,
    side: THREE.DoubleSide,
    transparent: true
  });

  // Remove existing artwork mesh if it exists
  if (artworkMesh) {
    scene.remove(artworkMesh);
  }

  artworkMesh = new THREE.Mesh(geometry, material);

  // Get the background mesh dimensions
  const bgMesh = scene.children.find(child => child instanceof THREE.Mesh && child.userData.name === "background");
  const bgWidth = bgMesh.geometry.parameters.width;
  const bgHeight = bgMesh.geometry.parameters.height;

  // Calculate position to place artwork at top-left
  // Offset by half the artwork dimensions because the mesh pivot is at its center
  const xPos = -bgWidth / 2 + artworkCanvas.width;
  const yPos = bgHeight / 2 - artworkCanvas.height / 2;

  artworkMesh.position.set(xPos, yPos, 1);
  scene.add(artworkMesh);
}

// Add these event listeners for dragging
function onMouseDown(event) {
  if (!artworkMesh) return;

  isDragging3D = true;
  previousMousePosition = {
    x: event.clientX,
    y: event.clientY
  };
}

function onMouseMove(event) {
  if (!isDragging3D || !artworkMesh) return;

  const deltaMove = {
    x: event.clientX - previousMousePosition.x,
    y: event.clientY - previousMousePosition.y
  };

  // Convert mouse movement to world space movement
  const movementSpeed = 1;
  const newX = artworkMesh.position.x + deltaMove.x * movementSpeed;
  const newY = artworkMesh.position.y - deltaMove.y * movementSpeed;

  // Get the dimensions of both meshes
  const bgGeometry = scene.children.find(child => child !== artworkMesh && child instanceof THREE.Mesh).geometry;
  const artworkGeometry = artworkMesh.geometry;

  // Calculate the bounds
  const bgWidth = bgGeometry.parameters.width;
  const bgHeight = bgGeometry.parameters.height;
  const artworkWidth = artworkGeometry.parameters.width;
  const artworkHeight = artworkGeometry.parameters.height;

  // Calculate the maximum allowed positions
  const maxX = (bgWidth - artworkWidth) / 2;
  const maxY = (bgHeight - artworkHeight) / 2;

  // Constrain the position within bounds
  artworkMesh.position.x = Math.max(-maxX, Math.min(maxX, newX));
  artworkMesh.position.y = Math.max(-maxY, Math.min(maxY, newY));

  previousMousePosition = {
    x: event.clientX,
    y: event.clientY
  };

}

function onMouseUp() {
  isDragging3D = false;
}