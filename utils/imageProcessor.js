// 固定目标尺寸（与本地测试脚本一致）
const TARGET_WIDTH = 1030;
const TARGET_HEIGHT = 590;
const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;

// 区域坐标定义（按照用户提供的新坐标）
const REGIONS = {
  productCode: { x1: 143, x2: 435, y1: 67, y2: 143 },
  sensor1: { x1: 255, x2: 435, y1: 106, y2: 200 },
  sensor2: { x1: 725, x2: 895, y1: 106, y2: 200 },
  sensor3: { x1: 255, x2: 435, y1: 363, y2: 456 },
  sensor4: { x1: 725, x2: 895, y1: 363, y2: 456 }
};

let Tesseract = null;

async function loadTesseract() {
  if (Tesseract) return Tesseract;
  
  try {
    Tesseract = await import('tesseract.js');
    console.log('✓ Tesseract.js 加载成功');
    return Tesseract;
  } catch (error) {
    console.error('❌ Tesseract.js 加载失败:', error);
    throw error;
  }
}

export async function processImage(file) {
  return new Promise(async (resolve) => {
    try {
      await loadTesseract();
      
      const img = new Image();
      img.onload = async () => {
        console.log(`原始图片尺寸: ${img.width} x ${img.height}`);
        
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(img, 0, 0);
        
        let rect = detectScreenByEdge(srcCtx, img.width, img.height);
        
        if (!rect) {
          console.log('❌ 边缘检测失败，尝试蓝色掩膜检测');
          rect = detectScreenByBlueMask(srcCtx, img.width, img.height);
          
          if (rect) {
            console.log(`蓝色掩膜检测成功，获取到角点: TL(${rect[0].x},${rect[0].y}) TR(${rect[1].x},${rect[1].y}) BR(${rect[2].x},${rect[2].y}) BL(${rect[3].x},${rect[3].y})`);
            if (!isValidAspectRatio(rect)) {
              console.log('⚠️ 蓝色掩膜检测结果不符合 1030:590 比例');
              rect = null;
            }
          } else {
            console.log('❌ 蓝色掩膜检测也失败');
          }
        } else {
          console.log('✓ 边缘检测成功');
        }
        
        if (!rect) {
          console.log('⚠️ 启用几何兜底：使用图片中心区域');
          rect = getCenterQuadrilateral(img.width, img.height);
          console.log(`兜底区域: TL(${rect[0].x},${rect[0].y}) TR(${rect[1].x},${rect[1].y}) BR(${rect[2].x},${rect[2].y}) BL(${rect[3].x},${rect[3].y})`);
        }
        
        const tl = rect[0];
        const tr = rect[1];
        const br = rect[2];
        const bl = rect[3];
        
        const dstPts = [
          { x: 0, y: 0 },
          { x: TARGET_WIDTH, y: 0 },
          { x: TARGET_WIDTH, y: TARGET_HEIGHT },
          { x: 0, y: TARGET_HEIGHT }
        ];
        
        const M = getPerspectiveTransform(rect, dstPts);
        
        const screenCanvas = document.createElement('canvas');
        screenCanvas.width = TARGET_WIDTH;
        screenCanvas.height = TARGET_HEIGHT;
        const screenCtx = screenCanvas.getContext('2d');
        applyPerspectiveTransform(screenCtx, img, M, TARGET_WIDTH, TARGET_HEIGHT);
        
        const results = await extractReadingsFromPerspectiveImage(screenCtx);
        resolve(results);
      };
      img.onerror = () => {
        resolve({ success: false, error: '图片加载失败' });
      };
      img.src = URL.createObjectURL(file);
    } catch (error) {
      console.error('图像处理错误:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

function detectScreenByEdge(ctx, width, height) {
  console.log(`\n=== 纯 JS 边缘检测开始 ===`);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const edges = [];
  const gray = [];
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
  }
  
  const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          gx += gray[idx] * sobelX[ky + 1][kx + 1];
          gy += gray[idx] * sobelY[ky + 1][kx + 1];
        }
      }
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude > 80) {
        edges.push({ x, y });
      }
    }
  }
  
  console.log(`检测到 ${edges.length} 个边缘点`);
  
  if (edges.length < 100) {
    return null;
  }
  
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (const pt of edges) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  
  const detectedWidth = maxX - minX;
  const detectedHeight = maxY - minY;
  
  if (detectedWidth > 0 && detectedHeight > 0) {
    const ratio = detectedWidth / detectedHeight;
    const tolerance = 0.3;
    
    if (Math.abs(ratio - TARGET_RATIO) < tolerance) {
      console.log(`✓ 找到符合比例的边缘区域！宽高比: ${ratio.toFixed(3)}`);
      return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
      ];
    }
  }
  
  return null;
}

