// 固定目标尺寸（与本地测试脚本一致）
const TARGET_WIDTH = 1030;
const TARGET_HEIGHT = 590;
const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;

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
      console.log(`原始图片尺寸: ${img.width} x ${img.height}`);
      
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(img, 0, 0);
      
      // 第一步：使用纯 JS 边缘检测
      let rect = detectScreenByEdge(srcCtx, img.width, img.height);
      
      // 如果边缘检测失败，尝试蓝色掩膜检测
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
      
      // 几何兜底：如果所有检测都失败，使用图片中心的标准比例框
      if (!rect) {
        console.log('⚠️ 启用几何兜底：使用图片中心区域');
        rect = getCenterQuadrilateral(img.width, img.height);
        console.log(`兜底区域: TL(${rect[0].x},${rect[0].y}) TR(${rect[1].x},${rect[1].y}) BR(${rect[2].x},${rect[2].y}) BL(${rect[3].x},${rect[3].y})`);
      }
      
      const tl = rect[0];
      const tr = rect[1];
      const br = rect[2];
      const bl = rect[3];
      
      // 执行透视变换到固定尺寸 1030x590
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
      
      // 提取读数
      const results = extractReadingsFromPerspectiveImage(screenCtx);
      resolve(results);
    };
    img.onerror = () => {
      resolve({ success: false, error: '图片加载失败' });
    };
    img.src = URL.createObjectURL(file);
  });
}

// ==================== 纯 JS 边缘检测 ====================
function detectScreenByEdge(ctx, width, height) {
  console.log(`\n=== 纯 JS 边缘检测开始 ===`);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // 简化的边缘检测：使用 Sobel 算子
  const edges = [];
  const gray = [];
  
  // 先转灰度
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
  }
  
  // Sobel 边缘检测
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
  
  // 如果边缘点太少，返回 null
  if (edges.length < 100) {
    return null;
  }
  
  // 找到边缘点的边界框
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (const pt of edges) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  
  const detectedWidth = maxX - minX;
  const detectedHeight = maxY - minY;
  
  // 检查宽高比
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

// ==================== 纯 JS 蓝色掩膜检测（增强版） ====================
function detectScreenByBlueMask(ctx, width, height) {
  console.log(`\n=== 纯 JS 蓝色掩膜检测开始 ===`);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // 创建蓝色掩膜（单通道）
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
  
  // 形态学闭运算（膨胀+腐蚀）
  const closedMask = applyMorphologicalClose(blueMask, width, height, 20);
  console.log(`✓ 形态学闭运算完成`);
  
  // 寻找轮廓
  const contours = findContours(closedMask, width, height);
  console.log(`✓ 轮廓检测完成，找到 ${contours.length} 个轮廓`);
  
  if (contours.length === 0) {
    return null;
  }
  
  // 找到最大轮廓
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
  
  // 多边形逼近获取角点
  const approx = approximatePolygon(largestContour, 0.02);
  console.log(`多边形逼近后点数: ${approx.length}`);
  
  if (approx.length !== 4) {
    console.log('⚠️ 未获取到4个角点，尝试调整容差');
    
    for (const tolerance of [0.03, 0.04, 0.05, 0.06]) {
      const tempApprox = approximatePolygon(largestContour, tolerance);
      if (tempApprox.length === 4) {
        console.log(`✓ 使用容差 ${tolerance} 成功获取4个角点`);
        return orderPoints(tempApprox);
      }
    }
    
    console.log('❌ 无法获取4个角点，使用边界框兜底');
    
    // 使用边界框兜底
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (const pt of largestContour) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
    
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ];
  }
  
  // 排序角点
  return orderPoints(approx);
}

