export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { files } = req.body;
    const results = [];

    for (const fileData of files) {
      const { filename } = fileData;
      
      // 模拟识别结果（实际应用中需要集成 OCR）
      const readings = {
        "#1": 9.6,
        "#2": 9.5,
        "#3": 1.6,
        "#4": 1.8
      };

      // 计算重量和重心
      const weight = Math.round((readings["#1"] + readings["#2"] + readings["#3"] + readings["#4"]) * 100) / 100;
      const cog = weight > 0 
        ? Math.round((((readings["#3"] + readings["#4"]) / weight) * 150) * 10000) / 10000
        : 0;

      results.push({
        filename,
        success: true,
        w1: readings["#1"],
        w2: readings["#2"],
        w3: readings["#3"],
        w4: readings["#4"],
        weight,
        cog
      });
    }

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}