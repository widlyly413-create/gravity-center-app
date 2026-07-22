const TARGET_WIDTH = 1030;
const TARGET_HEIGHT = 590;

const REGIONS = {
  sensor1: { x1: 280, x2: 520, y1: 160, y2: 310 },
  sensor2: { x1: 700, x2: 940, y1: 160, y2: 310 },
  sensor3: { x1: 280, x2: 520, y1: 380, y2: 530 },
  sensor4: { x1: 700, x2: 940, y1: 380, y2: 530 }
};

let templateImage = null;

export async function loadTemplate(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      templateImage = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error('无法加载模板图片'));
    img.src = src;
  });
}

export async function processImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        console.log(`图片尺寸: ${img.width} x ${img.height}`);
        
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        let rect = null;
        
        if (templateImage) {
          rect = await alignWithTemplate(ctx, canvas.width, canvas.height, img);
          console.log(`模板对齐检测: ${rect ? '成功' : '失败'}`);
        }
        
        if (!rect) {
          rect = detectScreen(ctx, img.width, img.height);
          console.log(`蓝色掩膜检测: ${rect ? '成功' : '失败，使用兜底'}`);
        }
        
        if (!rect) {
          rect = getCenterRect(img.width, img.height);
        }
        
        console.log(`角点: TL(${rect[0].x},${rect[0].y}) TR(${rect[1].x},${rect[1].y}) BR(${rect[2].x},${rect[2].y}) BL(${rect[3].x},${rect[3].y})`);

        const dst = [
          { x: 0, y: 0 },
          { x: TARGET_WIDTH, y: 0 },
          { x: TARGET_WIDTH, y: TARGET_HEIGHT },
          { x: 0, y: TARGET_HEIGHT }
        ];

        const M = getPerspectiveTransform(rect, dst);
        const output = document.createElement("canvas");
        output.width = TARGET_WIDTH;
        output.height = TARGET_HEIGHT;
        const outCtx = output.getContext("2d", { willReadFrequently: true });
        outCtx.imageSmoothingEnabled = false;
        perspectiveWarp(outCtx, img, M, TARGET_WIDTH, TARGET_HEIGHT);

        const result = recognizeWeights(outCtx);
        console.log(`识别结果: w1=${result.w1}, w2=${result.w2}, w3=${result.w3}, w4=${result.w4}`);
        resolve(result);
      } catch (e) {
        console.error(e);
        resolve({ success: false, error: e.message });
      }
    };

    img.onerror = () => {
      resolve({ success: false, error: "图片读取失败" });
    };

    img.src = URL.createObjectURL(file);
  });
}

async function alignWithTemplate(ctx, width, height, img) {
  try {
    const templateCanvas = document.createElement("canvas");
    templateCanvas.width = templateImage.width;
    templateCanvas.height = templateImage.height;
    const templateCtx = templateCanvas.getContext("2d", { willReadFrequently: true });
    templateCtx.drawImage(templateImage, 0, 0);

    const srcCorners = findScreenCorners(ctx, width, height);
    const dstCorners = findScreenCorners(templateCtx, templateCanvas.width, templateCanvas.height);

    if (!srcCorners || !dstCorners) {
      return null;
    }

    const dstPts = [
      { x: 0, y: 0 },
      { x: TARGET_WIDTH, y: 0 },
      { x: TARGET_WIDTH, y: TARGET_HEIGHT },
      { x: 0, y: TARGET_HEIGHT }
    ];

    const M = getPerspectiveTransform(srcCorners, dstPts);
    return srcCorners;
  } catch (e) {
    console.error('模板对齐失败:', e);
    return null;
  }
}

