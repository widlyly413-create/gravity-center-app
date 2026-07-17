import { useState, useCallback } from 'react';
import FileUploader from '../components/FileUploader';
import ProgressBar from '../components/ProgressBar';
import ResultTable from '../components/ResultTable';
import DownloadButton from '../components/DownloadButton';
import { processImage } from '../utils/imageProcessor';
import { Upload, FileImage, Archive, Trash2, Calculator, Layers, CheckCircle2 } from 'lucide-react';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFilesAdded = useCallback((newFiles) => {
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleFileRemove = useCallback((index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearAll = useCallback(() => {
    setFiles([]);
    setResults([]);
  }, []);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProgress(0);
    setResults([]);

    try {
      const newResults = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          const result = await processImage(file);
          
          if (result.success) {
            const weight = Math.round((result.w1 + result.w2 + result.w3 + result.w4) * 100) / 100;
            const cog = weight > 0 
              ? Math.round((((result.w3 + result.w4) / weight) * 150) * 10000) / 10000
              : 0;
            
            newResults.push({
              filename: file.name,
              success: true,
              w1: Math.round(result.w1 * 100) / 100,
              w2: Math.round(result.w2 * 100) / 100,
              w3: Math.round(result.w3 * 100) / 100,
              w4: Math.round(result.w4 * 100) / 100,
              weight,
              cog
            });
          } else {
            newResults.push({
              filename: file.name,
              success: false,
              w1: 0,
              w2: 0,
              w3: 0,
              w4: 0,
              weight: 0,
              cog: 0,
              error: result.error
            });
          }
        } catch (error) {
          newResults.push({
            filename: file.name,
            success: false,
            w1: 0,
            w2: 0,
            w3: 0,
            w4: 0,
            weight: 0,
            cog: 0,
            error: error.message
          });
        }
        
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      
      setResults(newResults);
    } catch (error) {
      console.error('处理错误:', error);
      alert('处理失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  }, [files]);

  const handleDownloadCSV = useCallback(() => {
    if (results.length === 0) return;

    const headers = ['文件名', '#1', '#2', '#3', '#4', '重量 (Weight)', '重心 (CoG)'];
    const csvContent = [
      headers.join(','),
      ...results.map(r => [
        `"${r.filename}"`,
        r.w1,
        r.w2,
        r.w3,
        r.w4,
        r.weight,
        r.cog
      ].join(','))
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'measurement_results.csv';
    link.click();
  }, [results]);

  return (
    <div className="min-h-screen bg-gradient-professional">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-neutral-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-800 tracking-tight">重心重量计算系统</h1>
                <p className="text-sm text-neutral-500 mt-0.5">批量图像处理与数据分析平台</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Layers className="w-4 h-4" />
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">已上传文件</p>
                <p className="text-3xl font-bold text-neutral-800">{files.length}</p>
              </div>
              <div className="w-14 h-14 bg-primary-50 rounded-xl flex items-center justify-center">
                <FileImage className="w-7 h-7 text-primary-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">处理成功</p>
                <p className="text-3xl font-bold text-success-500">
                  {results.filter(r => r.success).length}
                </p>
              </div>
              <div className="w-14 h-14 bg-success-50 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-success-500" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">处理失败</p>
                <p className="text-3xl font-bold text-error-500">
                  {results.filter(r => !r.success).length}
                </p>
              </div>
              <div className="w-14 h-14 bg-error-50 rounded-xl flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-error-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8 mb-8 card-hover">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-neutral-800">文件上传</h2>
              <p className="text-sm text-neutral-500 mt-1">支持拖拽上传或点击选择文件</p>
            </div>
            {files.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-neutral-600 hover:text-error-500 hover:bg-error-50 rounded-lg transition-all"
              >
                <Trash2 className="w-4 h-4" />
                清空全部
              </button>
            )}
          </div>
          <FileUploader onFilesAdded={handleFilesAdded} />
          
          {files.length > 0 && (
            <div className="mt-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-neutral-200"></div>
                <span className="text-xs text-neutral-500 uppercase tracking-wider">已选择 {files.length} 个文件</span>
                <div className="h-px flex-1 bg-neutral-200"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl hover:bg-neutral-100 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        file.name.endsWith('.zip') 
                          ? 'bg-amber-50 text-amber-600' 
                          : 'bg-primary-50 text-primary-600'
                      }`}>
                        {file.name.endsWith('.zip') ? (
                          <Archive className="w-5 h-5" />
                        ) : (
                          <FileImage className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-700 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {file.size >= 1024 
                            ? `${(file.size / 1024).toFixed(1)} KB` 
                            : `${file.size} B`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleFileRemove(index)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-neutral-400 hover:text-error-500 hover:bg-error-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Process Button */}
        <div className="flex justify-center mb-8">
          <button
            onClick={handleProcess}
            disabled={files.length === 0 || isProcessing}
            className="group relative px-10 py-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-semibold rounded-2xl shadow-lg shadow-primary-600/30 hover:from-primary-700 hover:to-primary-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:from-primary-600 disabled:hover:to-primary-700 btn-active"
          >
            <span className="flex items-center gap-3">
              {isProcessing ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  处理中...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 transition-transform group-hover:translate-y-0.5" />
                  开始处理
                </>
              )}
            </span>
            {/* 按钮光效 */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <ProgressBar progress={progress} className="mb-8" />
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8 card-hover animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-neutral-800">处理结果</h2>
                <p className="text-sm text-neutral-500 mt-1">
                  共 {results.length} 个文件，成功 {results.filter(r => r.success).length} 个
                </p>
              </div>
              <DownloadButton onClick={handleDownloadCSV} />
            </div>
            <ResultTable results={results} />
          </div>
        )}

        {/* Empty State */}
        {!isProcessing && results.length === 0 && files.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-16 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-neutral-100 to-neutral-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileImage className="w-12 h-12 text-neutral-400" />
            </div>
            <h3 className="text-xl font-semibold text-neutral-700 mb-3">开始上传文件</h3>
            <p className="text-neutral-500 max-w-md mx-auto">
              拖拽图片文件或压缩包到上传区域，系统将自动进行重心重量计算
            </p>
            <div className="flex items-center justify-center gap-6 mt-6">
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <div className="w-2 h-2 rounded-full bg-primary-500"></div>
                <span>支持 JPG、PNG</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span>支持 ZIP 压缩包</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white/60 backdrop-blur-md border-t border-neutral-200 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Calculator className="w-4 h-4" />
              <span>重心重量计算系统 © 2024</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-neutral-500">
              <span>版本 1.0.0</span>
              <span>|</span>
              <span>支持批量处理</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}