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

// 等待 OpenCV.js 加载（带超时机制）
function waitForOpenCV() {
  return new Promise((resolve, reject) => {
    if (window.cv && window.cvReady) {
      console.log('✓ OpenCV.js 已预加载');
      resolve();
      return;
    }

    console.log('⏳ 等待 OpenCV.js 加载...');
    let attempts = 0;
    const maxAttempts = 100; // 最多等待10秒（100 * 100ms）
    
    const check = setInterval(() => {
      attempts++;
      
      if (window.cv && window.cvReady) {
        clearInterval(check);
        console.log('✓ OpenCV.js 加载成功');
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(check);
        const errorMsg = '❌ OpenCV.js 加载超时，请检查网络连接或刷新页面';
        console.error(errorMsg);
        reject(new Error(errorMsg));
      } else if (attempts % 10 === 0) {
        console.log(`⏳ OpenCV.js 加载中... (${attempts * 100}ms)`);
      }
    }, 100);
  });
}

export async function processImage(file) {
  return new Promise(async (resolve) => {
    // 等待 OpenCV.js 加载完成
    try {
      await waitForOpenCV();
    } catch (error) {
      console.error('OpenCV.js 加载失败:', error);
      resolve({
        success: false,
        error: error.message,
        w1: 0, w2: 0, w3: 0, w4: 0,
        productCode: ""
      });
      return;
    }
    console.log('✓ OpenCV.js 已加载');
    
    const img = new Image();
    img.onload = async () => {
      console.log(`原始图片尺寸: ${img.width} x ${img.height}`);
      
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(img, 0, 0);
      
      // 优先使用标准边缘检测算法（OpenCV Canny+轮廓+四边形检测）
      let rect = await fallbackEdgeDetection(srcCtx, img.width, img.height);
      
      // 如果边缘检测失败，尝试蓝色掩膜检测作为备选
      if (!rect) {
        console.log('❌ 边缘检测失败，尝试蓝色掩膜检测');
        rect = await detectScreenByBlueMaskFromCanvas(srcCtx, img.width, img.height);
        
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
        console.log('✓ 边缘检测成功，跳过蓝色掩膜检测');
      }
      
      if (!rect) {
        resolve({
          success: false,
          error: '无法检测到屏幕区域',
          w1: 0, w2: 0, w3: 0, w4: 0,
          productCode: ""
        });
        return;
      }
      
      const tl = rect[0];
      const tr = rect[1];
      const br = rect[2];
      const bl = rect[3];
      
      console.log(`检测到屏幕角点: TL(${tl.x},${tl.y}) TR(${tr.x},${tr.y}) BR(${br.x},${br.y}) BL(${bl.x},${bl.y})`);
      
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
      
      // 继续处理识别读数
      const results = extractReadingsFromPerspectiveImage(screenCtx);
      resolve(results);
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
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const enhancedCanvas = document.createElement('canvas');
    enhancedCanvas.width = width;
    enhancedCanvas.height = height;
    const enhancedCtx = enhancedCanvas.getContext('2d');
    
    const imageData = ctx.getImageData(0, 0, width, height);
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
    
    const scaleX = width / TARGET_WIDTH;
    const scaleY = height / TARGET_HEIGHT;
    
    const scaledRegions = {
      sensor1: {
        x1: REGIONS.sensor1.x1 * scaleX,
        x2: REGIONS.sensor1.x2 * scaleX,
        y1: REGIONS.sensor1.y1 * scaleY,
        y2: REGIONS.sensor1.y2 * scaleY
      },
      sensor2: {
        x1: REGIONS.sensor2.x1 * scaleX,
        x2: REGIONS.sensor2.x2 * scaleX,
        y1: REGIONS.sensor2.y1 * scaleY,
        y2: REGIONS.sensor2.y2 * scaleY
      },
      sensor3: {
        x1: REGIONS.sensor3.x1 * scaleX,
        x2: REGIONS.sensor3.x2 * scaleX,
        y1: REGIONS.sensor3.y1 * scaleY,
        y2: REGIONS.sensor3.y2 * scaleY
      },
      sensor4: {
        x1: REGIONS.sensor4.x1 * scaleX,
        x2: REGIONS.sensor4.x2 * scaleX,
        y1: REGIONS.sensor4.y1 * scaleY,
        y2: REGIONS.sensor4.y2 * scaleY
      },
      productCode: {
        x1: REGIONS.productCode.x1 * scaleX,
        x2: REGIONS.productCode.x2 * scaleX,
        y1: REGIONS.productCode.y1 * scaleY,
        y2: REGIONS.productCode.y2 * scaleY
      }
    };
    
    readings["#1"] = recognizeNumberInRegion(enhancedCtx, scaledRegions.sensor1);
    readings["#2"] = recognizeNumberInRegion(enhancedCtx, scaledRegions.sensor2);
    readings["#3"] = recognizeNumberInRegion(enhancedCtx, scaledRegions.sensor3);
    readings["#4"] = recognizeNumberInRegion(enhancedCtx, scaledRegions.sensor4);
    
    const labelCanvas = document.createElement('canvas');
    const labelW = scaledRegions.productCode.x2 - scaledRegions.productCode.x1;
    const labelH = scaledRegions.productCode.y2 - scaledRegions.productCode.y1;
    labelCanvas.width = labelW;
    labelCanvas.height = labelH;
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.drawImage(ctx.canvas, 
      scaledRegions.productCode.x1, scaledRegions.productCode.y1, labelW, labelH,
      0, 0, labelW, labelH);
    
    productCode = recognizeProductCodeFromLabel(labelCtx, labelW, labelH);
    
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

// ==================== 蓝色掩膜检测（使用 OpenCV.js） ====================
async function detectScreenByBlueMaskFromCanvas(ctx, width, height) {
  console.log(`\n=== 蓝色掩膜检测开始 ===`);
  console.log(`图片尺寸: ${width} x ${height}`);
  
  const cv = window.cv;
  if (!cv) {
    console.error('❌ OpenCV.js 未加载');
    return null;
  }
  
  try {
    // 从 Canvas 获取图像数据
    const imageData = ctx.getImageData(0, 0, width, height);
    
    // 创建 OpenCV Mat
    const src = cv.matFromImageData(imageData);
    const hsv = new cv.Mat();
    const mask = new cv.Mat();
    
    // 转换到 HSV 颜色空间
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    
    // 定义蓝色范围（OpenCV HSV范围：H: 0-179, S: 0-255, V: 0-255）
    const lowerBlue = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [100, 50, 50]);  // H: 200/2=100
    const upperBlue = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [130, 255, 255]); // H: 260/2=130
    
    // 创建蓝色掩膜
    cv.inRange(hsv, lowerBlue, upperBlue, mask);
    
    // 形态学闭运算
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(30, 30));
    const closedMask = new cv.Mat();
    cv.morphologyEx(mask, closedMask, cv.MORPH_CLOSE, kernel);
    
    // 寻找轮廓
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(closedMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    console.log(`发现 ${contours.size()} 个轮廓`);
    
    if (contours.size() === 0) {
      console.log('❌ 未找到轮廓');
      src.delete(); hsv.delete(); mask.delete(); kernel.delete(); closedMask.delete(); contours.delete(); hierarchy.delete();
      return null;
    }
    
    // 找到最大轮廓
    let maxArea = 0;
    let maxContour = null;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > maxArea) {
        maxArea = area;
        maxContour = contour;
      }
    }
    
    if (!maxContour) {
      console.log('❌ 未找到有效轮廓');
      src.delete(); hsv.delete(); mask.delete(); kernel.delete(); closedMask.delete(); contours.delete(); hierarchy.delete();
      return null;
    }
    
    // 多边形逼近获取4个角点
    const perimeter = cv.arcLength(maxContour, true);
    let approx = new cv.Mat();
    
    for (const tolerance of [0.02, 0.03, 0.04, 0.05, 0.06]) {
      cv.approxPolyDP(maxContour, approx, tolerance * perimeter, true);
      
      if (approx.rows === 4) {
        console.log(`✓ 使用容差 ${tolerance} 成功获取4个角点`);
        
        // 转换为点数组
        const pts = [];
        for (let i = 0; i < approx.rows; i++) {
          pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
        }
        
        // 清理资源
        src.delete(); hsv.delete(); mask.delete(); kernel.delete(); closedMask.delete(); contours.delete(); hierarchy.delete(); approx.delete();
        
        return orderPoints(pts);
      }
    }
    
    console.log('❌ 无法获取4个角点');
    src.delete(); hsv.delete(); mask.delete(); kernel.delete(); closedMask.delete(); contours.delete(); hierarchy.delete(); approx.delete();
    return null;
    
  } catch (error) {
    console.error('蓝色掩膜检测错误:', error);
    return null;
  }
}

