import React, { useState } from 'react';
import { Stock, NovaWatchlistItem, Transaction, Market, TransactionType, MarketFilter, Account } from '../types';
import { Crosshair, TrendingUp, AlertCircle, Sparkles, Search, Loader2, Info, Plus, Trash2, Edit2, Check, X, Save } from 'lucide-react';
import QuickAddStockModal from './QuickAddStockModal';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

interface NovaStrategyProps {
  stocks: Stock[];
  watchlist: NovaWatchlistItem[];
  onUpdateWatchlist: (watchlist: NovaWatchlistItem[]) => void;
  transactions?: Transaction[];
  exchangeRate?: number;
  onUpdateStock: (stock: Stock) => void;
  onAddStock: (stock: Stock) => void;
  onDeleteStock?: (id: string) => void;
  marketFilter: MarketFilter;
  accounts?: Account[];
  suggestedCategories?: string[];
  onUpdateSuggestedCategories?: (categories: string[]) => void;
  stockOrder?: string[];
  onUpdateOrder?: (order: string[]) => void;
  onAddTransaction?: (stockId?: string, accountId?: string, strategy?: string) => void;
}

import ValueDefenseTable from './ValueDefenseTable';
import { fetchCurrentYahooQuote, fetchYahooHistoryUniversal, getLocalTodayString, getLocalPastYearString, getLocalPastDateString } from '../utils';

interface ChartDataPoint {
  date: string;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type KLineType = 'DAY' | 'WEEK' | 'MONTH' | 'ADJ_DAY' | 'ADJ_WEEK' | 'ADJ_MONTH';

const NovaStrategy: React.FC<NovaStrategyProps> = ({ 
  stocks, 
  watchlist, 
  onUpdateWatchlist, 
  transactions = [], 
  exchangeRate = 32,
  onUpdateStock,
  onAddStock,
  onDeleteStock,
  marketFilter,
  accounts,
  suggestedCategories,
  onUpdateSuggestedCategories,
  stockOrder,
  onUpdateOrder,
  onAddTransaction
}) => {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kLineType, setKLineType] = useState<KLineType>('DAY');
  const [startDate, setStartDate] = useState(() => getLocalPastYearString(2));
  const [endDate, setEndDate] = useState(() => getLocalPastDateString(20));
  const [rawFetchData, setRawFetchData] = useState<{ data: any, name: string } | null>(null);
  const [annualAnalysisYear, setAnnualAnalysisYear] = useState<string>('ALL');
  