function detectScreenByBlueMask(ctx, width, height) {
  console.log(`\n=== 纯 JS 蓝色掩膜检测开始 ===`);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const blueMask = new Uint8ClampedArray(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      blueMask[y * width + x] = isBlue(r, g, b) ? 255 : 0;
    }
  }
  
  const bluePixelCount = blueMask.reduce((sum, val) => sum + (val > 0 ? 1 : 0), 0);
  console.log(`检测到 ${bluePixelCount} 个蓝色像素`);
  
  if (bluePixelCount < 100) {
    return null;
  }
  
  const closedMask = applyMorphologicalClose(blueMask, width, height, 20);
  console.log(`✓ 形态学闭运算完成`);
  
  const contours = findContours(closedMask, width, height);
  console.log(`✓ 轮廓检测完成，找到 ${contours.length} 个轮廓`);
  
  if (contours.length === 0) {
    return null;
  }
  
  let maxArea = 0;
  let largestContour = null;
  for (const contour of contours) {
    const area = calculateContourArea(contour);
    if (area > maxArea) {
      maxArea = area;
      largestContour = contour;
    }
  }
  
  if (!largestContour || largestContour.length < 4) {
    console.log('❌ 未找到有效轮廓');
    return null;
  }
  
  console.log(`最大轮廓面积: ${maxArea}, 点数: ${largestContour.length}`);
  
  let tl = null, tr = null, br = null, bl = null;
  let minSum = Infinity, maxSum = -Infinity, maxDiff = -Infinity, minDiff = Infinity;
  
  for (const pt of largestContour) {
    const sum = pt.x + pt.y;
    const diff = pt.x - pt.y;
    
    if (sum < minSum) { minSum = sum; tl = pt; }
    if (sum > maxSum) { maxSum = sum; br = pt; }
    if (diff > maxDiff) { maxDiff = diff; tr = pt; }
    if (diff < minDiff) { minDiff = diff; bl = pt; }
  }
  
  if (!tl || !tr || !br || !bl) {
    console.log('❌ 无法获取四个角点，返回null让几何兜底生效');
    return null;
  }
  
  console.log(`✓ 直接提取角点成功: TL(${tl.x},${tl.y}) TR(${tr.x},${tr.y}) BR(${br.x},${br.y}) BL(${bl.x},${bl.y})`);
  
  return [tl, tr, br, bl];
}

function applyMorphologicalClose(mask, width, height, kernelSize) {
  const halfKernel = Math.floor(kernelSize / 2);
  const result = new Uint8ClampedArray(mask.length);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hasWhite = false;
      for (let ky = -halfKernel; ky <= halfKernel; ky++) {
        for (let kx = -halfKernel; kx <= halfKernel; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (mask[ny * width + nx] > 0) {
              hasWhite = true;
              break;
            }
          }
        }
        if (hasWhite) break;
      }
      result[y * width + x] = hasWhite ? 255 : 0;
    }
  }
  
  const finalResult = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allWhite = true;
      for (let ky = -halfKernel; ky <= halfKernel; ky++) {
        for (let kx = -halfKernel; kx <= halfKernel; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (result[ny * width + nx] === 0) {
              allWhite = false;
              break;
            }
          } else {
            allWhite = false;
            break;
          }
        }
        if (!allWhite) break;
      }
      finalResult[y * width + x] = allWhite ? 255 : 0;
    }
  }
  
  return finalResult;
}