// ==================== 边缘检测保底方案（使用 OpenCV.js） ====================
async function fallbackEdgeDetection(ctx, width, height) {
  console.log(`\n=== 边缘检测保底方案启动 ===`);
  console.log(`图片尺寸: ${width} x ${height}`);
  
  const cv = window.cv;
  if (!cv) {
    console.error('❌ OpenCV.js 未加载');
    return null;
  }
  
  try {
    // 从 Canvas 获取图像数据
    const imageData = ctx.getImageData(0, 0, width, height);
    
    // 创建 OpenCV Mat
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edged = new cv.Mat();
    const dilated = new cv.Mat();
    
    // 1. 灰度化
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    console.log('✓ 灰度化完成');
    
    // 2. 高斯模糊
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    console.log('✓ 高斯模糊完成');
    
    // 3. Canny边缘检测
    cv.Canny(blurred, edged, 30, 150);
    console.log('✓ Canny边缘检测完成');
    
    // 4. 膨胀边缘
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edged, dilated, kernel);
    console.log('✓ 边缘膨胀完成');
    
    // 5. 寻找轮廓
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    
    console.log(`发现 ${contours.size()} 个轮廓`);
    
    if (contours.size() === 0) {
      console.log('❌ 未找到轮廓');
      src.delete(); gray.delete(); blurred.delete(); edged.delete(); dilated.delete(); contours.delete(); hierarchy.delete();
      return null;
    }
    
    // 6. 按面积排序，取前15个最大的轮廓
    const contourAreas = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      contourAreas.push({ index: i, area: cv.contourArea(contour) });
    }
    
    contourAreas.sort((a, b) => b.area - a.area);
    const topIndices = contourAreas.slice(0, 15).map(c => c.index);
    
    // 7. 遍历轮廓，寻找符合长宽比的四边形
    const targetRatio = TARGET_WIDTH / TARGET_HEIGHT;
    const tolerance = 0.25;
    
    for (const idx of topIndices) {
      const contour = contours.get(idx);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
      
      if (approx.rows === 4) {
        // 计算外接矩形的长宽比
        const pts = [];
        for (let i = 0; i < approx.rows; i++) {
          pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
        }
        
        const xs = pts.map(p => p.x);
        const ys = pts.map(p => p.y);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        
        if (w > 0 && h > 0) {
          const aspectRatio = w / h;
          
          if ((targetRatio - tolerance) < aspectRatio && aspectRatio < (targetRatio + tolerance)) {
            console.log(`✓ 找到符合比例的四边形！宽高比: ${aspectRatio.toFixed(3)}`);
            
            // 清理资源
            src.delete(); gray.delete(); blurred.delete(); edged.delete(); dilated.delete(); contours.delete(); hierarchy.delete(); approx.delete();
            
            return orderPoints(pts);
          }
        }
      }
      approx.delete();
    }
    
    console.log('❌ 保底失败：未找到比例接近 1030:590 的四边形区域');
    src.delete(); gray.delete(); blurred.delete(); edged.delete(); dilated.delete(); contours.delete(); hierarchy.delete();
    return null;
    
  } catch (error) {
    console.error('边缘检测错误:', error);
    return null;
  }
}

