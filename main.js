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

// Add this variable at the top of your file
let lastDragOperation = null;

// Add these variables at the top with other global variables
let dragOffset = { x: 0, y: 0 }; // Store the offset between click point and artwork top-left

// Add this line after getting the warpedCanvas element
warpedCanvas.style.display = 'none';

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
    
    // Calculate offset between click point and artwork top-left corner
    let clickPoint = cv.matFromArray(1, 1, cv.CV_32FC2, [x, y]);
    let transformedClick = new cv.Mat();
    
    try {
      cv.perspectiveTransform(clickPoint, transformedClick, M);
      dragOffset = {
        x: transformedClick.data32F[0] - warpedArtworkPosition.x,
        y: transformedClick.data32F[1] - warpedArtworkPosition.y
      };
    } finally {
      clickPoint.delete();
      transformedClick.delete();
    }
    
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
    if (lastDragOperation) {
      cancelAnimationFrame(lastDragOperation);
      lastDragOperation = null;
    }

    let srcPoint = null;
    let dstPoint = null;

    try {
      srcPoint = cv.matFromArray(1, 1, cv.CV_32FC2, [x, y]);
      dstPoint = new cv.Mat();

      if (!srcPoint.empty() && M && !M.empty()) {
        cv.perspectiveTransform(srcPoint, dstPoint, M);

        if (dstPoint && !dstPoint.empty()) {
          const newX = dstPoint.data32F[0];
          const newY = dstPoint.data32F[1];

          if (!isNaN(newX) && !isNaN(newY)) {
            // Update position accounting for the drag offset
            warpedArtworkPosition.x = newX - dragOffset.x;
            warpedArtworkPosition.y = newY - dragOffset.y;

            lastDragOperation = requestAnimationFrame(() => {
              try {
                redrawWarpedCanvas();
                updateTransformedArtwork();
              } catch (error) {
                console.error('Error in animation frame:', error);
              }
            });
          }
        }
      }

      lastMousePos = { x, y };
    } catch (error) {
      console.error('Error during drag operation:', error);
    } finally {
      if (srcPoint && !srcPoint.deleted) srcPoint.delete();
      if (dstPoint && !dstPoint.deleted) dstPoint.delete();
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

// Update mouseup event handler
imageCanvas.addEventListener('mouseup', function () {
  if (lastDragOperation) {
    cancelAnimationFrame(lastDragOperation);
    lastDragOperation = null;
  }

  isDragging = false;
  isArtworkDragging = false;
  selectedPoint = null;
  imageCanvas.style.cursor = 'default';
});

// Add mouseleave handler to ensure cleanup
imageCanvas.addEventListener('mouseleave', function () {
  if (lastDragOperation) {
    cancelAnimationFrame(lastDragOperation);
    lastDragOperation = null;
  }

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
  if (!dstMat) return;

  try {
    const warpCtx = warpedCanvas.getContext('2d');
    // Clear canvas
    warpCtx.clearRect(0, 0, warpedCanvas.width, warpedCanvas.height);

    // Redraw warped background
    cv.imshow(warpedCanvas, dstMat);

    // Draw artwork at current position
    if (artworkLoaded) {
      warpCtx.drawImage(
        artworkCanvas,
        warpedArtworkPosition.x,
        warpedArtworkPosition.y,
        artworkCanvas.width,
        artworkCanvas.height
      );
    }
  } catch (error) {
    console.error('Error in redrawWarpedCanvas:', error);
  }
}

function updateTransformedArtwork() {
  if (!artworkLoaded || !Minv) return;

  try {
    // Create temporary matrices for the transformation
    let artworkPoints = null;
    let transformedArtworkPoints = null;

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

    // Transform points
    cv.perspectiveTransform(artworkPoints, transformedArtworkPoints, Minv);

    // Draw the warped artwork
    if (transformedArtworkPoints && transformedArtworkPoints.rows > 0) {
      const points = transformedArtworkPoints.data32F;

      // Redraw the corner points and rectangle if they exist
      // Create matrices for the artwork transformation
      artworkSrcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        artworkCanvas.width, 0,
        artworkCanvas.width, artworkCanvas.height,
        0, artworkCanvas.height
      ]);

      artworkDstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        points[0], points[1],
        points[2], points[3],
        points[4], points[5],
        points[6], points[7]
      ]);


      // Create transformation matrix for the artwork
      let artworkTransformMatrix = cv.getPerspectiveTransform(artworkSrcPoints, artworkDstPoints);

      let artworkDstMat = new cv.Mat();

      // Create size object for the destination
      let dsize = new cv.Size(imageCanvas.width, imageCanvas.height);

      // Create a temporary canvas for the artwork with transparency
      let tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageCanvas.width;
      tempCanvas.height = imageCanvas.height;
      let tempCtx = tempCanvas.getContext('2d');

      // Clear temp canvas with transparency
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

      // Draw only the artwork onto the temp canvas
      tempCtx.drawImage(artworkCanvas, 0, 0);

      // Convert the temp canvas to an OpenCV matrix
      let tempMat = cv.imread(tempCanvas);

      // Perform the perspective warp with transparent background
      cv.warpPerspective(
        tempMat,
        artworkDstMat,
        artworkTransformMatrix,
        dsize,
        cv.INTER_LINEAR,
        cv.BORDER_TRANSPARENT,
        new cv.Scalar(0, 0, 0, 0)  // Fully transparent background
      );

      // Create another temporary canvas for the final composition
      let finalTempCanvas = document.createElement('canvas');
      finalTempCanvas.width = imageCanvas.width;
      finalTempCanvas.height = imageCanvas.height;

      // Show the warped artwork on the temp canvas
      cv.imshow(finalTempCanvas, artworkDstMat);

      // 3. Clear the main canvas and draw the composite
      ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.drawImage(finalTempCanvas, 0, 0);
      // Clean up temporary canvases
      finalTempCanvas.remove();

      // Update stored position for original canvas
      artworkPosition = {
        x: transformedArtworkPoints.data32F[0],
        y: transformedArtworkPoints.data32F[1]
      };

      artworkTransformMatrix.delete();
      tempMat.delete();
      artworkDstMat.delete();

    }

    // Clean up matrices
    if (artworkPoints) artworkPoints.delete();
    if (transformedArtworkPoints) transformedArtworkPoints.delete();

  } catch (error) {
    console.error('Error in updateTransformedArtwork:', error);
  }
}


// Update the cleanup function to be more thorough
function cleanup() {
  // Clean up drag-related matrices
  cleanupDragMatrices();

  // Clean up transformation matrices
  if (dstMat && !dstMat.deleted) {
    dstMat.delete();
    dstMat = null;
  }
  if (Minv && !Minv.deleted) {
    Minv.delete();
    Minv = null;
  }
  if (M && !M.deleted) {
    M.delete();
    M = null;
  }
}

// Add this function to handle matrix cleanup during drag operations
function cleanupDragMatrices() {
  if (tempSrcPoint && !tempSrcPoint.deleted) {
    tempSrcPoint.delete();
    tempSrcPoint = null;
  }
  if (tempDstPoint && !tempDstPoint.deleted) {
    tempDstPoint.delete();
    tempDstPoint = null;
  }
  if (dragSrcPoint && !dragSrcPoint.deleted) {
    dragSrcPoint.delete();
    dragSrcPoint = null;
  }
  if (dragDstPoint && !dragDstPoint.deleted) {
    dragDstPoint.delete();
    dragDstPoint = null;
  }
}

// Add window unload handler to ensure cleanup
window.addEventListener('unload', cleanup);