function findContours(mask, width, height) {
  const visited = new Uint8ClampedArray(mask.length);
  const contours = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0 && visited[y * width + x] === 0) {
        const contour = [];
        const stack = [{ x, y }];
        
        while (stack.length > 0) {
          const { x: cx, y: cy } = stack.pop();
          const idx = cy * width + cx;
          
          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
          if (mask[idx] === 0 || visited[idx] === 1) continue;
          
          visited[idx] = 1;
          contour.push({ x: cx, y: cy });
          
          stack.push({ x: cx + 1, y: cy });
          stack.push({ x: cx - 1, y: cy });
          stack.push({ x: cx, y: cy + 1 });
          stack.push({ x: cx, y: cy - 1 });
        }
        
        if (contour.length > 50) {
          contours.push(contour);
        }
      }
    }
  }
  
  return contours;
}

function calculateContourArea(contour) {
  if (contour.length < 3) return 0;
  
  let area = 0;
  const n = contour.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += contour[i].x * contour[j].y;
    area -= contour[j].x * contour[i].y;
  }
  
  return Math.abs(area / 2);
}

function getCenterQuadrilateral(width, height) {
  const imgRatio = width / height;
  
  let targetW, targetH;
  
  if (imgRatio > TARGET_RATIO) {
    targetH = height * 0.9;
    targetW = targetH * TARGET_RATIO;
  } else {
    targetW = width * 0.9;
    targetH = targetW / TARGET_RATIO;
  }
  
  const offsetX = (width - targetW) / 2;
  const offsetY = (height - targetH) / 2;
  
  return [
    { x: offsetX, y: offsetY },
    { x: offsetX + targetW, y: offsetY },
    { x: offsetX + targetW, y: offsetY + targetH },
    { x: offsetX, y: offsetY + targetH }
  ];
}

async function extractReadingsFromPerspectiveImage(screenCtx) {
  const readings = { "#1": 0, "#2": 0, "#3": 0, "#4": 0 };
  let productCode = "";
  
  try {
    const enhancedCanvas = document.createElement('canvas');
    enhancedCanvas.width = TARGET_WIDTH;
    enhancedCanvas.height = TARGET_HEIGHT;
    const enhancedCtx = enhancedCanvas.getContext('2d');
    
    const imageData = screenCtx.getImageData(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const isBlueBackground = isBlue(r, g, b);
      
      if (isBlueBackground) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
    
    enhancedCtx.putImageData(imageData, 0, 0);
    
    readings["#1"] = await recognizeNumberInRegion(enhancedCtx, REGIONS.sensor1);
    readings["#2"] = await recognizeNumberInRegion(enhancedCtx, REGIONS.sensor2);
    readings["#3"] = await recognizeNumberInRegion(enhancedCtx, REGIONS.sensor3);
    readings["#4"] = await recognizeNumberInRegion(enhancedCtx, REGIONS.sensor4);
    
    const labelCanvas = document.createElement('canvas');
    const labelW = REGIONS.productCode.x2 - REGIONS.productCode.x1;
    const labelH = REGIONS.productCode.y2 - REGIONS.productCode.y1;
    labelCanvas.width = labelW;
    labelCanvas.height = labelH;
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.drawImage(screenCtx.canvas, 
      REGIONS.productCode.x1, REGIONS.productCode.y1, labelW, labelH,
      0, 0, labelW, labelH);
    
    productCode = await recognizeProductCodeFromLabel(labelCtx, labelW, labelH);
    
    const totalWeight = readings["#1"] + readings["#2"] + readings["#3"] + readings["#4"];
    const avgWeight = totalWeight / 4;
    
    let cog = 0;
    if (totalWeight > 0) {
      const leftWeight = readings["#1"] + readings["#3"];
      const rightWeight = readings["#2"] + readings["#4"];
      cog = (rightWeight / totalWeight) * 150;
      console.log(`重心计算: #1=${readings["#1"].toFixed(2)} #2=${readings["#2"].toFixed(2)} #3=${readings["#3"].toFixed(2)} #4=${readings["#4"].toFixed(2)}`);
      console.log(`总重量=${totalWeight.toFixed(2)}, 左侧=${leftWeight.toFixed(2)}, 右侧=${rightWeight.toFixed(2)}, 重心=${cog.toFixed(4)}`);
    }
    
    return {
      success: true,
      w1: Math.round(readings["#1"] * 100) / 100,
      w2: Math.round(readings["#2"] * 100) / 100,
      w3: Math.round(readings["#3"] * 100) / 100,
      w4: Math.round(readings["#4"] * 100) / 100,
      avgWeight: Math.round(avgWeight * 100) / 100,
      cog: Math.round(cog * 10000) / 10000,
      productCode
    };
  } catch (error) {
    console.error('图像处理错误:', error);
    return {
      success: false,
      error: error.message,
      w1: 0, w2: 0, w3: 0, w4: 0,
      avgWeight: 0, cog: 0,
      productCode: ""
    };
  }
}

function isBlue(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  return h >= 200 && h <= 260 && s >= 50 && v >= 50;
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, v = max;
  
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  
  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
      default: h = 0;
    }
  }
  
  return [h * 360, s * 100, v * 100];
}