function findScreenCorners(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  
  const edges = [];
  const threshold = 50;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      
      const idxLeft = (y * width + x - 1) * 4;
      const idxRight = (y * width + x + 1) * 4;
      const idxUp = ((y - 1) * width + x) * 4;
      const idxDown = ((y + 1) * width + x) * 4;
      
      const grayLeft = 0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2];
      const grayRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];
      const grayUp = 0.299 * data[idxUp] + 0.587 * data[idxUp + 1] + 0.114 * data[idxUp + 2];
      const grayDown = 0.299 * data[idxDown] + 0.587 * data[idxDown + 1] + 0.114 * data[idxDown + 2];
      
      const dx = Math.abs(grayRight - grayLeft);
      const dy = Math.abs(grayDown - grayUp);
      
      if (dx > threshold || dy > threshold) {
        edges.push({ x, y });
      }
    }
  }
  
  if (edges.length < 100) {
    return null;
  }
  
  const borderWidth = Math.min(width, height) * 0.15;
  
  const leftEdge = edges.filter(p => p.x < borderWidth);
  const rightEdge = edges.filter(p => p.x > width - borderWidth);
  const topEdge = edges.filter(p => p.y < borderWidth);
  const bottomEdge = edges.filter(p => p.y > height - borderWidth);
  
  if (leftEdge.length === 0 || rightEdge.length === 0 || topEdge.length === 0 || bottomEdge.length === 0) {
    return null;
  }
  
  const tl = findClosestToCorner(leftEdge, topEdge, { x: 0, y: 0 });
  const tr = findClosestToCorner(rightEdge, topEdge, { x: width, y: 0 });
  const br = findClosestToCorner(rightEdge, bottomEdge, { x: width, y: height });
  const bl = findClosestToCorner(leftEdge, bottomEdge, { x: 0, y: height });
  
  if (!tl || !tr || !br || !bl) {
    return null;
  }
  
  return [tl, tr, br, bl];
}

function findClosestToCorner(arr1, arr2, corner) {
  let closest = null;
  let minDist = Infinity;
  
  for (const p1 of arr1) {
    for (const p2 of arr2) {
      const dx = (p1.x + p2.x) / 2 - corner.x;
      const dy = (p1.y + p2.y) / 2 - corner.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < minDist) {
        minDist = dist;
        closest = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      }
    }
  }
  
  return closest;
}

function detectScreen(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  
  const bluePoints = [];
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (b > 80 && b > r * 1.2 && b > g * 1.1) {
        bluePoints.push({ x, y });
      }
    }
  }

  console.log(`蓝色像素数: ${bluePoints.length}`);
  
  if (bluePoints.length < 1000) {
    return null;
  }

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (const p of bluePoints) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  if (maxX - minX < 100 || maxY - minY < 100) {
    return null;
  }

  const s = bluePoints.map(p => p.x + p.y);
  const diff = bluePoints.map(p => p.x - p.y);
  
  const tl = bluePoints[s.indexOf(Math.min(...s))];
  const br = bluePoints[s.indexOf(Math.max(...s))];
  const tr = bluePoints[diff.indexOf(Math.max(...diff))];
  const bl = bluePoints[diff.indexOf(Math.min(...diff))];

  return [tl, tr, br, bl];
}

function getCenterRect(w, h) {
  const ratio = TARGET_WIDTH / TARGET_HEIGHT;
  let rw, rh;

  if (w / h > ratio) {
    rh = h * 0.9;
    rw = rh * ratio;
  } else {
    rw = w * 0.9;
    rh = rw / ratio;
  }

  const x = (w - rw) / 2;
  const y = (h - rh) / 2;

  return [
    { x, y },
    { x: x + rw, y },
    { x: x + rw, y: y + rh },
    { x, y: y + rh }
  ];
}

function recognizeWeights(ctx) {
  const weights = [];

  for (const key of ["sensor1", "sensor2", "sensor3", "sensor4"]) {
    const value = recognizeNumber(ctx, REGIONS[key], key);
    weights.push(value);
  }

  const validWeights = weights.filter(v => !isNaN(v));
  const avgWeight = validWeights.length > 0
    ? validWeights.reduce((a, b) => a + b, 0) / validWeights.length
    : 0;

  const cog = calculateCOG(weights);

  return {
    success: true,
    w1: weights[0],
    w2: weights[1],
    w3: weights[2],
    w4: weights[3],
    weights,
    avgWeight: Number(avgWeight.toFixed(2)),
    cog,
    productCode: ""
  };
}

