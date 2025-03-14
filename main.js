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
let artworkLoaded = false;
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
let isArtworkDragging = false;
let artworkPosition = { x: 0, y: 0 };
let lastMousePos = { x: 0, y: 0 };
let warpedArtwork = null; // To store the warped artwork image
let isWarpedArtworkDragging = false;
let warpedLastMousePos = { x: 0, y: 0 };
let warpedArtworkPosition = { x: 0, y: 0 };
let Minv = null;
let dstMat = null;
let M = null;

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

  // First check if we're clicking on the artwork
  if (artworkPosition && isPointInArtwork(x, y)) {
    console.log("Clicking on artwork");
    isArtworkDragging = true;
    lastMousePos = { x, y };
    imageCanvas.style.cursor = 'grabbing';
    return;
  }

  // If not clicking artwork, check for corner point dragging (existing code)
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

  // Handle artwork dragging
  if (isArtworkDragging) {
    const dx = x - lastMousePos.x;
    const dy = y - lastMousePos.y;

    artworkPosition.x += dx;
    artworkPosition.y += dy;

    lastMousePos = { x, y };
    redrawCanvas();
    return;
  }

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
  isArtworkDragging = false;
  selectedPoint = null;
  imageCanvas.style.cursor = 'default';
});

// Add this new function to redraw the canvas
function redrawCanvas() {
  // Clear canvas and redraw image
  ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  ctx.drawImage(img, 0, 0);

  // Draw the warped artwork if it exists
  if (artworkLoaded && warpedArtwork && artworkPosition) {
    ctx.drawImage(warpedArtwork, artworkPosition.x, artworkPosition.y);
  }

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

  // Set the warped canvas size to match real dimensions
  warpedCanvas.width = realWidth;
  warpedCanvas.height = realHeight;

  // Clean up any existing matrices
  if (dstMat) dstMat.delete();
  if (Minv) Minv.delete();
  if (M) M.delete();

  // Create new matrices
  let srcMat = cv.imread(imageCanvas);
  dstMat = new cv.Mat();
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

  // Store matrices globally
  M = cv.getPerspectiveTransform(srcTri, dstTri);
  Minv = cv.getPerspectiveTransform(dstTri, srcTri);

  // Warp background image
  cv.warpPerspective(srcMat, dstMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  cv.imshow(warpedCanvas, dstMat);

  // Add artwork to top-left corner of warped canvas if it's loaded
  if (artworkLoaded) {
    // Initialize warped artwork position at top-left
    warpedArtworkPosition = { x: 0, y: 0 };
    warpedLastMousePos = { x: 0, y: 0 };
    isWarpedArtworkDragging = false;
    
    // Draw artwork
    warpCtx.drawImage(
      artworkCanvas,
      warpedArtworkPosition.x,
      warpedArtworkPosition.y,
      artworkCanvas.width,
      artworkCanvas.height
    );
    
    // Store the warped artwork for later use
    warpedArtwork = artworkCanvas;

    // Initial transform to image canvas
    updateTransformedArtwork();
  }

  // Transform the green rectangle corners back to image canvas
  const rectCorners = [
    { x: 700, y: 0 },          // top-left
    { x: 800, y: 0 },          // top-right
    { x: 800, y: 50 },         // bottom-right
    { x: 700, y: 50 }          // bottom-left
  ];

  // Convert corners to matrix format
  let rectPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    rectCorners[0].x, rectCorners[0].y,
    rectCorners[1].x, rectCorners[1].y,
    rectCorners[2].x, rectCorners[2].y,
    rectCorners[3].x, rectCorners[3].y
  ]);

  // Transform points
  let transformedPoints = new cv.Mat();
  cv.perspectiveTransform(rectPoints, transformedPoints, Minv);
  // Free memory
  srcMat.delete();
  srcTri.delete();
  dstTri.delete();
  transformedPoints.delete();

});


// Add this helper function to check if a point is within the artwork bounds
function isPointInArtwork(x, y) {
  if (!artworkPosition || !warpedArtwork) return false;

  return x >= artworkPosition.x &&
    x <= artworkPosition.x + warpedArtwork.width &&
    y >= artworkPosition.y &&
    y <= artworkPosition.y + warpedArtwork.height;
}

// Add these helper functions
function isPointInWarpedArtwork(x, y) {
  if (!warpedArtworkPosition || !artworkCanvas) return false;
  
  const artworkBounds = {
    left: warpedArtworkPosition.x,
    right: warpedArtworkPosition.x + artworkCanvas.width,
    top: warpedArtworkPosition.y,
    bottom: warpedArtworkPosition.y + artworkCanvas.height
  };

  return x >= artworkBounds.left && 
         x <= artworkBounds.right && 
         y >= artworkBounds.top && 
         y <= artworkBounds.bottom;
}