function isValidAspectRatio(corners) {
  if (!corners || corners.length !== 4) {
    return false;
  }
  
  const xs = corners.map(p => p.x);
  const ys = corners.map(p => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  
  if (width === 0 || height === 0) {
    return false;
  }
  
  const aspectRatio = width / height;
  const isValid = Math.abs(aspectRatio - TARGET_RATIO) < 0.25;
  
  console.log(`检测到的长宽比: ${aspectRatio.toFixed(3)}, 目标比例: ${TARGET_RATIO.toFixed(3)}, 有效: ${isValid}`);
  
  return isValid;
}

function getPerspectiveTransform(src, dst) {
  const m = [];
  
  for (let i = 0; i < 4; i++) {
    m.push([src[i].x, src[i].y, 1, 0, 0, 0, -src[i].x * dst[i].x, -src[i].y * dst[i].x]);
    m.push([0, 0, 0, src[i].x, src[i].y, 1, -src[i].x * dst[i].y, -src[i].y * dst[i].y]);
  }
  
  const b = [];
  for (let i = 0; i < 4; i++) {
    b.push(dst[i].x);
    b.push(dst[i].y);
  }
  
  const x = solveLinearSystem(m, b);
  
  return [
    [x[0], x[1], x[2]],
    [x[3], x[4], x[5]],
    [x[6], x[7], 1]
  ];
}

function solveLinearSystem(A, b) {
  const n = b.length;
  const aug = [];
  
  for (let i = 0; i < n; i++) {
    aug.push(A[i].concat(b[i]));
  }
  
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }
  
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }
  
  return x;
}

