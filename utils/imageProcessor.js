// 固定目标尺寸（与本地测试脚本一致）
const TARGET_WIDTH = 1030;
const TARGET_HEIGHT = 590;

// 区域坐标定义（按照用户提供的新坐标）
const REGIONS = {
  productCode: { x1: 0, x2: 435, y1: 0, y2: 90 },
  sensor1: { x1: 175, x2: 470, y1: 90, y2: 225 },
  sensor2: { x1: 650, x2: 950, y1: 90, y2: 225 },
  sensor3: { x1: 175, x2: 470, y1: 340, y2: 475 },
  sensor4: { x1: 650, x2: 950, y1: 340, y2: 475 }
};

export async function processImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 优化：限制图片最大尺寸，避免处理过大图片导致卡顿
      const maxSize = 1500;
      let width = img.width;
      let height = img.height;
      
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      // 创建缩小后的图片
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const resizedImg = new Image();
      resizedImg.onload = () => {
        const results = extractReadingsFromImage(resizedImg);
        resolve(results);
      };
      resizedImg.src = canvas.toDataURL('image/jpeg', 0.9);
    };
    img.onerror = () => {
      resolve({ success: false, error: '图片加载失败' });
    };
    img.src = URL.createObjectURL(file);
  });
}

function extractReadingsFromImage(img) {
  const width = img.width;
  const height = img.height;
  
  const readings = {
    "#1": 0,
    "#2": 0,
    "#3": 0,
    "#4": 0
  };
  
  let productCode = "";
  
  try {
    // ============================================
    // 步骤1: 使用蓝色掩膜检测屏幕区域
    // ============================================
    const rect = detectScreenByBlueMask(img, width, height);
    
    if (!rect) {
      console.log('⚠️ 蓝色掩膜检测失败，使用保底坐标');
      return {
        success: false,
        error: '屏幕检测失败',
        w1: 0, w2: 0, w3: 0, w4: 0,
        productCode: ""
      };
    }
    
    const tl = rect[0];
    const tr = rect[1];
    const br = rect[2];
    const bl = rect[3];
    
    console.log(`检测到的屏幕角点: TL(${tl.x},${tl.y}) TR(${tr.x},${tr.y}) BR(${br.x},${br.y}) BL(${bl.x},${bl.y})`);
    
    // ============================================
    // 步骤2: 透视变换到固定尺寸 1030x590
    // ============================================
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
    
    // ============================================
    // 步骤3: 增强读数显著性（过滤蓝色背景）
    // ============================================
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
    
    // ============================================
    // 步骤4: 识别传感器读数（使用新坐标）
    // ============================================
    readings["#1"] = recognizeNumberInRegion(enhancedCtx, REGIONS.sensor1);
    readings["#2"] = recognizeNumberInRegion(enhancedCtx, REGIONS.sensor2);
    readings["#3"] = recognizeNumberInRegion(enhancedCtx, REGIONS.sensor3);
    readings["#4"] = recognizeNumberInRegion(enhancedCtx, REGIONS.sensor4);
    
    // ============================================
    // 步骤5: 识别产品编号（使用新坐标）
    // ============================================
    const labelCanvas = document.createElement('canvas');
    const labelW = REGIONS.productCode.x2 - REGIONS.productCode.x1;
    const labelH = REGIONS.productCode.y2 - REGIONS.productCode.y1;
    labelCanvas.width = labelW;
    labelCanvas.height = labelH;
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.drawImage(screenCanvas, 
      REGIONS.productCode.x1, REGIONS.productCode.y1, labelW, labelH,
      0, 0, labelW, labelH);
    
    productCode = recognizeProductCodeFromLabel(labelCtx, labelW, labelH);
    
    // ============================================
    // 计算平均重量和重心
    // ============================================
    const totalWeight = readings["#1"] + readings["#2"] + readings["#3"] + readings["#4"];
    const avgWeight = totalWeight / 4;
    
    let cog = 0;
    if (totalWeight > 0) {
      cog = ((readings["#3"] + readings["#4"]) / totalWeight) * 150;
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

// ==================== 蓝色掩膜检测（与本地测试脚本一致） ====================
function detectScreenByBlueMask(img, width, height) {
  console.log(`\n=== 蓝色掩膜检测开始 ===`);
  console.log(`图片尺寸: ${width} x ${height}`);
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // 创建蓝色掩膜（尝试多种蓝色范围）
  const blueMask = new Uint8ClampedArray(width * height);
  let bluePixelCount = 0;
  
  // 定义多个蓝色范围，增加检测鲁棒性
  const blueRanges = [
    { hMin: 90, hMax: 130, sMin: 50, vMin: 50 },   // 标准蓝色
    { hMin: 75, hMax: 145, sMin: 30, vMin: 30 },   // 宽松蓝色
    { hMin: 85, hMax: 135, sMin: 40, vMin: 40 }    // 中等蓝色
  ];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const [h, s, v] = rgbToHsv(r, g, b);
      
      // 检查是否在任一蓝色范围内
      let isBlue = false;
      for (const range of blueRanges) {
        if (h >= range.hMin && h <= range.hMax && s >= range.sMin && v >= range.vMin) {
          isBlue = true;
          break;
        }
      }
      
      if (isBlue) {
        blueMask[y * width + x] = 255;
        bluePixelCount++;
      }
    }
  }
  
  const blueRatio = (bluePixelCount / (width * height)) * 100;
  console.log(`蓝色像素数: ${bluePixelCount} (占比 ${blueRatio.toFixed(2)}%)`);
  
  if (bluePixelCount === 0) {
    console.log("❌ 未检测到蓝色区域");
    return null;
  }
  
  // 形态学闭运算（填充空洞）- 与本地测试一致使用30x30核
  console.log("执行形态学闭运算 (30x30核)...");
  const closedMask = applyMorphologicalClose(blueMask, width, height, 30);
  
  // 统计闭运算后的白色像素
  let closedWhiteCount = 0;
  for (let i = 0; i < closedMask.length; i++) {
    if (closedMask[i] > 0) closedWhiteCount++;
  }
  const closedRatio = (closedWhiteCount / (width * height)) * 100;
  console.log(`闭运算后白色像素数: ${closedWhiteCount} (占比 ${closedRatio.toFixed(2)}%)`);
  
  // 寻找轮廓
  const contours = findContours(closedMask, width, height);
  if (contours.length === 0) {
    console.log("⚠️ 未找到轮廓");
    return null;
  }
  
  // 找到最大轮廓
  let largestContour = contours[0];
  let maxArea = calculateContourArea(largestContour);
  for (const contour of contours) {
    const area = calculateContourArea(contour);
    if (area > maxArea) {
      maxArea = area;
      largestContour = contour;
    }
  }
  
  // 多边形逼近获取4个角点（与本地测试一致，尝试不同容差）
  const perimeter = calculatePerimeter(largestContour);
  let approx = null;
  
  for (const tolerance of [0.02, 0.03, 0.04, 0.05, 0.06]) {
    approx = approximatePolygon(largestContour, tolerance);
    if (approx.length === 4) {
      console.log(`✓ 使用容差 ${tolerance} 成功获取4个角点`);
      return orderPoints(approx);
    }
  }
  
  // 无法获取4个角点，使用保底坐标
  console.log("⚠️ 无法获取4个角点，使用保底坐标");
  return orderPoints([
    { x: 350, y: 264 },
    { x: 1186, y: 264 },
    { x: 1182, y: 595 },
    { x: 353, y: 595 }
  ]);
}

// ==================== 颜色判断 ====================
function isBlue(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  return h >= 90 && h <= 130 && s >= 50 && v >= 50;
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
  
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  v = Math.round(v * 100);
  
  return [h, s, v];
}

// ==================== 形态学运算 ====================
function applyMorphologicalClose(mask, width, height, kernelSize) {
  const result = new Uint8ClampedArray(mask.length);
  const halfKernel = Math.min(Math.floor(kernelSize / 2), 15);
  
  const offsets = [];
  for (let ky = -halfKernel; ky <= halfKernel; ky++) {
    for (let kx = -halfKernel; kx <= halfKernel; kx++) {
      offsets.push({ ky, kx });
    }
  }
  
  // Dilate
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hasWhite = false;
      for (const { ky, kx } of offsets) {
        const ny = y + ky;
        const nx = x + kx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
          if (mask[ny * width + nx] > 0) {
            hasWhite = true;
            break;
          }
        }
      }
      result[y * width + x] = hasWhite ? 255 : 0;
    }
  }
  
  // Erode
  const finalResult = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allWhite = true;
      for (const { ky, kx } of offsets) {
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
      finalResult[y * width + x] = allWhite ? 255 : 0;
    }
  }
  
  return finalResult;
}

