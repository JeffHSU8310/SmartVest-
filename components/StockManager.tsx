
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Stock, Market, MarketFilter, StockPerformanceRecord, Account, DCASetting } from '../types';
import { generateId, calculateStockPerformance, fetchCurrentYahooQuote, formatMarketPrice } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Plus, Edit2, X, Check, Tag, TrendingUp, Settings2, Calculator, Calendar, Loader2, RefreshCcw, ArrowRight, AlertCircle, Split, ToggleLeft, ToggleRight, Info, Save, History, Search, FileText, CheckSquare, Square, GripVertical, Eye, EyeOff, Target, Lock, CalendarClock, CreditCard, Coins } from 'lucide-react';

interface Props {
  stocks: Stock[];
  stockOrder?: string[];
  onUpdateOrder?: (order: string[]) => void;
  onAddStock: (stock: Stock) => void;
  onUpdateStock: (stock: Stock) => void;
  onDeleteStock: (id: string) => void;
  marketFilter: MarketFilter;
  // New props for performance history
  performanceRecords?: StockPerformanceRecord[];
  onAddPerformanceRecord?: (record: StockPerformanceRecord) => void;
  onDeletePerformanceRecord?: (id: string) => void;
  // New prop for accounts
  accounts?: Account[];
  suggestedCategories?: string[];
  onUpdateSuggestedCategories?: (categories: string[]) => void;
  strategyFilter?: 'DEFENSE' | 'NOVA' | 'TENX';
}

const DEFAULT_CATEGORIES = ['市值型ETF', '高股息型ETF', '債券型ETF'];
const CATEGORY_STORAGE_KEY = 'smartvest_custom_categories';

// System Stock Definition for Weighted Return Index
const SYSTEM_INDEX_ID = 'SYSTEM_TAIEX_TR';
const SYSTEM_INDEX_STOCK: Stock = {
    id: SYSTEM_INDEX_ID,
    name: '加權報酬指數',
    ticker: 'IR0001', // Using a dummy ticker, user must enter data manually
    market: Market.TW,
    category: '市場指標',
    currency: 'TWD',
    hidden: false
};