function applyPerspectiveTransform(ctx, img, M, width, height) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  const M00 = M[0][0], M01 = M[0][1], M02 = M[0][2];
  const M10 = M[1][0], M11 = M[1][1], M12 = M[1][2];
  const M20 = M[2][0], M21 = M[2][1], M22 = M[2][2];
  
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0);
  
  const srcImageData = srcCtx.getImageData(0, 0, img.width, img.height);
  const srcData = srcImageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const denom = M20 * x + M21 * y + M22;
      if (denom === 0) continue;
      
      const srcX = (M00 * x + M01 * y + M02) / denom;
      const srcY = (M10 * x + M11 * y + M12) / denom;
      
      const sx = Math.floor(srcX);
      const sy = Math.floor(srcY);
      
      if (sx >= 0 && sx < img.width - 1 && sy >= 0 && sy < img.height - 1) {
        const dx = srcX - sx;
        const dy = srcY - sy;
        
        const idx00 = (sy * img.width + sx) * 4;
        const idx10 = ((sy + 1) * img.width + sx) * 4;
        const idx01 = (sy * img.width + sx + 1) * 4;
        const idx11 = ((sy + 1) * img.width + sx + 1) * 4;
        
        for (let i = 0; i < 4; i++) {
          const val = 
            srcData[idx00 + i] * (1 - dx) * (1 - dy) +
            srcData[idx10 + i] * (1 - dx) * dy +
            srcData[idx01 + i] * dx * (1 - dy) +
            srcData[idx11 + i] * dx * dy;
          data[(y * width + x) * 4 + i] = Math.round(val);
        }
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

// ==================== 数字识别（使用 Tesseract OCR） ====================
async function recognizeNumberInRegion(ctx, region) {
  try {
    const { x1, x2, y1, y2 } = region;
    const w = x2 - x1;
    const h = y2 - y1;
    
    const regionCanvas = document.createElement('canvas');
    regionCanvas.width = w;
    regionCanvas.height = h;
    const regionCtx = regionCanvas.getContext('2d');
    regionCtx.drawImage(ctx.canvas, x1, y1, w, h, 0, 0, w, h);
    
    const processedCanvas = preprocessImageForOCR(regionCanvas);
    
    const { createWorker } = Tesseract;
    const worker = await createWorker('eng', 'https://tessdata.projectnaptha.com/4.0.0');
    
    const { data: { text } } = await worker.recognize(processedCanvas, {
      tessedit_char_whitelist: '0123456789.',
      tessedit_pageseg_mode: '7',
      user_defined_dpi: '300',
    });
    
    await worker.terminate();
    
    const cleanedText = text.trim().replace(/[^0-9.]/g, '');
    
    if (!cleanedText) {
      console.log(`Tesseract 未识别到数字，使用回退算法`);
      return fallbackRecognizeNumber(ctx, region);
    }
    
    const numValue = parseFloat(cleanedText);
    
    if (isNaN(numValue)) {
      console.log(`Tesseract 识别结果 "${cleanedText}" 无法解析，使用回退算法`);
      return fallbackRecognizeNumber(ctx, region);
    }
    
    console.log(`Tesseract 识别成功: "${cleanedText}" → ${numValue}`);
    return numValue;
    
  } catch (error) {
    console.error('Tesseract 识别错误:', error);
    return fallbackRecognizeNumber(ctx, region);
  }
}

// 图像预处理：灰度化、二值化、可选反色
function preprocessImageForOCR(inputCanvas, invert = true) {
  const width = inputCanvas.width;
  const height = inputCanvas.height;
  
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  ctx.drawImage(inputCanvas, 0, 0);
  const srcImageData = ctx.getImageData(0, 0, width, height);
  const srcData = srcImageData.data;
  
  for (let i = 0; i < srcData.length; i += 4) {
    const r = srcData[i];
    const g = srcData[i + 1];
    const b = srcData[i + 2];
    
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    
    const threshold = 128;
    let binary = gray < threshold ? 0 : 255;
    
    if (invert) {
      binary = 255 - binary;
    }
    
    data[i] = binary;
    data[i + 1] = binary;
    data[i + 2] = binary;
    data[i + 3] = 255;
  }
  
  ctx.putImageData(imageData, 0, 0);
  return outputCanvas;
}

function fallbackRecognizeNumber(ctx, region) {
  try {
    const { x1, x2, y1, y2 } = region;
    const w = x2 - x1;
    const h = y2 - y1;
    
    const imageData = ctx.getImageData(x1, y1, w, h);
    const data = imageData.data;
    
    const segDef = {
      a: { x: 25, y: 5, w: 50, h: 12 },
      b: { x: 72, y: 15, w: 12, h: 28 },
      c: { x: 72, y: 48, w: 12, h: 28 },
      d: { x: 25, y: 78, w: 50, h: 12 },
      e: { x: 8, y: 48, w: 12, h: 28 },
      f: { x: 8, y: 15, w: 12, h: 28 },
      g: { x: 25, y: 42, w: 50, h: 12 }
    };
    
    const segments = {};
    for (const [key, def] of Object.entries(segDef)) {
      const segX = Math.floor(def.x / 100 * w);
      const segY = Math.floor(def.y / 100 * h);
      const segW = Math.floor(def.w / 100 * w);
      const segH = Math.floor(def.h / 100 * h);
      
      segments[key] = isSegmentOnFallback(imageData, w, segX, segY, segW, segH);
    }
    
    const num = decodeSevenSegments(segments);
    const hasDecimal = detectDecimalPointFallback(ctx, x1, y1, w, h);
    
    console.log(`回退识别: 数字=${num}, 有小数点=${hasDecimal}`);
    
    return hasDecimal ? num + 0.5 : num;
    
  } catch (error) {
    console.error('回退识别错误:', error);
    return 0;
  }
}

function isSegmentOnFallback(imageData, width, x, y, w, h) {
  const data = imageData.data;
  let darkCount = 0;
  let total = 0;
  
  const startX = Math.max(0, x);
  const startY = Math.max(0, y);
  const endX = Math.min(width, x + w);
  const endY = Math.min(Math.floor(data.length / (4 * width)), y + h);
  
  for (let py = startY; py < endY; py++) {
    for (let px = startX; px < endX; px++) {
      const i = (py * width + px) * 4;
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness < 128) {
        darkCount++;
      }
      total++;
    }
  }
  
  return total > 0 && (darkCount / total) > 0.3;
}