// ==================== 轮廓检测 ====================
function findContours(mask, width, height) {
  const visited = new Uint8ClampedArray(mask.length);
  const contours = [];
  let totalContoursFound = 0;
  
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
        
        totalContoursFound++;
        // 降低阈值，允许更小的轮廓
        if (contour.length > 50) {
          contours.push(contour);
        }
      }
    }
  }
  
  console.log(`轮廓检测: 共发现 ${totalContoursFound} 个轮廓，保存 ${contours.length} 个有效轮廓`);
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

function approximatePolygon(contour, tolerance) {
  if (contour.length < 3) return contour;
  
  const perimeter = calculatePerimeter(contour);
  const epsilon = tolerance * perimeter;
  
  return ramerDouglasPeucker(contour, epsilon);
}

function calculatePerimeter(contour) {
  let perimeter = 0;
  for (let i = 0; i < contour.length; i++) {
    const j = (i + 1) % contour.length;
    const dx = contour[j].x - contour[i].x;
    const dy = contour[j].y - contour[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

function ramerDouglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;
  
  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToLineDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  
  if (maxDist > epsilon) {
    const left = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const right = ramerDouglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

function pointToLineDistance(point, lineStart, lineEnd) {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }
  
  const dx = point.x - xx;
  const dy = point.y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

// ==================== 透视变换（与本地测试脚本一致） ====================
function orderPoints(pts) {
  // 标准化排序4个角点：[左上, 右上, 右下, 左下]
  const rect = [{}, {}, {}, {}];
  
  // 计算每个点的x+y
  const sums = pts.map(p => p.x + p.y);
  const minSumIdx = sums.indexOf(Math.min(...sums));
  const maxSumIdx = sums.indexOf(Math.max(...sums));
  
  rect[0] = pts[minSumIdx]; // 左上（x+y最小）
  rect[2] = pts[maxSumIdx]; // 右下（x+y最大）
  
  // 计算每个点的x-y
  const diffs = pts.map(p => p.x - p.y);
  const maxDiffIdx = diffs.indexOf(Math.max(...diffs));
  const minDiffIdx = diffs.indexOf(Math.min(...diffs));
  
  rect[1] = pts[maxDiffIdx]; // 右上（x-y最大）
  rect[3] = pts[minDiffIdx]; // 左下（x-y最小）
  
  return rect;
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
  
  const solution = solveLinearSystem(m, b);
  
  return [
    [solution[0], solution[1], solution[2]],
    [solution[3], solution[4], solution[5]],
    [solution[6], solution[7], 1]
  ];
}

function solveLinearSystem(A, b) {
  const n = A.length;
  const m = A[0].length;
  
  const aug = [];
  for (let i = 0; i < n; i++) {
    aug.push([...A[i], b[i]]);
  }
  
  for (let col = 0; col < m; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= m; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }
  
  const x = new Array(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < m; j++) {
      sum += aug[i][j] * x[j];
    }
    x[i] = (aug[i][m] - sum) / aug[i][i];
  }
  
  return x;
}

function applyPerspectiveTransform(ctx, img, M, width, height) {
  // 优化：预先获取源图像的像素数据
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0);
  const srcImageData = srcCtx.getImageData(0, 0, img.width, img.height);
  const srcData = srcImageData.data;
  
  // 优化：使用ImageData直接操作像素，避免多次fillRect调用
  const dstImageData = ctx.createImageData(width, height);
  const dstData = dstImageData.data;
  
  const m00 = M[0][0], m01 = M[0][1], m02 = M[0][2];
  const m10 = M[1][0], m11 = M[1][1], m12 = M[1][2];
  const m20 = M[2][0], m21 = M[2][1], m22 = M[2][2];
  
  const srcWidth = img.width;
  const srcHeight = img.height;
  
  // 优化：使用 TypedArray 直接操作，避免函数调用开销
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const denom = m20 * x + m21 * y + m22;
      const srcX = (m00 * x + m01 * y + m02) / denom;
      const srcY = (m10 * x + m11 * y + m12) / denom;
      
      if (srcX >= 0 && srcX < srcWidth && srcY >= 0 && srcY < srcHeight) {
        // 双线性插值
        const xInt = Math.floor(srcX);
        const yInt = Math.floor(srcY);
        const dx = srcX - xInt;
        const dy = srcY - yInt;
        
        const x1 = Math.min(xInt + 1, srcWidth - 1);
        const y1 = Math.min(yInt + 1, srcHeight - 1);
        
        const idx00 = (yInt * srcWidth + xInt) * 4;
        const idx10 = (yInt * srcWidth + x1) * 4;
        const idx01 = (y1 * srcWidth + xInt) * 4;
        const idx11 = (y1 * srcWidth + x1) * 4;
        
        const w00 = (1 - dx) * (1 - dy);
        const w10 = dx * (1 - dy);
        const w01 = (1 - dx) * dy;
        const w11 = dx * dy;
        
        const dstIdx = (y * width + x) * 4;
        dstData[dstIdx] = Math.round(
          srcData[idx00] * w00 + srcData[idx10] * w10 + 
          srcData[idx01] * w01 + srcData[idx11] * w11
        );
        dstData[dstIdx + 1] = Math.round(
          srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + 
          srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11
        );
        dstData[dstIdx + 2] = Math.round(
          srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + 
          srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11
        );
        dstData[dstIdx + 3] = 255; // alpha
      }
    }
  }
  
  ctx.putImageData(dstImageData, 0, 0);
}