function redrawWarpedCanvas() {
  if (!dstMat) return;  // Add safety check
  
  const warpCtx = warpedCanvas.getContext('2d');
  // Clear canvas
  warpCtx.clearRect(0, 0, warpedCanvas.width, warpedCanvas.height);
  
  // Redraw warped background
  cv.imshow(warpedCanvas, dstMat);

  // Draw artork at current position
  if (artworkLoaded) {
    warpCtx.drawImage(
      artworkCanvas,
      warpedArtworkPosition.x,
      warpedArtworkPosition.y,
      artworkCanvas.width,
      artworkCanvas.height
    );
  }
}

function updateTransformedArtwork() {
  if (!artworkLoaded || !Minv) return;  // Add safety check

  // Get artwork corners in warped space
  const artworkCorners = [
    { x: warpedArtworkPosition.x, y: warpedArtworkPosition.y }, // top-left
    { x: warpedArtworkPosition.x + artworkCanvas.width, y: warpedArtworkPosition.y }, // top-right
    { x: warpedArtworkPosition.x + artworkCanvas.width, y: warpedArtworkPosition.y + artworkCanvas.height }, // bottom-right
    { x: warpedArtworkPosition.x, y: warpedArtworkPosition.y + artworkCanvas.height } // bottom-left
  ];

  // Convert to matrix format
  let artworkPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    artworkCorners[0].x, artworkCorners[0].y,
    artworkCorners[1].x, artworkCorners[1].y,
    artworkCorners[2].x, artworkCorners[2].y,
    artworkCorners[3].x, artworkCorners[3].y
  ]);

  // Transform points
  let transformedArtworkPoints = new cv.Mat();
  cv.perspectiveTransform(artworkPoints, transformedArtworkPoints, Minv);

  // Redraw original canvas
  ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  ctx.drawImage(img, 0, 0);

  // Draw transformed artwork shape
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0, 255, 255, 0.5)'; // semi-transparent cyan
  ctx.moveTo(transformedArtworkPoints.data32F[0], transformedArtworkPoints.data32F[1]);
  for (let i = 2; i < transformedArtworkPoints.data32F.length; i += 2) {
    ctx.lineTo(transformedArtworkPoints.data32F[i], transformedArtworkPoints.data32F[i + 1]);
  }
  ctx.closePath();
  ctx.fill();

  // Update stored position for original canvas
  artworkPosition = {
    x: transformedArtworkPoints.data32F[0],
    y: transformedArtworkPoints.data32F[1]
  };

  // Clean up
  artworkPoints.delete();
  transformedArtworkPoints.delete();
}

// Add or update these event listeners for the warped canvas
warpedCanvas.addEventListener('mousedown', function(evt) {
  if (!artworkLoaded) return;

  const rect = warpedCanvas.getBoundingClientRect();
  // Calculate the scale factor in case the canvas is being displayed at a different size
  const scaleX = warpedCanvas.width / rect.width;
  const scaleY = warpedCanvas.height / rect.height;
  
  // Get the actual position in canvas coordinates
  const x = (evt.clientX - rect.left) * scaleX;
  const y = (evt.clientY - rect.top) * scaleY;

  // Check if clicking on artwork
  if (isPointInWarpedArtwork(x, y)) {
    isWarpedArtworkDragging = true;
    warpedLastMousePos = { x, y };
    warpedCanvas.style.cursor = 'grabbing';
  }
});

warpedCanvas.addEventListener('mousemove', function(evt) {
  if (!isWarpedArtworkDragging) return;

  const rect = warpedCanvas.getBoundingClientRect();
  const scaleX = warpedCanvas.width / rect.width;
  const scaleY = warpedCanvas.height / rect.height;
  
  const x = (evt.clientX - rect.left) * scaleX;
  const y = (evt.clientY - rect.top) * scaleY;

  const dx = x - warpedLastMousePos.x;
  const dy = y - warpedLastMousePos.y;

  warpedArtworkPosition.x += dx;
  warpedArtworkPosition.y += dy;

  warpedLastMousePos = { x, y };

  // Redraw warped canvas
  redrawWarpedCanvas();
  
  // Update transformed artwork position on original canvas
  updateTransformedArtwork();
});

warpedCanvas.addEventListener('mouseup', function() {
  isWarpedArtworkDragging = false;
  warpedCanvas.style.cursor = 'default';
});

warpedCanvas.addEventListener('mouseleave', function() {
  isWarpedArtworkDragging = false;
  warpedCanvas.style.cursor = 'default';
});

// Add cleanup function
function cleanup() {
  if (dstMat) {
    dstMat.delete();
    dstMat = null;
  }
  if (Minv) {
    Minv.delete();
    Minv = null;
  }
  if (M) {
    M.delete();
    M = null;
  }
}

// Add window unload handler to ensure cleanup
window.addEventListener('unload', cleanup);