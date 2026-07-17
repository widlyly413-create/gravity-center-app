import { Download, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export default function DownloadButton({ onClick }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const handleClick = async () => {
    setIsDownloading(true);
    await onClick();
    setIsDownloading(false);
    setIsComplete(true);
    
    setTimeout(() => {
      setIsComplete(false);
    }, 2000);
  };

  return (
    <button
      onClick={handleClick}
      disabled={isDownloading}
      className={`group relative flex items-center gap-2 px-5 py-2.5 font-medium rounded-xl transition-all duration-300 btn-active ${
        isComplete
          ? 'bg-success-500 text-white shadow-lg shadow-success-500/30'
          : 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/30 hover:shadow-primary-500/40'
      }`}
    >
      {isComplete ? (
        <>
          <CheckCircle2 className="w-5 h-5" />
          已导出
        </>
      ) : isDownloading ? (
        <>
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          导出中...
        </>
      ) : (
        <>
          <Download className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
          导出 CSV
        </>
      )}
      
      {/* 按钮光效 */}
      {!isComplete && (
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}