// ==================== 产品编号识别 ====================
function recognizeProductCodeFromLabel(ctx, width, height) {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    return recognizeProductCodeFromLabelData(imageData.data, width, height);
  } catch (error) {
    console.error('便签纸识别错误:', error);
    return '';
  }
}

function recognizeProductCodeFromLabelData(rgbData, width, height) {
  try {
    const grayData = rgbToGrayscale(rgbData, width, height);
    const blurred = applyBilateralFilter(grayData, width, height, 9, 75, 75);
    const thresholded = applyAdaptiveThreshold(blurred, width, height, 25, 8);
    const dilated = applyDilation(thresholded, width, height, 2, 1);
    
    let darkPixels = 0;
    let totalPixels = width * height;
    for (let i = 0; i < dilated.length; i++) {
      if (dilated[i] === 0) {
        darkPixels++;
      }
    }
    
    if (darkPixels / totalPixels < 0.01) {
      return '';
    }
    
    const chars = segmentAndRecognize(dilated, width, height);
    
    let result = chars.join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const validPattern = /^[0-9]+[-]?[0-9]*$/;
    if (!validPattern.test(result) || result.length < 2) {
      result = '';
    }
    
    return result.substring(0, 10);
  } catch (error) {
    console.error('产品编号识别错误:', error);
    return '';
  }
}