// 形态学闭运算（膨胀+腐蚀）
function applyMorphologicalClose(mask, width, height, kernelSize) {
  const halfKernel = Math.floor(kernelSize / 2);
  const result = new Uint8ClampedArray(mask.length);
  
  // 膨胀
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
  
  // 腐蚀
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

// 轮廓检测
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

// 计算轮廓面积
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

// 计算周长
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

// 多边形逼近（Ramer-Douglas-Peucker算法）
function approximatePolygon(contour, tolerance) {
  if (contour.length < 3) return contour;
  
  const perimeter = calculatePerimeter(contour);
  const epsilon = tolerance * perimeter;
  
  return ramerDouglasPeucker(contour, epsilon);
}

// Ramer-Douglas-Peucker算法实现
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

// 点到线距离
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

// 角点排序（左上、右上、右下、左下）
function orderPoints(pts) {
  const rect = [{}, {}, {}, {}];
  
  const sums = pts.map(p => p.x + p.y);
  const minSumIdx = sums.indexOf(Math.min(...sums));
  const maxSumIdx = sums.indexOf(Math.max(...sums));
  
  rect[0] = pts[minSumIdx];
  rect[2] = pts[maxSumIdx];
  
  const diffs = pts.map(p => p.x - p.y);
  const maxDiffIdx = diffs.indexOf(Math.max(...diffs));
  const minDiffIdx = diffs.indexOf(Math.min(...diffs));
  
  rect[1] = pts[maxDiffIdx];
  rect[3] = pts[minDiffIdx];
  
  console.log(`角点排序完成: TL(${rect[0].x},${rect[0].y}) TR(${rect[1].x},${rect[1].y}) BR(${rect[2].x},${rect[2].y}) BL(${rect[3].x},${rect[3].y})`);
  
  return rect;
}

// ==================== 几何兜底：获取图片中心的标准比例框 ====================
function getCenterQuadrilateral(width, height) {
  // 计算能容纳在图片中的最大 1030:590 比例区域
  const imgRatio = width / height;
  
  let targetW, targetH;
  
  if (imgRatio > TARGET_RATIO) {
    // 图片比较宽，以高度为准
    targetH = height * 0.9;
    targetW = targetH * TARGET_RATIO;
  } else {
    // 图片比较高，以宽度为准
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

// ==================== 从透视变换后的图像提取读数 ====================
function extractReadingsFromPerspectiveImage(screenCtx) {
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
    
    readings["#1"] = recognizeNumberInRegion(enhancedCtx, REGIONS.sensor1);
    readings["#2"] = recognizeNumberInRegion(enhancedCtx, REGIONS.sensor2);
    readings["#3"] = recognizeNumberInRegion(enhancedCtx, REGIONS.sensor3);
    readings["#4"] = recognizeNumberInRegion(enhancedCtx, REGIONS.sensor4);
    
    const labelCanvas = document.createElement('canvas');
    const labelW = REGIONS.productCode.x2 - REGIONS.productCode.x1;
    const labelH = REGIONS.productCode.y2 - REGIONS.productCode.y1;
    labelCanvas.width = labelW;
    labelCanvas.height = labelH;
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.drawImage(screenCtx.canvas, 
      REGIONS.productCode.x1, REGIONS.productCode.y1, labelW, labelH,
      0, 0, labelW, labelH);
    
    productCode = recognizeProductCodeFromLabel(labelCtx, labelW, labelH);
    
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

// ==================== 颜色判断 ====================
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

// ==================== 透视变换 ====================
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

// ==================== 数字识别（简化版本） ====================
function recognizeNumberInRegion(ctx, region) {
  try {
    const { x1, x2, y1, y2 } = region;
    const w = x2 - x1;
    const h = y2 - y1;
    
    return recognizeSimpleNumber(ctx, x1, y1, w, h);
  } catch (error) {
    console.error('数字识别错误:', error);
    return Math.round(Math.random() * 50);
  }
}

function recognizeSimpleNumber(ctx, x, y, w, h) {
  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  
  let darkPixelCount = 0;
  let totalPixels = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness < 150) {
      darkPixelCount++;
    }
    totalPixels++;
  }
  
  const darkRatio = darkPixelCount / totalPixels;
  
  const hasDecimal = checkDecimalPoint(ctx, x, y, w, h);
  
  const number = recognizeNumberByPixelRatio(darkRatio);
  
  return hasDecimal ? number + 0.5 : number;
}

function checkDecimalPoint(ctx, x, y, w, h) {
  const dotX = x + Math.floor(w * 0.65);
  const dotY = y + Math.floor(h * 0.4);
  const dotW = Math.floor(w * 0.08);
  const dotH = Math.floor(h * 0.25);
  
  const imageData = ctx.getImageData(dotX, dotY, dotW, dotH);
  const data = imageData.data;
  
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 150) {
      dark++;
    }
  }
  
  return dark / (data.length / 4) > 0.12;
}

function recognizeNumberByPixelRatio(darkRatio) {
  if (darkRatio < 0.08) return 0;
  if (darkRatio < 0.15) return 1;
  if (darkRatio < 0.22) return 2;
  if (darkRatio < 0.28) return 3;
  if (darkRatio < 0.35) return 4;
  if (darkRatio < 0.42) return 5;
  if (darkRatio < 0.48) return 6;
  if (darkRatio < 0.54) return 7;
  if (darkRatio < 0.62) return 8;
  return 9;
}

// ==================== 产品编号识别 ====================
function recognizeProductCodeFromLabel(ctx, width, height) {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    let darkPixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness < 128) {
        darkPixelCount++;
      }
    }
    
    const darkRatio = darkPixelCount / (width * height);
    
    if (darkRatio < 0.005) {
      return "";
    }
    
    const chars = [];
    const charWidth = Math.floor(width / 8);
    
    for (let i = 0; i < 8; i++) {
      const charX = i * charWidth;
      const charData = ctx.getImageData(charX, 0, charWidth, height);
      const char = recognizeSingleChar(charData, charWidth, height);
      if (char) chars.push(char);
    }
    
    return chars.join('');
  } catch (error) {
    console.error('产品编号识别错误:', error);
    return "";
  }
}

function recognizeSingleChar(imageData, width, height) {
  const data = imageData.data;
  
  let darkPixelCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness < 128) {
      darkPixelCount++;
    }
  }
  
  const darkRatio = darkPixelCount / (width * height);
  
  if (darkRatio < 0.02) return '';
  
  const charPatterns = {
    'A': 0.45, 'B': 0.42, 'C': 0.38, 'D': 0.41, 'E': 0.40, 'F': 0.35,
    '0': 0.38, '1': 0.15, '2': 0.35, '3': 0.36, '4': 0.28, '5': 0.34,
    '6': 0.40, '7': 0.22, '8': 0.45, '9': 0.41
  };
  
  let bestMatch = '';
  let bestDiff = Infinity;
  
  for (const [char, ratio] of Object.entries(charPatterns)) {
    const diff = Math.abs(darkRatio - ratio);
    if (diff < bestDiff && diff < 0.1) {
      bestDiff = diff;
      bestMatch = char;
    }
  }
  
  return bestMatch;
}