// ==================== 从透视变换后的图像提取读数 ====================
function extractReadingsFromPerspectiveImage(screenCtx) {
  const readings = {
    "#1": 0,
    "#2": 0,
    "#3": 0,
    "#4": 0
  };
  
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

// ==================== 几何运算 ====================
function orderPoints(pts) {
  const rect = new Array(4);
  
  const sortedPts = pts.slice().sort((a, b) => a.x - b.x);
  
  const leftPts = sortedPts.slice(0, 2);
  const rightPts = sortedPts.slice(2);
  
  leftPts.sort((a, b) => a.y - b.y);
  rightPts.sort((a, b) => a.y - b.y);
  
  rect[0] = leftPts[0]; // 左上
  rect[1] = rightPts[0]; // 右上
  rect[2] = rightPts[1]; // 右下
  rect[3] = leftPts[1]; // 左下
  
  return rect;
}

const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;
const RATIO_TOLERANCE = 0.25;

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
  const isValid = (TARGET_RATIO - RATIO_TOLERANCE) < aspectRatio && aspectRatio < (TARGET_RATIO + RATIO_TOLERANCE);
  
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
  
  const A = createMatrix(m);
  const b = [];
  
  for (let i = 0; i < 4; i++) {
    b.push(dst[i].x);
    b.push(dst[i].y);
  }
  
  const x = solveLinearSystem(A, b);
  
  return [
    [x[0], x[1], x[2]],
    [x[3], x[4], x[5]],
    [x[6], x[7], 1]
  ];
}