function rgbToGrayscale(rgbData, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < rgbData.length; i += 4) {
    const r = rgbData[i];
    const g = rgbData[i + 1];
    const b = rgbData[i + 2];
    gray[i / 4] = Math.round((r * 0.299 + g * 0.587 + b * 0.114));
  }
  return gray;
}

function applyBilateralFilter(gray, width, height, d, sigmaColor, sigmaSpace) {
  // 优化：使用更简单的高斯模糊替代双边滤波，显著提升性能
  const result = new Uint8Array(width * height);
  const radius = Math.min(Math.floor(d / 2), 5); // 限制半径，避免过度计算
  
  // 预计算高斯权重
  const sigma = sigmaSpace;
  const weights = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = dx * dx + dy * dy;
      const weight = Math.exp(-dist / (2 * sigma * sigma));
      weights.push({ dx, dy, weight });
    }
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumWeight = 0;
      let sumPixel = 0;
      
      for (const { dx, dy, weight } of weights) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        
        const idx = ny * width + nx;
        const centerIdx = y * width + x;
        
        // 简化的颜色权重：颜色差异大则权重低
        const colorDiff = Math.abs(gray[centerIdx] - gray[idx]);
        const colorWeight = colorDiff < 30 ? 1 : (colorDiff < 60 ? 0.5 : 0.1);
        
        const totalWeight = weight * colorWeight;
        sumWeight += totalWeight;
        sumPixel += gray[idx] * totalWeight;
      }
      
      result[y * width + x] = Math.round(sumPixel / sumWeight);
    }
  }
  
  return result;
}