// ... (StockReturnCalculator component remains unchanged) ...
// --- Helper: Stock Return Calculator Modal ---
const StockReturnCalculator = ({ 
    stock, onClose, 
    records, onAddRecord, onDeleteRecord 
}: { 
    stock: Stock; 
    onClose: () => void;
    records: StockPerformanceRecord[];
    onAddRecord?: (rec: StockPerformanceRecord) => void;
    onDeleteRecord?: (id: string) => void;
}) => {
    const [view, setView] = useState<'CALC' | 'HISTORY'>('CALC');
    
    // Find latest record for this stock to pre-fill Start Price & Date
    const latestRecord = useMemo(() => {
        if (!records || records.length === 0) return null;
        const stockRecords = records.filter(r => r.stockId === stock.id);
        if (stockRecords.length === 0) return null;
        // Sort by endDate desc
        return stockRecords.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];
    }, [records, stock.id]);

    // --- Calc State ---
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    
    // Default Start Date: Use latest record end date if available (Continuity), else Last day of previous month
    const [startDate, setStartDate] = useState(() => {
        if (latestRecord) return latestRecord.endDate;
        const d = new Date();
        // Set to day 0 of current month = Last day of previous month
        d.setDate(0); 
        return d.toISOString().split('T')[0];
    });

    const [calcMode, setCalcMode] = useState<'PRICE' | 'ADJ'>('ADJ'); 
    
    // Initialize Start Price from latest record if available
    const [startPrice, setStartPrice] = useState<string>(() => {
        // Priority 1: System Index Persistence (Manual Override)
        if (stock.id === SYSTEM_INDEX_ID) {
            return localStorage.getItem('smartvest_sys_start_price') || '';
        }
        // Priority 2: Continuity from previous record
        if (latestRecord) return latestRecord.endPrice.toString();
        return '';
    });

    // Effect to persist System Index Start Price whenever it changes
    useEffect(() => {
        if (stock.id === SYSTEM_INDEX_ID) {
            localStorage.setItem('smartvest_sys_start_price', startPrice);
        }
    }, [startPrice, stock.id]);

    const [endPrice, setEndPrice] = useState<string>('');
    const [dividends, setDividends] = useState<string>('0');
    const [note, setNote] = useState('');
    
    // UI State for results from shared utility
    const [resultData, setResultData] = useState<{
        startPrice: number, endPrice: number, 
        totalDiv: number, returnRate: number, totalDiff: number,
        actualStartDate: string
    } | null>(null);

    const [loading, setLoading] = useState(false);
    const [fetchStatus, setFetchStatus] = useState<string>('');
    const [splitMsg, setSplitMsg] = useState<string>('');

    // --- History State ---
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterMonth, setFilterMonth] = useState<string>('ALL');

    // Detect Standard Periods (Updated Logic)
    const isMTD = useMemo(() => {
        if (!startDate || !endDate) return false;
        // Logic: Start date is the last day of the month PRIOR to endDate's month
        const e = new Date(endDate);
        // Get last day of previous month relative to endDate
        const targetStart = new Date(e.getFullYear(), e.getMonth(), 0); 
        // Format to YYYY-MM-DD
        const y = targetStart.getFullYear();
        const m = String(targetStart.getMonth() + 1).padStart(2, '0');
        const d = String(targetStart.getDate()).padStart(2, '0');
        const targetStr = `${y}-${m}-${d}`;
        
        return startDate === targetStr;
    }, [startDate, endDate]);

    const isYTD = useMemo(() => {
        if (!startDate || !endDate) return false;
        // Logic: Start date is Dec 31 of the year PRIOR to endDate's year
        const e = new Date(endDate);
        const prevYear = e.getFullYear() - 1;
        return startDate === `${prevYear}-12-31`;
    }, [startDate, endDate]);

    const isMAX = useMemo(() => {
        return startDate === '2000-01-01';
    }, [startDate]);

    const currencyLabel = stock.market === Market.US || stock.currency === 'USD' ? '(USD)' : '(TWD)';

    // Range Presets (Updated Logic)
    const setRange = (type: 'MTD' | 'YTD' | 'MAX') => {
        const end = new Date(endDate); // Base on current end date
        
        if (type === 'MTD') {
            // Set to last day of previous month
            // new Date(year, monthIndex, 0) gets the last day of previous month
            const prevMonthEnd = new Date(end.getFullYear(), end.getMonth(), 0);
            
            // Format to YYYY-MM-DD manually to avoid timezone shifts
            const y = prevMonthEnd.getFullYear();
            const m = String(prevMonthEnd.getMonth() + 1).padStart(2, '0');
            const d = String(prevMonthEnd.getDate()).padStart(2, '0');
            setStartDate(`${y}-${m}-${d}`);
        } else if (type === 'YTD') {
            // Set to Dec 31 of previous year
            const prevYear = end.getFullYear() - 1;
            setStartDate(`${prevYear}-12-31`);
        } else if (type === 'MAX') {
            setStartDate('2000-01-01');
        }
        // Trigger fetch slightly after state update
        setTimeout(handleFetchData, 0);
    };

    // Auto-fetch on mount only if NOT System Index (System Index needs manual input usually)
    useEffect(() => {
        if (stock.id !== SYSTEM_INDEX_ID) {
            handleFetchData();
        }
    }, []);

    const handleFetchData = async () => {
        if (!stock.ticker) return;
        setLoading(true);
        setFetchStatus('更新數據中...');
        setSplitMsg('');
        
        try {
            // Using the shared utility from utils.ts
            // Note: Shared utility defaults to 'ADJ' logic (Total Return)
            const result = await calculateStockPerformance(stock, startDate, endDate);
            
            if (!result.success || !result.startPrice) {
                throw new Error(result.error || 'Unknown Error');
            }

            // Update State
            // Modified: For System Index, do not overwrite start price (keep user manual input)
            if (stock.id !== SYSTEM_INDEX_ID) {
                setStartPrice(result.startPrice.toFixed(2));
            }
            
            setEndPrice((result.endPrice || 0).toFixed(2));
            setDividends('0'); // In ADJ mode, div is 0
            
            setResultData({
                startPrice: result.startPrice,
                endPrice: result.endPrice || 0,
                totalDiv: 0,
                returnRate: result.returnRate || 0,
                totalDiff: result.totalDiff || 0,
                actualStartDate: result.actualStartDate || startDate
            });

            setFetchStatus('');

        } catch (err) {
            console.error(err);
            setFetchStatus('無法取得數據，請手動輸入');
        } finally {
            setLoading(false);
        }
    };

    const sPrice = parseFloat(startPrice);
    const ePrice = parseFloat(endPrice);
    const div = parseFloat(dividends);
    const isValid = !isNaN(sPrice) && !isNaN(ePrice) && !isNaN(div) && sPrice > 0;
    
    // Dynamic Calc based on inputs (allowing manual override)
    const priceDiff = isValid ? ePrice - sPrice : 0;
    const totalDiff = isValid ? priceDiff + div : 0;
    const returnRate = isValid ? (totalDiff / sPrice) * 100 : 0;

    // --- Save Handler ---
    const handleSaveRecord = () => {
        if (!onAddRecord || !isValid) return;
        
        // IMPORTANT: We save 'startDate' (User Intent) instead of 'resultData.actualStartDate' (API Reality).
        // This ensures that records intended for "2024-12-31" (YTD Start) are saved as such.
        
        onAddRecord({
            id: generateId(),
            stockId: stock.id,
            recordDate: new Date().toISOString().split('T')[0],
            startDate: startDate, // Save the intent date
            endDate,
            mode: calcMode,
            startPrice: sPrice,
            endPrice: ePrice,
            dividends: div,
            returnRate,
            totalDiff,
            note
        });
        alert('試算紀錄已儲存！');
        setNote('');
    };

    // --- History Filtering ---
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            if (r.stockId !== stock.id) return false;
            const rDate = new Date(r.recordDate);
            const rYear = rDate.getFullYear().toString();
            const rMonth = (rDate.getMonth() + 1).toString();
            
            if (filterYear !== 'ALL' && rYear !== filterYear) return false;
            if (filterMonth !== 'ALL' && rMonth !== filterMonth) return false;
            return true;
        }).sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime());
    }, [records, stock.id, filterYear, filterMonth]);

    const availableYears = useMemo(() => {
        const years = new Set(records.filter(r => r.stockId === stock.id).map(r => new Date(r.recordDate).getFullYear()));
        return Array.from(years).sort((a, b) => b - a);
    }, [records, stock.id]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b border-blue-100 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Calculator size={20} className="text-blue-600"/>
                            個股績效試算
                        </h3>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                            {stock.name} ({stock.ticker})
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20}/>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button 
                        onClick={() => setView('CALC')}
                        className={`flex-1 py-3 text-sm font-bold transition-all ${view === 'CALC' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        試算工具
                    </button>
                    <button 
                        onClick={() => setView('HISTORY')}
                        className={`flex-1 py-3 text-sm font-bold transition-all flex items-center justify-center gap-1 ${view === 'HISTORY' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        歷史紀錄 <span className="bg-slate-100 text-slate-500 px-1.5 rounded-full text-[10px]">{records.filter(r => r.stockId === stock.id).length}</span>
                    </button>
                </div>

                {view === 'CALC' ? (
                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <label className="text-[10px] font-bold text-slate-400 absolute left-1 -top-4">起始 (收盤價)</label>
                                    <Calendar size={14} className="absolute left-2.5 top-2.5 text-slate-400"/>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"/>
                                </div>
                                <ArrowRight size={16} className="text-slate-300 mt-2"/>
                                <div className="relative flex-1">
                                    <label className="text-[10px] font-bold text-slate-400 absolute left-1 -top-4">結算 (收盤價)</label>
                                    <Calendar size={14} className="absolute left-2.5 top-2.5 text-slate-400"/>
                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"/>
                                </div>
                            </div>

                            {/* Standard Period Toggles */}
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setRange('MTD')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                                        isMTD 
                                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                >
                                    {isMTD ? <CheckSquare size={14}/> : <Square size={14}/>}
                                    月績效(MTD)
                                </button>
                                <button 
                                    onClick={() => setRange('YTD')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                                        isYTD 
                                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                >
                                    {isYTD ? <CheckSquare size={14}/> : <Square size={14}/>}
                                    年績效(YTD)
                                </button>
                                <button 
                                    onClick={() => setRange('MAX')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                                        isMAX
                                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                >
                                    {isMAX ? <CheckSquare size={14}/> : <Square size={14}/>}
                                    成立至今
                                </button>
                            </div>

                            <button 
                                onClick={handleFetchData} 
                                disabled={loading}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-70"
                            >
                                {loading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCcw size={16}/>}
                                {loading ? '更新數據中...' : '更新股價與股息'}
                            </button>
                            {fetchStatus && !loading && <p className="text-xs text-center text-rose-500 font-bold">{fetchStatus}</p>}
                            
                            {resultData && resultData.actualStartDate > startDate && (
                                <div className="flex items-start gap-2 bg-amber-50 p-2 rounded-lg border border-amber-100 text-xs text-amber-700">
                                    <Info size={14} className="shrink-0 mt-0.5"/>
                                    <div>
                                        <span>實際數據起日為 <b>{resultData.actualStartDate}</b>，但系統將以 <b>{startDate}</b> 存檔以符合{isMAX ? '成立至今' : isYTD ? '年' : isMTD ? '月' : ''}績效格式。</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="h-px bg-slate-100"></div>

                        {/* Force ADJ Mode for consistency with Auto Report, but allow view switch if needed manually later */}
                        <div className="flex bg-slate-100 p-1 rounded-xl pointer-events-none opacity-80" title="自動計算皆使用還原權值">
                            <button className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-white text-emerald-600 shadow-sm flex items-center justify-center gap-1">
                                總報酬 (還原權值)
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                    期初還原股價 {currencyLabel}
                                    {stock.id === SYSTEM_INDEX_ID && (
                                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded border border-slate-200" title="此欄位為手動設定，不會被自動更新覆蓋">
                                            鎖定
                                        </span>
                                    )}
                                </label>
                                <input 
                                    type="number" step="0.01" value={startPrice} onChange={e => setStartPrice(e.target.value)}
                                    className={`w-full px-3 py-2 border border-slate-200 rounded-xl font-mono font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors ${stock.id === SYSTEM_INDEX_ID ? 'bg-amber-50/50' : 'bg-slate-50 focus:bg-white'}`}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">
                                    期末還原股價 {currencyLabel}
                                </label>
                                <input 
                                    type="number" step="0.01" value={endPrice} onChange={e => setEndPrice(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono font-bold text-slate-700 outline-none focus:border-blue-500 bg-slate-50 focus:bg-white transition-colors"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-bold">含息總損益</span>
                                <span className={`font-mono font-bold ${totalDiff >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {totalDiff >= 0 ? '+' : ''}{totalDiff.toFixed(2)}
                                </span>
                            </div>
                            <div className="h-px bg-slate-200 my-1"></div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-600 font-bold">含息報酬率</span>
                                <span className={`text-2xl font-black font-mono ${returnRate >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {isValid ? (returnRate >= 0 ? '+' : '') + returnRate.toFixed(2) + '%' : '-'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="輸入備註 (選填)" 
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500"
                                />
                                <button 
                                    onClick={handleSaveRecord}
                                    disabled={!isValid}
                                    className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold flex items-center gap-1 hover:bg-slate-700 transition-all disabled:opacity-50 shadow-md active:scale-95"
                                >
                                    <Save size={16} /> 儲存紀錄
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex gap-2 overflow-x-auto">
                            <select 
                                value={filterYear} 
                                onChange={e => setFilterYear(e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:border-blue-300"
                            >
                                <option value="ALL">全部年份</option>
                                {availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}
                            </select>
                            <select 
                                value={filterMonth} 
                                onChange={e => setFilterMonth(e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:border-blue-300"
                            >
                                <option value="ALL">全部月份</option>
                                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
                            </select>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {filteredRecords.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-sm">
                                    <History size={32} className="mx-auto mb-2 opacity-20"/>
                                    無符合條件的紀錄
                                </div>
                            ) : (
                                filteredRecords.map(rec => (
                                    <div key={rec.id} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:border-blue-200 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="text-[10px] font-bold text-slate-400">{rec.recordDate} 存檔</span>
                                                <div className="text-xs font-bold text-slate-700 mt-0.5">
                                                    區間: {rec.startDate} ~ {rec.endDate}
                                                </div>
                                            </div>
                                            <span className={`text-lg font-black font-mono ${rec.returnRate >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                {rec.returnRate > 0 ? '+' : ''}{rec.returnRate.toFixed(2)}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg">
                                            <div className="flex gap-2">
                                                <span>{rec.mode === 'ADJ' ? '總報酬' : '簡單報酬'}</span>
                                                {rec.note && <span className="text-slate-400">| {rec.note}</span>}
                                            </div>
                                            <button 
                                                onClick={() => onDeleteRecord && onDeleteRecord(rec.id)}
                                                className="text-slate-300 hover:text-rose-500 transition-colors"
                                            >
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const StockManager: React.FC<Props> = ({ 
    stocks, stockOrder, onUpdateOrder,
    onAddStock, onUpdateStock, onDeleteStock, marketFilter,
    performanceRecords = [], onAddPerformanceRecord, onDeletePerformanceRecord,
    accounts = [],
    suggestedCategories = DEFAULT_CATEGORIES,
    onUpdateSuggestedCategories,
    strategyFilter
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [calcStock, setCalcStock] = useState<Stock | null>(null);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{old: string, new: string} | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [draggedFilterCategory, setDraggedFilterCategory] = useState<string | null>(null);
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const uniqueCategories = useMemo(() => {
     const cats = new Set<string>();
     stocks.forEach(s => {
        if (s.category && (marketFilter === 'ALL' || s.market === marketFilter)) {
           s.category.split(',').forEach(c => {
              const cat = c.trim();
              if (cat) cats.add(cat);
           });
        }
     });
     return Array.from(cats);
  }, [stocks, marketFilter]); 

  const displayCategories = useMemo(() => {
     const inSuggestions = suggestedCategories.filter(cat => uniqueCategories.includes(cat));
     const notInSuggestions = uniqueCategories.filter(cat => !suggestedCategories.includes(cat));
     return [...inSuggestions, ...notInSuggestions];
  }, [suggestedCategories, uniqueCategories]);
  
  const [ticker, setTicker] = useState('');
  const [lastFetchedTicker, setLastFetchedTicker] = useState('');
  const [name, setName] = useState('');
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [category, setCategory] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [stockMarket, setStockMarket] = useState<Market>(Market.TW); 
  const [currency, setCurrency] = useState<'TWD' | 'USD'>('TWD');
  const [monthlyTarget, setMonthlyTarget] = useState(''); // New State for Monthly Target
  const [nav, setNav] = useState(''); // New State for NAV
  
  // DCA Settings State
  const [dcaSettings, setDcaSettings] = useState<DCASetting[]>([]); 
  const [activeDcaAccountId, setActiveDcaAccountId] = useState<string>('');

  // Dividend Months State
  const [dividendMonths, setDividendMonths] = useState<number[]>([]);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);

  // Sync categories once on mount to include existing categories from stocks
  const categoriesSyncedRef = useRef(false);
  useEffect(() => {
    if (!onUpdateSuggestedCategories || categoriesSyncedRef.current) return;
    
    const stockCats = new Set<string>();
    stocks.forEach(s => {
      if (s.category && s.category.trim()) {
        s.category.split(',').forEach(c => {
           const cat = c.trim();
           if (cat) stockCats.add(cat);
        });
      }
    });

    const currentSet = new Set(suggestedCategories);
    let hasNew = false;
    const newCats = [...suggestedCategories];
    
    stockCats.forEach(cat => {
      if (!currentSet.has(cat)) {
        newCats.push(cat);
        hasNew = true;
      }
    });

    if (hasNew) {
      onUpdateSuggestedCategories(newCats);
    }
    categoriesSyncedRef.current = true;
  }, [stocks, suggestedCategories, onUpdateSuggestedCategories]);

  const securitiesAccounts = useMemo(() => accounts.filter(a => a.isSecurities !== false), [accounts]);

  // Pre-process performance records to find the latest one for each stock
  const performanceMaps = useMemo(() => {
        const mtdMap = new Map<string, StockPerformanceRecord>();
        const ytdMap = new Map<string, StockPerformanceRecord>();
        const maxMap = new Map<string, StockPerformanceRecord>();
        
        if (!performanceRecords) return { mtdMap, ytdMap, maxMap };
        
        // Group by stockId
        const groups = new Map<string, StockPerformanceRecord[]>();
        performanceRecords.forEach(r => {
            if (!groups.has(r.stockId)) groups.set(r.stockId, []);
            groups.get(r.stockId)?.push(r);
        });

        // Find latest for each type
        groups.forEach((records, stockId) => {
            // Sort desc by recordDate to get the latest entry (if user updated it multiple times)
            records.sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime());
            
            // Logic for "Monthly" (MTD)
            const mtd = records.find(r => {
                // Check legacy format (1st of month)
                if (r.startDate.endsWith('-01')) {
                    const startYM = r.startDate.substring(0, 7);
                    const endYM = r.endDate.substring(0, 7);
                    if (startYM === endYM) return true;
                }
                
                // Check new format (Last day of previous month relative to End Date)
                const e = new Date(r.endDate);
                const targetStart = new Date(e.getFullYear(), e.getMonth(), 0);
                const y = targetStart.getFullYear();
                const m = String(targetStart.getMonth() + 1).padStart(2, '0');
                const d = String(targetStart.getDate()).padStart(2, '0');
                const targetStr = `${y}-${m}-${d}`;
                
                if (r.startDate === targetStr) return true;

                return false;
            });
            if (mtd) mtdMap.set(stockId, mtd);

            // Logic for "Yearly" (YTD)
            const ytd = records.find(r => {
                const startY = r.startDate.substring(0, 4);
                const endY = r.endDate.substring(0, 4);
                
                // Legacy check (Jan 1st)
                if (r.startDate.endsWith('-01-01') && startY === endY) return true;

                // New check: Start is Dec 31 of Prev Year
                if (r.startDate.endsWith('-12-31') && parseInt(startY) === parseInt(endY) - 1) return true;

                return false;
            });
            if (ytd) ytdMap.set(stockId, ytd);

            // Logic for "Since Inception" (MAX): Start date is 2000-01-01
            const max = records.find(r => r.startDate === '2000-01-01');
            if (max) maxMap.set(stockId, max);
        });
        
        return { mtdMap, ytdMap, maxMap };
  }, [performanceRecords]);

  // Sort Stocks
  const sortedStocks = useMemo(() => {
    let result = [...stocks];
    if (stockOrder && stockOrder.length > 0) {
        result.sort((a, b) => {
            // Priority 1: Hidden items go to bottom
            if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
            
            const idxA = stockOrder.indexOf(a.id);
            const idxB = stockOrder.indexOf(b.id);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
    } else {
        // Fallback default sort if no order saved (Market then Ticker)
        result.sort((a, b) => {
            // Priority 1: Hidden items go to bottom
            if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
            
            if (a.market !== b.market) return a.market === Market.TW ? -1 : 1;
            return a.ticker.localeCompare(b.ticker);
        });
    }

    if (strategyFilter) {
      if (strategyFilter === 'DEFENSE') {
        result = result.filter(s => s.isDynamicBalancing || s.strategy === 'DEFENSE' || s.category === '動態平衡策略' || s.category?.includes('動態平衡'));
      } else if (strategyFilter === 'NOVA') {
        result = result.filter(s => s.isNova || s.strategy === 'NOVA' || s.category === 'Nova策略' || s.category?.includes('Nova'));
      } else if (strategyFilter === 'TENX') {
        result = result.filter(s => s.isTenX || s.strategy === 'TENX' || s.category?.includes('十倍大盤') || s.isTenXCandidate);
      }
    } else {
      result = result.filter(s => 
        !(s.isDynamicBalancing || s.strategy === 'DEFENSE' || s.category === '動態平衡策略' || s.category?.includes('動態平衡')) &&
        !(s.isNova || s.strategy === 'NOVA' || s.category === 'Nova策略' || s.category?.includes('Nova')) &&
        !(s.isTenX || s.strategy === 'TENX' || s.category?.includes('十倍大盤') || s.isTenXCandidate)
      );
    }

    let filtered = result.filter(s => marketFilter === 'ALL' || s.market === marketFilter);
    if (selectedCategory) {
        filtered = filtered.filter(s => {
           const cats = s.category ? s.category.split(',').map(c => c.trim()) : [];
           return cats.includes(selectedCategory);
        });
    }
    return filtered;
  }, [stocks, stockOrder, marketFilter, selectedCategory, strategyFilter]);

  useEffect(() => {
    if (isAdding && !editingId) {
      setStockMarket(marketFilter === 'ALL' ? Market.TW : marketFilter);
      // Auto set currency based on market filter
      setCurrency(marketFilter === Market.US ? 'USD' : 'TWD');
    }
  }, [isAdding, editingId, marketFilter]);

  const resetForm = () => {
    setTicker('');
    setLastFetchedTicker('');
    setName('');
    setCategory('');
    setCurrentPrice('');
    setCurrency('TWD');
    setMonthlyTarget('');
    setNav('');
    setDcaSettings([]);
    setActiveDcaAccountId('');
    setDividendMonths([]);
    setIsAdding(false);
    setEditingId(null);
  };

  useEffect(() => {
    if (isAdding) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          resetForm();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isAdding]);

  const handleAddClick = () => {
    resetForm();
    if (strategyFilter) {
      if (strategyFilter === 'DEFENSE') setCategory('動態平衡策略');
      if (strategyFilter === 'NOVA') setCategory('Nova策略');
      if (strategyFilter === 'TENX') setCategory('十倍大盤策略');
    }
    setIsAdding(true);
  };

  const handleEditClick = (stock: Stock) => {
    setEditingId(stock.id);
    setTicker(stock.ticker);
    setName(stock.name);
    setCategory(stock.category || '');
    setStockMarket(stock.market);
    setCurrency(stock.currency || (stock.market === Market.US ? 'USD' : 'TWD'));
    setCurrentPrice(stock.currentPrice !== undefined ? formatMarketPrice(stock.currentPrice, stock.market) : '');
    setMonthlyTarget(stock.monthlyTarget ? stock.monthlyTarget.toString() : '');
    setNav(stock.nav ? stock.nav.toString() : '');
    setDividendMonths(stock.dividendMonths || []);

    // Load DCA Settings: Prefer new dcaSettings, fallback to legacy dcaDates
    if (stock.dcaSettings && stock.dcaSettings.length > 0) {
        setDcaSettings(stock.dcaSettings);
    } else if (stock.dcaDates && stock.dcaDates.length > 0) {
        // Migration: If legacy dates exist, assign them to the first available securities account or 'UNASSIGNED'
        const defaultAcc = securitiesAccounts.length > 0 ? securitiesAccounts[0].id : 'UNASSIGNED';
        setDcaSettings([{ accountId: defaultAcc, dates: stock.dcaDates }]);
    } else {
        setDcaSettings([]);
    }
    
    // Set active DCA account to first available
    if (securitiesAccounts.length > 0) {
        setActiveDcaAccountId(securitiesAccounts[0].id);
    }

    setIsAdding(true);
  };

  const handleQuickPriceUpdate = (stock: Stock, newPrice: string) => {
    onUpdateStock({
      ...stock,
      currentPrice: parseFloat(newPrice) || 0
    });
  };

  // Helper to handle Market change and auto-set Currency
  const handleMarketChange = (newMarket: Market) => {
      setStockMarket(newMarket);
      if (newMarket === Market.US) {
          setCurrency('USD');
      } else if (newMarket === Market.TW) {
          setCurrency('TWD');
      }
      // For Fund, Bond, Commodity, we keep current or default, user can change.
  };

  const toggleDcaDate = (day: number) => {
      if (!activeDcaAccountId) return;

      setDcaSettings(prev => {
          const existingIndex = prev.findIndex(s => s.accountId === activeDcaAccountId);
          let newDates: number[] = [];

          if (existingIndex >= 0) {
              const currentDates = prev[existingIndex].dates;
              if (currentDates.includes(day)) {
                  newDates = currentDates.filter(d => d !== day);
              } else {
                  newDates = [...currentDates, day].sort((a, b) => a - b);
              }
              
              const newSettings = [...prev];
              if (newDates.length === 0) {
                  // Remove setting if no dates left
                  newSettings.splice(existingIndex, 1);
              } else {
                  newSettings[existingIndex] = { ...newSettings[existingIndex], dates: newDates };
              }
              return newSettings;
          } else {
              // Create new setting
              return [...prev, { accountId: activeDcaAccountId, dates: [day] }];
          }
      });
  };

  const updateDcaSetting = (updates: Partial<{amount: number, autoDeduct: boolean}>) => {
      if (!activeDcaAccountId) return;
      setDcaSettings(prev => {
          const existingIndex = prev.findIndex(s => s.accountId === activeDcaAccountId);
          if (existingIndex >= 0) {
              const newSettings = [...prev];
              newSettings[existingIndex] = { ...newSettings[existingIndex], ...updates };
              return newSettings;
          } else {
              return [...prev, { accountId: activeDcaAccountId, dates: [], ...updates }];
          }
      });
  };

  const getActiveDcaSetting = () => {
      return dcaSettings.find(s => s.accountId === activeDcaAccountId) || null;
  };

  const getActiveDcaDates = () => {
      const setting = dcaSettings.find(s => s.accountId === activeDcaAccountId);
      return setting ? setting.dates : [];
  };

  const toggleDividendMonth = (month: number) => {
      setDividendMonths(prev => {
          if (prev.includes(month)) {
              return prev.filter(m => m !== month).sort((a, b) => a - b);
          } else {
              return [...prev, month].sort((a, b) => a - b);
          }
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !name) return;

    const trimmedCategory = category.trim();
    if (trimmedCategory && onUpdateSuggestedCategories) {
        let hasNew = false;
        let newSuggested = [...suggestedCategories];
        trimmedCategory.split(',').forEach(c => {
           const cat = c.trim();
           if (cat && !newSuggested.includes(cat)) {
              newSuggested.push(cat);
              hasNew = true;
           }
        });
        if (hasNew) onUpdateSuggestedCategories(newSuggested);
    }

    const stockData: any = {
      ticker,
      name,
      category: trimmedCategory,
      market: stockMarket,
      currentPrice: parseFloat(currentPrice) !== undefined && !isNaN(parseFloat(currentPrice)) ? parseFloat(currentPrice) : undefined,
      currency: currency,
      monthlyTarget: parseFloat(monthlyTarget) !== undefined && !isNaN(parseFloat(monthlyTarget)) ? parseFloat(monthlyTarget) : undefined,
      nav: parseFloat(nav) !== undefined && !isNaN(parseFloat(nav)) ? parseFloat(nav) : undefined,
      dcaSettings: dcaSettings.length > 0 ? dcaSettings : undefined,
      dcaDates: undefined, // Clear legacy field if updating
      dividendMonths: dividendMonths.length > 0 ? dividendMonths : undefined
    };

    if (!editingId && strategyFilter) {
      if (strategyFilter === 'DEFENSE') { stockData.isDynamicBalancing = true; stockData.strategy = 'DEFENSE'; }
      if (strategyFilter === 'NOVA') { stockData.isNova = true; stockData.strategy = 'NOVA'; }
      if (strategyFilter === 'TENX') { stockData.isTenX = true; stockData.strategy = 'TENX'; }
    }

    if (editingId) {
      // Find existing stock to preserve 'note' and other fields
      const existingStock = stocks.find(s => s.id === editingId);
      if (existingStock) {
          onUpdateStock({ ...existingStock, ...stockData });
      } else {
          // Fallback if not found (shouldn't happen)
          onUpdateStock({ id: editingId, ...stockData } as Stock);
      }
    } else {
      const newId = generateId();
      onAddStock({ id: newId, ...stockData });
      // Add new stock to order list
      if (onUpdateOrder) {
          const newOrder = stockOrder ? [...stockOrder, newId] : [...stocks.map(s => s.id), newId];
          onUpdateOrder(newOrder);
      }
    }
    resetForm();
  };

  // --- Category Management Handlers ---
  const handleUpdateCategoryName = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed || !onUpdateSuggestedCategories) return;
    
    // Update suggestion list
    const newSuggested = suggestedCategories.map(cat => cat === oldName ? trimmed : cat);
    onUpdateSuggestedCategories(newSuggested);
    
    // Update all stocks using this category segment
    stocks.forEach(s => {
      if (s.category) {
        const segs = s.category.split(',').map(c => c.trim());
        if (segs.includes(oldName)) {
           const newSegs = segs.map(c => c === oldName ? trimmed : c);
           onUpdateStock({ ...s, category: newSegs.join(', ') });
        }
      }
    });
    setEditingCategory(null);
  };

  const handleDeleteCategory = (catToDelete: string) => {
    if (!onUpdateSuggestedCategories) return;
    
    // Remove from suggestions
    const newSuggested = suggestedCategories.filter(cat => cat !== catToDelete);
    onUpdateSuggestedCategories(newSuggested);
    
    // IMPORTANT: Clear this category from all stocks to prevent it from being re-discovered or causing confusion
    stocks.forEach(s => {
      if (s.category) {
        const segs = s.category.split(',').map(c => c.trim());
        if (segs.includes(catToDelete)) {
           const newSegs = segs.filter(c => c !== catToDelete);
           onUpdateStock({ ...s, category: newSegs.join(', ') || '' });
        }
      }
    });
  };

  const handleReorderCategory = (draggedIndex: number, targetIndex: number) => {
    if (!onUpdateSuggestedCategories) return;
    const newOrder = [...suggestedCategories];
    const item = newOrder.splice(draggedIndex, 1)[0];
    newOrder.splice(targetIndex, 0, item);
    onUpdateSuggestedCategories(newOrder);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget) e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.currentTarget.style.opacity = '1';
    setDraggedId(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId || !onUpdateOrder) return;

    // Use full list of stocks for reordering
    let newOrder = stockOrder && stockOrder.length > 0 ? [...stockOrder] : stocks.map(s => s.id);
    
    // Safety check: ensure both IDs exist in order array
    if (!newOrder.includes(draggedId)) newOrder.push(draggedId);
    if (!newOrder.includes(targetId)) newOrder.push(targetId);

    const fromIndex = newOrder.indexOf(draggedId);
    const toIndex = newOrder.indexOf(targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, draggedId);
      onUpdateOrder(newOrder);
    }
    setDraggedId(null);
  };

  const getMarketBadge = (market: Market) => {
      switch (market) {
          case Market.TW: return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm bg-blue-100 text-blue-600">TW</span>;
          case Market.US: return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm bg-green-100 text-green-600">US</span>;
          case Market.FUND: return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm bg-purple-100 text-purple-600">FUND</span>;
          case Market.BOND: return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm bg-cyan-100 text-cyan-600">BOND</span>;
          case Market.COMMODITY: return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm bg-orange-100 text-orange-600">CMDTY</span>;
          default: return null;
      }
  };

  const getAccountName = (id: string) => {
      if (id === 'UNASSIGNED') return '未指定';
      const acc = accounts.find(a => a.id === id);
      return acc ? acc.name : id;
  };

  // Helper to render stats cells to avoid duplication
  const renderStatsCells = (stockId: string) => {
      const mtdRecord = performanceMaps.mtdMap.get(stockId);
      const ytdRecord = performanceMaps.ytdMap.get(stockId);
      const maxRecord = performanceMaps.maxMap.get(stockId);

      return (
          <>
            <td className="px-6 py-4 font-mono font-bold">
                {mtdRecord ? (
                    <div className="flex flex-col">
                        <span className={mtdRecord.returnRate >= 0 ? 'text-rose-500' : 'text-emerald-500'}>
                            {mtdRecord.returnRate > 0 ? '+' : ''}{mtdRecord.returnRate.toFixed(2)}%
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                            {mtdRecord.recordDate}
                        </span>
                    </div>
                ) : (
                    <span className="text-slate-300 text-xs">-</span>
                )}
            </td>
            <td className="px-6 py-4 font-mono font-bold">
                {ytdRecord ? (
                    <div className="flex flex-col">
                        <span className={ytdRecord.returnRate >= 0 ? 'text-rose-500' : 'text-emerald-500'}>
                            {ytdRecord.returnRate > 0 ? '+' : ''}{ytdRecord.returnRate.toFixed(2)}%
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                            {ytdRecord.recordDate}
                        </span>
                    </div>
                ) : (
                    <span className="text-slate-300 text-xs">-</span>
                )}
            </td>
            <td className="px-6 py-4 font-mono font-bold">
                {maxRecord ? (
                    <div className="flex flex-col">
                        <span className={maxRecord.returnRate >= 0 ? 'text-rose-500' : 'text-emerald-500'}>
                            {maxRecord.returnRate > 0 ? '+' : ''}{maxRecord.returnRate.toFixed(2)}%
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                            {maxRecord.recordDate}
                        </span>
                    </div>
                ) : (
                    <span className="text-slate-300 text-xs">-</span>
                )}
            </td>
          </>
      );
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
           <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings2 className="text-blue-600" />
            股票管理 <span className="text-slate-400 text-sm font-normal">({sortedStocks.length} 檔)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 pl-8">設定您的觀察與持有名單。系統將在每月過後自動記錄「上月結」績效。</p>
        </div>
       
        {!isAdding && (
          <button 
            type="button"
            onClick={handleAddClick}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-full hover:bg-slate-700 hover:shadow-lg transition-all text-sm font-bold active:scale-95"
          >
            <Plus size={18} /> 新增股票
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-top-2 shadow-inner">
          <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold border-b border-slate-200 pb-2">
             {editingId ? <Edit2 size={18}/> : <Plus size={18}/>}
             {editingId ? '編輯股票資訊' : '新增股票標的'}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-5">
             <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">市場</label>
              <select
                value={stockMarket}
                onChange={e => handleMarketChange(e.target.value as Market)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium"
              >
                <option value={Market.TW}>台股 TW</option>
                <option value={Market.US}>美股 US</option>
                <option value={Market.FUND}>基金 FUND</option>
                <option value={Market.BOND}>債券 BOND</option>
                <option value={Market.COMMODITY}>原物料 CMDTY</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">代號</label>
              <div className="relative">
                <input 
                  value={ticker}
                  onChange={e => setTicker(e.target.value)}
                  onBlur={async () => {
                    const currentTicker = ticker.trim().toUpperCase();
                    if (currentTicker && currentTicker.length >= 2 && currentTicker !== lastFetchedTicker) {
                      setLastFetchedTicker(currentTicker);
                      setIsFetchingName(true);
                      try {
                        let symbol = ticker.trim().toUpperCase();
                        if (stockMarket === Market.TW && !symbol.includes('.')) {
                          symbol += '.TW';
                        }
                        
                        const isDesktopEnv = (window as any).electronAPI?.isElectron || window.location.protocol === 'file:';
                        let quoteData = null;
                        
                        const fetchQuote = async (sym: string) => {
                            if (isDesktopEnv && (window as any).electronAPI) {
                                const res = await (window as any).electronAPI.fetchYahooQuote(sym);
                                return res.data ? res.data : null;
                            } else {
                                const res = await fetchCurrentYahooQuote(sym);
                                return res && res.success ? res : null;
                            }
                        };
                        
                        if (stockMarket === Market.TW && !ticker.trim().includes('.')) {
                            quoteData = await fetchQuote(`${ticker.trim().toUpperCase()}.TW`);
                            if (!quoteData || !(quoteData.shortName || quoteData.longName)) {
                                quoteData = await fetchQuote(`${ticker.trim().toUpperCase()}.TWO`);
                            }
                        } else {
                            quoteData = await fetchQuote(symbol);
                        }

                        if (quoteData && (quoteData.shortName || quoteData.longName)) {
                          setName(quoteData.shortName || quoteData.longName || '');
                          if (quoteData.regularMarketPrice) {
                            setCurrentPrice(quoteData.regularMarketPrice.toString());
                          } else {
                            setCurrentPrice('');
                          }
                        } else {
                          setName('');
                          setCurrentPrice('');
                        }
                      } catch (err) {
                        console.error("Auto-fetch name failed", err);
                      } finally {
                        setIsFetchingName(false);
                      }
                    }
                  }}
                  placeholder={stockMarket === Market.TW ? "Ex: 2330" : stockMarket === Market.US ? "Ex: AAPL" : "Ex: 0050"}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium pr-10"
                  required
                />
                {isFetchingName && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 size={16} className="animate-spin text-blue-500" />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1 lg:col-span-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">名稱</label>
              <input 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={stockMarket === Market.TW ? "Ex: 台積電" : "Ex: Apple"}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium"
                required
              />
              {stockMarket === Market.FUND && (
                <div className="mt-1 flex items-center justify-start">
                    <a 
                        href={`https://www.moneydj.com/funddj/yp/FindFund.djhtm?a=${encodeURIComponent(name || ticker)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 group"
                    >
                        <Search size={10} className="text-slate-400 group-hover:text-blue-500" />
                        <span className="opacity-70 group-hover:opacity-100 transition-opacity">在 MoneyDJ 搜尋淨值</span>
                    </a>
                </div>
              )}
            </div>
             <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                  參考市價
              </label>
              <input 
                type="number"
                step="0.01"
                value={currentPrice}
                onChange={e => setCurrentPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium font-mono"
              />
            </div>
             {stockMarket !== Market.FUND && (
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                    參考淨值
                </label>
                <input 
                  type="number"
                  step="0.0001"
                  value={nav}
                  onChange={e => setNav(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium font-mono"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">計算幣別</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value as 'TWD' | 'USD')}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium"
              >
                <option value="TWD">台幣 TWD</option>
                <option value="USD">美金 USD</option>
              </select>
            </div>
            <div className={`space-y-1 ${strategyFilter ? 'hidden' : ''}`}>
              <label className="block text-xs font-bold text-slate-500 uppercase">分類</label>
              <input 
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="自訂分類"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium"
                readOnly={!!strategyFilter}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-emerald-600 uppercase flex items-center gap-1">
                  <Target size={12}/> 每月投入目標 (選填)
              </label>
              <input 
                type="number"
                value={monthlyTarget}
                onChange={e => setMonthlyTarget(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-2.5 border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm font-medium text-emerald-700 font-mono"
              />
            </div>
          </div>
          
          {!strategyFilter && (
            <div className="flex flex-wrap gap-1.5 mt-2 items-center">
              {suggestedCategories.map((cat, index) => (
                <motion.div 
                  key={cat} 
                  layout
                  draggable
                  onDragStart={() => setDraggedCategory(cat)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedCategory && draggedCategory !== cat) {
                    const fromIndex = suggestedCategories.indexOf(draggedCategory);
                    const toIndex = index;
                    const newList = [...suggestedCategories];
                    const [removed] = newList.splice(fromIndex, 1);
                    newList.splice(toIndex, 0, removed);
                    if (onUpdateSuggestedCategories) {
                      onUpdateSuggestedCategories(newList);
                    }
                  }
                }}
                onDragEnd={() => setDraggedCategory(null)}
                className={`group relative cursor-grab active:cursor-grabbing transition-all duration-200 ${draggedCategory === cat ? 'opacity-30 scale-95' : 'opacity-100'}`}
              >
                <button
                  type="button"
                  onClick={() => {
                     const cats = category.split(',').map(c => c.trim()).filter(Boolean);
                     if (cats.includes(cat)) {
                         setCategory(cats.filter(c => c !== cat).join(', '));
                     } else {
                         setCategory([...cats, cat].join(', '));
                     }
                  }}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-all flex items-center gap-1 font-medium shadow-sm ${
                    category.split(',').map(c => c.trim()).includes(cat)
                      ? 'bg-blue-600 border-blue-500 text-white font-bold ring-1 ring-blue-100' 
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-white hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  <Tag size={10} /> {cat}
                </button>
                <div className="absolute -top-2 -right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 pointer-events-auto z-10">
                   <button onClick={(e) => { e.stopPropagation(); setEditingCategory({old: cat, new: cat}); setIsManagingCategories(true); }} className="bg-white border border-slate-200 text-slate-400 hover:text-blue-500 p-0.5 rounded shadow-sm" title="編輯"><Edit2 size={8}/></button>
                   <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }} className="bg-white border border-slate-200 text-slate-400 hover:text-rose-500 p-0.5 rounded shadow-sm" title="刪除"><Trash2 size={8}/></button>
                </div>
              </motion.div>
            ))}
            
            {showAddCategoryInput ? (
              <div className="flex items-center gap-1 animate-in slide-in-from-left-2 duration-200">
                <input 
                  autoFocus
                  placeholder="輸入名稱..."
                  value={newCategoryInput}
                  onChange={e => setNewCategoryInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                       const trimmed = newCategoryInput.trim();
                       if (trimmed && onUpdateSuggestedCategories && !suggestedCategories.includes(trimmed)) {
                         onUpdateSuggestedCategories([...suggestedCategories, trimmed]);
                         setNewCategoryInput('');
                         setShowAddCategoryInput(false);
                       }
                    }
                    if (e.key === 'Escape') setShowAddCategoryInput(false);
                  }}
                  className="text-[10px] px-2 py-1 rounded-full border border-blue-400 outline-none focus:ring-2 focus:ring-blue-100 w-20 shadow-sm"
                />
                <button 
                  type="button"
                  onClick={() => {
                    const trimmed = newCategoryInput.trim();
                    if (trimmed && onUpdateSuggestedCategories && !suggestedCategories.includes(trimmed)) {
                      onUpdateSuggestedCategories([...suggestedCategories, trimmed]);
                      setNewCategoryInput('');
                      setShowAddCategoryInput(false);
                    }
                  }}
                  className="text-emerald-500 hover:bg-emerald-50 p-0.5 rounded-full transition-colors"
                >
                  <Check size={12} />
                </button>
                <button 
                  type="button"
                  onClick={() => setShowAddCategoryInput(false)}
                  className="text-slate-400 hover:bg-slate-100 p-0.5 rounded-full transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button 
                type="button"
                onClick={() => setShowAddCategoryInput(true)}
                className="text-[10px] px-2 py-1 rounded-full border-2 border-dashed border-slate-200 text-slate-400 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-500 transition-all flex items-center gap-1 font-bold"
              >
                <Plus size={10} /> 新增標籤
              </button>
            )}

            <button 
              type="button"
              onClick={() => setIsManagingCategories(!isManagingCategories)}
              className="text-[10px] px-2 py-1 rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all flex items-center gap-1 shadow-sm"
            >
              <Settings2 size={10} /> 管理
            </button>
          </div>
          )}


          {isManagingCategories && (
            <div className="mt-4 p-4 bg-white rounded-xl border border-blue-100 shadow-sm animate-in zoom-in-95 duration-200">
               <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-bold text-slate-600 flex items-center gap-1">
                     <Tag size={14} className="text-blue-500"/> 分類管理 (拖曳可排序)
                  </h4>
                  <button type="button" onClick={() => setIsManagingCategories(false)} className="text-slate-400 hover:text-slate-600">
                     <X size={14}/>
                  </button>
               </div>
               <div className="space-y-2">
                  {suggestedCategories.map((cat, idx) => (
                      <div 
                        key={cat} 
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', idx.toString()); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const draggedIdx = parseInt(e.dataTransfer.getData('text/plain')); if (draggedIdx !== idx) handleReorderCategory(draggedIdx, idx); }}
                        className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg group hover:bg-slate-100 transition-colors"
                      >
                         <GripVertical size={14} className="text-slate-300 cursor-grab active:cursor-grabbing"/>
                         {editingCategory?.old === cat ? (
                            <div className="flex-1 flex gap-2">
                               <input 
                                 autoFocus
                                 value={editingCategory.new} 
                                 onChange={e => setEditingCategory({ ...editingCategory, new: e.target.value })}
                                 onKeyDown={e => { if (e.key === 'Enter') handleUpdateCategoryName(cat, editingCategory.new); if (e.key === 'Escape') setEditingCategory(null); }}
                                 className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded outline-none focus:ring-2 focus:ring-blue-100"
                               />
                               <button type="button" onClick={() => handleUpdateCategoryName(cat, editingCategory.new)} className="text-emerald-500 hover:bg-emerald-50 p-1 rounded"><Check size={14}/></button>
                               <button type="button" onClick={() => setEditingCategory(null)} className="text-slate-400 hover:bg-slate-200 p-1 rounded"><X size={14}/></button>
                            </div>
                         ) : (
                            <>
                               <span className="flex-1 text-xs font-bold text-slate-700">{cat}</span>
                               <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button type="button" onClick={() => setEditingCategory({ old: cat, new: cat })} className="p-1 text-slate-400 hover:text-blue-500 hover:bg-white rounded transition-colors"><Edit2 size={12}/></button>
                                  <button type="button" onClick={() => handleDeleteCategory(cat)} className="p-1 text-slate-400 hover:text-rose-500 hover:bg-white rounded transition-colors"><Trash2 size={12}/></button>
                               </div>
                            </>
                         )}
                      </div>
                  ))}
                  <div className="pt-2">
                     {showAddCategoryInput ? (
                        <div className="flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                           <input 
                             autoFocus
                             placeholder="輸入新分類名稱..."
                             value={newCategoryInput}
                             onChange={e => setNewCategoryInput(e.target.value)}
                             onKeyDown={e => {
                               if (e.key === 'Enter') {
                                  const trimmed = newCategoryInput.trim();
                                  if (trimmed && onUpdateSuggestedCategories && !suggestedCategories.includes(trimmed)) {
                                    onUpdateSuggestedCategories([...suggestedCategories, trimmed]);
                                    setNewCategoryInput('');
                                    setShowAddCategoryInput(false);
                                  }
                               }
                               if (e.key === 'Escape') setShowAddCategoryInput(false);
                             }}
                             className="flex-1 px-3 py-2 text-xs border border-blue-400 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                           />
                           <button 
                             type="button"
                             onClick={() => {
                               const trimmed = newCategoryInput.trim();
                               if (trimmed && onUpdateSuggestedCategories && !suggestedCategories.includes(trimmed)) {
                                 onUpdateSuggestedCategories([...suggestedCategories, trimmed]);
                                 setNewCategoryInput('');
                                 setShowAddCategoryInput(false);
                               }
                             }}
                             className="bg-emerald-500 text-white p-2 rounded-lg hover:bg-emerald-600 transition-colors"
                           >
                             <Check size={16} />
                           </button>
                           <button 
                             type="button"
                             onClick={() => setShowAddCategoryInput(false)}
                             className="bg-slate-100 text-slate-500 p-2 rounded-lg hover:bg-slate-200 transition-colors"
                           >
                             <X size={16} />
                           </button>
                        </div>
                     ) : (
                        <button 
                           type="button"
                           onClick={() => setShowAddCategoryInput(true)}
                           className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all flex items-center justify-center gap-1"
                        >
                           <Plus size={14}/> 新增分類標籤
                        </button>
                     )}
                  </div>
               </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* DCA Settings Section */}
              <div>
                  <div className="flex flex-col md:flex-row gap-6">
                      {/* Account Selector & Grid */}
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                              <CalendarClock size={14}/> 定期定額扣款日設定 (分帳戶)
                          </label>
                          
                          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                              <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">選擇設定帳戶</label>
                                  <div className="relative">
                                      <CreditCard className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                                      <select 
                                          value={activeDcaAccountId} 
                                          onChange={(e) => setActiveDcaAccountId(e.target.value)}
                                          className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold text-sm bg-white"
                                      >
                                          {securitiesAccounts.length === 0 && <option value="">無證券帳戶</option>}
                                          {securitiesAccounts.map(acc => (
                                              <option key={acc.id} value={acc.id}>{acc.name}</option>
                                          ))}
                                      </select>
                                  </div>
                              </div>

                              {activeDcaAccountId ? (
                                  <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">
                                          點擊選擇扣款日 (複選)
                                      </label>
                                      <div className="flex flex-wrap gap-1.5 mb-4">
                                          {Array.from({length: 31}, (_, i) => i + 1).map(day => {
                                              const isActive = getActiveDcaDates().includes(day);
                                              return (
                                                  <button 
                                                      key={day}
                                                      type="button" 
                                                      onClick={() => toggleDcaDate(day)}
                                                      className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                                                          isActive 
                                                          ? 'bg-blue-600 text-white shadow-sm transform scale-110' 
                                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                      }`}
                                                  >
                                                      {day}
                                                  </button>
                                              );
                                          })}
                                      </div>
                                      
                                      <div className="space-y-3 pt-3 border-t border-slate-100">
                                          <div>
                                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                                  每次扣款金額 (TWD)
                                              </label>
                                              <input 
                                                  type="number" 
                                                  placeholder="例如：2000"
                                                  value={getActiveDcaSetting()?.amount || ''}
                                                  onChange={(e) => updateDcaSetting({ amount: parseFloat(e.target.value) || 0 })}
                                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 transition-all text-xs font-mono"
                                              />
                                          </div>
                                          <div className="flex items-center gap-2">
                                              <input 
                                                  type="checkbox"
                                                  id="autoDeduct"
                                                  checked={getActiveDcaSetting()?.autoDeduct || false}
                                                  onChange={(e) => updateDcaSetting({ autoDeduct: e.target.checked })}
                                                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                              />
                                              <label htmlFor="autoDeduct" className="text-xs font-bold text-slate-700 cursor-pointer">
                                                  自動生成扣款交易
                                              </label>
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="text-center py-8 text-slate-400 text-sm">
                                      請先建立證券帳戶以設定扣款日
                                  </div>
                              )}
                          </div>
                      </div>

                      {/* Summary List */}
                      <div className="md:w-48 bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                          <h4 className="text-xs font-bold text-slate-600 uppercase mb-3">目前設定總覽</h4>
                          <div className="flex-1 space-y-2 overflow-y-auto max-h-48 custom-scrollbar pr-1">
                              {dcaSettings.length === 0 ? (
                                  <div className="text-xs text-slate-400 italic text-center py-4">尚未設定</div>
                              ) : (
                                  dcaSettings.map((setting, idx) => (
                                      <div key={idx} className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm text-xs group relative">
                                          <div className="font-bold text-blue-600 mb-1 flex items-center justify-between gap-1">
                                            <div className="flex items-center gap-1">
                                              <CreditCard size={10}/>
                                              {getAccountName(setting.accountId)}
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const newSettings = [...dcaSettings];
                                                    newSettings.splice(idx, 1);
                                                    setDcaSettings(newSettings);
                                                }}
                                                className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded hover:bg-rose-50"
                                                title="刪除設定"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                              {setting.dates.map(d => (
                                                  <span key={d} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-mono">
                                                      {d}日
                                                  </span>
                                              ))}
                                          </div>
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>
                  </div>
              </div>

              {/* Dividend Months Section */}
              <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                      <Coins size={14}/> 預估除息月份 (可複選)
                  </label>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="grid grid-cols-6 gap-2 sm:flex sm:flex-wrap">
                          {Array.from({length: 12}, (_, i) => i + 1).map(month => {
                              const isSelected = dividendMonths.includes(month);
                              return (
                                  <button
                                      key={month}
                                      type="button"
                                      onClick={() => toggleDividendMonth(month)}
                                      className={`w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center transition-all border-2 ${
                                          isSelected
                                          ? 'bg-amber-500 border-amber-500 text-white shadow-md transform scale-105'
                                          : 'bg-white border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-500'
                                      }`}
                                  >
                                      {month}月
                                  </button>
                              );
                          })}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-3 flex items-center gap-1">
                          <Info size={12}/> 設定除息月份後，將顯示於資產卡片上，方便追蹤現金流。
                      </p>
                  </div>
              </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
            <button 
              type="button" 
              onClick={resetForm}
              className="px-5 py-2 text-slate-500 hover:bg-slate-200 rounded-xl text-sm font-bold transition-colors"
            >
              取消
            </button>
            <button 
              type="submit" 
              className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-bold flex items-center gap-2 shadow-md active:scale-95 transition-all"
            >
              <Check size={16} /> {editingId ? '確認更新' : '立即新增'}
            </button>
          </div>
        </form>
      )}

      {displayCategories.length > 0 && (
         <div className="flex gap-1.5 mb-4 overflow-x-auto pb-2 scrollbar-hide items-center">
            <button 
               onClick={() => setSelectedCategory(null)}
               className={`px-3 py-1.5 rounded-xl text-[10px] font-bold whitespace-nowrap transition-all ${
                  !selectedCategory 
                  ? 'bg-slate-800 text-white shadow-md' 
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
               }`}
            >
               全部股票
            </button>
            {displayCategories.map((cat, index) => (
               <motion.div
                  key={cat}
                  layout
                  draggable
                  onDragStart={() => setDraggedFilterCategory(cat)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedFilterCategory && draggedFilterCategory !== cat) {
                      const fromIndex = suggestedCategories.indexOf(draggedFilterCategory);
                      const toIndex = suggestedCategories.indexOf(cat);
                      
                      if (fromIndex !== -1 && toIndex !== -1) {
                        const newList = [...suggestedCategories];
                        const [removed] = newList.splice(fromIndex, 1);
                        newList.splice(toIndex, 0, removed);
                        if (onUpdateSuggestedCategories) {
                          onUpdateSuggestedCategories(newList);
                        }
                      }
                    }
                  }}
                  onDragEnd={() => setDraggedFilterCategory(null)}
                  className={`${draggedFilterCategory === cat ? 'opacity-30 scale-95' : 'opacity-100'}`}
               >
                  <button 
                     onClick={() => setSelectedCategory(cat)}
                     className={`px-3 py-1.5 rounded-xl text-[10px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shadow-sm border ${
                        selectedCategory === cat 
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                     }`}
                  >
                     <Tag size={10} className={selectedCategory === cat ? "text-indigo-200" : "text-slate-400"} />
                     {cat}
                  </button>
               </motion.div>
            ))}
         </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-bold w-10"></th>
              <th className="px-6 py-4 font-bold">市場</th>
              <th className="px-6 py-4 font-bold">代號</th>
              <th className="px-6 py-4 font-bold">名稱</th>
              <th className="px-6 py-4 font-bold">參考市價 (點擊修改)</th>
              <th className="px-6 py-4 font-bold">分類</th>
              <th className="px-6 py-4 font-bold text-center text-amber-600">除息月份</th>
              <th className="px-6 py-4 font-bold text-center text-emerald-600">每月投入目標 & 扣款日</th>
              <th className="px-6 py-4 font-bold text-blue-600">當月含息報酬率</th>
              <th className="px-6 py-4 font-bold text-blue-600">當年含息報酬率</th>
              <th className="px-6 py-4 font-bold text-blue-600">成立至今總報酬</th>
              <th className="px-6 py-4 font-bold text-center w-16">顯示</th>
              <th className="px-6 py-4 font-bold text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* System Weighted Return Index Row (Always Fixed) */}
            {(marketFilter === 'ALL' || marketFilter === Market.TW) && (!selectedCategory || selectedCategory === SYSTEM_INDEX_STOCK.category) && (
                <tr className="bg-slate-50/50 hover:bg-indigo-50/30 transition-colors group border-b-2 border-slate-100">
                    <td className="px-6 py-4 text-center">
                        <Lock size={14} className="text-slate-300 mx-auto"/>
                    </td>
                    <td className="px-6 py-4">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm bg-indigo-100 text-indigo-600">SYS</span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-500 font-mono text-xs">
                        {SYSTEM_INDEX_STOCK.ticker}
                    </td>
                    <td className="px-6 py-4 text-indigo-700 font-bold">
                        {SYSTEM_INDEX_STOCK.name}
                    </td>
                    <td className="px-6 py-4 text-slate-400 italic text-xs">
                        (手動輸入)
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            {SYSTEM_INDEX_STOCK.category}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <span className="text-slate-300">-</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <span className="text-slate-300">-</span>
                    </td>
                    
                    {renderStatsCells(SYSTEM_INDEX_ID)}

                    <td className="px-6 py-4 text-center">
                        <span className="text-slate-300">-</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setCalcStock(SYSTEM_INDEX_STOCK)}
                                className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded-lg transition-colors"
                                title="績效試算"
                            >
                                <Calculator size={16} />
                            </button>
                        </div>
                    </td>
                </tr>
            )}

            {sortedStocks.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-6 py-12 text-center text-slate-400">
                   <div className="flex flex-col items-center gap-2">
                      <Settings2 size={32} className="text-slate-300" />
                      <span>尚未新增股票</span>
                   </div>
                </td>
              </tr>
            ) : (
              sortedStocks.map(stock => {
                const isDragging = draggedId === stock.id;
                
                // Determine symbol based on stock.currency first, then fall back to market logic
                const currencySymbol = stock.currency === 'USD' ? '$' : stock.currency === 'TWD' ? 'NT' : (stock.market === Market.US ? '$' : 'NT');

                return (
                  <tr 
                    key={stock.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, stock.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, stock.id)}
                    onDragEnd={handleDragEnd}
                    className={`transition-colors group ${isDragging ? 'bg-blue-50 opacity-50' : 'hover:bg-slate-50'} ${stock.hidden ? 'opacity-60 bg-slate-50/50' : ''}`}
                  >
                    <td className="px-6 py-4">
                        <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-blue-500 transition-colors" title="拖曳排序">
                            <GripVertical size={16} />
                        </div>
                    </td>
                    <td className="px-6 py-4">
                      {getMarketBadge(stock.market)}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800 font-mono">{stock.ticker}</td>
                    <td className="px-6 py-4 text-slate-700 font-medium">{stock.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700 flex items-center gap-2 w-32 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                           <span className="text-slate-400 text-xs font-bold">{currencySymbol}</span>
                           <input 
                             key={`${stock.id}-${stock.currentPrice}`} 
                             type="number"
                             step="0.01"
                             className="bg-transparent w-full outline-none font-mono text-sm font-medium"
                             placeholder="-"
                             defaultValue={stock.currentPrice !== undefined ? formatMarketPrice(stock.currentPrice, stock.market) : ''}
                             onBlur={(e) => handleQuickPriceUpdate(stock, e.target.value)}
                           />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {stock.category && stock.category.trim() ? (
                        <div className="flex flex-col gap-1 items-start">
                          {stock.category.split(',').map(c => c.trim()).filter(Boolean).map((cat, i) => (
                              <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                {cat}
                              </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                        {stock.dividendMonths && stock.dividendMonths.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1 max-w-[120px]">
                                {stock.dividendMonths.map(m => (
                                    <span key={m} className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-100 text-[10px] font-bold">
                                        {m}月
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="text-slate-300 text-xs">-</span>
                        )}
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-emerald-600 font-bold">
                        <div className="flex flex-col items-center gap-1.5">
                            {stock.monthlyTarget ? (
                                <div className="flex items-center justify-center gap-1 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                    <Target size={12}/> {stock.monthlyTarget.toLocaleString()}
                                </div>
                            ) : null}
                            
                            {/* Account-Specific DCA Dates Display */}
                            {stock.dcaSettings && stock.dcaSettings.length > 0 && (
                                <div className="flex flex-col gap-1 w-full max-w-[200px]">
                                    {stock.dcaSettings.map((setting, idx) => (
                                        <div key={idx} className="flex items-center gap-1 text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                            <span className="font-bold text-indigo-700 whitespace-nowrap">{getAccountName(setting.accountId)}:</span>
                                            <span className="text-indigo-500 truncate" title={setting.dates.join(', ')}>
                                                {setting.dates.join(', ')}日
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {/* Legacy Display (Fallback) */}
                            {(!stock.dcaSettings || stock.dcaSettings.length === 0) && stock.dcaDates && stock.dcaDates.length > 0 && (
                                <div className="flex flex-wrap justify-center gap-1 max-w-[150px]">
                                    {stock.dcaDates.map(d => (
                                        <span key={d} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold border border-slate-200 leading-none">
                                            {d}日
                                        </span>
                                    ))}
                                </div>
                            )}
                            
                            {!stock.monthlyTarget && (!stock.dcaSettings || stock.dcaSettings.length === 0) && (!stock.dcaDates || stock.dcaDates.length === 0) && '-'}
                        </div>
                    </td>
                    
                    {renderStatsCells(stock.id)}

                    <td className="px-6 py-4 text-center">
                        <button
                            onClick={() => onUpdateStock({ ...stock, hidden: !stock.hidden })}
                            className={`p-1.5 rounded-lg transition-colors ${stock.hidden ? 'text-slate-400 hover:text-slate-600 bg-slate-100' : 'text-blue-500 hover:text-blue-600 bg-blue-50'}`}
                            title={stock.hidden ? "目前隱藏 (點擊顯示)" : "目前顯示 (點擊隱藏)"}
                        >
                            {stock.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         {!(() => {
                           // 判斷是否為基金
                           return stock.market === Market.FUND || 
                                 ( (stock.category?.includes('基金') || stock.name?.includes('基金')) && 
                                   !/^[0-9]{4,6}(\.TW|\.TWO)?$/i.test(stock.ticker) && 
                                   !/^[A-Z]{1,5}$/.test(stock.ticker) );
                         })() && (
                             <button
                              type="button"
                              onClick={() => setCalcStock(stock)}
                              className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded-lg transition-colors"
                              title="績效試算"
                             >
                              <Calculator size={16} />
                             </button>
                         )}
                         <button 
                          type="button"
                          onClick={() => handleEditClick(stock)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="編輯"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          type="button"
                          onClick={() => onDeleteStock(stock.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors"
                          title="刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {calcStock && (
        <StockReturnCalculator 
            stock={calcStock} 
            onClose={() => setCalcStock(null)} 
            records={performanceRecords}
            onAddRecord={onAddPerformanceRecord}
            onDeleteRecord={onDeletePerformanceRecord}
        />
      )}
    </div>
  );
};

export default React.memo(StockManager);
