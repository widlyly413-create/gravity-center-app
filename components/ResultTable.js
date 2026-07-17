import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export default function ResultTable({ results }) {
  const [sortConfig, setSortConfig] = useState({ key: 'filename', direction: 'asc' });
  const [expandedRows, setExpandedRows] = useState(new Set());

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleRow = (index) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const sortedResults = [...results].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ChevronDown className="w-4 h-4 text-neutral-400" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-4 h-4 text-primary-500" />
      : <ChevronDown className="w-4 h-4 text-primary-500" />;
  };

  const totalWeight = results.reduce((sum, r) => sum + (r.weight || 0), 0);
  const avgCog = results.length > 0 
    ? (results.reduce((sum, r) => sum + (r.cog || 0), 0) / results.length).toFixed(2)
    : '0';

  return (
    <div className="overflow-hidden">
      {/* 汇总信息 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-neutral-50 rounded-xl">
        <div className="text-center">
          <p className="text-2xl font-bold text-neutral-800">{results.length}</p>
          <p className="text-xs text-neutral-500">总文件数</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-success-500">
            {results.filter(r => r.success).length}
          </p>
          <p className="text-xs text-neutral-500">成功</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary-600">{totalWeight.toFixed(2)}</p>
          <p className="text-xs text-neutral-500">总重量</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-accent-600">{avgCog}</p>
          <p className="text-xs text-neutral-500">平均重心</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-neutral-50 to-neutral-100">
              <th className="px-6 py-4 text-left font-semibold text-neutral-600 rounded-tl-xl">
                <button onClick={() => handleSort('filename')} className="flex items-center gap-2 hover:text-primary-600 transition-colors">
                  文件名
                  {renderSortIcon('filename')}
                </button>
              </th>
              <th className="px-4 py-4 text-center font-semibold text-neutral-600">
                <button onClick={() => handleSort('w1')} className="flex items-center justify-center gap-2 hover:text-primary-600 transition-colors">
                  #1
                  {renderSortIcon('w1')}
                </button>
              </th>
              <th className="px-4 py-4 text-center font-semibold text-neutral-600">
                <button onClick={() => handleSort('w2')} className="flex items-center justify-center gap-2 hover:text-primary-600 transition-colors">
                  #2
                  {renderSortIcon('w2')}
                </button>
              </th>
              <th className="px-4 py-4 text-center font-semibold text-neutral-600">
                <button onClick={() => handleSort('w3')} className="flex items-center justify-center gap-2 hover:text-primary-600 transition-colors">
                  #3
                  {renderSortIcon('w3')}
                </button>
              </th>
              <th className="px-4 py-4 text-center font-semibold text-neutral-600">
                <button onClick={() => handleSort('w4')} className="flex items-center justify-center gap-2 hover:text-primary-600 transition-colors">
                  #4
                  {renderSortIcon('w4')}
                </button>
              </th>
              <th className="px-4 py-4 text-center font-semibold text-neutral-600">
                <button onClick={() => handleSort('weight')} className="flex items-center justify-center gap-2 hover:text-primary-600 transition-colors">
                  重量
                  {renderSortIcon('weight')}
                </button>
              </th>
              <th className="px-4 py-4 text-center font-semibold text-neutral-600">
                <button onClick={() => handleSort('cog')} className="flex items-center justify-center gap-2 hover:text-primary-600 transition-colors">
                  重心
                  {renderSortIcon('cog')}
                </button>
              </th>
              <th className="px-6 py-4 text-center font-semibold text-neutral-600 rounded-tr-xl">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sortedResults.map((result, index) => (
              <>
                <tr 
                  key={index} 
                  className={`hover:bg-neutral-50 transition-colors cursor-pointer ${
                    expandedRows.has(index) ? 'bg-neutral-50' : ''
                  }`}
                  onClick={() => toggleRow(index)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle2 className="w-5 h-5 text-success-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-error-500 flex-shrink-0" />
                      )}
                      <span className="font-medium text-neutral-700 truncate max-w-xs">
                        {result.filename}
                      </span>
                      {result.success && (
                        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${
                          expandedRows.has(index) ? 'rotate-180' : ''
                        }`} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center text-neutral-600">
                    {result.w1 ?? '-'}
                  </td>
                  <td className="px-4 py-4 text-center text-neutral-600">
                    {result.w2 ?? '-'}
                  </td>
                  <td className="px-4 py-4 text-center text-neutral-600">
                    {result.w3 ?? '-'}
                  </td>
                  <td className="px-4 py-4 text-center text-neutral-600">
                    {result.w4 ?? '-'}
                  </td>
                  <td className="px-4 py-4 text-center font-semibold text-primary-600">
                    {result.weight ?? '-'}
                  </td>
                  <td className="px-4 py-4 text-center font-semibold text-accent-600">
                    {result.cog ?? '-'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                      result.success
                        ? 'bg-success-50 text-success-700'
                        : 'bg-error-50 text-error-700'
                    }`}>
                      {result.success ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          成功
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          失败
                        </>
                      )}
                    </span>
                  </td>
                </tr>
                {expandedRows.has(index) && result.success && (
                  <tr className="bg-neutral-50">
                    <td colSpan={8} className="px-6 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-white rounded-xl border border-neutral-100">
                          <p className="text-xs text-neutral-500 mb-2">计算详情</p>
                          <div className="grid grid-cols-4 gap-4 text-center">
                            <div>
                              <p className="text-lg font-semibold text-neutral-800">{result.w1}</p>
                              <p className="text-xs text-neutral-500">#1 传感器</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-neutral-800">{result.w2}</p>
                              <p className="text-xs text-neutral-500">#2 传感器</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-neutral-800">{result.w3}</p>
                              <p className="text-xs text-neutral-500">#3 传感器</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-neutral-800">{result.w4}</p>
                              <p className="text-xs text-neutral-500">#4 传感器</p>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-white rounded-xl border border-neutral-100">
                          <p className="text-xs text-neutral-500 mb-2">计算结果</p>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-2xl font-bold text-primary-600">{result.weight}</p>
                              <p className="text-xs text-neutral-500">总重量</p>
                            </div>
                            <div className="w-px h-12 bg-neutral-200"></div>
                            <div>
                              <p className="text-2xl font-bold text-accent-600">{result.cog}</p>
                              <p className="text-xs text-neutral-500">重心位置</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}