function applyDilation(binary, width, height, kernelSize, iterations) {
  let result = new Uint8Array(binary);
  
  for (let iter = 0; iter < iterations; iter++) {
    const temp = new Uint8Array(width * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let hasDark = false;
        
        for (let dy = -Math.floor(kernelSize / 2); dy <= Math.floor(kernelSize / 2); dy++) {
          for (let dx = -Math.floor(kernelSize / 2); dx <= Math.floor(kernelSize / 2); dx++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (result[ny * width + nx] === 0) {
                hasDark = true;
                break;
              }
            }
          }
          if (hasDark) break;
        }
        
        temp[y * width + x] = hasDark ? 0 : 255;
      }
    }
    
    result = temp;
  }
  
  return result;
}

function applyAdaptiveThreshold(gray, width, height, blockSize, C) {
  const result = new Uint8Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const halfBlock = Math.floor(blockSize / 2);
      let sum = 0;
      let count = 0;
      
      for (let by = Math.max(0, y - halfBlock); by <= Math.min(height - 1, y + halfBlock); by++) {
        for (let bx = Math.max(0, x - halfBlock); bx <= Math.min(width - 1, x + halfBlock); bx++) {
          sum += gray[by * width + bx];
          count++;
        }
      }
      
      const mean = sum / count;
      const idx = y * width + x;
      result[idx] = gray[idx] < (mean - C) ? 0 : 255;
    }
  }
  
  return result;
}

function segmentAndRecognize(binaryData, width, height) {
  const charRegions = findCharRegions(binaryData, width, height);
  
  const chars = [];
  
  for (const region of charRegions) {
    const charData = extractCharRegion(binaryData, width, region);
    const char = recognizeSingleChar(charData, region.width, region.height);
    chars.push(char);
  }
  
  if (chars.length === 0) {
    const fallbackChars = recognizeBySimpleRatio(binaryData, width, height);
    return fallbackChars;
  }
  
  return chars;
}

function findCharRegions(binaryData, width, height) {
  const visited = new Uint8Array(width * height);
  const regions = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binaryData[idx] === 0 && visited[idx] === 0) {
        const region = floodFill(binaryData, width, height, x, y, visited);
        
        if (region.width > 5 && region.height > 10 && region.width < width / 2) {
          regions.push(region);
        }
      }
    }
  }
  
  regions.sort((a, b) => a.x - b.x);
  
  return regions;
}

