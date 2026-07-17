import { useEffect, useState } from 'react';

export default function ProgressBar({ progress, className = '' }) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress]);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-neutral-100 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            animatedProgress === 100 
              ? 'bg-success-50 text-success-500' 
              : 'bg-primary-50 text-primary-500'
          }`}>
            {animatedProgress === 100 ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-700">
              {animatedProgress === 100 ? '处理完成' : '正在处理'}
            </p>
            <p className="text-xs text-neutral-500">
              {animatedProgress === 100 ? '所有文件已处理完毕' : '请稍候...'}
            </p>
          </div>
        </div>
        <span className="text-2xl font-bold text-primary-600">{animatedProgress}%</span>
      </div>
      
      <div className="relative h-3 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${animatedProgress}%` }}
        />
        {/* 光效 */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${animatedProgress}%` }}
        />
      </div>
    </div>
  );
}