function decodeSevenSegments(s) {
  if (s.a && s.b && s.c && s.d && s.e && s.f && !s.g) return 0;
  if (!s.a && s.b && s.c && !s.d && !s.e && !s.f && !s.g) return 1;
  if (s.a && s.b && !s.c && s.d && s.e && !s.f && s.g) return 2;
  if (s.a && s.b && s.c && s.d && !s.e && !s.f && s.g) return 3;
  if (!s.a && s.b && s.c && !s.d && !s.e && s.f && s.g) return 4;
  if (s.a && !s.b && s.c && s.d && !s.e && s.f && s.g) return 5;
  if (s.a && !s.b && s.c && s.d && s.e && s.f && s.g) return 6;
  if (s.a && s.b && s.c && !s.d && !s.e && !s.f && !s.g) return 7;
  if (s.a && s.b && s.c && s.d && s.e && s.f && s.g) return 8;
  if (s.a && s.b && s.c && s.d && !s.e && s.f && s.g) return 9;
  
  const onCount = Object.values(s).filter(v => v).length;
  if (onCount <= 2) return 1;
  if (onCount === 3) return 7;
  if (onCount === 4) return 4;
  if (onCount === 5) return 2;
  if (onCount === 6) return 0;
  if (onCount === 7) return 8;
  
  return 0;
}

function detectDecimalPointFallback(ctx, x, y, w, h) {
  const scanX = x + Math.floor(w * 0.7);
  const scanWidth = Math.floor(w * 0.25);
  const scanHeight = h;
  
  const imageData = ctx.getImageData(scanX, y, scanWidth, scanHeight);
  const data = imageData.data;
  
  for (let py = Math.floor(h * 0.3); py < Math.floor(h * 0.7); py++) {
    for (let px = 0; px < scanWidth; px++) {
      const i = (py * scanWidth + px) * 4;
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      
      if (brightness < 100) {
        let dotSize = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ny = py + dy;
            const nx = px + dx;
            if (ny >= 0 && ny < scanHeight && nx >= 0 && nx < scanWidth) {
              const ni = (ny * scanWidth + nx) * 4;
              if ((data[ni] + data[ni + 1] + data[ni + 2]) / 3 < 100) {
                dotSize++;
              }
            }
          }
        }
        
        if (dotSize >= 3 && dotSize <= 12) {
          return true;
        }
      }
    }
  }
  
  return false;
}

async function recognizeProductCodeFromLabel(ctx, width, height) {
  try {
    const processedCanvas = preprocessImageForOCR(ctx.canvas, false);
    
    const { createWorker } = Tesseract;
    const worker = await createWorker('eng', 'https://tessdata.projectnaptha.com/4.0.0');
    
    const { data: { text } } = await worker.recognize(processedCanvas, {
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      tessedit_pageseg_mode: '7',
      user_defined_dpi: '300',
    });
    
    await worker.terminate();
    
    const cleanedText = text.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    console.log(`产品编号识别: "${cleanedText}"`);
    
    return cleanedText;
    
  } catch (error) {
    console.error('产品编号识别错误:', error);
    return "";
  }
}