  const [editingWatchlistItemId, setEditingWatchlistItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NovaWatchlistItem>>({});
  
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [addForm, setAddForm] = useState<Partial<NovaWatchlistItem>>({});
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

  React.useEffect(() => {
    let active = true;
    const fetchPrices = async () => {
      const newPrices = { ...currentPrices };
      let changed = false;
      for (const item of watchlist) {
        if (!newPrices[item.symbol]) {
          try {
            let searchSymbol = item.symbol;
            if (!searchSymbol.includes('.') && /^[0-9]/.test(searchSymbol)) {
              searchSymbol += '.TW';
            }
            const quote = await fetchCurrentYahooQuote(searchSymbol);
            if (!quote.success && searchSymbol.endsWith('.TW')) {
               const otcQuote = await fetchCurrentYahooQuote(searchSymbol.replace('.TW', '.TWO'));
               const otcPrice = otcQuote.regularMarketPrice ?? otcQuote.price;
               if (otcQuote.success && otcPrice != null) {
                  newPrices[item.symbol] = (typeof otcPrice === 'number') ? otcPrice : parseFloat(otcPrice as any);
                  changed = true;
               }
            } else if (quote.success) {
              const qPrice = quote.regularMarketPrice ?? quote.price;
              if (qPrice != null) {
                newPrices[item.symbol] = (typeof qPrice === 'number') ? qPrice : parseFloat(qPrice as any);
                changed = true;
              }
            }
          } catch (e) {
            console.warn('Failed to fetch price for', item.symbol, e);
          }
        }
      }
      if (active && changed) {
        setCurrentPrices(newPrices);
      }
    };
    fetchPrices();
    return () => { active = false; };
  }, [watchlist]);
  
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [analysisResult, setAnalysisResult] = useState<{
    maxPrice: number;
    minPrice: number;
    amplitude: number;
    isConsolidating: boolean;
    priceRatio: number;
    isPriceRatioValid: boolean;
    latestVolume: number;
    ma400Volume: number;
    volumeRatio: number;
    isVolumeValid: boolean;
    breakoutStatus: 'C1_BREAKOUT' | 'C2_READY' | 'C3_RETEST' | 'NONE';
    breakoutSuccessDays: number;
    isBreakoutTimely: boolean;
    name?: string;
    maxDate?: string;
    minDate?: string;
  } | null>(null);

  const handleAddToWatchlist = () => {
    if (!analysisResult) return;
    const newItem: NovaWatchlistItem = {
      id: Date.now().toString(),
      symbol: symbol.trim().toUpperCase(),
      name: analysisResult.name || '',
      dateAdded: new Date().toISOString().split('T')[0],
      rangeHigh: analysisResult.maxPrice,
      rangeLow: analysisResult.minPrice,
      pattern: analysisResult.breakoutStatus,
      note: ''
    };
    onUpdateWatchlist([...watchlist, newItem]);
  };

  const handleSaveEdit = (id: string) => {
    onUpdateWatchlist(watchlist.map(item => item.id === id ? { ...item, ...editForm } as NovaWatchlistItem : item));
    setEditingWatchlistItemId(null);
  };

  const handleDeleteWatchlist = (id: string) => {
    if (window.confirm('確定要刪除此觀察清單標的嗎？')) {
      onUpdateWatchlist(watchlist.filter(item => item.id !== id));
    }
  };

  const startAddWatchlist = () => {
    setAddForm({
      symbol: '',
      name: '',
      dateAdded: new Date().toISOString().split('T')[0],
      rangeLow: 0,
      rangeHigh: 0,
      pattern: 'NONE',
      note: ''
    });
    setIsAdding(true);
  };

  const handleSaveAdd = () => {
    if (!addForm.symbol) {
      alert('請輸入股票代號');
      return;
    }
    const newItem: NovaWatchlistItem = {
      id: Date.now().toString(),
      symbol: addForm.symbol!.trim().toUpperCase(),
      name: addForm.name || '',
      dateAdded: addForm.dateAdded || new Date().toISOString().split('T')[0],
      rangeHigh: addForm.rangeHigh || 0,
      rangeLow: addForm.rangeLow || 0,
      pattern: addForm.pattern || 'NONE',
      note: addForm.note || ''
    };
    onUpdateWatchlist([...watchlist, newItem]);
    setIsAdding(false);
    setAddForm({});
  };

  React.useEffect(() => {
    if (!rawFetchData) {
        setChartData([]);
        setAnalysisResult(null);
        return;
    }

    try {
      const { data, name } = rawFetchData;
      let isValidFormat = false;
      if (Array.isArray(data)) {
          isValidFormat = data.length > 0;
      } else if (data.chart?.result?.[0]) {
          isValidFormat = true;
      } else if (data.timestamp && (data.indicators?.quote?.[0] || data.indicators?.adjclose?.[0])) {
          isValidFormat = true;
      }

      if (!isValidFormat) {
        throw new Error("取得的歷史資料格式無效。");
      }

      let actualData = data;
      if (data.chart?.result?.[0]) {
          actualData = data.chart.result[0];
      }

      let rawParsed: any[] = [];
      
      if (Array.isArray(actualData)) {
          actualData.forEach(item => {
              if (item.open != null && item.close != null) {
                  const dateObj = typeof item.date === 'string' ? new Date(item.date) : new Date(item.date);
                  const dateStr = dateObj.toISOString().split('T')[0];
                  const open = item.open;
                  const high = item.high;
                  const low = item.low;
                  const close = item.close;
                  const vol = item.volume || 0;
                  const adjCloseOriginal = item.adjClose || item.close;

                  let adjOpen = open, adjHigh = high, adjLow = low, adjCloseParam = adjCloseOriginal;
                  if (adjCloseOriginal != null && close > 0) {
                      const adjFactor = adjCloseOriginal / close;
                      adjOpen = open * adjFactor;
                      adjHigh = high * adjFactor;
                      adjLow = low * adjFactor;
                  }

                  rawParsed.push({
                      date: dateStr,
                      open, high, low, close, vol,
                      adjOpen, adjHigh, adjLow, adjCloseParam
                  });
              }
          });
      } else {
          const timestamps: number[] = actualData.timestamp || [];
          const quote = actualData.indicators?.quote?.[0];
          const adjclose = actualData.indicators?.adjclose?.[0]?.adjclose;

          for (let i = 0; i < timestamps.length; i++) {
            let open, high, low, close, vol;
            if (quote && quote.open?.[i] != null) {
                open = quote.open[i];
                high = quote.high[i];
                low = quote.low[i];
                close = quote.close[i];
                vol = quote.volume[i];
            } else if (adjclose && adjclose[i] != null) {
                open = high = low = close = adjclose[i];
                vol = 0;
            }

            if (open == null || high == null || low == null || close == null) continue;
            
            let adjOpen = open, adjHigh = high, adjLow = low, adjCloseParam = close;
            if (adjclose && adjclose[i] != null && close > 0) {
                const adjFactor = adjclose[i] / close;
                adjOpen = open * adjFactor;
                adjHigh = high * adjFactor;
                adjLow = low * adjFactor;
                adjCloseParam = adjclose[i];
            }

            const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
            rawParsed.push({
                date: dateStr,
                open, high, low, close, vol,
                adjOpen, adjHigh, adjLow, adjCloseParam
            });
          }
      }

      let aggregatedData: any[] = [];
      const isWeek = kLineType === 'WEEK' || kLineType === 'ADJ_WEEK';
      const isMonth = kLineType === 'MONTH' || kLineType === 'ADJ_MONTH';
      const isAdj = kLineType.startsWith('ADJ_');

      if (!isWeek && !isMonth) {
         aggregatedData = rawParsed;
      } else {
         let currentCandle: any = null;
         let currentPeriodKey = '';
         rawParsed.forEach(item => {
            const dateObj = new Date(item.date);
            let key = '';
            if (isWeek) {
                const day = dateObj.getDay();
                const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(dateObj);
                monday.setDate(diff);
                key = `${monday.getFullYear()}-W${Math.ceil((((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)}`;
            } else {
                key = `${dateObj.getFullYear()}-${dateObj.getMonth()}`;
            }

            if (key !== currentPeriodKey) {
                if (currentCandle) aggregatedData.push(currentCandle);
                currentPeriodKey = key;
                currentCandle = { ...item };
            } else if (currentCandle) {
                currentCandle.high = Math.max(currentCandle.high, item.high);
                currentCandle.low = Math.min(currentCandle.low, item.low);
                currentCandle.close = item.close; 
                currentCandle.adjHigh = Math.max(currentCandle.adjHigh, item.adjHigh);
                currentCandle.adjLow = Math.min(currentCandle.adjLow, item.adjLow);
                currentCandle.adjCloseParam = item.adjCloseParam;
                currentCandle.vol += item.vol;
                currentCandle.date = item.date;
            }
         });
         if (currentCandle) aggregatedData.push(currentCandle);
      }

      let formattedData: ChartDataPoint[] = [];

      aggregatedData.forEach(item => {
         const h = isAdj ? item.adjHigh : item.high;
         const l = isAdj ? item.adjLow : item.low;
         const c = isAdj ? item.adjCloseParam : item.close;
         const v = item.vol;

         formattedData.push({
             date: item.date,
             high: Math.round(h * 100) / 100,
             low: Math.round(l * 100) / 100,
             close: Math.round(c * 100) / 100,
             volume: v
         });
      });

      if (formattedData.length === 0) {
        throw new Error("取得的資料為空。");
      }
      
      // Calculate Analysis Metrics using the selected period data
      let baseMaxHigh = -Infinity;
      let baseMinLow = Infinity;
      let baseMaxHighDate = '';
      let baseMinLowDate = '';

      // The historical period used to define the consolidation range (constrained by user selected startDate and endDate)
      const historicalBars = formattedData.filter(d => d.date >= startDate && d.date <= endDate);
      
      if (historicalBars.length === 0) {
        // Fallback to all but last if filter results in empty (safety)
        const safetyBars = formattedData.length > 1 ? formattedData.slice(0, -1) : formattedData;
        safetyBars.forEach(item => {
           if (item.high > baseMaxHigh) { baseMaxHigh = item.high; baseMaxHighDate = item.date; }
           if (item.low < baseMinLow) { baseMinLow = item.low; baseMinLowDate = item.date; }
        });
      } else {
        historicalBars.forEach(item => {
           if (item.high > baseMaxHigh) { baseMaxHigh = item.high; baseMaxHighDate = item.date; }
           if (item.low < baseMinLow) { baseMinLow = item.low; baseMinLowDate = item.date; }
        });
      }
      
      const amplitude = (baseMaxHigh - baseMinLow) / baseMaxHigh;
      const isConsolidating = amplitude <= 0.5;

      const latestClose = formattedData[formattedData.length - 1].close;
      const latestHigh = formattedData[formattedData.length - 1].high;
      const latestVolume = formattedData[formattedData.length - 1].volume;
      
      const priceRatio = latestClose / baseMinLow;
      const isPriceRatioValid = priceRatio <= 3.0;

      let ma400Volume = 0;
      let volumeRatio = 0;
      let isVolumeValid = false;
      if (formattedData.length > 0) {
          const ma400Bars = formattedData.slice(Math.max(0, formattedData.length - 1 - 400), formattedData.length - 1);
          if (ma400Bars.length > 0) {
              const sumVolume = ma400Bars.reduce((sum, item) => sum + item.volume, 0);
              ma400Volume = sumVolume / ma400Bars.length;
              volumeRatio = ma400Volume > 0 ? latestVolume / ma400Volume : 0;
              isVolumeValid = volumeRatio > 8;
          }
      }

      let breakoutStatus: 'C1_BREAKOUT' | 'C2_READY' | 'C3_RETEST' | 'NONE' = 'NONE';
      
      // Calculate days since breakout (relative to endDate)
      // We look for the first bar after endDate where close > baseMaxHigh
      const postBars = formattedData.filter(d => d.date > endDate);
      let firstBreakoutIdxInPost = -1;
      for (let i = 0; i < postBars.length; i++) {
          if (postBars[i].close > baseMaxHigh) {
              firstBreakoutIdxInPost = i;
              break;
          }
      }
      const breakoutSuccessDays = firstBreakoutIdxInPost !== -1 ? postBars.length - firstBreakoutIdxInPost : 0;
      const isBreakoutTimely = breakoutSuccessDays <= 20;

      // Breakout Analysis logic
      if (formattedData.length >= 10 && isPriceRatioValid && isVolumeValid) {
          // Condition 3: 突破兩年高點後回測再突破
          let globalMaxHigh = -Infinity;
          let globalMaxIdx = -1;
          for (let i = 0; i < formattedData.length - 2; i++) {
              if (formattedData[i].high > globalMaxHigh) {
                  globalMaxHigh = formattedData[i].high;
                  globalMaxIdx = i;
              }
          }
          
          // Require at least some bars after the global max to consider it a retest
          if (globalMaxIdx >= Math.floor(formattedData.length * 0.2) && globalMaxIdx <= formattedData.length - 3) {
              let retestLow = Infinity;
              for (let i = globalMaxIdx + 1; i < formattedData.length - 1; i++) {
                  if (formattedData[i].low < retestLow) {
                      retestLow = formattedData[i].low;
                  }
              }
              const retestDrop = (globalMaxHigh - retestLow) / globalMaxHigh;
              if (retestDrop >= 0.04 && latestClose >= globalMaxHigh * 0.985) {
                  breakoutStatus = 'C3_RETEST';
              }
          }
          
          if (breakoutStatus === 'NONE' && isConsolidating) {
              if (latestClose > baseMaxHigh) {
                  // Apply timeliness filter: breakout should be within 20 days since the first breakout after endDate
                  breakoutStatus = isBreakoutTimely ? 'C1_BREAKOUT' : 'NONE';
              } else if (latestClose >= baseMaxHigh * 0.94 && latestClose <= baseMaxHigh) {
                  breakoutStatus = 'C2_READY';
              }
          }
      }
      
      setChartData(formattedData);
      setAnalysisResult({
        maxPrice: baseMaxHigh,
        minPrice: baseMinLow,
        maxDate: baseMaxHighDate,
        minDate: baseMinLowDate,
        amplitude: amplitude,
        isConsolidating: isConsolidating,
        priceRatio: priceRatio,
        isPriceRatioValid: isPriceRatioValid,
        latestVolume: latestVolume,
        ma400Volume: ma400Volume,
        volumeRatio: volumeRatio,
        isVolumeValid: isVolumeValid,
        breakoutStatus: breakoutStatus,
        breakoutSuccessDays: breakoutSuccessDays,
        isBreakoutTimely: isBreakoutTimely,
        name
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || '分析時發生錯誤');
      setChartData([]);
      setAnalysisResult(null);
    }
  }, [rawFetchData, kLineType, startDate, endDate]);

  const handleUpdatePrice = async (item: NovaWatchlistItem) => {
    // ... logic
  };

  const annualAnalysisStats = React.useMemo(() => {
    const closedTrades: any[] = [];
    const allTrades: any[] = [];
    
    stocks.forEach(stock => {
      const stockTxs = transactions
        .filter(t => t.stockId === stock.id && t.isNova)
        .sort((a, b) => {
          const getEffectiveDate = (tx: Transaction) => {
             if (tx.type === TransactionType.DIVIDEND && tx.exDividendDate) {
                 return tx.exDividendDate.replace(/\//g, '-');
             }
             return tx.date.replace(/\//g, '-');
          };
          const da = new Date(getEffectiveDate(a)).getTime();
          const db = new Date(getEffectiveDate(b)).getTime();
          if (da !== db) return da - db;
          const order = { [TransactionType.BUY]: 1, [TransactionType.DIVIDEND]: 2, [TransactionType.SPLIT]: 3, [TransactionType.SELL]: 4 };
          return (order[a.type] || 99) - (order[b.type] || 99);
        });

      if (stockTxs.length === 0) return;

      const isUSD = stock.currency === 'USD' || (stock.market === Market.US && !stock.currency);
      
      const txByAccount = new Map<string, Transaction[]>();
      stockTxs.forEach(t => {
        const accId = t.accountId ? String(t.accountId) : 'default';
        if (!txByAccount.has(accId)) txByAccount.set(accId, []);
        txByAccount.get(accId)!.push(t);
      });

      Array.from(txByAccount.entries()).forEach(([accId, accTxs]) => {
         const cycles: Transaction[][] = [];
         let currentCycle: Transaction[] = [];
         let currentShares = 0;
         accTxs.forEach(t => {
             if (currentCycle.length === 0) {
                 if (t.type === TransactionType.BUY) {
                     currentCycle.push(t);
                     currentShares = Number(t.quantity) || 0;
                     if (currentShares <= 0) { cycles.push(currentCycle); currentCycle = []; currentShares = 0; }
                 }
             } else {
                 currentCycle.push(t);
                 if (t.type === TransactionType.BUY) {
                     currentShares += (Number(t.quantity) || 0);
                 } else if (t.type === TransactionType.SELL) {
                     currentShares -= (Number(t.quantity) || 0);
                 }
                 if (currentShares <= 0) { cycles.push(currentCycle); currentCycle = []; currentShares = 0; }
             }
         });
         if (currentCycle.length > 0) cycles.push(currentCycle);

         cycles.forEach(cycleTxs => {
            let remaining = 0;
            cycleTxs.forEach(t => {
               if (t.type === TransactionType.BUY) remaining += (Number(t.quantity) || 0);
               else if (t.type === TransactionType.SELL) remaining -= (Number(t.quantity) || 0);
            });
            const isClosed = remaining <= 0;

            let costBasisTWD = 0;
            let proceedsTWD = 0;
            let year = '';
            let lastRate = 32;

            cycleTxs.forEach(t => {
               const rate = Number(t.exchangeRate) || 32;
               lastRate = rate;
               const qty = Number(t.quantity) || 0;
               if (t.type === TransactionType.BUY) {
                   const cost = t.price * qty + (t.fee || 0);
                   costBasisTWD += isUSD ? cost * rate : cost;
                   if (!year) year = t.date.substring(0, 4);
               } else if (t.type === TransactionType.SELL) {
                   const revenue = t.price * qty - (t.fee || 0) - (t.tax || 0);
                   proceedsTWD += isUSD ? revenue * rate : revenue;
                   year = t.date.substring(0, 4);
               }
            });

            let unrealizedProceedsTWD = 0;
            if (!isClosed && remaining > 0) {
                const currentPrice = Number(stock.currentPrice) || 0;
                const currentVal = currentPrice * remaining;
                unrealizedProceedsTWD = isUSD ? currentVal * lastRate : currentVal;
            }

            if (year) {
                if (isClosed) {
                    const profitTWD = proceedsTWD - costBasisTWD;
                    const profitPerc = costBasisTWD > 0 ? (profitTWD / costBasisTWD) * 100 : 0;
                    closedTrades.push({ profitPerc, profitTWD, year, costBasisTWD });
                }
                const allProfitTWD = (proceedsTWD + unrealizedProceedsTWD) - costBasisTWD;
                const allProfitPerc = costBasisTWD > 0 ? (allProfitTWD / costBasisTWD) * 100 : 0;
                allTrades.push({ profitPerc: allProfitPerc, profitTWD: allProfitTWD, year, costBasisTWD });
            }
         });
      });
    });

    const years = Array.from(new Set(allTrades.map(t => t.year))).sort().reverse();
    const filteredClosedTrades = annualAnalysisYear === 'ALL' ? closedTrades : closedTrades.filter(t => t.year === annualAnalysisYear);
    const filteredAllTrades = annualAnalysisYear === 'ALL' ? allTrades : allTrades.filter(t => t.year === annualAnalysisYear);
    
    // Calculations for Closed Trades (Realized)
    const totalTrades = filteredClosedTrades.length;
    const wins = filteredClosedTrades.filter(t => t.profitTWD > 0);
    const losses = filteredClosedTrades.filter(t => t.profitTWD <= 0); 
    
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    const lossRate = totalTrades > 0 ? (losses.length / totalTrades) * 100 : 0;
    
    const totalProfitTWD = wins.reduce((sum, t) => sum + t.profitTWD, 0);
    const totalLossTWD = losses.reduce((sum, t) => sum + Math.abs(t.profitTWD), 0);
    
    const avgWinPerc = wins.length > 0 ? wins.reduce((sum, t) => sum + t.profitPerc, 0) / wins.length : 0;
    const avgLossPerc = losses.length > 0 ? losses.reduce((sum, t) => sum + Math.abs(t.profitPerc), 0) / losses.length : 0;
    
    const plRatio = avgLossPerc > 0 ? avgWinPerc / avgLossPerc : (avgWinPerc > 0 ? 999.99 : 0);
    const evPerc = totalTrades > 0 ? filteredClosedTrades.reduce((sum, t) => sum + t.profitPerc, 0) / totalTrades : 0;

    // Calculations for All Trades (Realized + Unrealized)
    const totalAllTrades = filteredAllTrades.length;
    const allWins = filteredAllTrades.filter(t => t.profitTWD > 0);
    const allLosses = filteredAllTrades.filter(t => t.profitTWD <= 0);
    const avgAllWinPerc = allWins.length > 0 ? allWins.reduce((sum, t) => sum + t.profitPerc, 0) / allWins.length : 0;
    const avgAllLossPerc = allLosses.length > 0 ? allLosses.reduce((sum, t) => sum + Math.abs(t.profitPerc), 0) / allLosses.length : 0;
    
    const allPlRatio = avgAllLossPerc > 0 ? avgAllWinPerc / avgAllLossPerc : (avgAllWinPerc > 0 ? 999.99 : 0);
    const allEvPerc = totalAllTrades > 0 ? filteredAllTrades.reduce((sum, t) => sum + t.profitPerc, 0) / totalAllTrades : 0;
    
    return {
       years,
       totalTrades,
       winCount: wins.length,
       lossCount: losses.length,
       winRate,
       lossRate,
       totalProfitTWD,
       totalLossTWD,
       avgWinPerc,
       avgLossPerc,
       plRatio,
       evPerc,
       allPlRatio,
       allEvPerc
    };
  }, [stocks, transactions, annualAnalysisYear]);

  const handleAnalyze = async () => {
    if (!symbol.trim()) return;
    
    setLoading(true);
    setError(null);
    setRawFetchData(null);

    try {
      let finalSymbol = symbol.trim().toUpperCase();
      let attemptOtc = false;
      if (!finalSymbol.includes('.') && /^[0-9]/.test(finalSymbol)) {
        finalSymbol += '.TW'; // Default to TW for taiwan stocks
        attemptOtc = true;
      }

      // Fetch basic quote for name
      let name = finalSymbol;
      const symbolClean = finalSymbol.split('.')[0];
      const existingStock = stocks.find(s => 
        s.ticker.toUpperCase() === finalSymbol || 
        s.ticker.toUpperCase().split('.')[0] === symbolClean
      );
      
      let fetchedQuote = null;

      if (existingStock) {
        name = existingStock.name;
      } else {
        try {
          fetchedQuote = await fetchCurrentYahooQuote(finalSymbol);
          if (fetchedQuote.success && fetchedQuote.shortName) {
             name = fetchedQuote.shortName;
          } else if (attemptOtc) {
             const otcSymbol = finalSymbol.replace('.TW', '.TWO');
             const otcQuote = await fetchCurrentYahooQuote(otcSymbol);
             if (otcQuote.success) {
                 finalSymbol = otcSymbol;
                 fetchedQuote = otcQuote;
                 if (otcQuote.shortName) name = otcQuote.shortName;
             }
          }
        } catch (e) {
          console.warn("Could not fetch name", e);
        }
      }

      const defaultStart = getLocalPastYearString(2);
      const fetchStart = new Date(startDate) < new Date(defaultStart) ? startDate : defaultStart;
      const period1 = Math.floor(new Date(fetchStart).getTime() / 1000);
      const period2 = Math.floor(Date.now() / 1000) + 86400; // 總是抓取到最新日期
      
      const fetchHistoryFallback = async (sym: string) => {
          try {
              return await fetchYahooHistoryUniversal(sym, period1, period2, '1d');
          } catch (e) {
              console.warn(`Failed to fetch ${sym}`, e);
              return null;
          }
      };

      let data = await fetchHistoryFallback(finalSymbol);

      if ((!data || !data.timestamp || data.timestamp.length === 0) && finalSymbol.endsWith('.TW')) {
          const otcSymbol = finalSymbol.replace('.TW', '.TWO');
          const otcData = await fetchHistoryFallback(otcSymbol);
          if (otcData && otcData.timestamp && otcData.timestamp.length > 0) {
              data = otcData;
              finalSymbol = otcSymbol;
              
              // Also try to refetch name with OTC symbol if we failed earlier mapping
              try {
                  const quoteData = await fetchCurrentYahooQuote(finalSymbol);
                  if (quoteData.success && quoteData.shortName) {
                     name = quoteData.shortName;
                  }
              } catch (e) {}
          }
      }
      
      if (!data || !data.timestamp || !(data.indicators?.quote?.[0] || data.indicators?.adjclose?.[0])) {
        throw new Error("無法取得歷史資料，請確認股票代碼是否正確。");
      }

      setRawFetchData({ data, name });

    } catch (err: any) {
      console.error(err);
      setError(err.message || '分析時發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <span className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg shadow-indigo-500/20">
              <Crosshair size={24} />
            </span>
            Nova 策略選股
          </h2>
          <p className="text-slate-500 mt-1 font-medium ml-12">設定盤整計算區間（建議兩年），分析當前股價是否產生突破。</p>
        </div>
        <button 
          onClick={() => setIsAddingStock(true)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-all shadow-sm`}
        >
          <Plus size={16} /> 快速新增標的
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end justify-between">
            <div className="flex-1 w-full relative min-w-[200px]">
                <label className="block text-sm font-semibold text-slate-700 mb-2">輸入股票代號 (如: 2330, AAPL)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={18} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="輸入代號..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
                  />
                </div>
            </div>
            
            <div className="flex flex-col gap-2 w-full lg:w-auto">
                <label className="block text-sm font-semibold text-slate-700">自訂時間範圍</label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 h-[50px]">
                   <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none w-32 px-2" />
                   <span className="text-slate-400 font-bold">~</span>
                   <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none w-32 px-2" />
                </div>
            </div>

            <div className="flex flex-col gap-2 w-full lg:w-auto">
                <label className="block text-sm font-semibold text-slate-700">週期</label>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl whitespace-nowrap overflow-x-auto h-[50px]">
                  {(['DAY', 'WEEK', 'MONTH', 'ADJ_DAY', 'ADJ_WEEK', 'ADJ_MONTH'] as const).map(type => (
                      <button 
                        key={type} 
                        onClick={() => setKLineType(type)} 
                        className={`px-4 h-full text-sm font-bold rounded-lg transition-all ${kLineType === type ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {type === 'DAY' ? '日K' : type === 'WEEK' ? '週K' : type === 'MONTH' ? '月K' : type === 'ADJ_DAY' ? '還原日' : type === 'ADJ_WEEK' ? '還原週' : '還原月'}
                      </button>
                  ))}
                </div>
            </div>

            <button
                onClick={handleAnalyze}
                disabled={loading || !symbol.trim()}
                className="w-full lg:w-auto px-8 h-[50px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors shadow-sm shadow-indigo-200 flex items-center justify-center shrink-0"
            >
                {loading ? <Loader2 size={20} className="animate-spin" /> : '開始分析'}
            </button>
        </div>
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-start gap-2 border border-red-100">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      {analysisResult && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
             <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Crosshair className="text-indigo-500" />
                動能分析結果
             </h2>
             {!watchlist.some(w => w.symbol === symbol.trim().toUpperCase()) && (
                <button 
                  onClick={handleAddToWatchlist}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-indigo-200"
                >
                  <Plus size={18} />
                  加入觀察清單
                </button>
             )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
              <p className="text-slate-500 text-sm font-medium mb-1">標的名稱</p>
              <p className="text-xl font-bold text-slate-800">
                {stocks.find(s => 
                  s.ticker.toUpperCase() === symbol.trim().toUpperCase() || 
                  s.ticker.toUpperCase().split('.')[0] === symbol.trim().toUpperCase().split('.')[0]
                )?.name || analysisResult.name}
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center relative">
              <p className="text-slate-500 text-sm font-medium mb-1">兩年最高價</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-emerald-600">{analysisResult.maxPrice.toFixed(2)}</p>
                {analysisResult.maxDate && <p className="text-xs text-slate-400 font-mono">{analysisResult.maxDate}</p>}
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center relative">
              <p className="text-slate-500 text-sm font-medium mb-1">兩年最低價</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-rose-600">{analysisResult.minPrice.toFixed(2)}</p>
                {analysisResult.minDate && <p className="text-xs text-slate-400 font-mono">{analysisResult.minDate}</p>}
              </div>
            </div>
            <div className={`p-5 rounded-2xl shadow-sm border flex flex-col justify-center ${analysisResult.isConsolidating ? 'bg-indigo-50 border-indigo-200' : 'bg-rose-50 border-rose-200'}`}>
              <p className={`text-sm font-medium mb-1 ${analysisResult.isConsolidating ? 'text-indigo-600' : 'text-rose-600'}`}>區間振幅 (目標 {'<'} 50%)</p>
              <div className="flex items-end gap-2">
                <p className={`text-2xl font-black ${analysisResult.isConsolidating ? 'text-indigo-700' : 'text-rose-700'}`}>
                  {(analysisResult.amplitude * 100).toFixed(1)}%
                </p>
                {analysisResult.isConsolidating ? (
                  <span className="text-xs font-bold text-indigo-600 mb-1 px-2 py-0.5 bg-indigo-100 rounded">符合條件</span>
                ) : (
                  <span className="text-xs font-bold text-rose-600 mb-1 px-2 py-0.5 bg-rose-100 rounded">振幅過大</span>
                )}
              </div>
            </div>
            <div className={`p-5 rounded-2xl shadow-sm border flex flex-col justify-center ${analysisResult.isPriceRatioValid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <p className={`text-sm font-medium mb-1 ${analysisResult.isPriceRatioValid ? 'text-emerald-600' : 'text-rose-600'}`}>高低價差 (目標 {'≤'} 3倍)</p>
              <div className="flex items-end gap-2">
                <p className={`text-2xl font-black ${analysisResult.isPriceRatioValid ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {analysisResult.priceRatio.toFixed(2)} 倍
                </p>
                {analysisResult.isPriceRatioValid ? (
                  <span className="text-xs font-bold text-emerald-600 mb-1 px-2 py-0.5 bg-emerald-100 rounded">符合條件</span>
                ) : (
                  <span className="text-xs font-bold text-rose-600 mb-1 px-2 py-0.5 bg-rose-100 rounded">價差過大</span>
                )}
              </div>
            </div>
            <div className={`p-5 rounded-2xl shadow-sm border flex flex-col justify-center ${analysisResult.isVolumeValid ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
              <p className={`text-sm font-medium mb-1 ${analysisResult.isVolumeValid ? 'text-amber-600' : 'text-rose-600'}`}>成交量動能 (目標 {'>'} 8倍)</p>
              <div className="flex items-end gap-2">
                <p className={`text-2xl font-black ${analysisResult.isVolumeValid ? 'text-amber-700' : 'text-rose-700'}`}>
                  {analysisResult.volumeRatio.toFixed(1)} 倍
                </p>
                {analysisResult.isVolumeValid ? (
                  <span className="text-xs font-bold text-amber-600 mb-1 px-2 py-0.5 bg-amber-100 rounded">符合條件</span>
                ) : (
                  <span className="text-xs font-bold text-rose-600 mb-1 px-2 py-0.5 bg-rose-100 rounded">動能不足</span>
                )}
              </div>
            </div>
            
            <div className={`p-5 rounded-2xl shadow-sm border flex flex-col justify-center ${analysisResult.isBreakoutTimely ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <p className={`text-sm font-medium mb-1 ${analysisResult.isBreakoutTimely ? 'text-blue-600' : 'text-orange-600'}`}>突破後交易日 (目標 {'≤'} 20日)</p>
              <div className="flex items-end gap-2">
                <p className={`text-2xl font-black ${analysisResult.isBreakoutTimely ? 'text-blue-700' : 'text-orange-700'}`}>
                  {analysisResult.breakoutSuccessDays} 日
                </p>
                {analysisResult.breakoutSuccessDays > 0 ? (
                  analysisResult.isBreakoutTimely ? (
                    <span className="text-xs font-bold text-blue-600 mb-1 px-2 py-0.5 bg-blue-100 rounded">符合時效</span>
                  ) : (
                    <span className="text-xs font-bold text-orange-600 mb-1 px-2 py-0.5 bg-orange-100 rounded">突破已過久</span>
                  )
                ) : (
                  <span className="text-xs font-bold text-slate-400 mb-1 px-2 py-0.5 bg-slate-100 rounded">尚未突破</span>
                )}
              </div>
            </div>
          </div>

          {/* Breakout Status Alert */}
          {analysisResult.breakoutStatus !== 'NONE' && (
            <div className={`p-4 rounded-xl shadow-sm border flex items-center justify-between
              ${analysisResult.breakoutStatus === 'C3_RETEST' ? 'bg-fuchsia-50 border-fuchsia-200' : 
                analysisResult.breakoutStatus === 'C1_BREAKOUT' ? 'bg-emerald-50 border-emerald-200' :
                'bg-amber-50 border-amber-200'}
            `}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg 
                  ${analysisResult.breakoutStatus === 'C3_RETEST' ? 'bg-fuchsia-100 text-fuchsia-600' : 
                    analysisResult.breakoutStatus === 'C1_BREAKOUT' ? 'bg-emerald-100 text-emerald-600' :
                    'bg-amber-100 text-amber-600'}
                `}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <p className="font-bold text-slate-800">
                    {analysisResult.breakoutStatus === 'C3_RETEST' ? '突破兩年高點後回測再突破' : 
                      analysisResult.breakoutStatus === 'C1_BREAKOUT' ? '已突破兩年內盤整區間高點' :
                      '準備突破兩年內盤整區間高點'}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    系統判斷您的標的符合上述突破條件設定。
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {analysisResult.breakoutStatus === 'NONE' && (
             <div className="p-4 rounded-xl shadow-sm border bg-slate-50 border-slate-200 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-200 text-slate-500">
                  <Info size={20} />
                </div>
                <div>
                   <p className="font-bold text-slate-700">未符合任何突破條件</p>
                   <p className="text-sm text-slate-500 mt-1">目前股價並未出現上述三種突破或回測形態。</p>
                </div>
             </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-start gap-3">
              <Info className="text-indigo-500 mt-0.5 flex-shrink-0" size={20} />
              <div>
                <h3 className="font-bold text-slate-800">盤整型態與進階篩選條件</h3>
                <div className="text-sm text-slate-600 mt-2 space-y-2">
                  <p>1. 將篩選到的個股記錄在 Excel 表上，連續兩天後相互比較，表上會自動標註新增（表示今天有選上但昨天沒有），每天循環比較。</p>
                  <p>2. 接著再針對新增的個股進行人工判斷：</p>
                  <ul className="list-none space-y-1 pl-4">
                    <li>(1) <strong>盤整區間定義：</strong>由動能選入日為基準往前回推兩年（固定時間）。</li>
                    <li>(2) <strong>計算盤整區間振幅：</strong>基本定義一定要小於 50%（越小越好），於區間內再主觀去判斷盤整的型態與成交量，<strong className="text-indigo-600">型態與量的重要性 &gt; 振幅</strong>。</li>
                    <li>(3) <strong>符合基本盤整圖形：</strong>（藍色為盤整區間及振幅）。</li>
                    <li>(4) <strong>成交量符合條件：</strong>動能入選當天 MA400 成交量的 8倍以上成交量濾網。</li>
                    <li>(5) <strong>空間濾網：</strong>盤整區間的最低價與動能入選當日的股價 高低 不得超過 3 倍以上。</li>
                    <li>(6) <strong>第一次勝率高：</strong>盡量選動能第一次入選的個股為主，可用選股工具回查確定。</li>
                    <li>(7) <strong>時間濾網：</strong>突破盤整區間後 漲幅不得超過 20 個交易日。</li>
                    <li>(8) 因是每天互相比較的結果，某些個股有可能過幾天會重複入選，若未符合上述條件者，則自動淘汰重複入選的。</li>
                    <li>(9) 依個人資金大小設定風險評價並設好停損點（前波低點或 20%），最後按照股數買入七捨八入。</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="p-6 h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12, fill: '#64748b' }} 
                    axisLine={false} 
                    tickLine={false}
                    minTickGap={30}
                  />
                  <YAxis 
                    yAxisId="price"
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 12, fill: '#64748b' }} 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(val) => val.toFixed(0)}
                  />
                  <YAxis 
                    yAxisId="volume"
                    orientation="right"
                    domain={[0, 'auto']}
                    hide
                  />
                  <Tooltip 
                    content={({ active, payload, label }: any) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const vol = data.volume;
                        const isTaiwanStock = /^\d+$/.test(symbol.trim().split('.')[0]) || symbol.toUpperCase().endsWith('.TW') || symbol.toUpperCase().endsWith('.TWO');
                        const volStr = isTaiwanStock ? 
                          `${Math.floor(vol / 1000).toLocaleString()} 張` : 
                          `${Math.floor(vol).toLocaleString()} 股`;

                        return (
                          <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-200 min-w-[160px]">
                            <p className="text-slate-500 font-bold text-sm mb-2 pb-1 border-b border-slate-100">{label}</p>
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-emerald-600 flex justify-between gap-4">
                                <span>最高價:</span>
                                <span>{data.high?.toFixed(2)}</span>
                              </p>
                              <p className="text-sm font-semibold text-rose-600 flex justify-between gap-4">
                                <span>最低價:</span>
                                <span>{data.low?.toFixed(2)}</span>
                              </p>
                              <p className="text-sm font-bold text-indigo-600 flex justify-between gap-4">
                                <span>收盤價:</span>
                                <span>{data.close?.toFixed(2)}</span>
                              </p>
                              <p className="text-xs font-semibold text-slate-500 flex justify-between gap-4 pt-1 mt-1 border-t border-slate-100">
                                <span>成交量:</span>
                                <span>{volStr}</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar yAxisId="volume" dataKey="volume" name="成交量" fill="#94a3b8" opacity={0.8}>
                      {chartData.map((entry, index) => {
                        // Color volume based on price change
                        const prevClose = index > 0 ? chartData[index - 1].close : entry.close;
                        const isUp = entry.close >= prevClose;
                        return <Cell key={`cell-${index}`} fill={isUp ? '#f43f5e' : '#22c55e'} />; // rose-500 or green-500
                      })}
                  </Bar>
                  <Line 
                    yAxisId="price"
                    type="monotone" 
                    dataKey="close" 
                    name="收盤價"
                    stroke="#4f46e5" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
                  />
                  {/* Highlight Max and Min Lines */}
                  {analysisResult?.maxPrice && (
                    <Line yAxisId="price" dataKey={() => analysisResult.maxPrice} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} dot={false} activeDot={false} name="最高價" tooltipType="none" />
                  )}
                  {analysisResult?.minPrice && (
                    <Line yAxisId="price" dataKey={() => analysisResult.minPrice} stroke="#e11d48" strokeDasharray="3 3" strokeWidth={1} dot={false} activeDot={false} name="最低價" tooltipType="none" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Track Table */}
      <div className="mb-8">
        <ValueDefenseTable 
           stocks={stocks} 
           transactions={transactions} 
           accounts={accounts}
           onUpdateStock={onUpdateStock} 
           onAddStock={onAddStock} 
           onDeleteStock={onDeleteStock}
           marketFilter={marketFilter} 
           strategyType="NOVA" 
           suggestedCategories={suggestedCategories}
           onUpdateSuggestedCategories={onUpdateSuggestedCategories}
           stockOrder={stockOrder}
           onUpdateOrder={onUpdateOrder}
           onAddTransaction={onAddTransaction}
        />
      </div>

      {/* Watchlist Section */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-50 flex items-center justify-center border border-fuchsia-100">
              <Search className="text-fuchsia-500" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Nova 觀察清單</h2>
              <p className="text-sm font-medium text-slate-500">自訂追蹤與標註符合型態的標的</p>
            </div>
          </div>
          <button 
            onClick={startAddWatchlist}
            className="bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-fuchsia-200"
          >
            <Plus size={18} />自行加入
          </button>
        </div>

        {watchlist.length === 0 && !isAdding ? (
          <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Crosshair size={32} className="mx-auto mb-3 opacity-50" />
            <p>目前沒有觀察標的</p>
            <p className="text-sm mt-1">請先搜尋並分析股票，或點擊「自行加入」</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm text-left table-fixed">
              <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-[10%]">股票代號</th>
                  <th className="px-4 py-3 w-[12%]">股票名稱</th>
                  <th className="px-4 py-3 w-[10%] text-right">最新股價</th>
                  <th className="px-4 py-3 w-[12%]">選入時間</th>
                  <th className="px-4 py-3 w-[10%] text-right">區間低點</th>
                  <th className="px-4 py-3 w-[10%] text-right">區間高點</th>
                  <th className="px-4 py-3 w-[16%]">目前型態</th>
                  <th className="px-4 py-3 w-[12%]">備註</th>
                  <th className="px-4 py-3 text-center w-[8%]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isAdding && (
                  <tr className="bg-fuchsia-50/30">
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={addForm.symbol || ''}
                        onChange={e => setAddForm({ ...addForm, symbol: e.target.value.toUpperCase() })}
                        className="w-full border border-slate-300 rounded px-2 py-1 uppercase"
                        placeholder="代號"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={addForm.name || ''}
                        onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                        placeholder="名稱"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">
                      -
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="date"
                        value={addForm.dateAdded || ''}
                        onChange={e => setAddForm({ ...addForm, dateAdded: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input 
                        type="number"
                        value={addForm.rangeLow || ''}
                        onChange={e => setAddForm({ ...addForm, rangeLow: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input 
                        type="number"
                        value={addForm.rangeHigh || ''}
                        onChange={e => setAddForm({ ...addForm, rangeHigh: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={addForm.pattern || ''}
                        onChange={e => setAddForm({ ...addForm, pattern: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                      >
                        <option value="C1_BREAKOUT">已突破高點</option>
                        <option value="C2_READY">準備突破高點</option>
                        <option value="C3_RETEST">突破後回測再突破</option>
                        <option value="NONE">無明顯型態</option>
                        <option value="OTHER">其他</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={addForm.note || ''}
                        onChange={e => setAddForm({ ...addForm, note: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                        placeholder="輸入備註..."
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={handleSaveAdd} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                          <Check size={16} />
                        </button>
                        <button onClick={() => setIsAdding(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {watchlist.map((item) => {
                  const isEditing = editingWatchlistItemId === item.id;
                  const currentPrice = currentPrices[item.symbol];
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-800 truncate">{item.symbol}</td>
                      <td className="px-4 py-3 text-slate-700 truncate">
                        {isEditing ? (
                          <input 
                            type="text"
                            value={editForm.name || ''}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2 py-1"
                            placeholder="名稱"
                          />
                        ) : (
                          stocks.find(s => 
                            s.ticker.toUpperCase() === item.symbol.toUpperCase() || 
                            s.ticker.toUpperCase().split('.')[0] === item.symbol.toUpperCase().split('.')[0]
                          )?.name || item.name
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                        {currentPrice !== undefined ? currentPrice.toFixed(2) : <Loader2 size={14} className="animate-spin inline text-slate-400" />}
                      </td>
                      <td className="px-4 py-3 truncate">
                        {isEditing ? (
                          <input 
                            type="date"
                            value={editForm.dateAdded || ''}
                            onChange={e => setEditForm({ ...editForm, dateAdded: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2 py-1"
                          />
                        ) : item.dateAdded}
                      </td>
                      <td className="px-4 py-3 text-right font-mono truncate">
                        {isEditing ? (
                          <input 
                            type="number"
                            value={editForm.rangeLow || ''}
                            onChange={e => setEditForm({ ...editForm, rangeLow: Number(e.target.value) })}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                          />
                        ) : item.rangeLow.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono truncate">
                        {isEditing ? (
                          <input 
                            type="number"
                            value={editForm.rangeHigh || ''}
                            onChange={e => setEditForm({ ...editForm, rangeHigh: Number(e.target.value) })}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                          />
                        ) : item.rangeHigh.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select 
                            value={editForm.pattern || ''}
                            onChange={e => setEditForm({ ...editForm, pattern: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2 py-1"
                          >
                            <option value="C1_BREAKOUT">已突破高點</option>
                            <option value="C2_READY">準備突破高點</option>
                            <option value="C3_RETEST">突破後回測再突破</option>
                            <option value="NONE">無明顯型態</option>
                            <option value="OTHER">其他</option>
                          </select>
                        ) : (
                            <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-bold block w-fit mx-auto text-center whitespace-nowrap">
                              {item.pattern === 'C1_BREAKOUT' ? '已突破高點' : 
                               item.pattern === 'C2_READY' ? '準備突破高點' :
                               item.pattern === 'C3_RETEST' ? '突破後回測再突破' : 
                               item.pattern === 'NONE' ? '無型態' : item.pattern}
                            </span>
                        )}
                      </td>
                      <td className="px-4 py-3 truncate">
                        {isEditing ? (
                          <input 
                            type="text"
                            value={editForm.note || ''}
                            onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2 py-1"
                            placeholder="輸入備註..."
                          />
                        ) : (
                          <span className="text-slate-600 truncate block w-full" title={item.note}>{item.note || '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => handleSaveEdit(item.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                              <Check size={16} />
                            </button>
                            <button onClick={() => setEditingWatchlistItemId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => { setEditingWatchlistItemId(item.id); setEditForm(item); }} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDeleteWatchlist(item.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAddingStock && (
        <QuickAddStockModal 
          onClose={() => setIsAddingStock(false)}
          onAddStock={onAddStock}
          marketFilter={marketFilter}
          suggestedCategory="Nova策略"
          strategy="NOVA"
        />
      )}
    </div>
  );
};

export default React.memo(NovaStrategy);