function recognizeNumber(ctx, region, sensorName) {
  const { x1, x2, y1, y2 } = region;
  const w = x2 - x1;
  const h = y2 - y1;

  const regionCanvas = document.createElement("canvas");
  regionCanvas.width = w;
  regionCanvas.height = h;
  const regionCtx = regionCanvas.getContext("2d", { willReadFrequently: true });
  regionCtx.drawImage(ctx.canvas, x1, y1, w, h, 0, 0, w, h);

  const binary = createBinary(regionCanvas);
  const chars = segmentCharacters(binary);

  console.log(`${sensorName}: 分割出 ${chars.length} 个字符`);
  
  if (chars.length === 0) {
    console.log(`${sensorName}: 未检测到字符`);
    return NaN;
  }

  let result = "";
  for (let i = 0; i < chars.length; i++) {
    const digit = recognizeDigit(chars[i]);
    console.log(`${sensorName}: 字符 ${i} 识别为 "${digit}"`);
    result += digit;
  }

  result = result.replace(/[^0-9.]/g, "");
  
  console.log(`${sensorName}: 最终结果 "${result}"`);
  
  if (result.length === 0) return NaN;
  
  const value = parseFloat(result);
  return isNaN(value) ? NaN : value;
}

function createBinary(canvas) {
  const scale = 4;
  const out = document.createElement("canvas");
  out.width = canvas.width * scale;
  out.height = canvas.height * scale;

  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;

  const grays = [];
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    grays.push(gray);
  }
  
  grays.sort((a, b) => a - b);
  const threshold = grays[Math.floor(grays.length * 0.7)];

  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const val = gray > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = val;
  }

  ctx.putImageData(img, 0, 0);
  return out;
}

function segmentCharacters(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  
  const cols = [];
  const minRow = Math.floor(canvas.height * 0.05);
  const maxRow = Math.floor(canvas.height * 0.95);

  for (let x = 0; x < canvas.width; x++) {
    let count = 0;
    for (let y = minRow; y < maxRow; y++) {
      if (d[(y * canvas.width + x) * 4] > 200) count++;
    }
    cols.push(count);
  }

  const charRegions = [];
  let inChar = false;
  let startX = 0;
  const minHeight = (maxRow - minRow) * 0.1;

  for (let i = 0; i < cols.length; i++) {
    const hasContent = cols[i] > minHeight;
    
    if (hasContent && !inChar) {
      inChar = true;
      startX = i;
    } else if (!hasContent && inChar) {
      inChar = false;
      const charWidth = i - startX;
      if (charWidth > 3 && charWidth < canvas.width * 0.5) {
        charRegions.push({ start: startX, end: i });
      }
    }
  }

  if (inChar) {
    const charWidth = cols.length - startX;
    if (charWidth > 3) {
      charRegions.push({ start: startX, end: cols.length });
    }
  }

  return charRegions.map(r => {
    const c = document.createElement("canvas");
    c.width = r.end - r.start;
    c.height = canvas.height;
    const cctx = c.getContext("2d", { willReadFrequently: true });
    cctx.drawImage(canvas, r.start, 0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  });
}

function recognizeDigit(canvas) {
  const width = canvas.width;
  const height = canvas.height;

  if (width < 5 || height < 8) {
    const isDot = checkIsDot(canvas);
    return isDot ? "." : "";
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;

  const segments = detectSegments(d, width, height);
  
  const digit = matchBySegments(segments);
  if (digit) return digit;

  return recognizeByPattern(canvas);
}

function checkIsDot(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  
  let whiteCount = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 200) whiteCount++;
  }
  
  if (whiteCount < 3) return false;
  
  const centerY = Math.floor(canvas.height * 0.7);
  let bottomWhite = 0;
  for (let y = centerY; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (d[i] > 200) bottomWhite++;
    }
  }
  
  return bottomWhite > whiteCount * 0.5;
}