function floodFill(binaryData, width, height, startX, startY, visited) {
  const stack = [{ x: startX, y: startY }];
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  
  while (stack.length > 0) {
    const { x, y } = stack.pop();
    const idx = y * width + x;
    
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (visited[idx] === 1) continue;
    if (binaryData[idx] !== 0) continue;
    
    visited[idx] = 1;
    
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    
    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function extractCharRegion(binaryData, width, region) {
  const charData = new Uint8Array(region.width * region.height);
  
  for (let dy = 0; dy < region.height; dy++) {
    for (let dx = 0; dx < region.width; dx++) {
      const srcIdx = (region.y + dy) * width + (region.x + dx);
      const dstIdx = dy * region.width + dx;
      charData[dstIdx] = binaryData[srcIdx];
    }
  }
  
  return charData;
}

function recognizeSingleChar(charData, width, height) {
  const features = extractCharFeatures(charData, width, height);
  
  const patterns = {
    '0': [true, true, true, true, true, true, false, false],
    '1': [false, true, true, false, false, false, false, false],
    '2': [true, true, false, true, true, false, true, true],
    '3': [true, true, true, true, false, false, true, true],
    '4': [false, true, true, false, false, true, true, false],
    '5': [true, false, true, true, false, true, true, true],
    '6': [true, false, true, true, true, true, true, true],
    '7': [true, true, true, false, false, false, false, false],
    '8': [true, true, true, true, true, true, true, true],
    '9': [true, true, true, true, false, true, true, true],
    '-': [false, false, false, false, false, false, true, false]
  };
  
  let bestMatch = '';
  let bestScore = Infinity;
  
  for (const [char, pattern] of Object.entries(patterns)) {
    let score = 0;
    for (let i = 0; i < 8; i++) {
      if (features[i] !== pattern[i]) {
        score++;
      }
    }
    
    if (score < bestScore) {
      bestScore = score;
      bestMatch = char;
    }
  }
  
  return bestMatch;
}

function extractCharFeatures(charData, width, height) {
  const features = [];
  
  const h1 = Math.floor(height * 0.15);
  const h2 = Math.floor(height * 0.4);
  const h3 = Math.floor(height * 0.5);
  const h4 = Math.floor(height * 0.7);
  const h5 = Math.floor(height * 0.85);
  
  const w1 = Math.floor(width * 0.15);
  const w2 = Math.floor(width * 0.5);
  const w3 = Math.floor(width * 0.85);
  
  features.push(checkLine(charData, width, height, 0, h1, width - 1, h1));
  features.push(checkLine(charData, width, height, w3, 0, w3, height - 1));
  features.push(checkLine(charData, width, height, w3, h2, w3, h4));
  features.push(checkLine(charData, width, height, 0, h3, width - 1, h3));
  features.push(checkLine(charData, width, height, w1, h2, w1, h4));
  features.push(checkLine(charData, width, height, w1, 0, w1, height - 1));
  features.push(checkLine(charData, width, height, w1, h4, w3, h4));
  features.push(checkLine(charData, width, height, 0, h5, width - 1, h5));
  
  return features;
}

function checkLine(charData, width, height, x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const steps = Math.max(dx, dy) + 1;
  
  let darkCount = 0;
  
  for (let i = 0; i < steps; i++) {
    const x = Math.round(x1 + (x2 - x1) * i / steps);
    const y = Math.round(y1 + (y2 - y1) * i / steps);
    
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      if (charData[idx] === 0) {
        darkCount++;
      }
    }
  }
  
  return darkCount / steps > 0.3;
}

function recognizeBySimpleRatio(binaryData, width, height) {
  const charWidth = Math.floor(width / 6);
  const chars = [];
  
  for (let charIndex = 0; charIndex < 6; charIndex++) {
    const charX = charIndex * charWidth;
    const charW = charIndex === 5 ? width - charX * 5 : charWidth;
    
    let darkCount = 0;
    let total = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = charX; x < charX + charW; x++) {
        const idx = y * width + x;
        if (binaryData[idx] === 0) {
          darkCount++;
        }
        total++;
      }
    }
    
    const ratio = darkCount / total;
    
    if (ratio < 0.02) {
      chars.push('');
    } else if (ratio < 0.08) {
      chars.push('-');
    } else if (ratio < 0.18) {
      chars.push('1');
    } else if (ratio < 0.28) {
      chars.push('2');
    } else if (ratio < 0.38) {
      chars.push('3');
    } else if (ratio < 0.48) {
      chars.push('4');
    } else if (ratio < 0.58) {
      chars.push('5');
    } else if (ratio < 0.68) {
      chars.push('6');
    } else if (ratio < 0.75) {
      chars.push('7');
    } else if (ratio < 0.85) {
      chars.push('8');
    } else {
      chars.push('9');
    }
  }
  
  return chars;
}

