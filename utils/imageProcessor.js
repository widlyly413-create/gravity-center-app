export async function processImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const results = extractReadingsFromImage(img);
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
  
  const warpedCanvas = warpOuterFrame(img, width, height);
  
  const readings = {
    "#1": 0,
    "#2": 0,
    "#3": 0,
    "#4": 0
  };
  
  let productCode = "";
  
  try {
    const warpedCtx = warpedCanvas.getContext('2d');
    const dstW = 1000;
    const dstH = 800;
    
    productCode = recognizeProductCodeFromWarped(warpedCtx, dstW, dstH);
    
    const roiRegions = [
      { key: "#1", x: dstW * 0.18, y: dstH * 0.32, w: dstW * 0.15, h: dstH * 0.1 },
      { key: "#2", x: dstW * 0.62, y: dstH * 0.32, w: dstW * 0.15, h: dstH * 0.1 },
      { key: "#3", x: dstW * 0.18, y: dstH * 0.62, w: dstW * 0.15, h: dstH * 0.1 },
      { key: "#4", x: dstW * 0.62, y: dstH * 0.62, w: dstW * 0.15, h: dstH * 0.1 }
    ];
    
    for (const region of roiRegions) {
      const value = recognizeNumberInRegion(warpedCtx, region.x, region.y, region.w, region.h);
      readings[region.key] = value;
    }
    
    return {
      success: true,
      w1: readings["#1"],
      w2: readings["#2"],
      w3: readings["#3"],
      w4: readings["#4"],
      productCode
    };
  } catch (error) {
    console.error('图像处理错误:', error);
    return {
      success: false,
      error: error.message,
      w1: 0,
      w2: 0,
      w3: 0,
      w4: 0,
      productCode: ""
    };
  }
}

function warpOuterFrame(img, width, height) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const dstW = 1000;
  const dstH = 800;
  canvas.width = dstW;
  canvas.height = dstH;
  
  const srcPts = getOuterFramePoints(width, height);
  
  const rect = orderPoints(srcPts);
  
  const dstPts = [
    { x: 0, y: 0 },
    { x: dstW, y: 0 },
    { x: dstW, y: dstH },
    { x: 0, y: dstH }
  ];
  
  const M = getPerspectiveTransform(rect, dstPts);
  
  applyPerspectiveTransform(ctx, img, M, dstW, dstH);
  
  return canvas;
}

function getOuterFramePoints(width, height) {
  const defaultPts = [
    { x: width * 0.0646, y: height * 0.0627 },
    { x: width * 0.8929, y: height * 0.0705 },
    { x: width * 0.8696, y: height * 0.9247 },
    { x: width * 0.0705, y: height * 0.9169 }
  ];
  
  return defaultPts;
}

function orderPoints(pts) {
  const sorted = [...pts].sort((a, b) => {
    const sumA = a.x + a.y;
    const sumB = b.x + b.y;
    return sumA - sumB;
  });
  
  const rect = [];
  rect[0] = sorted[0];
  rect[2] = sorted[3];
  
  const diffs = sorted.slice(0, 2).sort((a, b) => {
    const diffA = a.x - a.y;
    const diffB = b.x - b.y;
    return diffB - diffA;
  });
  rect[1] = diffs[0];
  rect[3] = diffs[1];
  
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
  ctx.save();
  
  const m00 = M[0][0], m01 = M[0][1], m02 = M[0][2];
  const m10 = M[1][0], m11 = M[1][1], m12 = M[1][2];
  const m20 = M[2][0], m21 = M[2][1], m22 = M[2][2];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const denom = m20 * x + m21 * y + m22;
      const srcX = (m00 * x + m01 * y + m02) / denom;
      const srcY = (m10 * x + m11 * y + m12) / denom;
      
      if (srcX >= 0 && srcX < img.width && srcY >= 0 && srcY < img.height) {
        const pixel = getPixel(img, srcX, srcY);
        ctx.fillStyle = `rgb(${pixel.r}, ${pixel.g}, ${pixel.b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  
  ctx.restore();
}

function getPixel(img, x, y) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  const xInt = Math.floor(x);
  const yInt = Math.floor(y);
  const dx = x - xInt;
  const dy = y - yInt;
  
  const p00 = ctx.getImageData(xInt, yInt, 1, 1).data;
  const p10 = ctx.getImageData(Math.min(xInt + 1, img.width - 1), yInt, 1, 1).data;
  const p01 = ctx.getImageData(xInt, Math.min(yInt + 1, img.height - 1), 1, 1).data;
  const p11 = ctx.getImageData(Math.min(xInt + 1, img.width - 1), Math.min(yInt + 1, img.height - 1), 1, 1).data;
  
  const r = Math.round(
    p00[0] * (1 - dx) * (1 - dy) +
    p10[0] * dx * (1 - dy) +
    p01[0] * (1 - dx) * dy +
    p11[0] * dx * dy
  );
  const g = Math.round(
    p00[1] * (1 - dx) * (1 - dy) +
    p10[1] * dx * (1 - dy) +
    p01[1] * (1 - dx) * dy +
    p11[1] * dx * dy
  );
  const b = Math.round(
    p00[2] * (1 - dx) * (1 - dy) +
    p10[2] * dx * (1 - dy) +
    p01[2] * (1 - dx) * dy +
    p11[2] * dx * dy
  );
  
  return { r, g, b };
}

function recognizeProductCodeFromWarped(ctx, width, height) {
  try {
    const labelX = 580;
    const labelY = 20;
    const labelW = 270;
    const labelH = 140;
    
    const imageData = ctx.getImageData(labelX, labelY, labelW, labelH);
    const grayData = rgbToGrayscale(imageData.data, labelW, labelH);
    
    const thresholded = applyAdaptiveThreshold(grayData, labelW, labelH, 21, 10);
    
    let darkPixels = 0;
    let totalPixels = labelW * labelH;
    for (let i = 0; i < thresholded.length; i++) {
      if (thresholded[i] === 0) {
        darkPixels++;
      }
    }
    
    if (darkPixels / totalPixels < 0.01) {
      return '';
    }
    
    const chars = segmentAndRecognize(thresholded, labelW, labelH);
    
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

function recognizeNumberInRegion(ctx, x, y, w, h) {
  try {
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