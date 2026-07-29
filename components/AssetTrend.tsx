
import React, { useState, useMemo } from 'react';
import { AssetSnapshot, MarketFilter, Market, Transaction, Stock, TransactionType } from '../types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Cell, LineChart, Line, Legend
} from 'recharts';
import { TrendingUp, Activity, Plus, Edit2, Trash2, X, Coins, Filter, AlertCircle, ArrowUpRight, ArrowDownRight, Calculator, RefreshCcw, Save, Calendar, MousePointerClick, Info, Clock } from 'lucide-react';
import { calculatePortfolio } from '../utils';
import PeriodPerformance from './PeriodPerformance';

interface Props {
  history: AssetSnapshot[];
  onAddHistory: (record: AssetSnapshot) => void;
  onDeleteHistory: (date: string) => void;
  marketFilter?: MarketFilter;
  transactions?: Transaction[];
  stocks?: Stock[];
  exchangeRate?: number;
}

type ViewMode = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'ALL' | 'CUSTOM';

const AssetTrend: React.FC<Props> = ({ 
  history, onAddHistory, onDeleteHistory, marketFilter = 'ALL', 
  transactions = [], stocks = [], exchangeRate = 32.5 
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('DAY');
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  
  const [customStart, setCustomStart] = useState(() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

  const [listStart, setListStart] = useState('');
  const [listEnd, setListEnd] = useState('');

  const [formDate, setFormDate] = useState('');
  const [originalDate, setOriginalDate] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formDividend, setFormDividend] = useState('');
  const [formSubtotals, setFormSubtotals] = useState<AssetSnapshot['subtotals']>(undefined);
  
  const [isEditing, setIsEditing] = useState(false);

  const currentPortfolio = useMemo(() => calculatePortfolio(stocks, transactions), [stocks, transactions]);

  const liveSnapshot = useMemo(() => {
      const now = new Date();
      const currentHour = now.getHours();
      
      let effectiveDate = new Date(now);
      let isShifted = false;

      if (currentHour < 9) {
          effectiveDate.setDate(now.getDate() - 1);
          isShifted = true;
      }

      const dayOfWeek = effectiveDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
          return null;
      }

      const todayStr = `${effectiveDate.getFullYear()}-${(effectiveDate.getMonth()+1).toString().padStart(2,'0')}-${effectiveDate.getDate().toString().padStart(2,'0')}`;

      let gCost = 0, gVal = 0;
      let twCost = 0, twVal = 0, twPL = 0;
      let usCost = 0, usVal = 0, usPL = 0;

      currentPortfolio.forEach(p => {
          // Correctly identify USD assets (Market.US OR Currency='USD')
          const isUSD = p.stock.currency === 'USD' || (p.stock.market === Market.US && !p.stock.currency);
          
          const costTwd = p.totalCostTWD !== undefined ? p.totalCostTWD : (p.totalCost * (isUSD ? exchangeRate : 1));
          
          const val = p.marketValue;
          const valTwd = isUSD ? val * exchangeRate : val;
          
          // Add to Global Totals
          gCost += costTwd;
          gVal += valTwd;

          // Add to Subtotals (Strict Market Buckets)
          if (p.stock.market === Market.US) {
              usCost += costTwd;
              usVal += valTwd;
              usPL += (valTwd - costTwd);
          } else if (p.stock.market === Market.TW) {
              twCost += costTwd;
              twVal += valTwd;
              twPL += (valTwd - costTwd);
          }
          // Other markets (Bond/Commodity) contribute to Global but not to strict TW/US buckets for now
      });

      let dayDiv = 0;
      transactions.filter(t => t.type === TransactionType.DIVIDEND).forEach(t => {
          const dateMatch = t.exDividendDate === todayStr || (!t.exDividendDate && t.date === todayStr);
          if (dateMatch) {
             const stock = stocks.find(s => s.id === t.stockId);
             // Correctly identify USD dividends
             const isUSD = stock?.currency === 'USD' || (stock?.market === Market.US && !stock?.currency);
             const amt = (t.price * t.quantity) - (t.fee || 0);
             dayDiv += amt * (isUSD ? exchangeRate : 1);
          }
      });

      return {
          date: todayStr,
          totalCostTWD: gCost,
          totalMarketValueTWD: gVal,
          unrealizedPLTWD: gVal - gCost,
          todayDividendTWD: dayDiv > 0 ? dayDiv : undefined,
          subtotals: {
              [Market.TW]: { totalCostTWD: twCost, totalMarketValueTWD: twVal, unrealizedPLTWD: twPL, todayDividendTWD: 0 },
              [Market.US]: { totalCostTWD: usCost, totalMarketValueTWD: usVal, unrealizedPLTWD: usPL, todayDividendTWD: 0 }
          },
          isLive: true,
          isShifted
      };
  }, [stocks, transactions, exchangeRate]);

  const dailyData = useMemo(() => {
    let sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    if (liveSnapshot) {
        const hasToday = sorted.some(h => h.date === liveSnapshot.date);
        if (!hasToday && liveSnapshot.totalCostTWD > 0) {
            sorted.push(liveSnapshot);
        }
    }

    let prevTotalRealizedTWD = 0;

    return sorted.map((item, index) => {
      let currentCost = item.totalCostTWD;
      let currentValue = item.totalMarketValueTWD;
      let currentPL = item.unrealizedPLTWD;

      if (marketFilter === Market.TW) {
         const sub = item.subtotals?.[Market.TW];
         currentCost = sub?.totalCostTWD || 0;
         currentValue = sub?.totalMarketValueTWD || 0;
         currentPL = sub?.unrealizedPLTWD || 0;
      } else if (marketFilter === Market.US) {
         const sub = item.subtotals?.[Market.US];
         currentCost = sub?.totalCostTWD || 0;
         currentValue = sub?.totalMarketValueTWD || 0;
         currentPL = sub?.unrealizedPLTWD || 0;
      }

      // Calculate Portfolio state at this date to get Cumulative Realized Gain
      const txsUpToDate = transactions.filter(t => t.date <= item.date);
      const filteredStocks = stocks.filter(s => marketFilter === 'ALL' || s.market === marketFilter);
      const pAtDate = calculatePortfolio(filteredStocks, txsUpToDate);
      
      let totalRealizedTWD = 0;
      let totalAccumulatedDivTWD = 0;
      pAtDate.forEach(p => {
          totalRealizedTWD += ((p.realizedGainTWD || 0) + (p.historicalRealizedGainTWD || 0));
          totalAccumulatedDivTWD += ((p.totalDividendTWD || 0) + (p.historicalDividendTWD || 0));
      });

      // Calculate Daily Realized Gain (Change in cumulative realized gain)
      const dayRealizedGain = totalRealizedTWD - prevTotalRealizedTWD;
      prevTotalRealizedTWD = totalRealizedTWD;

      let calculatedDivTWD = 0;
      transactions
        .filter(t => t.type === TransactionType.DIVIDEND && (t.exDividendDate === item.date || (!t.exDividendDate && t.date === item.date)))
        .forEach(t => {
           const stock = stocks.find(s => s.id === t.stockId);
           // Correctly identify USD dividends
           const isUSD = stock?.currency === 'USD' || (stock?.market === Market.US && !stock?.currency);
           
           // Strict filter
           if (marketFilter === Market.TW && stock?.market !== Market.TW) return;
           if (marketFilter === Market.US && stock?.market !== Market.US) return;

           const amount = (t.price * t.quantity) - (t.fee || 0);
           const rate = isUSD ? (t.exchangeRate || exchangeRate) : 1;
           calculatedDivTWD += (amount * rate);
        });

      const manualDiv = item.todayDividendTWD || 0;
      const effectiveDiv = calculatedDivTWD > 0 ? calculatedDivTWD : manualDiv;

      const prevItem = sorted[index - 1];
      let prevPL = 0;
      if (prevItem) {
        if (marketFilter === Market.TW) { prevPL = prevItem.subtotals?.[Market.TW]?.unrealizedPLTWD || 0; } 
        else if (marketFilter === Market.US) { prevPL = prevItem.subtotals?.[Market.US]?.unrealizedPLTWD || 0; } 
        else { prevPL = prevItem.unrealizedPLTWD; }
      }
      
      const rawUnrealizedChange = prevItem ? currentPL - prevPL : 0;
      
      // Daily Change = Unrealized Change + Dividend + Realized Change
      const dailyChange = rawUnrealizedChange + effectiveDiv + dayRealizedGain;
      
      const totalReturnIncDiv = totalRealizedTWD + currentPL + totalAccumulatedDivTWD;

      return { 
          ...item, 
          displayCost: currentCost, 
          displayValue: currentValue, 
          displayPL: currentPL, 
          displayDiv: effectiveDiv, 
          dayRealizedGain,
          dailyChange,
          totalReturnIncDiv,
          isLive: (item as any).isLive,
          isShifted: (item as any).isShifted
      };
    });
  }, [history, liveSnapshot, marketFilter, transactions, stocks, exchangeRate]);

  const chartData = useMemo(() => {
    if (dailyData.length === 0) return [];
    
    const getRecent = (arr: any[], count: number) => {
        if (arr.length <= count) return arr;
        return arr.slice(-count);
    };

    let result = [];
    if (viewMode === 'CUSTOM') {
       result = dailyData.filter(d => d.date >= customStart && d.date <= customEnd);
    } else if (viewMode === 'DAY' || viewMode === 'ALL') {
       const filtered = dailyData.filter(d => Math.abs(d.dailyChange) > 0.01 || d.displayDiv > 0 || d.isLive || Math.abs(d.displayPL) > 0);
       result = viewMode === 'DAY' ? getRecent(filtered, 30) : filtered;
    } else {
        const grouped = new Map<string, any>();
        dailyData.forEach(item => {
           if (item.isLive) return; 
           let key = item.date;
           if (viewMode === 'WEEK') {
                const d = new Date(item.date); const day = d.getDay() || 7; if (day !== 1) d.setHours(-24 * (day - 1));
                key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
           } else if (viewMode === 'MONTH') { key = item.date.substring(0, 7); } 
           else if (viewMode === 'YEAR') { key = item.date.substring(0, 4); }
           
           if (!grouped.has(key)) { 
               grouped.set(key, { 
                   date: key, 
                   dailyChange: 0, 
                   displayDiv: 0, 
                   dayRealizedGain: 0,
                   displayPL: item.displayPL, 
                   totalReturnIncDiv: item.totalReturnIncDiv, 
                   displayCost: item.displayCost, 
                   displayValue: item.displayValue, 
                   count: 0 
                }); 
            }
           const g = grouped.get(key)!; 
           g.dailyChange += item.dailyChange; 
           g.displayDiv += item.displayDiv; 
           g.dayRealizedGain += item.dayRealizedGain;
           g.displayPL = item.displayPL; 
           g.totalReturnIncDiv = item.totalReturnIncDiv; // Use latest total return in the group period
           g.displayCost = item.displayCost; 
           g.displayValue = item.displayValue; 
           g.count += 1;
        });
        
        result = Array.from(grouped.values()).filter(d => Math.abs(d.dailyChange) > 0.01 || d.displayDiv > 0);
        if (viewMode === 'WEEK') result = getRecent(result, 52); 
        if (viewMode === 'MONTH') result = getRecent(result, 36); 
    }

    // 計算與前次的比較值 (用於總報酬走勢圖 Tooltip)
    return result.map((curr, idx, arr) => {
        const prev = arr[idx - 1];
        const comparison = prev ? curr.totalReturnIncDiv - prev.totalReturnIncDiv : 0;
        return { ...curr, comparison };
    });
  }, [dailyData, viewMode, customStart, customEnd]);

  const listDisplayData = useMemo(() => {
     let data = [...chartData].reverse();
     const hasFilter = listStart || listEnd;
     
     if (hasFilter) {
         if (listStart) data = data.filter(r => r.date >= listStart.substring(0, r.date.length));
         if (listEnd) data = data.filter(r => r.date <= listEnd.substring(0, r.date.length));
     }
     
     return hasFilter ? data : data.slice(0, 100);
  }, [chartData, listStart, listEnd]);

  const periodStats = useMemo(() => {
    if (chartData.length === 0) return { totalChange: 0, winDays: 0, lossDays: 0 };
    return { totalChange: chartData.reduce((acc, curr) => acc + curr.dailyChange, 0), winDays: chartData.filter(d => d.dailyChange > 0).length, lossDays: chartData.filter(d => d.dailyChange < 0).length };
  }, [chartData]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0, notation: 'compact' }).format(val);
  const formatTooltipCurrency = (val: number) => new Intl.NumberFormat('zh-TW', { style: 'decimal', maximumFractionDigits: 0 }).format(val);
  const formatDate = (dateStr: string) => { if (viewMode === 'YEAR' || viewMode === 'MONTH') return dateStr; const d = new Date(dateStr); return `${d.getMonth() + 1}/${d.getDate()}`; };

  const getIntervalLabel = () => {
      switch (viewMode) {
          case 'DAY': return '近30日';
          case 'WEEK': return '近52週';
          case 'MONTH': return '近36月';
          case 'YEAR': return '年度';
          case 'ALL': return '總區間';
          case 'CUSTOM': return '指定區間';
          default: return '區間';
      }
  };

  const handleAutoFill = () => {
      if (!liveSnapshot) {
          alert('今日為假日或系統無法取得即時數據，無法自動帶入。');
          return;
      }
      setFormDate(liveSnapshot.date); 
      setFormCost(liveSnapshot.totalCostTWD.toFixed(0));
      setFormValue(liveSnapshot.totalMarketValueTWD.toFixed(0));
      if (liveSnapshot.todayDividendTWD && liveSnapshot.todayDividendTWD > 0) {
          setFormDividend(liveSnapshot.todayDividendTWD.toFixed(0));
      }
      setFormSubtotals(liveSnapshot.subtotals);
  };

  const handleEditClick = (row: any) => {
      setFormDate(row.date); 
      setOriginalDate(row.date); 
      setFormCost(row.totalCostTWD.toString()); 
      setFormValue(row.totalMarketValueTWD.toString()); 
      setFormDividend(row.todayDividendTWD ? row.todayDividendTWD.toString() : ''); 
      setFormSubtotals(row.subtotals); 
      setIsEditing(true); 
      setShowHistoryForm(true);
  };

  const handleQuickSaveLive = () => {
      if (!liveSnapshot) return;
      onAddHistory({ 
          date: liveSnapshot.date, 
          totalCostTWD: liveSnapshot.totalCostTWD, 
          totalMarketValueTWD: liveSnapshot.totalMarketValueTWD, 
          unrealizedPLTWD: liveSnapshot.unrealizedPLTWD, 
          todayDividendTWD: liveSnapshot.todayDividendTWD,
          subtotals: liveSnapshot.subtotals 
      });
  };

  const handleAddClick = () => {
      const now = new Date();
      if (now.getHours() < 9) {
          now.setDate(now.getDate() - 1);
      }
      const todayStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;
      
      setFormDate(todayStr);
      setOriginalDate('');
      setFormCost('');
      setFormValue('');
      setFormDividend('');
      setFormSubtotals(undefined);
      setIsEditing(false);
      setShowHistoryForm(true);
      
      setTimeout(() => {
          if (liveSnapshot) handleAutoFill();
      }, 100);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <PeriodPerformance portfolio={currentPortfolio} transactions={transactions} exchangeRate={exchangeRate} />

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Activity size={20} /></div>
                <div>
                    <h2 className="font-bold text-slate-800">損益變動分析 (TWD)</h2>
                    {marketFilter !== 'ALL' && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${marketFilter === Market.TW ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>{marketFilter === Market.TW ? '僅顯示台股' : '僅顯示美股'}</span>}
                </div>
            </div>
            
            {viewMode === 'CUSTOM' && (
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200 animate-in slide-in-from-left-2">
                    <Calendar size={14} className="text-slate-400 ml-1" />
                    <input 
                        type="date" 
                        value={customStart} 
                        onChange={(e) => setCustomStart(e.target.value)} 
                        className="bg-transparent text-xs font-bold text-slate-700 outline-none w-24"
                    />
                    <span className="text-slate-300">~</span>
                    <input 
                        type="date" 
                        value={customEnd} 
                        onChange={(e) => setCustomEnd(e.target.value)} 
                        className="bg-transparent text-xs font-bold text-slate-700 outline-none w-24"
                    />
                </div>
            )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <button 
                onClick={handleAddClick} 
                className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-slate-700 transition-all shadow-sm whitespace-nowrap"
            >
                <Plus size={14}/> 新增紀錄
            </button>
            <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto">
                {(['DAY', 'WEEK', 'MONTH', 'YEAR', 'ALL', 'CUSTOM'] as ViewMode[]).map((p) => (
                    <button key={p} onClick={() => setViewMode(p)} className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${viewMode === p ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {p === 'DAY' ? '日' : p === 'WEEK' ? '1週' : p === 'MONTH' ? '1月' : p === 'YEAR' ? '1年' : p === 'CUSTOM' ? '自訂' : '全部'}
                    </button>
                ))}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className={`p-4 rounded-xl border ${periodStats.totalChange >= 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}><h3 className="text-slate-500 text-xs font-medium mb-1">{marketFilter === 'ALL' ? '總' : marketFilter === 'TW' ? '台股' : '美股'}{getIntervalLabel()}損益變動 (含息)</h3><div className="flex items-center gap-2">{periodStats.totalChange >= 0 ? <ArrowUpRight className="text-red-500" size={24}/> : <ArrowDownRight className="text-green-500" size={24}/>}<span className={`text-2xl font-bold ${periodStats.totalChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>{periodStats.totalChange >= 0 ? '+' : ''}{formatTooltipCurrency(periodStats.totalChange)}</span></div></div>
         <div className="p-4 rounded-xl border border-slate-200 bg-white"><h3 className="text-slate-500 text-xs font-medium mb-1">區間賺錢{viewMode === 'DAY' || viewMode === 'ALL' || viewMode === 'CUSTOM' ? '天' : '次'}</h3><span className="text-2xl font-bold text-red-500">{periodStats.winDays} <span className="text-sm text-slate-400 font-normal">{viewMode === 'DAY' || viewMode === 'ALL' || viewMode === 'CUSTOM' ? '天' : '次'}</span></span></div>
         <div className="p-4 rounded-xl border border-slate-200 bg-white"><h3 className="text-slate-500 text-xs font-medium mb-1">區間賠錢{viewMode === 'DAY' || viewMode === 'ALL' || viewMode === 'CUSTOM' ? '天' : '次'}</h3><span className="text-2xl font-bold text-green-500">{periodStats.lossDays} <span className="text-sm text-slate-400 font-normal">{viewMode === 'DAY' || viewMode === 'ALL' || viewMode === 'CUSTOM' ? '天' : '次'}</span></span></div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-start mb-6"><h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Activity size={16} className="text-slate-400"/>損益變動走勢</h3><div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded"><div className="w-2 h-2 bg-red-500 rounded-sm"></div> 獲利 <div className="w-2 h-2 bg-green-500 rounded-sm"></div> 虧損</div></div>
        <div className="h-[250px] w-full">
           {chartData.length > 0 ? (
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} minTickGap={20} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                    formatter={(value: number, name: string, props: any) => { 
                        const dividend = props.payload.displayDiv; 
                        const realized = props.payload.dayRealizedGain;
                        
                        if (dividend > 0 || realized !== 0) { 
                            return [
                                <div>
                                    <div>NT$ {formatTooltipCurrency(value)}</div>
                                    {dividend > 0 && <div className="text-xs text-amber-500 mt-1 font-bold">(含除息: +{formatTooltipCurrency(dividend)})</div>}
                                    {realized !== 0 && (
                                        <div className={`text-xs mt-1 font-bold ${realized > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                            (含已實現: {realized > 0 ? '+' : ''}{formatTooltipCurrency(realized)})
                                        </div>
                                    )}
                                </div>, 
                                '變動損益'
                            ]; 
                        } 
                        return [`NT$ ${formatTooltipCurrency(value)}`, '變動損益']; 
                    }} 
                    labelFormatter={(label) => formatDate(label)} 
                  />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <Bar dataKey="dailyChange" name="損益變動" radius={[2, 2, 2, 2]}>{chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.dailyChange >= 0 ? '#ef4444' : '#10b981'} />))}</Bar>
               </BarChart>
             </ResponsiveContainer>
           ) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm">無資料</div>)}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-start mb-6">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-500"/> 總報酬走勢
            </h3>
            <div className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded">
               已實現損益 + 未實現損益 + 累積領息
            </div>
        </div>
        <div className="h-[250px] w-full">
           {chartData.length > 0 ? (
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} minTickGap={20} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const val = data.totalReturnIncDiv;
                            const comp = data.comparison;
                            const compColor = comp >= 0 ? '#ef4444' : '#10b981'; // 紅漲綠跌
                            const compSign = comp > 0 ? '+' : '';
                            
                            return (
                                <div className="bg-slate-900/95 backdrop-blur-md p-4 border border-slate-700 shadow-2xl rounded-2xl text-sm z-50 min-w-[180px]">
                                    <p className="text-slate-400 mb-3 border-b border-slate-700 pb-2 text-xs font-bold">日期: {label}</p>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center gap-4">
                                            <span className="text-slate-300 font-bold">總報酬損益:</span>
                                            <span className="text-blue-400 font-mono font-bold text-lg">NT$ {formatTooltipCurrency(val)}</span>
                                        </div>
                                        <div className="flex justify-between items-center gap-4 border-t border-slate-800 pt-2">
                                            <span className="text-slate-300 font-bold">與前次比較:</span>
                                            <span className="font-mono font-black text-sm" style={{ color: compColor }}>
                                                {compSign}{formatTooltipCurrency(comp)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                  />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                  <Line 
                    type="monotone" 
                    dataKey="totalReturnIncDiv" 
                    name="總報酬損益" 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="totalReturnIncDiv" 
                    fill="url(#colorTotal)" 
                    stroke="none" 
                    connectNulls 
                    tooltipType="none"
                  />
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
               </LineChart>
             </ResponsiveContainer>
           ) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm">無資料</div>)}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
             <div className="flex items-center gap-2">
                 <h3 className="font-bold text-slate-700 text-sm">詳細數據列表 (TWD)</h3>
                 <div className="group relative">
                     <Info size={14} className="text-slate-400 cursor-help"/>
                     <div className="absolute left-6 top-0 w-64 bg-slate-800 text-white text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                         <span className="font-bold text-amber-300 block mb-1">統計提醒:</span>
                         變動損益與列表數值維持「當期市值變動 + 當期領息 + 當期已實現損益」之計算。僅上方曲線圖採用「已實現 + 未實現 + 累積領息」公式。
                     </div>
                 </div>
             </div>
             <div className="flex items-center gap-2">
                 <input type="date" value={listStart} onChange={e => setListStart(e.target.value)} className="px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-blue-500"/>
                 <span className="text-xs text-slate-400">至</span>
                 <input type="date" value={listEnd} onChange={e => setListEnd(e.target.value)} className="px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-blue-500"/>
                 <span className="text-xs text-slate-400">
                     {(!listStart && !listEnd) ? '僅顯示最近 100 筆' : `顯示 ${listDisplayData.length} 筆`}
                 </span>
             </div>
         </div>
         <div className="overflow-x-auto max-h-[300px]">
           <table className="w-full text-sm text-left">
             <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
               <tr>
                 <th className="px-6 py-3 font-bold">日期</th>
                 <th className="px-6 py-3 font-bold text-right">變動損益(已實現+除息)</th>
                 <th className="px-6 py-3 font-bold text-right">當期已實現 (台幣)</th>
                 <th className="px-6 py-3 font-bold text-right">當期除息 (台幣)</th>
                 <th className="px-6 py-3 font-bold text-right">帳面損益</th>
                 <th className="px-6 py-3 font-bold text-right">市值</th>
                 {(viewMode === 'DAY' || viewMode === 'ALL' || viewMode === 'CUSTOM') && <th className="px-6 py-3 font-bold text-right">操作</th>}
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {listDisplayData.map((row) => (
                 <tr key={row.date} className={`transition-colors ${row.isLive ? 'bg-indigo-50/60 hover:bg-indigo-50 border-l-4 border-l-indigo-400' : 'hover:bg-slate-50'}`}>
                   <td className="px-6 py-3 font-medium text-slate-600">
                       <div className="flex items-center gap-2">
                           {row.date}
                           {row.isLive && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold">預覽</span>}
                           {row.isShifted && (
                               <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 border border-amber-200" title="已自動對齊至前一交易日收盤">
                                   <Clock size={10}/> 昨日歸戶
                               </span>
                           )}
                       </div>
                   </td>
                   <td className={`px-6 py-3 text-right font-bold ${row.dailyChange >= 0 ? 'text-red-500' : 'text-green-500'}`}>{row.dailyChange > 0 ? '+' : ''}{formatTooltipCurrency(row.dailyChange)}</td>
                   <td className="px-6 py-3 text-right">
                      {row.dayRealizedGain !== 0 ? (
                          <span className={`font-bold ${row.dayRealizedGain > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                              {row.dayRealizedGain > 0 ? '+' : ''}{formatTooltipCurrency(row.dayRealizedGain)}
                          </span>
                      ) : '-'}
                   </td>
                   <td className="px-6 py-3 text-right">
                      {row.displayDiv > 0 ? <span className="text-amber-500 font-bold">+{formatTooltipCurrency(row.displayDiv)}</span> : '-'}
                   </td>
                   <td className={`px-6 py-3 text-right font-bold ${row.displayPL >= 0 ? 'text-red-500' : 'text-green-500'}`}>{formatTooltipCurrency(row.displayPL)}</td>
                   <td className="px-6 py-3 text-right text-slate-600 font-mono">{new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(row.displayValue)}</td>
                   {(viewMode === 'DAY' || viewMode === 'ALL' || viewMode === 'CUSTOM') && (
                     <td className="px-6 py-3 text-right">
                        {row.isLive ? (
                            <button 
                                onClick={handleQuickSaveLive}
                                className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-indigo-700 transition-all flex items-center gap-1 ml-auto active:scale-95"
                            >
                                <Save size={12} /> 立即儲存
                            </button>
                        ) : (
                            <div className="flex justify-end gap-2">
                                <button onClick={() => handleEditClick(row)} className="p-1 text-blue-500 hover:bg-blue-100 rounded"><Edit2 size={14}/></button>
                                <button onClick={() => onDeleteHistory(row.date)} className="p-1 text-rose-500 hover:bg-rose-100 rounded"><Trash2 size={14}/></button>
                            </div>
                        )}
                     </td>
                   )}
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
      </div>
      {showHistoryForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <form onSubmit={(e) => { 
              e.preventDefault(); 
              if (isEditing && originalDate !== formDate) onDeleteHistory(originalDate); 
              onAddHistory({ 
                  date: formDate, 
                  totalCostTWD: parseFloat(formCost), 
                  totalMarketValueTWD: parseFloat(formValue), 
                  unrealizedPLTWD: parseFloat(formValue) - parseFloat(formCost), 
                  todayDividendTWD: parseFloat(formDividend) || undefined,
                  subtotals: formSubtotals 
              }); 
              setShowHistoryForm(false); 
          }} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-800">{isEditing ? '編輯紀錄' : '補登紀錄'}</h3>
                <button type="button" onClick={() => setShowHistoryForm(false)}><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">日期</label>
                  <div className="flex gap-2">
                      <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required />
                      <button 
                        type="button" 
                        onClick={handleAutoFill}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-1 whitespace-nowrap"
                        title="依據目前股價與庫存自動計算 (若為09:00前，自動歸戶至昨日)"
                      >
                        <RefreshCcw size={14}/> 智能帶入
                      </button>
                  </div>
              </div>
              <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">總成本 (TWD)</label><input type="number" step="0.01" value={formCost} onChange={e => setFormCost(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required /></div>
              <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">總市值 (TWD)</label><input type="number" step="0.01" value={formValue} onChange={e => setFormValue(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required /></div>
              <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">除息金額 (選填 TWD)</label><input type="number" step="0.01" value={formDividend} onChange={e => setFormDividend(e.target.value)} className="w-full px-4 py-2 border rounded-xl" placeholder="如無交易紀錄可手動填寫" /></div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2 bg-slate-50">
                <button type="button" onClick={() => setShowHistoryForm(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg transition-colors">取消</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md transition-colors">儲存</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default React.memo(AssetTrend);