function detectSegments(data, width, height) {
  const seg = {
    a: checkSegmentArea(data, width, height, 0.15, 0.02, 0.7, 0.12),
    b: checkSegmentArea(data, width, height, 0.75, 0.05, 0.2, 0.42),
    c: checkSegmentArea(data, width, height, 0.75, 0.52, 0.2, 0.42),
    d: checkSegmentArea(data, width, height, 0.15, 0.82, 0.7, 0.15),
    e: checkSegmentArea(data, width, height, 0.02, 0.52, 0.2, 0.42),
    f: checkSegmentArea(data, width, height, 0.02, 0.05, 0.2, 0.42),
    g: checkSegmentArea(data, width, height, 0.15, 0.45, 0.7, 0.12)
  };
  
  return seg;
}

function checkSegmentArea(data, width, height, px, py, pw, ph) {
  const startX = Math.floor(width * px);
  const startY = Math.floor(height * py);
  const endX = Math.floor(width * (px + pw));
  const endY = Math.floor(height * (py + ph));
  
  let white = 0;
  let total = 0;
  
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (y >= 0 && y < height && x >= 0 && x < width) {
        const i = (y * width + x) * 4;
        if (data[i] > 128) white++;
        total++;
      }
    }
  }
  
  return total > 0 && (white / total) > 0.4;
}

function matchBySegments(seg) {
  if (seg.a && seg.b && seg.c && seg.d && seg.e && seg.f && !seg.g) return "0";
  if (!seg.a && seg.b && seg.c && !seg.d && !seg.e && !seg.f && !seg.g) return "1";
  if (seg.a && seg.b && !seg.c && seg.d && seg.e && !seg.f && seg.g) return "2";
  if (seg.a && seg.b && seg.c && seg.d && !seg.e && !seg.f && seg.g) return "3";
  if (!seg.a && seg.b && seg.c && !seg.d && !seg.e && seg.f && seg.g) return "4";
  if (seg.a && !seg.b && seg.c && seg.d && !seg.e && seg.f && seg.g) return "5";
  if (seg.a && !seg.b && seg.c && seg.d && seg.e && seg.f && seg.g) return "6";
  if (seg.a && seg.b && seg.c && !seg.d && !seg.e && !seg.f && !seg.g) return "7";
  if (seg.a && seg.b && seg.c && seg.d && seg.e && seg.f && seg.g) return "8";
  if (seg.a && seg.b && seg.c && seg.d && !seg.e && seg.f && seg.g) return "9";
  return null;
}

function recognizeByPattern(canvas) {
  const pattern = extractPattern(canvas);
  
  if (!pattern || pattern.length === 0) return "";

  const templates = {
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "001", "001", "001"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"],
    ".": ["0", "0", "0", "0", "1"]
  };

  let bestMatch = "";
  let bestScore = 9999;

  for (const [digit, template] of Object.entries(templates)) {
    const score = comparePatterns(pattern, template);
    if (score < bestScore) {
      bestScore = score;
      bestMatch = digit;
    }
  }

  return bestScore < 5 ? bestMatch : "";
}

function extractPattern(canvas) {
  const width = canvas.width;
  const height = canvas.height;

  if (width < 6 || height < 12) return null;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;

  const gridW = 3;
  const gridH = 5;
  const cellW = width / gridW;
  const cellH = height / gridH;

  const pattern = [];

  for (let gy = 0; gy < gridH; gy++) {
    let row = "";
    for (let gx = 0; gx < gridW; gx++) {
      const startX = Math.floor(gx * cellW);
      const startY = Math.floor(gy * cellH);
      const endX = Math.floor((gx + 1) * cellW);
      const endY = Math.floor((gy + 1) * cellH);

      let whiteCount = 0;
      let total = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          if (y < height && x < width) {
            const i = (y * width + x) * 4;
            if (d[i] > 128) whiteCount++;
            total++;
          }
        }
      }

      row += (total > 0 && whiteCount / total > 0.35) ? "1" : "0";
    }
    pattern.push(row);
  }

  return pattern;
}