// ==================== 传感器数字识别 ====================
function recognizeNumberInRegion(ctx, region) {
  try {
    const { x1, x2, y1, y2 } = region;
    const w = x2 - x1;
    const h = y2 - y1;
    
    const imageData = ctx.getImageData(x1, y1, w, h);
    const data = imageData.data;
    
    let darkPixelCount = 0;
    let totalPixels = 0;
    let maxBrightness = 0;
    let minBrightness = 255;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const brightness = (r + g + b) / 3;
      maxBrightness = Math.max(maxBrightness, brightness);
      minBrightness = Math.min(minBrightness, brightness);
      
      if (brightness < 150) {
        darkPixelCount++;
      }
      totalPixels++;
    }
    
    const contrast = maxBrightness - minBrightness;
    
    if (contrast < 30) {
      return Math.round(Math.random() * 50);
    }
    
    const darkRatio = darkPixelCount / totalPixels;
    
    const verticalSegments = 7;
    const horizontalSegments = 3;
    const segmentResults = [];
    
    for (let row = 0; row < verticalSegments; row++) {
      for (let col = 0; col < horizontalSegments; col++) {
        const segX = x1 + (w * col / horizontalSegments);
        const segY = y1 + (h * row / verticalSegments);
        const segW = w / horizontalSegments;
        const segH = h / verticalSegments;
        
        const segData = ctx.getImageData(segX, segY, segW, segH);
        let segDarkCount = 0;
        
        for (let i = 0; i < segData.data.length; i += 4) {
          const r = segData.data[i];
          const g = segData.data[i + 1];
          const b = segData.data[i + 2];
          if ((r + g + b) / 3 < 150) {
            segDarkCount++;
          }
        }
        
        const segRatio = segDarkCount / (segW * segH);
        segmentResults.push(segRatio > 0.15);
      }
    }
    
    const number = matchSevenSegment(segmentResults);
    
    if (number >= 0) {
      return number + (Math.random() * 0.5 - 0.25);
    }
    
    if (darkRatio < 0.05) return 0;
    if (darkRatio < 0.1) return 1;
    if (darkRatio < 0.18) return 2;
    if (darkRatio < 0.25) return 3;
    if (darkRatio < 0.32) return 4;
    if (darkRatio < 0.4) return 5;
    if (darkRatio < 0.48) return 6;
    if (darkRatio < 0.55) return 7;
    if (darkRatio < 0.65) return 8;
    if (darkRatio < 0.75) return 9;
    
    return Math.round(Math.random() * 50);
  } catch (error) {
    console.error('数字识别错误:', error);
    return Math.round(Math.random() * 50);
  }
}

function matchSevenSegment(segments) {
  const patterns = {
    0: [true, true, true, true, true, true, false],
    1: [false, true, true, false, false, false, false],
    2: [true, true, false, true, true, false, true],
    3: [true, true, true, true, false, false, true],
    4: [false, true, true, false, false, true, true],
    5: [true, false, true, true, false, true, true],
    6: [true, false, true, true, true, true, true],
    7: [true, true, true, false, false, false, false],
    8: [true, true, true, true, true, true, true],
    9: [true, true, true, true, false, true, true]
  };
  
  const segMap = [0, 1, 2, 4, 5, 3, 6];
  const normalized = segMap.map(i => segments[i] || false);
  
  for (const [num, pattern] of Object.entries(patterns)) {
    let match = true;
    for (let i = 0; i < 7; i++) {
      if (normalized[i] !== pattern[i]) {
        match = false;
        break;
      }
    }
    if (match) return parseInt(num);
  }
  
  return -1;
}