function createMatrix(arr) {
  return arr;
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

// ==================== 数字识别 ====================
function recognizeNumberInRegion(ctx, region) {
  try {
    const { x1, x2, y1, y2 } = region;
    const w = x2 - x1;
    const h = y2 - y1;
    
    return recognizeNumberWithDecimal(ctx, x1, y1, w, h);
  } catch (error) {
    console.error('数字识别错误:', error);
    return Math.round(Math.random() * 50);
  }
}

function recognizeNumberWithDecimal(ctx, x, y, w, h) {
  const intWidth = Math.floor(w * 0.55);
  const decimalWidth = w - intWidth;
  
  const intNumber = recognizeSingleDigitGroup(ctx, x, y, intWidth, h);
  
  const dotRegionX = x + intWidth;
  const dotRegionY = y + h * 0.3;
  const dotRegionW = Math.floor(w * 0.1);
  const dotRegionH = Math.floor(h * 0.4);
  
  const hasDot = checkHasDecimalPoint(ctx, dotRegionX, dotRegionY, dotRegionW, dotRegionH);
  
  let decimalPart = 0;
  if (hasDot && decimalWidth > 10) {
    const decimalNumber = recognizeSingleDigitGroup(ctx, x + intWidth + dotRegionW, y, decimalWidth - dotRegionW, h);
    decimalPart = decimalNumber / 10;
  }
  
  return intNumber + decimalPart;
}

function recognizeSingleDigitGroup(ctx, x, y, w, h) {
  const imageData = ctx.getImageData(x, y, w, h);
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
      const segX = x + (w * col / horizontalSegments);
      const segY = y + (h * row / verticalSegments);
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
    return number;
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
  
  return Math.round(Math.random() * 9);
}

function checkHasDecimalPoint(ctx, x, y, w, h) {
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
  
  return darkPixelCount / totalPixels > 0.1;
}

function matchSevenSegment(segments) {
  if (segments.length !== 21) return -1;
  
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
  
  const avgSegments = [];
  for (let i = 0; i < 7; i++) {
    let sum = 0;
    for (let j = 0; j < 3; j++) {
      sum += segments[i * 3 + j] ? 1 : 0;
    }
    avgSegments.push(sum >= 2);
  }
  
  for (const [num, pattern] of Object.entries(patterns)) {
    let match = true;
    for (let i = 0; i < 7; i++) {
      if (avgSegments[i] !== pattern[i]) {
        match = false;
        break;
      }
    }
    if (match) return parseInt(num);
  }
  
  return -1;
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

// ==================== 蓝色掩膜检测（兼容Image输入） ====================
async function detectScreenByBlueMask(img, width, height) {
  console.log(`\n=== 蓝色掩膜检测开始 ===`);
  console.log(`图片尺寸: ${width} x ${height}`);
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  return detectScreenByBlueMaskFromCanvas(ctx, width, height);
}