function comparePatterns(a, b) {
  if (!a || !b) return 9999;

  let diff = 0;
  const maxLen = Math.max(a.length, b.length);

  for (let i = 0; i < maxLen; i++) {
    const rowA = a[i] || "";
    const rowB = b[i] || "";
    const maxRowLen = Math.max(rowA.length, rowB.length);

    for (let j = 0; j < maxRowLen; j++) {
      const charA = rowA[j] || "0";
      const charB = rowB[j] || "0";
      if (charA !== charB) diff++;
    }
  }

  return diff;
}

function calculateCOG(weights) {
  const valid = weights.filter(v => !isNaN(v));
  if (valid.length === 0) return { x: 0, y: 0 };

  const positions = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 }
  ];

  let sx = 0, sy = 0, total = 0;
  weights.forEach((w, i) => {
    if (!isNaN(w)) {
      sx += positions[i].x * w;
      sy += positions[i].y * w;
      total += w;
    }
  });

  if (total === 0) return { x: 0, y: 0 };

  return {
    x: Number((sx / total).toFixed(2)),
    y: Number((sy / total).toFixed(2))
  };
}

function getPerspectiveTransform(src, dst) {
  const m = [];
  for (let i = 0; i < 4; i++) {
    m.push([src[i].x, src[i].y, 1, 0, 0, 0, -src[i].x * dst[i].x, -src[i].y * dst[i].x]);
    m.push([0, 0, 0, src[i].x, src[i].y, 1, -src[i].x * dst[i].y, -src[i].y * dst[i].y]);
  }
  
  const b = [];
  for (let i = 0; i < 4; i++) { b.push(dst[i].x); b.push(dst[i].y); }
  
  const n = m.length;
  const aug = m.map((row, i) => [...row, b[i]]);
  
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) {
      for (let i = 0; i < n; i++) aug[i][n] = i < 8 ? (i < 3 ? 1 : 0) : 0;
      return aug.map(row => row[n]);
    }
    
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = 0;
    for (let j = row + 1; j < n; j++) sum += aug[row][j] * x[j];
    x[row] = (aug[row][n] - sum) / aug[row][row];
  }
  
  return [[x[0], x[1], x[2]], [x[3], x[4], x[5]], [x[6], x[7], 1]];
}

function perspectiveWarp(ctx, img, M, w, h) {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  srcCtx.drawImage(img, 0, 0);
  
  const srcImageData = srcCtx.getImageData(0, 0, img.width, img.height);
  const srcData = srcImageData.data;
  
  const dstImageData = ctx.createImageData(w, h);
  const dstData = dstImageData.data;
  
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const denom = M[2][0] * dx + M[2][1] * dy + M[2][2];
      if (Math.abs(denom) < 1e-10) continue;
      
      const sx = (M[0][0] * dx + M[0][1] * dy + M[0][2]) / denom;
      const sy = (M[1][0] * dx + M[1][1] * dy + M[1][2]) / denom;
      
      if (sx >= 0 && sx < img.width - 1 && sy >= 0 && sy < img.height - 1) {
        const sx0 = Math.floor(sx);
        const sy0 = Math.floor(sy);
        const sx1 = sx0 + 1;
        const sy1 = sy0 + 1;
        
        const fx = sx - sx0;
        const fy = sy - sy0;
        
        const idx00 = (sy0 * img.width + sx0) * 4;
        const idx01 = (sy0 * img.width + sx1) * 4;
        const idx10 = (sy1 * img.width + sx0) * 4;
        const idx11 = (sy1 * img.width + sx1) * 4;
        
        for (let c = 0; c < 4; c++) {
          const val = (1 - fx) * (1 - fy) * srcData[idx00 + c] +
                      fx * (1 - fy) * srcData[idx01 + c] +
                      (1 - fx) * fy * srcData[idx10 + c] +
                      fx * fy * srcData[idx11 + c];
          dstData[(dy * w + dx) * 4 + c] = Math.round(val);
        }
      }
    }
  }
  
  ctx.putImageData(dstImageData, 0, 0);
}

export default { processImage, loadTemplate };