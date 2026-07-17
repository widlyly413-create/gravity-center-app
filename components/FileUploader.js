import { useState, useCallback, useRef } from 'react';
import { Upload, FileImage, Archive } from 'lucide-react';

export default function FileUploader({ onFilesAdded }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files);
    handleFiles(selectedFiles);
    e.target.value = '';
  }, []);

  const handleFiles = useCallback((files) => {
    const validFiles = files.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'zip'].includes(ext);
    });
    if (validFiles.length > 0) {
      onFilesAdded(validFiles);
    }
  }, [onFilesAdded]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
        isDragOver
          ? 'border-primary-400 bg-primary-50/50'
          : 'border-neutral-200 hover:border-primary-300 hover:bg-neutral-50'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.zip"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-4">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 ${
          isDragOver 
            ? 'bg-primary-100 scale-110' 
            : 'bg-gradient-to-br from-neutral-100 to-neutral-200'
        }`}>
          <Upload className={`w-10 h-10 transition-colors duration-300 ${
            isDragOver ? 'text-primary-600' : 'text-neutral-400'
          }`} />
        </div>
        <div>
          <p className="text-lg font-medium text-neutral-700 mb-1">
            {isDragOver ? '释放文件以上传' : '拖拽文件到此处或点击选择'}
          </p>
          <p className="text-sm text-neutral-500">
            支持 JPG、JPEG、PNG 图片文件或 ZIP 压缩包
          </p>
        </div>
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <FileImage className="w-5 h-5 text-primary-500" />
            <span>图片</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Archive className="w-5 h-5 text-amber-500" />
            <span>压缩包</span>
          </div>
        </div>
      </div>
      
      {/* 装饰性背景图案 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        <div className={`absolute top-4 left-4 w-8 h-8 rounded-full opacity-20 transition-opacity duration-300 ${
          isDragOver ? 'bg-primary-400 opacity-40' : 'bg-neutral-300'
        }`} />
        <div className={`absolute bottom-4 right-4 w-12 h-12 rounded-full opacity-10 transition-opacity duration-300 ${
          isDragOver ? 'bg-primary-500 opacity-30' : 'bg-neutral-400'
        }`} />
      </div>
    </div>
  );
}