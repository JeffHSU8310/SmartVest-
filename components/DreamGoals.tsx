
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { PortfolioItem, Stock, Market } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Rocket, TrendingUp, Calendar, Target, DollarSign, Calculator, Wallet, Filter, Coins, X, Delete, Equal, Check, ChevronDown } from 'lucide-react';

interface Props {
  portfolio: PortfolioItem[];
  onUpdateStock: (stock: Stock) => void;
  exchangeRate: number;
}

// --- MultiSelect Component (Local) ---
const MultiSelect = ({ 
  label, 
  options, 
  value, 
  onChange 
}: { 
  label: string, 
  options: {id: string, name: string}[], 
  value: string[], 
  onChange: (val: string[]) => void 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (id: string) => {
    if (id === 'ALL') {
      onChange(['ALL']);
    } else {
      let newValue = [...value];
      if (newValue.includes('ALL')) {
        newValue = [];
      }
      
      if (newValue.includes(id)) {
        newValue = newValue.filter(v => v !== id);
      } else {
        newValue.push(id);
      }
      
      if (newValue.length === 0) {
        onChange(['ALL']);
      } else {
        onChange(newValue);
      }
    }
  };

  const displayValue = value.includes('ALL') 
    ? `全部持股組合` 
    : value.length === 1 
      ? options.find(o => o.id === value[0])?.name || value[0] 
      : `已選 ${value.length} 檔標的`;

  return (
    <div className="relative" ref={ref}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center bg-white p-1.5 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <div className="px-3 py-1.5 bg-slate-100 rounded-lg mr-2 text-slate-500">
           <Filter size={16} />
        </div>
        <div className="flex items-center justify-between gap-2 min-w-[150px] pr-2">
            <span className="text-sm font-bold text-slate-700 select-none truncate max-w-[180px]">{displayValue}</span>
            <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 max-h-[300px] overflow-y-auto animate-in fade-in zoom-in-95">
          <div 
            onClick={() => toggleOption('ALL')}
            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer"
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${value.includes('ALL') ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
              {value.includes('ALL') && <Check size={10} className="text-white" />}
            </div>
            <span className={`text-sm font-bold ${value.includes('ALL') ? 'text-blue-600' : 'text-slate-700'}`}>全部持股組合</span>
          </div>
          <div className="h-px bg-slate-100 my-1"></div>
          {options.map(opt => (
            <div 
              key={opt.id}
              onClick={() => toggleOption(opt.id)}
              className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer group"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${value.includes(opt.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300 group-hover:border-blue-300'}`}>
                {value.includes(opt.id) && <Check size={10} className="text-white" />}
              </div>
              <span className={`text-sm font-medium truncate ${value.includes(opt.id) ? 'text-slate-900' : 'text-slate-600'}`}>{opt.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Calculator Component (Local) ---
const CalculatorPopup = ({ 
    isOpen, 
    onClose, 
    onApply, 
    initialValue, 
    label 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    onApply: (val: string) => void, 
    initialValue: string, 
    label: string 
}) => {
    const [expression, setExpression] = useState(initialValue || '0');
    const [result, setResult] = useState<string | null>(null);
    const [isResultFinal, setIsResultFinal] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setExpression(initialValue || '0');
            setResult(null);
            setIsResultFinal(false);
        }
    }, [isOpen, initialValue]);

    const handleBtn = (val: string) => {
        if (isResultFinal) {
            setExpression(val);
            setIsResultFinal(false);
            setResult(null);
        } else {
            setExpression(prev => (prev === '0' && val !== '.') ? val : prev + val);
        }
    };

    const handleOp = (op: string) => {
        setIsResultFinal(false);
        setExpression(prev => prev + op);
    };

    const handleClear = () => {
        setExpression('0');
        setResult(null);
        setIsResultFinal(false);
    };

    const handleDelete = () => {
        if (isResultFinal) {
            handleClear();
        } else {
            setExpression(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
        }
    };

    const calculate = () => {
        try {
            // Safe evaluation for simple math
            const safeExpr = expression.replace(/x/g, '*').replace(/[^-()\d/*+.]/g, '');
            // eslint-disable-next-line no-new-func
            const res = new Function('return ' + safeExpr)();
            const resStr = String(Math.round(res * 10000) / 10000);
            setResult(resStr);
            setExpression(resStr);
            setIsResultFinal(true);
        } catch (e) {
            setResult('Error');
            setIsResultFinal(true);
        }
    };

    const handleConfirm = () => {
        if (result && result !== 'Error') {
            onApply(result);
        } else {
            try {
                const safeExpr = expression.replace(/x/g, '*').replace(/[^-()\d/*+.]/g, '');
                // eslint-disable-next-line no-new-func
                const res = new Function('return ' + safeExpr)();
                if (!isNaN(res)) {
                    onApply(String(Math.round(res * 10000) / 10000));
                } else {
                    onApply(expression);
                }
            } catch (e) {
                onApply(expression);
            }
        }
    };

    if (!isOpen) return null;

    const btnClass = "flex-1 py-3 text-lg font-bold rounded-xl active:scale-95 transition-all shadow-sm flex items-center justify-center";
    const numClass = `${btnClass} bg-white text-slate-700 hover:bg-slate-50 border border-slate-200`;
    const opClass = `${btnClass} bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100`;
    const actionClass = `${btnClass} bg-slate-200 text-slate-600 hover:bg-slate-300`;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[320px] overflow-hidden border border-slate-200">
                <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2"><Calculator size={18}/> 計算機 - {label}</h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="p-4 bg-slate-100 text-right">
                    <div className="text-sm text-slate-400 min-h-[1.25em]">{isResultFinal ? 'Result' : ''}</div>
                    <div className="text-3xl font-mono font-bold text-slate-800 break-all">{expression}</div>
                </div>
                <div className="p-4 grid grid-cols-4 gap-2 bg-slate-50">
                    <button onClick={handleClear} className={actionClass}>AC</button>
                    <button onClick={handleDelete} className={actionClass}><Delete size={20}/></button>
                    <button onClick={() => handleOp('/')} className={opClass}>/</button>
                    <button onClick={() => handleOp('*')} className={opClass}>x</button>

                    <button onClick={() => handleBtn('7')} className={numClass}>7</button>
                    <button onClick={() => handleBtn('8')} className={numClass}>8</button>
                    <button onClick={() => handleBtn('9')} className={numClass}>9</button>
                    <button onClick={() => handleOp('-')} className={opClass}>-</button>

                    <button onClick={() => handleBtn('4')} className={numClass}>4</button>
                    <button onClick={() => handleBtn('5')} className={numClass}>5</button>
                    <button onClick={() => handleBtn('6')} className={numClass}>6</button>
                    <button onClick={() => handleOp('+')} className={opClass}>+</button>

                    <button onClick={() => handleBtn('1')} className={numClass}>1</button>
                    <button onClick={() => handleBtn('2')} className={numClass}>2</button>
                    <button onClick={() => handleBtn('3')} className={numClass}>3</button>
                    <button onClick={calculate} className={`${opClass} row-span-2 bg-indigo-600 text-white hover:bg-indigo-700 border-transparent shadow-md`}><Equal size={24}/></button>

                    <button onClick={() => handleBtn('0')} className={`${numClass} col-span-2`}>0</button>
                    <button onClick={() => handleBtn('.')} className={numClass}>.</button>
                </div>
                <div className="p-4 border-t border-slate-200">
                    <button onClick={handleConfirm} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                        <Check size={20}/> 套用數值
                    </button>
                </div>
            </div>
        </div>
    );
};

const DreamGoals: React.FC<Props> = ({ portfolio, onUpdateStock, exchangeRate }) => {
  const [filterStockIds, setFilterStockIds] = useState<string[]>(['ALL']);
  
  // Calculator State
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcStockId, setCalcStockId] = useState<string | null>(null);
  const [calcValue, setCalcValue] = useState('');

  // Only consider stocks that are currently held (Active Holdings)
  const activeHoldings = useMemo(() => {
    return portfolio.filter(p => p.totalShares > 0).sort((a, b) => b.marketValue - a.marketValue);
  }, [portfolio]);

  // Holdings to display based on multi-select filter
  const displayHoldings = useMemo(() => {
      if (filterStockIds.includes('ALL')) return activeHoldings;
      return activeHoldings.filter(item => filterStockIds.includes(item.stock.id));
  }, [activeHoldings, filterStockIds]);

  const normalizeValue = (item: PortfolioItem) => {
    // Correctly handle USD currency for all markets (US, Commodity, Fund etc.)
    const isUSD = item.stock.currency === 'USD' || (item.stock.market === Market.US && !item.stock.currency);
    if (isUSD) {
      return item.marketValue * exchangeRate;
    }
    return item.marketValue;
  };

  // Calculate Totals based on Filtered Holdings
  const currentTotalValue = useMemo(() => {
    return displayHoldings.reduce((sum, item) => sum + normalizeValue(item), 0);
  }, [displayHoldings, exchangeRate]);

  // Calculate Year-by-Year Growth based on Filtered Holdings
  const projectionData = useMemo(() => {
    if (displayHoldings.length === 0) return [];

    const maxYears = Math.max(...displayHoldings.map(item => item.stock.targetYears || 25), 25);
    const data = [];
    const currentYear = new Date().getFullYear();

    // Year 0 (Current)
    data.push({
        year: currentYear,
        displayYear: '現在',
        totalValue: currentTotalValue,
        totalInvested: currentTotalValue,
        profit: 0
    });

    for (let i = 1; i <= maxYears; i++) {
        let yearlyTotal = 0;
        let yearlyInvested = currentTotalValue;
        
        displayHoldings.forEach(item => {
            const principal = normalizeValue(item);
            const rate = (item.stock.expectedReturnRate || 5) / 100;
            const yearsToGrow = item.stock.targetYears || 25;
            
            // Treat stored annualInvestment as "Monthly Investment" now
            const monthlyInvRaw = item.stock.annualInvestment || 0;
            const annualInvRaw = monthlyInvRaw * 12;

            // Check currency for investment amount conversion
            const isUSD = item.stock.currency === 'USD' || (item.stock.market === Market.US && !item.stock.currency);
            const annualInv = isUSD ? annualInvRaw * exchangeRate : annualInvRaw;

            // Compound Interest Formula for Year i
            // Logic: Growth stops after targetYears.
            const n = Math.min(i, yearsToGrow);
            
            // 1. Future Value of Initial Principal
            const fvPrincipal = principal * Math.pow(1 + rate, n);
            
            // 2. Future Value of Annual Contributions (Annuity)
            // Formula: PMT * [((1 + r)^n - 1) / r]
            let fvSeries = 0;
            if (rate === 0) {
                fvSeries = annualInv * n;
            } else {
                fvSeries = annualInv * (Math.pow(1 + rate, n) - 1) / rate;
            }
            
            yearlyTotal += (fvPrincipal + fvSeries);
            
            // Track accumulated capital (Principal + Contributions)
            yearlyInvested += (annualInv * n);
        });

        data.push({
            year: currentYear + i,
            displayYear: `${currentYear + i} (第${i}年)`,
            totalValue: yearlyTotal,
            totalInvested: yearlyInvested,
            profit: yearlyTotal - yearlyInvested
        });
    }
    return data;
  }, [displayHoldings, currentTotalValue, exchangeRate]);

  const finalProjection = projectionData.length > 0 ? projectionData[projectionData.length - 1] : { totalValue: 0, totalInvested: 0, profit: 0 };

  const handleRateChange = (stock: Stock, val: string) => {
      onUpdateStock({ ...stock, expectedReturnRate: parseFloat(val) || 0 });
  };

  const handleYearChange = (stock: Stock, val: string) => {
      onUpdateStock({ ...stock, targetYears: parseInt(val) || 0 });
  };

  const handleInvestmentChange = (stock: Stock, val: string) => {
      // Store as 'annualInvestment' property even though it represents monthly now
      onUpdateStock({ ...stock, annualInvestment: parseFloat(val) || 0 });
  };

  const openCalculator = (stock: Stock) => {
      setCalcStockId(stock.id);
      setCalcValue(stock.annualInvestment ? stock.annualInvestment.toString() : '0');
      setShowCalculator(true);
  };

  const handleCalculatorApply = (val: string) => {
      if (calcStockId) {
          const stockItem = activeHoldings.find(p => p.stock.id === calcStockId);
          if (stockItem) {
              onUpdateStock({ ...stockItem.stock, annualInvestment: parseFloat(val) || 0 });
          }
      }
      setShowCalculator(false);
      setCalcStockId(null);
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
  const formatShortCurrency = (val: number) => new Intl.NumberFormat('zh-TW', { style: 'decimal', maximumFractionDigits: 0, notation: 'compact' }).format(val);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
         <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
                <Rocket size={24} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-800">夢想目標試算</h2>
                <p className="text-sm text-slate-500">以目前持股為本金，設定預期報酬與每月投入，預見未來的資產藍圖。</p>
            </div>
         </div>

         {/* Stock Multi-Select Filter */}
         <MultiSelect 
            label="標的"
            options={activeHoldings.map(item => ({id: item.stock.id, name: `${item.stock.ticker} ${item.stock.name}`}))}
            value={filterStockIds}
            onChange={setFilterStockIds}
         />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-16 bg-blue-50 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-blue-100 transition-colors"></div>
              <div className="relative z-10">
                  <p className="text-slate-500 font-bold text-xs uppercase mb-1 flex items-center gap-1"><Wallet size={14}/> 目前投入本金 (市值)</p>
                  <h3 className="text-3xl font-black text-slate-800 font-mono tracking-tight">{formatCurrency(currentTotalValue)}</h3>
              </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-3xl shadow-xl text-white flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 p-20 bg-indigo-500/20 rounded-full blur-2xl"></div>
              <div className="relative z-10">
                  <p className="text-slate-400 font-bold text-xs uppercase mb-1 flex items-center gap-1"><Target size={14}/> 預估未來總資產</p>
                  <h3 className="text-3xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-100">
                      {formatCurrency(finalProjection.totalValue)}
                  </h3>
              </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-16 bg-emerald-50 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-100 transition-colors"></div>
              <div className="relative z-10">
                  <p className="text-slate-500 font-bold text-xs uppercase mb-1 flex items-center gap-1"><TrendingUp size={14}/> 預估總獲利 (含投入)</p>
                  <h3 className="text-3xl font-black text-emerald-600 font-mono tracking-tight">+{formatCurrency(finalProjection.profit)}</h3>
                  <p className="text-xs text-emerald-600/80 font-bold mt-1">
                      總資產成長 {currentTotalValue > 0 ? ((finalProjection.totalValue / currentTotalValue)).toFixed(1) : 0} 倍
                  </p>
              </div>
          </div>
      </div>

      {/* Configuration Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calculator size={18} className="text-blue-500"/> 參數設定</h3>
              <span className="text-xs text-slate-400">
                  {filterStockIds.includes('ALL') ? '顯示所有持有庫存的標的' : `目前顯示 ${filterStockIds.length} 檔標的設定`}
              </span>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                      <tr>
                          <th className="px-6 py-3 font-bold">標的名稱</th>
                          <th className="px-6 py-3 font-bold text-right">目前市值 (TWD)</th>
                          <th className="px-6 py-3 font-bold text-center text-emerald-600">每月預計投入 (原幣)</th>
                          <th className="px-6 py-3 font-bold text-center">預估年化報酬 (%)</th>
                          <th className="px-6 py-3 font-bold text-center">複利年數</th>
                          <th className="px-6 py-3 font-bold text-right text-indigo-600">期末預估值</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {displayHoldings.length === 0 ? (
                          <tr>
                              <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                                  無符合篩選條件的持股
                              </td>
                          </tr>
                      ) : (
                          displayHoldings.map(item => {
                              const rate = item.stock.expectedReturnRate || 5;
                              const years = item.stock.targetYears || 25;
                              // Treat stored annualInvestment as monthly
                              const monthlyInv = item.stock.annualInvestment || 0;
                              
                              const isUSD = item.stock.currency === 'USD' || (item.stock.market === Market.US && !item.stock.currency);
                              const currency = isUSD ? 'USD' : 'TWD';
                              
                              // Local calc for row display
                              const principal = normalizeValue(item);
                              
                              // Annual Investment in TWD for calculation (Monthly * 12 * Rate)
                              const annualInvTWD = isUSD ? (monthlyInv * 12 * exchangeRate) : (monthlyInv * 12);
                              
                              let futureVal = principal * Math.pow(1 + rate/100, years);
                              let futureSeries = 0;
                              if (rate === 0) {
                                  futureSeries = annualInvTWD * years;
                              } else {
                                  futureSeries = annualInvTWD * (Math.pow(1 + rate/100, years) - 1) / (rate/100);
                              }
                              const totalFuture = futureVal + futureSeries;

                              return (
                                  <tr key={item.stock.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-6 py-4 font-bold text-slate-700">
                                          {item.stock.name} 
                                          <span className="text-xs font-normal text-slate-400 ml-2 bg-slate-100 px-1.5 py-0.5 rounded">{item.stock.ticker}</span>
                                      </td>
                                      <td className="px-6 py-4 text-right font-mono text-slate-600">
                                          {formatShortCurrency(principal)}
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex items-center justify-center gap-1 relative">
                                              <span className="text-[10px] text-slate-400 absolute left-2 pointer-events-none top-1/2 -translate-y-1/2">{currency}</span>
                                              <input 
                                                  type="number" 
                                                  value={monthlyInv}
                                                  onChange={(e) => handleInvestmentChange(item.stock, e.target.value)}
                                                  className="w-32 text-right pl-8 pr-8 py-1.5 border border-emerald-200 rounded-lg font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 bg-white"
                                                  placeholder="0"
                                              />
                                              <button 
                                                  type="button" 
                                                  onClick={() => openCalculator(item.stock)}
                                                  className="absolute right-1 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-600 p-1 hover:bg-emerald-50 rounded transition-colors"
                                                  title="開啟計算機"
                                              >
                                                  <Calculator size={14} />
                                              </button>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                              <input 
                                                  type="number" 
                                                  step="0.1" 
                                                  value={rate}
                                                  onChange={(e) => handleRateChange(item.stock, e.target.value)}
                                                  className="w-16 text-center px-2 py-1.5 border border-slate-200 rounded-lg font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                                              />
                                              <span className="text-slate-400 text-xs">%</span>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                              <input 
                                                  type="number" 
                                                  max="100"
                                                  value={years}
                                                  onChange={(e) => handleYearChange(item.stock, e.target.value)}
                                                  className="w-16 text-center px-2 py-1.5 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-100 bg-white"
                                              />
                                              <span className="text-slate-400 text-xs">年</span>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-right font-mono font-bold text-indigo-600 bg-indigo-50/30">
                                          {formatShortCurrency(totalFuture)}
                                      </td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-500"/> 資產成長趨勢</h3>
          <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projectionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorInvest" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                          </linearGradient>
                      </defs>
                      <XAxis 
                          dataKey="year" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94a3b8', fontSize: 12 }} 
                      />
                      <YAxis 
                          tickFormatter={(val) => new Intl.NumberFormat('en', { notation: 'compact' }).format(val)}
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94a3b8', fontSize: 12 }} 
                      />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: number, name: string) => [formatCurrency(value), name === 'totalValue' ? '總資產' : '總投入成本']}
                          labelStyle={{ color: '#64748b', marginBottom: '0.5rem', fontWeight: 'bold' }}
                      />
                      <Area 
                          type="monotone" 
                          dataKey="totalValue" 
                          stroke="#6366f1" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorTotal)" 
                          name="總資產"
                      />
                      <Area 
                          type="monotone" 
                          dataKey="totalInvested" 
                          stroke="#94a3b8" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          fillOpacity={1} 
                          fill="url(#colorInvest)" 
                          name="總投入成本"
                      />
                  </AreaChart>
              </ResponsiveContainer>
          </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calendar size={18} className="text-slate-400"/> 年度詳細列表</h3>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">
                      <tr>
                          <th className="px-6 py-3 font-bold w-1/5">年度</th>
                          <th className="px-6 py-3 font-bold text-right w-1/5">預估總資產</th>
                          <th className="px-6 py-3 font-bold text-right w-1/5 text-slate-400">總投入成本</th>
                          <th className="px-6 py-3 font-bold text-right w-1/5">預估總獲利</th>
                          <th className="px-6 py-3 font-bold text-right w-1/5">資產成長倍數</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {projectionData.map((row, idx) => (
                          <tr key={row.year} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-3 font-bold text-slate-700">
                                  {row.displayYear}
                              </td>
                              <td className="px-6 py-3 text-right font-mono font-bold text-slate-800">
                                  {formatCurrency(row.totalValue)}
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-slate-400">
                                  {formatCurrency(row.totalInvested)}
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-emerald-600 font-bold">
                                  {row.profit > 0 ? '+' : ''}{formatCurrency(row.profit)}
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-slate-500">
                                  {currentTotalValue > 0 ? (row.totalValue / currentTotalValue).toFixed(2) : '-'} x
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      <CalculatorPopup 
        isOpen={showCalculator} 
        onClose={() => setShowCalculator(false)} 
        onApply={handleCalculatorApply} 
        initialValue={calcValue} 
        label="每月投入金額" 
      />
    </div>
  );
};

export default React.memo(DreamGoals);
