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

// Add these variables at the top to track temporary matrices
let tempSrcPoint = null;
let tempDstPoint = null;

// Add these variables at the top to track matrices used in dragging
let dragSrcPoint = null;
let dragDstPoint = null;
let dragTransformMatrix = null;

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
  const width = 500;
  const height = 300;

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

  // Check if we're clicking on a warped artwork
  if (warpedArtwork && isPointInWarpedArtwork(x, y)) {
    isArtworkDragging = true;
    lastMousePos = { x, y };
    imageCanvas.style.cursor = 'grabbing';
    return;
  }

  // Check for corner point dragging (existing code)
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

// Modify the mousemove event handler
imageCanvas.addEventListener('mousemove', function (evt) {
  if (!imgLoaded) return;

  const rect = imageCanvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;

  // Handle artwork dragging
  if (isArtworkDragging && M) {
    try {
      // Clean up previous matrices before creating new ones
      cleanupDragMatrices();

      // Create new matrices for this drag operation
      dragSrcPoint = cv.matFromArray(1, 1, cv.CV_32FC2, [x, y]);
      dragDstPoint = new cv.Mat();
      
      // Create a copy of transformation matrix to avoid deletion issues
      dragTransformMatrix = M.clone();
      
      // Transform the point
      cv.perspectiveTransform(dragSrcPoint, dragDstPoint, dragTransformMatrix);
      
      // Update position only if transformation was successful
      if (dragDstPoint && dragDstPoint.rows > 0 && dragDstPoint.cols > 0) {
        warpedArtworkPosition.x = dragDstPoint.data32F[0];
        warpedArtworkPosition.y = dragDstPoint.data32F[1];

        // Redraw canvases
        requestAnimationFrame(() => {
          redrawWarpedCanvas();
          updateTransformedArtwork();
        });
      }

      lastMousePos = { x, y };
    } catch (error) {
      console.error('Error during drag operation:', error);
    } finally {
      // Clean up matrices used in this drag operation
      cleanupDragMatrices();
    }
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

// Modify mouseup event handler
imageCanvas.addEventListener('mouseup', function () {
  isDragging = false;
  isArtworkDragging = false;
  selectedPoint = null;
  imageCanvas.style.cursor = 'default';
  
  // Only cleanup temporary drag matrices, not the transformation matrices
  cleanupDragMatrices();
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

  // Get real wall dimensions in meters
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


function updateArtworkDestPoints(artworkMesh) {
  // Get the background mesh
  const bgMesh = scene.children.find(child => child instanceof THREE.Mesh && child.userData.name === "background");

  // Get dimensions
  const bgWidth = bgMesh.geometry.parameters.width;
  const bgHeight = bgMesh.geometry.parameters.height;

  // Calculate artwork's position relative to background mesh
  // Convert from three.js coordinates (centered) to top-left based coordinates
  const relativeX = Math.abs(artworkMesh.position.x - artworkMesh.geometry.parameters.width / 2 + bgWidth / 2);  // Distance from left edge
  const relativeY = Math.abs(artworkMesh.position.y + artworkMesh.geometry.parameters.height / 2 - bgHeight / 2)  // Distance from top edge

  console.log(relativeX, relativeY, "00000000");
  console.log(artworkMesh.position.x, artworkMesh.position.y, bgWidth, bgHeight, artworkMesh.geometry.parameters.width, artworkMesh.geometry.parameters.height, "11111111");

  // Calculate the vectors that define the perspective transformation

  const topRightEdgeVector = {
    x: srcPoints[1].x - srcPoints[0].x,
    y: srcPoints[1].y - srcPoints[0].y
  };
  const rightBottomEdgeVector = {
    x: srcPoints[2].x - srcPoints[1].x,
    y: srcPoints[2].y - srcPoints[1].y
  };
  const bottomLeftEdgeVector = {
    x: srcPoints[3].x - srcPoints[2].x,
    y: srcPoints[3].y - srcPoints[2].y
  };
  const leftTopEdgeVector = {
    x: srcPoints[3].x - srcPoints[0].x,
    y: srcPoints[3].y - srcPoints[0].y
  };

  // Calculate ratios of position relative to background size
  const xRatio = relativeX / bgWidth;
  const yRatio = relativeY / bgHeight;

  // Get real wall dimensions in meters
  const realWidth = parseFloat(realWidthInput.value);
  const realHeight = parseFloat(realHeightInput.value);

  // Calculate the starting point by interpolating along the edges of the drawn rectangle
  const startX = srcPoints[0].x + (topRightEdgeVector.x * xRatio) +
    (leftTopEdgeVector.x * yRatio);
  const startY = srcPoints[0].y + (topRightEdgeVector.y * xRatio) +
    (leftTopEdgeVector.y * yRatio);


  // Calculate pixels per meter for scaling
  const rectangleLeftEdge = Math.sqrt(
    Math.pow(srcPoints[3].x - srcPoints[0].x, 2) +
    Math.pow(srcPoints[3].y - srcPoints[0].y, 2)
  );
  const rectangleRightEdge = Math.sqrt(
    Math.pow(srcPoints[2].x - srcPoints[1].x, 2) +
    Math.pow(srcPoints[2].y - srcPoints[1].y, 2)
  );

  // Calculate scale factors
  const scaleFactorWidth = artworkCanvas.width / realWidth * (1 - xRatio * (1 - rectangleRightEdge / rectangleLeftEdge));
  const scaleFactorHeight = artworkCanvas.height / realHeight * (1 - xRatio * (1 - rectangleRightEdge / rectangleLeftEdge));

  // Calculate new destination points
  const artworkDestPoints = [
    { // top-left
      x: startX,
      y: startY
    },
    { // top-right
      x: startX + (topRightEdgeVector.x * scaleFactorWidth),
      y: startY + (topRightEdgeVector.y * scaleFactorWidth)
    },
    { // bottom-right
      x: startX + (topRightEdgeVector.x * scaleFactorWidth) +
        (rightBottomEdgeVector.x * scaleFactorHeight),
      y: startY + (topRightEdgeVector.y * scaleFactorWidth) +
        (rightBottomEdgeVector.y * scaleFactorHeight)
    },
    { // bottom-left
      x: startX + (topRightEdgeVector.x * scaleFactorWidth) +
        (rightBottomEdgeVector.x * scaleFactorHeight) +
        (bottomLeftEdgeVector.x * scaleFactorWidth),
      y: startY + (topRightEdgeVector.y * scaleFactorWidth) +
        (rightBottomEdgeVector.y * scaleFactorHeight) +
        (bottomLeftEdgeVector.y * scaleFactorWidth)
    }
  ];

  return {
    destPoints: artworkDestPoints,
    srcPoints: [
      0, 0,                          // top-left
      artworkCanvas.width, 0,        // top-right
      artworkCanvas.width, artworkCanvas.height,  // bottom-right
      0, artworkCanvas.height        // bottom-left
    ]
  };
}

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
  if (!warpedArtwork || !M || !artworkPosition) return false;

  let clickPoint = null;
  let transformedPoint = null;
  
  try {
    // Create a point matrix for the click coordinates
    clickPoint = cv.matFromArray(1, 1, cv.CV_32FC2, [x, y]);
    transformedPoint = new cv.Mat();
    
    // Transform the point to warped space
    cv.perspectiveTransform(clickPoint, transformedPoint, M);
    
    // Get the transformed coordinates
    const tx = transformedPoint.data32F[0];
    const ty = transformedPoint.data32F[1];
    
    // Check if the transformed point is within the warped artwork bounds
    return tx >= warpedArtworkPosition.x &&
           tx <= warpedArtworkPosition.x + artworkCanvas.width &&
           ty >= warpedArtworkPosition.y &&
           ty <= warpedArtworkPosition.y + artworkCanvas.height;
  } catch (error) {
    console.error('Error in isPointInWarpedArtwork:', error);
    return false;
  } finally {
    // Clean up
    if (clickPoint) {
      clickPoint.delete();
    }
    if (transformedPoint) {
      transformedPoint.delete();
    }
  }
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
  if (!artworkLoaded || !Minv) return;

  try {
    // Create temporary matrices for the transformation
    let artworkPoints = null;
    let transformedArtworkPoints = null;
    let artworkTransformMatrix = null;

    // First, restore the original background image
    ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.drawImage(img, 0, 0);

    // Get artwork corners in warped space
    const artworkCorners = [
      { x: warpedArtworkPosition.x, y: warpedArtworkPosition.y },
      { x: warpedArtworkPosition.x + artworkCanvas.width, y: warpedArtworkPosition.y },
      { x: warpedArtworkPosition.x + artworkCanvas.width, y: warpedArtworkPosition.y + artworkCanvas.height },
      { x: warpedArtworkPosition.x, y: warpedArtworkPosition.y + artworkCanvas.height }
    ];

    // Create matrices
    artworkPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      artworkCorners[0].x, artworkCorners[0].y,
      artworkCorners[1].x, artworkCorners[1].y,
      artworkCorners[2].x, artworkCorners[2].y,
      artworkCorners[3].x, artworkCorners[3].y
    ]);

    transformedArtworkPoints = new cv.Mat();
    
    // Create a copy of inverse transformation matrix
    artworkTransformMatrix = Minv.clone();
    
    // Transform points
    cv.perspectiveTransform(artworkPoints, transformedArtworkPoints, artworkTransformMatrix);

    // Draw the warped artwork
    if (transformedArtworkPoints && transformedArtworkPoints.rows > 0) {
      const p = transformedArtworkPoints.data32F;
      
      // Create temporary canvas for the warped artwork
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageCanvas.width;
      tempCanvas.height = imageCanvas.height;
      
      // Draw the warped artwork
      const tempCtx = tempCanvas.getContext('2d');
      drawWarpedArtwork(tempCtx, p);
      
      // Draw the result on the main canvas
      ctx.drawImage(tempCanvas, 0, 0);
      
      // Clean up
      tempCanvas.remove();
    }

    // Clean up matrices
    if (artworkPoints) artworkPoints.delete();
    if (transformedArtworkPoints) transformedArtworkPoints.delete();
    if (artworkTransformMatrix) artworkTransformMatrix.delete();

  } catch (error) {
    console.error('Error in updateTransformedArtwork:', error);
  }
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

// Update the cleanupDragMatrices function
function cleanupDragMatrices() {
  if (dragSrcPoint) {
    dragSrcPoint.delete();
    dragSrcPoint = null;
  }
  if (dragDstPoint) {
    dragDstPoint.delete();
    dragDstPoint = null;
  }
  // Don't delete dragTransformMatrix since it's a clone of M
  dragTransformMatrix = null;
}

// Update the cleanup function to only clean up when actually closing/reloading page
function cleanup() {
  cleanupDragMatrices();
  
  // Only clean up these matrices when actually closing/reloading the page
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

// Add this function to draw the warped artwork
function drawWarpedArtwork(context, points) {
  if (!artworkLoaded || !artworkCanvas) return;

  context.save();
  
  // Begin a new path for the warped shape
  context.beginPath();
  context.moveTo(points[0], points[1]);
  context.lineTo(points[2], points[3]);
  context.lineTo(points[4], points[5]);
  context.lineTo(points[6], points[7]);
  context.closePath();
  
  // Create clipping path
  context.clip();
  
  // Transform the context to match the warped perspective
  const sourcePoints = [
    0, 0,
    artworkCanvas.width, 0,
    artworkCanvas.width, artworkCanvas.height,
    0, artworkCanvas.height
  ];
  
  // Calculate the transformation matrix
  const transform = PerspT([
    { x: sourcePoints[0], y: sourcePoints[1] },
    { x: sourcePoints[2], y: sourcePoints[3] },
    { x: sourcePoints[4], y: sourcePoints[5] },
    { x: sourcePoints[6], y: sourcePoints[7] }
  ], [
    { x: points[0], y: points[1] },
    { x: points[2], y: points[3] },
    { x: points[4], y: points[5] },
    { x: points[6], y: points[7] }
  ]);
  
  const matrix = transform.coeffs;
  context.transform(
    matrix[0], matrix[3],
    matrix[1], matrix[4],
    matrix[2], matrix[5]
  );
  
  // Draw the artwork
  context.drawImage(artworkCanvas, 0, 0);
  
  context.restore();
}

// Add this PerspT helper function (or include the perspective-transform library)
function PerspT(from, to) {
  // Simple perspective transform calculation
  // This is a basic implementation - you might want to use a library like perspective-transform
  // for more robust calculations
  const eqMatrix = [];
  const targetMatrix = [];

  for (let i = 0; i < 4; i++) {
    const sourceX = from[i].x;
    const sourceY = from[i].y;
    const targetX = to[i].x;
    const targetY = to[i].y;

    eqMatrix.push([sourceX, sourceY, 1, 0, 0, 0, -sourceX * targetX, -sourceY * targetX]);
    eqMatrix.push([0, 0, 0, sourceX, sourceY, 1, -sourceX * targetY, -sourceY * targetY]);
    targetMatrix.push(targetX);
    targetMatrix.push(targetY);
  }

  const coeffs = solve(eqMatrix, targetMatrix);
  return {
    coeffs: [...coeffs, 1],
    transform: function(x, y) {
      const denominator = coeffs[6] * x + coeffs[7] * y + 1;
      return {
        x: (coeffs[0] * x + coeffs[1] * y + coeffs[2]) / denominator,
        y: (coeffs[3] * x + coeffs[4] * y + coeffs[5]) / denominator
      };
    }
  };
}

// Add helper function to solve the equation system
function solve(matrix, vector) {
  const n = matrix.length;
  
  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[j][i]) > Math.abs(matrix[maxRow][i])) {
        maxRow = j;
      }
    }

    [matrix[i], matrix[maxRow]] = [matrix[maxRow], matrix[i]];
    [vector[i], vector[maxRow]] = [vector[maxRow], vector[i]];

    for (let j = i + 1; j < n; j++) {
      const factor = matrix[j][i] / matrix[i][i];
      vector[j] -= factor * vector[i];
      for (let k = i; k < n; k++) {
        matrix[j][k] -= factor * matrix[i][k];
      }
    }
  }

  // Back substitution
  const solution = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += matrix[i][j] * solution[j];
    }
    solution[i] = (vector[i] - sum) / matrix[i][i];
  }

  return solution;
}
