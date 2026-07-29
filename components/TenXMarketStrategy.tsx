import React, { useState, useMemo, useEffect } from 'react';
import { Stock, MarketFilter, Market, Account, Transaction, TransactionType } from '../types';
import { Rocket, Target, Zap, TrendingUp, Search, X, AlertCircle, RefreshCw, Info, Calendar, DollarSign, Settings, Wallet, Plus } from 'lucide-react';
import QuickAddStockModal from './QuickAddStockModal';
import StockManager from './StockManager';

interface StrategyMetrics {
  symbol: string;
  r1m: number;
  r3m: number;
  r6m: number;
  avg: number;

  r1w?: number;
  r2w?: number;
  r4w?: number;
  avgW?: number;

  latestPrice: number;
  p0m: number;
  p1m: number;
  p3m: number;
  p6m: number;
  w0?: number;
  w1?: number;
  w2?: number;
  w4?: number;
}

interface PriceData {
  latest: number;
  p0: number;
  p1: number;
  p3: number;
  p6: number;
  w0?: number;
  w1?: number;
  w2?: number;
  w4?: number;
}

interface TenXMarketStrategyProps {
  stocks: Stock[];
  transactions: Transaction[];
  accounts?: Account[];
  onUpdateStock: (stock: Stock) => void;
  onAddStock: (stock: Stock) => void;
  onAddTransaction?: (stockId?: string, accountId?: string, strategy?: string) => void;
  marketFilter: MarketFilter;
  exchangeRate: number;
  config: {
    symbols: string[];
    enabledSymbols?: string[];
    priceData: Record<string, PriceData>;
    dates: { 
      p0: string; p1: string; p3: string; p6: string;
      w0?: string; w1?: string; w2?: string; w4?: string;
    };
    lastUpdated: string;
    totalCapital?: number;
    allocation?: {
      QLD: number;
      TLT: number;
      VT: number;
      CASH: number;
    };
    monthlyPeriods?: [number, number, number];
    weeklyPeriods?: [number, number, number];
  };
  onUpdateConfig: React.Dispatch<React.SetStateAction<any>>;
  onDeleteStock?: (id: string) => void;
  suggestedCategories?: string[];
  onUpdateSuggestedCategories?: (categories: string[]) => void;
  stockOrder?: string[];
  onUpdateOrder?: (order: string[]) => void;
  strategyType?: 'DEFENSE' | 'NOVA' | 'TENX';
}

const TenXMarketStrategy: React.FC<TenXMarketStrategyProps> = ({
  stocks,
  transactions,
  accounts,
  onUpdateStock,
  onAddStock,
  onDeleteStock,
  onAddTransaction,
  marketFilter,
  exchangeRate,
  config,
  onUpdateConfig,
  suggestedCategories,
  onUpdateSuggestedCategories,
  stockOrder,
  onUpdateOrder,
  strategyType = 'TENX'
}) => {
  const [showDataEditor, setShowDataEditor] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [viewMode, setViewMode] = useState<'monthly' | 'weekly'>('monthly');
  const [baseDateStr, setBaseDateStr] = useState<string>('');
  const [annualAnalysisYear, setAnnualAnalysisYear] = useState<string>('ALL');
  const [isAddingStock, setIsAddingStock] = useState(false);

  // Strategy Analysis State
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);

  const mPeriods = config.monthlyPeriods || [1, 3, 6];
  const wPeriods = config.weeklyPeriods || [1, 2, 4];

  const fetchStrategyData = async () => {
    setStrategyLoading(true);
    setStrategyError(null);
    try {
      const symbols = config.symbols;
      const newPriceData: Record<string, PriceData> = { ...config.priceData };
      let calcDates = { ...config.dates };
      let fetchedCount = 0;

      const now = baseDateStr ? new Date(baseDateStr) : new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11

      // Target (p0) is the previous COMPLETELY finished month
      let targetMonth = currentMonth - 1;
      let targetYear = currentYear;
      if (targetMonth < 0) {
        targetMonth = 11;
        targetYear--;
      }

      const endTs = Math.floor(now.getTime() / 1000) + 86400;
      const startTs = Math.floor(new Date(currentYear - 2, currentMonth, 1).getTime() / 1000);

      for (const symbol of symbols) {
        try {
          const isDesktopEnv = window.electronAPI?.isElectron || window.location.protocol === 'file:';
          let data = null;
          let latestPrice = 0;

          // 1. Fetch Latest Price (using 1d interval for smallest window)
          if (isDesktopEnv && window.electronAPI) {
            const res = await window.electronAPI.fetchYahooHistory({
              symbol,
              period1: Math.floor(now.getTime() / 1000) - 86400 * 7, // last week
              period2: endTs,
              interval: '1d'
            });
            if (res.data && res.data.indicators?.adjclose?.[0]?.adjclose) {
              const prices = res.data.indicators.adjclose[0].adjclose.filter((p: number) => p != null);
              if (prices.length > 0) latestPrice = prices[prices.length - 1];
            }
          } else {
            const res = await fetch(`/api/yahoo/history?symbol=${symbol}&period1=${Math.floor(now.getTime() / 1000) - 86400 * 7}&period2=${endTs}&interval=1d`);
            if (res.ok) {
              const d = await res.json();
              const prices = d.indicators?.adjclose?.[0]?.adjclose?.filter((p: number) => p != null);
              if (prices && prices.length > 0) latestPrice = prices[prices.length - 1];
            }
          }

          // 2. Fetch Historical Monthly Data
          if (isDesktopEnv && window.electronAPI) {
            const res = await window.electronAPI.fetchYahooHistory({
              symbol,
              period1: startTs,
              period2: endTs,
              interval: '1mo'
            });
            if (res.data) data = res.data;
          } else {
            const res = await fetch(`/api/yahoo/history?symbol=${symbol}&period1=${startTs}&period2=${endTs}&interval=1mo`);
            if (res.ok) data = await res.json();
          }

          if (data && data.timestamp && data.indicators?.adjclose?.[0]?.adjclose) {
            const timestamps = data.timestamp;
            const adjCloses = data.indicators.adjclose[0].adjclose;
            const validIndices = timestamps.map((ts: number, i: number) => adjCloses[i] != null ? i : -1).filter((i: number) => i !== -1);
            
            let p0Idx = -1;
            for (let i = validIndices.length - 1; i >= 0; i--) {
              const idx = validIndices[i];
              const d = new Date(timestamps[idx] * 1000);
              // Match targetYear and targetMonth
              if (d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
                p0Idx = idx;
                break;
              }
            }

            if (p0Idx === -1) {
              for (let i = validIndices.length - 1; i >= 0; i--) {
                const idx = validIndices[i];
                const d = new Date(timestamps[idx] * 1000);
                if (d.getFullYear() < targetYear || (d.getFullYear() === targetYear && d.getMonth() < targetMonth)) {
                  p0Idx = idx;
                  break;
                }
              }
            }

            const vIdxPos = validIndices.indexOf(p0Idx);

            const maxM = Math.max(...mPeriods);

            if (vIdxPos >= maxM) {
              const p1Idx = validIndices[vIdxPos - mPeriods[0]];
              const p3Idx = validIndices[vIdxPos - mPeriods[1]];
              const p6Idx = validIndices[vIdxPos - mPeriods[2]];

              // 3. Fetch Historical Weekly Data
              let weeklyData = null;
              if (isDesktopEnv && window.electronAPI) {
                const res = await window.electronAPI.fetchYahooHistory({
                  symbol,
                  period1: startTs,
                  period2: endTs,
                  interval: '1wk'
                });
                if (res.data) weeklyData = res.data;
              } else {
                const res = await fetch(`/api/yahoo/history?symbol=${symbol}&period1=${startTs}&period2=${endTs}&interval=1wk`);
                if (res.ok) weeklyData = await res.json();
              }

              let w0 = 0, w1 = 0, w2 = 0, w4 = 0;
              let w0Date = '', w1Date = '', w2Date = '', w4Date = '';

              if (weeklyData && weeklyData.timestamp && weeklyData.indicators?.adjclose?.[0]?.adjclose) {
                 const ts = weeklyData.timestamp;
                 const ac = weeklyData.indicators.adjclose[0].adjclose;
                 const vi = ts.map((t: number, i: number) => ac[i] != null ? i : -1).filter((i: number) => i !== -1);
                 
                 const dayOfWeek = now.getDay();
                 const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                 const recentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
                 recentMonday.setHours(0, 0, 0, 0);
                 const recentMondaySeconds = Math.floor(recentMonday.getTime() / 1000);
                 
                 let w0Idx = -1;
                 for (let i = vi.length - 1; i >= 0; i--) {
                     if (ts[vi[i]] <= recentMondaySeconds + 86400 * 2) { // up to Tuesday to accommodate holidays
                         w0Idx = vi[i];
                         break;
                     }
                 }
                 if (w0Idx === -1 && vi.length > 0) w0Idx = vi[vi.length - 1];
                 
                 const wIdxPos = vi.indexOf(w0Idx);
                 const maxW = Math.max(...wPeriods);

                 if (wIdxPos >= maxW) {
                    w0 = ac[w0Idx];
                    w1 = ac[vi[wIdxPos - wPeriods[0]]];
                    w2 = ac[vi[wIdxPos - wPeriods[1]]];
                    w4 = ac[vi[wIdxPos - wPeriods[2]]];

                    const fmtW = (idx: number) => {
                       const d = new Date(ts[idx] * 1000);
                       return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
                    };

                    w0Date = fmtW(w0Idx);
                    w1Date = fmtW(vi[wIdxPos - wPeriods[0]]);
                    w2Date = fmtW(vi[wIdxPos - wPeriods[1]]);
                    w4Date = fmtW(vi[wIdxPos - wPeriods[2]]);
                 }
              }

              newPriceData[symbol] = {
                latest: latestPrice || adjCloses[validIndices[validIndices.length - 1]],
                p0: adjCloses[p0Idx],
                p1: adjCloses[p1Idx],
                p3: adjCloses[p3Idx],
                p6: adjCloses[p6Idx],
                w0, w1, w2, w4
              };

              fetchedCount++;

              if (!calcDates.p0 || calcDates.p0 === '--' || true) { // Always update dates based on first fetched
                const fmt = (idx: number) => {
                   const d = new Date(timestamps[idx] * 1000);
                   return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                };
                calcDates = {
                  ...calcDates,
                  p0: fmt(p0Idx),
                  p1: fmt(p1Idx),
                  p3: fmt(p3Idx),
                  p6: fmt(p6Idx),
                  w0: w0Date || calcDates.w0,
                  w1: w1Date || calcDates.w1,
                  w2: w2Date || calcDates.w2,
                  w4: w4Date || calcDates.w4
                };
              }
            }
          }
        } catch (e: any) {
          console.error(`Error fetching ${symbol}:`, e);
          setStrategyError(prev => (prev ? `${prev}, ` : '') + `${symbol}: ${e.message}`);
        }
      }

      if (fetchedCount > 0) {
        onUpdateConfig({
          ...config,
          priceData: newPriceData,
          dates: calcDates,
          lastUpdated: new Date().toLocaleString('zh-TW')
        });
      } else if (!strategyError) {
        setStrategyError('未能取得任何標的的完整月度數據');
      }
    } catch (err: any) {
      console.error('Error in fetchStrategyData:', err);
      setStrategyError(err.message || '發生未知錯誤');
    } finally {
      setStrategyLoading(false);
    }
  };

  const strategyDataList = useMemo(() => {
    const results: StrategyMetrics[] = [];

    config.symbols.forEach(symbol => {
      const p = config.priceData[symbol];
      if (p && p.p0 > 0 && p.p1 > 0 && p.p3 > 0 && p.p6 > 0) {
        const r1m = (p.p0 - p.p1) / p.p1;
        const r3m = (p.p0 - p.p3) / p.p3;
        const r6m = (p.p0 - p.p6) / p.p6;
        const avg = (r1m + r3m + r6m) / 3;
        
        let r1w, r2w, r4w, avgW;
        if (p.w0 && p.w1 && p.w2 && p.w4) {
           r1w = (p.w0 - p.w1) / p.w1;
           r2w = (p.w0 - p.w2) / p.w2;
           r4w = (p.w0 - p.w4) / p.w4;
           avgW = (r1w + r2w + r4w) / 3;
        }

        results.push({
          symbol,
          r1m, r3m, r6m, avg,
          r1w, r2w, r4w, avgW,
          latestPrice: p.latest || p.p0,
          p0m: p.p0,
          p1m: p.p1,
          p3m: p.p3,
          p6m: p.p6,
          w0: p.w0,
          w1: p.w1,
          w2: p.w2,
          w4: p.w4
        });
      }
    });

    return {
      items: results,
      dates: config.dates,
      lastUpdated: config.lastUpdated
    };
  }, [config]);

  const strategyRecommendation = useMemo(() => {
    const { items } = strategyDataList;
    const enabledSymbols = config.enabledSymbols || config.symbols;
    
    // Filter only items that are enabled
    const enabledItems = items.filter(item => enabledSymbols.includes(item.symbol));

    if (enabledItems.length === 0) return { action: '待計算', desc: '請確認已選擇(勾選)標的並有有效數據', color: 'text-slate-400', code: 'WAIT', bg: 'bg-slate-50' };

    const metrics = enabledItems.map(item => {
      const targetAvg = viewMode === 'weekly' ? (item.avgW || 0) : item.avg;
      return {
        id: item.symbol,
        label: `持倉 ${item.symbol}`,
        avg: targetAvg,
        color: item.symbol === 'QQQ' ? 'text-indigo-600' : (item.symbol === 'TLT' ? 'text-blue-600' : 'text-emerald-600'),
        bg: item.symbol === 'QQQ' ? 'bg-indigo-50' : (item.symbol === 'TLT' ? 'bg-blue-50' : 'bg-emerald-50')
      }
    });

    const best = [...metrics].sort((a, b) => b.avg - a.avg)[0];

    if (best.avg > 0) {
      return { 
        action: `買入/持有 ${best.id}`, 
        desc: best.label,
        code: best.id,
        color: best.color || 'text-blue-600',
        bg: best.bg || 'bg-blue-50'
      };
    } else {
      return { 
        action: '持有現金', 
        desc: '所有觀察標的之平均報酬率皆為負值',
        code: 'CASH',
        color: 'text-slate-600',
        bg: 'bg-slate-100'
      };
    }
  }, [strategyDataList, viewMode, config]);

  const handleUpdateAllocation = (key: string, value: number) => {
    onUpdateConfig({
      ...config,
      allocation: {
         ...(config.allocation || { QLD: 100, TLT: 0, VT: 0, CASH: 0 }),
         [key]: value
      }
    });
  };

  const handleUpdateCapital = (value: number) => {
     onUpdateConfig({
        ...config,
        totalCapital: value
     });
  };

  const handleAddSymbol = () => {
    if (!newSymbol) return;
    const sym = newSymbol.toUpperCase().trim();
    if (config.symbols.includes(sym)) return;
    
    onUpdateConfig({
      ...config,
      symbols: [...config.symbols, sym],
      enabledSymbols: [...(config.enabledSymbols || config.symbols), sym],
      priceData: {
        ...config.priceData,
        [sym]: { latest: 0, p0: 0, p1: 0, p3: 0, p6: 0 }
      }
    });
    setNewSymbol('');
  };

  const handleRemoveSymbol = (symbol: string) => {
    const newSymbols = config.symbols.filter(s => s !== symbol);
    const newEnabledSymbols = (config.enabledSymbols || config.symbols).filter(s => s !== symbol);
    const newPriceData = { ...config.priceData };
    delete newPriceData[symbol];
    
    onUpdateConfig({
      ...config,
      symbols: newSymbols,
      enabledSymbols: newEnabledSymbols,
      priceData: newPriceData
    });
  };

  const handleToggleEnable = (symbol: string) => {
    const currentEnabled = config.enabledSymbols || config.symbols;
    const isEnabled = currentEnabled.includes(symbol);
    
    const newEnabled = isEnabled 
      ? currentEnabled.filter(s => s !== symbol)
      : [...currentEnabled, symbol];
      
    onUpdateConfig({
      ...config,
      enabledSymbols: newEnabled
    });
  };

  const handleUpdatePrice = (symbol: string, key: keyof PriceData, val: number) => {
    onUpdateConfig({
      ...config,
      priceData: {
        ...config.priceData,
        [symbol]: { ...config.priceData[symbol], [key]: val }
      }
    });
  };

  const tenxStocks = useMemo(() => {
    return stocks.filter(s => s.isTenX || s.strategy === 'TENX' || s.category?.includes('十倍大盤') || s.isTenXCandidate);
  }, [stocks]);

  const tenxDetails = useMemo(() => {
    const details: any[] = [];
    
    tenxStocks.forEach(stock => {
      const stockTxsAll = transactions.filter(t => t.stockId === stock.id && t.isTenX);
      const isUSD = stock.currency === 'USD' || (stock.market === Market.US && !stock.currency);
      
      const txByAccount = new Map<string | null, Transaction[]>();
      
      if (stockTxsAll.length > 0) {
        stockTxsAll.forEach(t => {
          const accId = t.accountId ? String(t.accountId) : null;
          if (!txByAccount.has(accId)) txByAccount.set(accId, []);
          txByAccount.get(accId)!.push(t);
        });
      }

      Array.from(txByAccount.entries()).forEach(([accId, stockTxs]) => {
        let heldQty = 0;
        let totalStockCostUSD = 0;
        let totalStockCostTWD = 0;
        
        stockTxs.forEach(t => {
          if (t.type === TransactionType.BUY) {
            heldQty += t.quantity;
            const txCost = t.price * t.quantity + (t.fee || 0);
            totalStockCostUSD += isUSD ? txCost : txCost / exchangeRate;
            totalStockCostTWD += isUSD ? txCost * (t.exchangeRate || exchangeRate) : txCost;
          } else if (t.type === TransactionType.SELL) {
            const avgBuyPriceUSD = heldQty > 0 ? totalStockCostUSD / heldQty : 0;
            const avgBuyPriceTWD = heldQty > 0 ? totalStockCostTWD / heldQty : 0;
            totalStockCostUSD -= (avgBuyPriceUSD * t.quantity);
            totalStockCostTWD -= (avgBuyPriceTWD * t.quantity);
            heldQty -= t.quantity;
          }
        });

        const avgCostUSD = heldQty > 0 ? totalStockCostUSD / heldQty : 0;
        const avgCostTWD = heldQty > 0 ? totalStockCostTWD / heldQty : 0;
        const currentPriceUSD = isUSD ? (stock.currentPrice || 0) : (stock.currentPrice || 0) / exchangeRate;
        const currentPriceTWD = isUSD ? (stock.currentPrice || 0) * exchangeRate : (stock.currentPrice || 0);
        const unPLRate = avgCostUSD > 0 ? (currentPriceUSD - avgCostUSD) / avgCostUSD : 0;

        const accName = accId ? accounts?.find(a => String(a.id) === accId)?.name || '未知帳戶' : '';
        const tenXSubStrategy = stockTxs.find(t => t.tenXSubStrategy)?.tenXSubStrategy;

        details.push({
          ...stock,
          detailId: `${stock.id}_${accId || 'none'}`,
          accountName: accName,
          tenXSubStrategy,
          heldQty,
          avgCostUSD,
          avgCostTWD,
          currentPriceUSD,
          currentPriceTWD,
          unPLRate,
          marketValueUSD: heldQty * currentPriceUSD,
          marketValueTWD: heldQty * currentPriceTWD,
          stockCostUSD: totalStockCostUSD,
          stockCostTWD: totalStockCostTWD
        });
      });
    });

    return details.filter(s => s.heldQty > 0);
  }, [tenxStocks, transactions, exchangeRate, accounts]);

  const tenxStats = useMemo(() => {
    let costUSD = 0;
    let costTWDActual = 0;
    let marketValueUSD = 0;
    let marketValueTWD = 0;
    let realizedUSD = 0;
    let realizedTWDActual = 0;
    
    // Calculate stats from details and transactions
    tenxDetails.forEach(s => {
      costUSD += s.stockCostUSD;
      costTWDActual += s.stockCostTWD;
      marketValueUSD += s.marketValueUSD;
      marketValueTWD += s.marketValueTWD;
    });

    // Realized profits from ALL tenx stocks (even those not held)
    tenxStocks.forEach(stock => {
      const stockTxs = transactions.filter(t => t.stockId === stock.id && t.isTenX);
      const isUSD = stock.currency === 'USD' || (stock.market === Market.US && !stock.currency);
      
      let runningQty = 0;
      let runningCostUSD = 0;
      let runningCostTWD = 0;
      
      stockTxs.forEach(t => {
        if (t.type === TransactionType.BUY) {
          runningQty += t.quantity;
          const cost = t.price * t.quantity + (t.fee || 0);
          runningCostUSD += isUSD ? cost : cost / exchangeRate;
          runningCostTWD += isUSD ? cost * (t.exchangeRate || exchangeRate) : cost;
        } else if (t.type === TransactionType.SELL) {
          const avgUSD = runningQty > 0 ? runningCostUSD / runningQty : 0;
          const avgTWD = runningQty > 0 ? runningCostTWD / runningQty : 0;
          
          const proceedsUSD = t.price * t.quantity - (t.fee || 0) - (t.tax || 0);
          const proceedsTWD = isUSD ? (t.price * t.quantity - (t.fee || 0) - (t.tax || 0)) * (t.exchangeRate || exchangeRate) : (t.price * t.quantity - (t.fee || 0) - (t.tax || 0));
          
          realizedUSD += (proceedsUSD - avgUSD * t.quantity);
          realizedTWDActual += (proceedsTWD - avgTWD * t.quantity);
          
          runningCostUSD -= (avgUSD * t.quantity);
          runningCostTWD -= (avgTWD * t.quantity);
          runningQty -= t.quantity;
        } else if (t.type === TransactionType.DIVIDEND) {
          const divNet = t.price * t.quantity - (t.fee || 0);
          realizedUSD += isUSD ? divNet : divNet / exchangeRate;
          realizedTWDActual += isUSD ? divNet * (t.exchangeRate || exchangeRate) : divNet;
        }
      });
    });

    return {
      costUSD,
      costTWD: costTWDActual,
      marketValueUSD,
      marketValueTWD,
      unrealizedUSD: marketValueUSD - costUSD,
      unrealizedTWD: marketValueTWD - costTWDActual,
      realizedUSD,
      realizedTWD: realizedTWDActual
    };
  }, [tenxStocks, tenxDetails, transactions, exchangeRate]);

  const formatYahooDate = (dateStr: string) => {
    if (!dateStr || dateStr === '--') return '--';
    return dateStr;
  };

  const todayStr = useMemo(() => {
    const now = baseDateStr ? new Date(baseDateStr) : new Date();
    return `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;
  }, [baseDateStr]);

  const annualAnalysisStats = useMemo(() => {
    const closedTrades: any[] = [];
    const allTrades: any[] = [];
    
    tenxStocks.forEach(stock => {
      // Get all transactions for this stock
      const stockTxs = transactions
        .filter(t => t.stockId === stock.id && t.isTenX)
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
            let lastRate = exchangeRate;

            cycleTxs.forEach(t => {
               const rate = Number(t.exchangeRate) || exchangeRate;
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
  }, [tenxStocks, transactions, exchangeRate, annualAnalysisYear]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Strategy Capital Card */}
        <div className="glass-panel p-5 rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
              <Wallet size={20} />
            </div>
            <h3 className="font-bold text-slate-700">策略總資金</h3>
          </div>
          <div className="flex flex-col">
            <p className="text-3xl font-black text-indigo-700">
               <span className="text-sm mr-1">TWD</span>
               {(config.totalCapital ?? 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs font-bold text-slate-500 mt-1 flex justify-between items-center">
               <span>配置額度設定</span>
               <span className="text-indigo-600 bg-indigo-100/50 px-1.5 py-0.5 rounded border border-indigo-200 text-[10px]">手動輸入</span>
            </p>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-rose-200/60 bg-gradient-to-br from-rose-50/50 to-orange-50/50 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
              <Zap size={20} />
            </div>
            <h3 className="font-bold text-slate-700">持倉總市值 (Value)</h3>
          </div>
          <div className="flex flex-col">
            <p className="text-3xl font-black text-rose-700">
               <span className="text-sm mr-1">$</span>
               {tenxStats.marketValueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm font-bold text-slate-500 mt-1">
               ≈ {tenxStats.marketValueTWD.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px]">TWD</span>
            </p>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <DollarSign size={20} />
            </div>
            <h3 className="font-bold text-slate-700">持倉總成本 (Cost)</h3>
          </div>
          <div className="flex flex-col">
            <p className="text-3xl font-black text-blue-700">
               <span className="text-sm mr-1">$</span>
               {tenxStats.costUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm font-bold text-slate-500 mt-1">
               (實) {tenxStats.costTWD.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px]">TWD</span>
            </p>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <h3 className="font-bold text-slate-700">損益摘要 (P/L)</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase">未實現 (USD)</span>
                <span className={`text-lg font-black font-mono ${tenxStats.unrealizedUSD >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                   {tenxStats.unrealizedUSD >= 0 ? '+$' : '-$'}
                   {Math.abs(tenxStats.unrealizedUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-400 font-bold">
                   ≈ {tenxStats.unrealizedTWD >= 0 ? '+' : ''}{tenxStats.unrealizedTWD.toLocaleString(undefined, { maximumFractionDigits: 0 })} TWD
                </span>
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase">已實現 (USD)</span>
                <span className={`text-lg font-black font-mono ${tenxStats.realizedUSD >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                   {tenxStats.realizedUSD >= 0 ? '+$' : '-$'}
                   {Math.abs(tenxStats.realizedUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-400 font-bold">
                   (實) {tenxStats.realizedTWD >= 0 ? '+' : ''}{tenxStats.realizedTWD.toLocaleString(undefined, { maximumFractionDigits: 0 })} TWD
                </span>
             </div>
          </div>
        </div>
      </div>

      {/* Strategy Recommendation Panel */}
      <div className="glass-panel p-6 rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white/80 to-blue-50/30">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Target className="text-blue-500" size={24} />
              十倍大盤：動態配置策略建議
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              自動計算 {config.symbols.join('、')} 之 {viewMode === 'monthly' ? `${mPeriods[0]}M/${mPeriods[1]}M/${mPeriods[2]}M` : `${wPeriods[0]}W/${wPeriods[1]}W/${wPeriods[2]}W`} 還原報酬平均值，找出最強勢標的。
            </p>
            {strategyError && (
              <div className="mt-2 flex items-center gap-2 p-2 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 text-xs font-bold">
                <AlertCircle size={14} />
                <span>數據抓取異常: {strategyError}</span>
              </div>
            )}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('monthly')}
                className={`flex-1 px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                月度 ({mPeriods[0]}M/{mPeriods[1]}M/{mPeriods[2]}M)
              </button>
              <button 
                onClick={() => setViewMode('weekly')}
                className={`flex-1 px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'weekly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                週度 ({wPeriods[0]}W/{wPeriods[1]}W/{wPeriods[2]}W)
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
             <input 
              type="date" 
              value={baseDateStr} 
              onChange={(e) => setBaseDateStr(e.target.value)}
              className="px-3 py-2 text-sm font-bold bg-white text-slate-700 border border-slate-200 rounded-xl outline-none focus:border-blue-500 shadow-sm"
              title="選擇基準日期 (預設為今日)"
            />
            <button 
              onClick={fetchStrategyData}
              disabled={strategyLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-white text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={16} className={strategyLoading ? 'animate-spin' : ''} />
              {strategyLoading ? '運算中...' : '重新計算'}
            </button>
            <button 
              onClick={() => setShowDataEditor(!showDataEditor)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border transition-all shadow-sm active:scale-95 ${showDataEditor ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              <Settings size={16} />
              數據管理
            </button>
          </div>
        </div>

        {/* Manual Data Editor */}
        {showDataEditor && (
          <div className="mb-6 space-y-4 animate-in slide-in-from-top-2 duration-300">
            {/* Capital & Allocation Section */}
            <div className="p-4 bg-white border border-blue-100 rounded-2xl shadow-inner">
               <h3 className="text-sm font-black text-slate-700 flex items-center gap-2 mb-3">
                 <Wallet size={16} className="text-blue-500" />
                 資本與資產配置比例設定
               </h3>
               <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 relative">
                 <div className="col-span-2 lg:col-span-1 border border-slate-200 p-2 rounded-xl bg-slate-50">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest text-center">總資金 (TWD)</label>
                    <input 
                      type="number"
                      step="1000"
                      value={config.totalCapital ?? 1000000}
                      onChange={(e) => handleUpdateCapital(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white px-2 py-1.5 border border-slate-200 rounded-lg text-center font-mono font-black text-blue-700 focus:border-blue-500 outline-none"
                    />
                 </div>
                 {['QLD', 'TLT', 'VT', 'CASH'].map((k) => (
                    <div key={k} className="border border-slate-200 p-2 rounded-xl bg-slate-50 flex flex-col justify-center items-center relative">
                       <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest text-center">{k} (%)</label>
                       <div className="flex items-center gap-1 w-full relative">
                         <input 
                           type="number"
                           min="0" max="100"
                           value={(config.allocation || { QLD: 100, TLT: 0, VT: 0, CASH: 0 })[k as keyof typeof config.allocation]}
                           onChange={(e) => handleUpdateAllocation(k, parseFloat(e.target.value) || 0)}
                           className="w-full bg-white px-2 py-1.5 border border-slate-200 rounded-lg text-center font-mono font-black text-slate-700 focus:border-blue-500 outline-none"
                         />
                         <span className="absolute right-3 text-slate-400 font-bold text-xs pointer-events-none">%</span>
                       </div>
                    </div>
                 ))}
               </div>
               <p className="text-[10px] text-slate-400 font-bold mt-2 text-center bg-blue-50 p-1.5 rounded-lg border border-blue-100 italic">這些配置比例用於試算部署建議目標金額，幫助您達成資產再平衡與策略設定。</p>
            </div>

            {/* Periods Configuration Section */}
            <div className="p-4 bg-white border border-blue-100 rounded-2xl shadow-inner">
               <h3 className="text-sm font-black text-slate-700 flex items-center gap-2 mb-3">
                 <Settings size={16} className="text-blue-500" />
                 策略計算週期設定 (預設 1M/3M/6M 與 1W/2W/4W)
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50">
                     <label className="block text-xs font-bold text-slate-600 mb-2">月度週期 (Months)</label>
                     <div className="flex items-center gap-2">
                        {[0, 1, 2].map((idx) => (
                           <div key={`m${idx}`} className="flex-1">
                              <input 
                                type="number"
                                min="1" max="60"
                                value={mPeriods[idx]}
                                onChange={(e) => {
                                  const newVal = parseInt(e.target.value) || 1;
                                  const newPeriods = [...mPeriods];
                                  newPeriods[idx] = newVal;
                                  onUpdateConfig({ ...config, monthlyPeriods: newPeriods as [number, number, number] });
                                }}
                                className="w-full bg-white px-2 py-1.5 border border-slate-200 rounded-lg text-center font-mono font-black text-slate-700 focus:border-blue-500 outline-none"
                              />
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50">
                     <label className="block text-xs font-bold text-slate-600 mb-2">週度週期 (Weeks)</label>
                     <div className="flex items-center gap-2">
                        {[0, 1, 2].map((idx) => (
                           <div key={`w${idx}`} className="flex-1">
                              <input 
                                type="number"
                                min="1" max="100"
                                value={wPeriods[idx]}
                                onChange={(e) => {
                                  const newVal = parseInt(e.target.value) || 1;
                                  const newPeriods = [...wPeriods];
                                  newPeriods[idx] = newVal;
                                  onUpdateConfig({ ...config, weeklyPeriods: newPeriods as [number, number, number] });
                                }}
                                className="w-full bg-white px-2 py-1.5 border border-slate-200 rounded-lg text-center font-mono font-black text-slate-700 focus:border-blue-500 outline-none"
                              />
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>

            {/* Price Editor Section */}
            <div className="p-4 bg-white border border-blue-100 rounded-2xl shadow-inner">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 pb-4 border-b border-blue-50">
              <div>
                <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                  <DollarSign size={16} className="text-blue-500" />
                  參考「還原收盤價」數據管理
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase italic mt-0.5">您可以手動修正數據，或新增觀測標的</p>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input 
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol()}
                  placeholder="輸入標的 (如 SPY)"
                  className="p-2 text-xs border border-slate-200 rounded-lg focus:border-blue-500 outline-none w-full md:w-32 font-bold"
                />
                <button 
                  onClick={handleAddSymbol}
                  className="whitespace-nowrap px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  新增標的
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 font-black uppercase tracking-tighter">
                    <th className="pb-2">納入策略</th>
                    <th className="pb-2">標的</th>
                    <th className="pb-2">當前市價</th>
                    {viewMode === 'monthly' ? (
                      <>
                        <th className="pb-2">基準價 (P0)</th>
                        <th className="pb-2">{mPeriods[0]}M 前價 (P1)</th>
                        <th className="pb-2">{mPeriods[1]}M 前價 (P2)</th>
                        <th className="pb-2">{mPeriods[2]}M 前價 (P3)</th>
                      </>
                    ) : (
                      <>
                        <th className="pb-2">基準價 (W0)</th>
                        <th className="pb-2">{wPeriods[0]}W 前價 (W1)</th>
                        <th className="pb-2">{wPeriods[1]}W 前價 (W2)</th>
                        <th className="pb-2">{wPeriods[2]}W 前價 (W3)</th>
                      </>
                    )}
                    <th className="pb-2">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {config.symbols.map((symbol) => {
                    const prices = config.priceData[symbol] || { latest: 0, p0: 0, p1: 0, p3: 0, p6: 0 };
                    const isEnabled = (config.enabledSymbols || config.symbols).includes(symbol);
                    return (
                      <tr key={symbol}>
                        <td className="py-2 pr-4 text-center">
                          <input 
                            type="checkbox" 
                            checked={isEnabled}
                            onChange={() => handleToggleEnable(symbol)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <span className="font-black text-slate-700">{symbol}</span>
                        </td>
                        <td className="py-2 pr-2">
                          <input 
                            type="number" 
                            step="any"
                            value={prices.latest || ''} 
                            onChange={(e) => handleUpdatePrice(symbol, 'latest', parseFloat(e.target.value) || 0)}
                            className="w-full p-2 border border-blue-100 rounded-lg font-mono font-black focus:border-blue-500 outline-none text-blue-700"
                          />
                        </td>
                        {viewMode === 'monthly' ? (
                          <>
                            <td className="py-2 pr-2">
                              <input 
                                type="number" 
                                step="any"
                                value={prices.p0 || ''} 
                                onChange={(e) => handleUpdatePrice(symbol, 'p0', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold focus:border-blue-500 outline-none"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="number" 
                                step="any"
                                value={prices.p1 || ''} 
                                onChange={(e) => handleUpdatePrice(symbol, 'p1', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold focus:border-blue-500 outline-none"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="number" 
                                step="any"
                                value={prices.p3 || ''} 
                                onChange={(e) => handleUpdatePrice(symbol, 'p3', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold focus:border-blue-500 outline-none"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="number" 
                                step="any"
                                value={prices.p6 || ''} 
                                onChange={(e) => handleUpdatePrice(symbol, 'p6', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold focus:border-blue-500 outline-none"
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 pr-2">
                              <input 
                                type="number" 
                                step="any"
                                value={prices.w0 || ''} 
                                onChange={(e) => handleUpdatePrice(symbol, 'w0', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold focus:border-blue-500 outline-none"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="number" 
                                step="any"
                                value={prices.w1 || ''} 
                                onChange={(e) => handleUpdatePrice(symbol, 'w1', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold focus:border-blue-500 outline-none"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="number" 
                                step="any"
                                value={prices.w2 || ''} 
                                onChange={(e) => handleUpdatePrice(symbol, 'w2', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold focus:border-blue-500 outline-none"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="number" 
                                step="any"
                                value={prices.w4 || ''} 
                                onChange={(e) => handleUpdatePrice(symbol, 'w4', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold focus:border-blue-500 outline-none"
                              />
                            </td>
                          </>
                        )}
                        <td className="py-2">
                          <button 
                            onClick={() => handleRemoveSymbol(symbol)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="刪除標的"
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-2 text-[10px] text-blue-600 bg-blue-50/50 p-2 rounded-lg">
               <Info size={12} />
               <span>註：Yahoo Finance 每月數據通常以次月1日標註。如欲抓取3月結算數據，請確認網站 4/1 之數據。</span>
            </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className={`lg:col-span-1 rounded-2xl p-6 border-2 border-dashed border-blue-200 flex flex-col items-center justify-center text-center shadow-inner ${strategyRecommendation.bg}`}>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">當前部署建議</span>
            <div className={`p-4 rounded-full mb-4 shadow-sm bg-white/80 ${strategyRecommendation.color}`}>
              <Zap size={40} className="fill-current" />
            </div>
            <h3 className={`text-2xl font-black mb-1 ${strategyRecommendation.color}`}>
              {strategyRecommendation.action}
            </h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed max-w-[140px]">{strategyRecommendation.desc}</p>
            
            <div className="mt-6 pt-4 border-t border-blue-100 w-full">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-left">配置規則說明</h4>
              <ul className="text-[10px] space-y-1.5 text-left font-bold text-slate-500">
                <li className="flex items-start gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1"></div>
                  <span>QQQ 平均值最大且 &gt; 0 → 持有 QLD</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-blue-500 mt-1"></div>
                  <span>TLT (或 VT) 平均值最大且 &gt; 0 → 持有 TLT (或 VT)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-slate-400 mt-1"></div>
                  <span>若所有平均值皆 &lt; 0 → 持有現金</span>
                </li>
              </ul>
            </div>

            <div className="mt-4 w-full">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-left">目標資金配置 (TWD)</h4>
              <div className="bg-white rounded-lg border border-slate-100 divide-y divide-slate-100 text-left">
                 {(() => {
                    const alloc = config.allocation || { QLD: 100, TLT: 0, VT: 0, CASH: 0 };
                    const tc = config.totalCapital ?? 1000000;
                    const items = [
                      { label: 'QLD', v: alloc.QLD },
                      { label: 'TLT', v: alloc.TLT },
                      { label: 'VT', v: alloc.VT },
                      { label: '現金', v: alloc.CASH }
                    ].filter(i => i.v > 0);
                    return items.map((item, idx) => (
                       <div key={idx} className="flex justify-between items-center p-2 text-xs">
                          <span className="font-black text-slate-600">{item.label} <span className="text-[9px] text-slate-400 font-bold ml-1">{item.v}%</span></span>
                          <span className="font-mono font-bold text-indigo-600">{((tc * item.v) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                       </div>
                    ));
                 })()}
              </div>
            </div>
            
            {strategyDataList.lastUpdated && (
              <div className="mt-6 flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                 <Calendar size={10} /> {strategyDataList.lastUpdated}
              </div>
            )}
          </div>

          <div className="lg:col-span-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs font-black uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 w-1/6">觀測標的 (擷取日: {todayStr})</th>
                    <th className="p-4 text-center w-1/6">
                      基準點價位<br/>
                      <span className="text-[10px] font-normal tracking-normal normal-case text-slate-400">
                        ({viewMode === 'monthly' ? formatYahooDate(strategyDataList.dates.p0) : formatYahooDate(strategyDataList.dates.w0 || '--')})
                      </span>
                    </th>
                    {viewMode === 'monthly' ? (
                      <>
                        <th className="p-4 text-center w-1/6">{mPeriods[0]}M 報酬<br/><span className="text-[10px] font-normal text-slate-400">(vs {formatYahooDate(strategyDataList.dates.p1)})</span></th>
                        <th className="p-4 text-center w-1/6">{mPeriods[1]}M 報酬<br/><span className="text-[10px] font-normal text-slate-400">(vs {formatYahooDate(strategyDataList.dates.p3)})</span></th>
                        <th className="p-4 text-center w-1/6">{mPeriods[2]}M 報酬<br/><span className="text-[10px] font-normal text-slate-400">(vs {formatYahooDate(strategyDataList.dates.p6)})</span></th>
                      </>
                    ) : (
                      <>
                        <th className="p-4 text-center w-1/6">{wPeriods[0]}W 報酬<br/><span className="text-[10px] font-normal text-slate-400">(vs {formatYahooDate(strategyDataList.dates.w1 || '--')})</span></th>
                        <th className="p-4 text-center w-1/6">{wPeriods[1]}W 報酬<br/><span className="text-[10px] font-normal text-slate-400">(vs {formatYahooDate(strategyDataList.dates.w2 || '--')})</span></th>
                        <th className="p-4 text-center w-1/6">{wPeriods[2]}W 報酬<br/><span className="text-[10px] font-normal text-slate-400">(vs {formatYahooDate(strategyDataList.dates.w4 || '--')})</span></th>
                      </>
                    )}
                    <th className="p-4 text-center bg-blue-50/50 text-blue-800 w-1/6">績效平均值</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {strategyDataList.items.map((data) => {
                    const isEnabled = (config.enabledSymbols || config.symbols).includes(data.symbol);
                    
                    const r1 = viewMode === 'monthly' ? data.r1m : (data.r1w ?? 0);
                    const r2 = viewMode === 'monthly' ? data.r3m : (data.r2w ?? 0);
                    const r3 = viewMode === 'monthly' ? data.r6m : (data.r4w ?? 0);
                    const avg = viewMode === 'monthly' ? data.avg : (data.avgW ?? 0);
                    
                    return (
                      <tr key={data.symbol} className={`hover:bg-blue-50/20 transition-colors group ${!isEnabled ? 'opacity-40 grayscale-[0.5]' : ''}`}>
                        <td className="p-4 align-middle">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-800 text-xl group-hover:text-blue-600 transition-colors">{data.symbol}</span>
                              {!isEnabled && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase">已排除</span>}
                            </div>
                            <span className="text-xs text-slate-500 font-bold mt-1">最新市價: <span className="font-mono text-slate-700">${data.latestPrice.toFixed(2)}</span></span>
                          </div>
                        </td>
                        <td className="p-4 text-center align-middle font-mono font-bold text-slate-700 text-base">
                           ${(viewMode === 'monthly' ? data.p0m : (data.w0 ?? 0)).toFixed(2)}
                        </td>
                      <td className={`p-4 text-center align-middle font-mono font-bold text-base ${r1 >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                         {(r1 * 100).toFixed(3)}%
                      </td>
                      <td className={`p-4 text-center align-middle font-mono font-bold text-base ${r2 >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                         {(r2 * 100).toFixed(3)}%
                      </td>
                      <td className={`p-4 text-center align-middle font-mono font-bold text-base ${r3 >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                         {(r3 * 100).toFixed(3)}%
                      </td>
                      <td className="p-4 text-center align-middle bg-blue-50/30">
                         <span className={`text-2xl font-black font-mono ${avg >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {(avg * 100).toFixed(3)}%
                         </span>
                      </td>
                    </tr>
                  );
                })}
                  {strategyDataList.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic font-medium">尚未取得有效數據，請點擊「重新計算」或於「數據管理」手動輸入。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 p-3 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-500 font-medium">
               <Info size={12} className="text-blue-400" />
               運用「還原股價」計算多週期績效。當 QQQ/TLT/VT 平均為負時，轉趨保守持有現金。
            </div>
          </div>
        </div>
      </div>

      {/* Annual Analysis Table */}
      {annualAnalysisStats.totalTrades > 0 && (
         <div className="mb-6">
            <div className="flex justify-end items-center gap-2 mb-3">
              <label className="text-sm font-semibold text-slate-600">選擇年份:</label>
              <select 
                value={annualAnalysisYear} 
                onChange={(e) => setAnnualAnalysisYear(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1 text-sm outline-none focus:border-blue-500 bg-white shadow-sm"
              >
                <option value="ALL">全部年份</option>
                {annualAnalysisStats.years.map(y => (
                  <option key={y} value={y as string}>{y as string} 年</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto rounded-lg border-2 border-[#00d0cd] shadow-md bg-white">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr>
                    <th colSpan={5} className="bg-[#b3b3b3] text-gray-900 text-2xl py-3 font-semibold border-b border-black">
                      {annualAnalysisYear === 'ALL' ? '全部年份' : annualAnalysisYear} 交易分析
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-[#ffe599] text-gray-900 font-bold text-[18px]">
                    <td className="py-2 px-1 border border-black">總交易次數</td>
                    <td className="py-2 px-1 border border-black">勝率</td>
                    <td className="py-2 px-1 border border-black">敗率</td>
                    <td className="py-2 px-1 border border-black">平均賺(%)</td>
                    <td className="py-2 px-1 border border-black">平均賠(%)</td>
                  </tr>
                  <tr className="bg-white text-gray-900 font-semibold text-[20px]">
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.totalTrades}</td>
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.winRate.toFixed(2)}%</td>
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.lossRate.toFixed(2)}%</td>
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.avgWinPerc.toFixed(2)}%</td>
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.avgLossPerc.toFixed(2)}%</td>
                  </tr>
                  
                  <tr className="bg-[#ffe599] text-gray-900 font-bold text-[18px]">
                    <td className="py-2 px-1 border border-black">獲利次數</td>
                    <td className="py-2 px-1 border border-black">虧損次數</td>
                    <td className="py-2 px-1 border border-black">總獲利 (TWD)</td>
                    <td className="py-2 px-1 border border-black">總虧損 (TWD)</td>
                    <td className="py-2 px-1 border border-black bg-white"></td>
                  </tr>
                  <tr className="bg-white text-gray-900 font-semibold text-[20px]">
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.winCount}</td>
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.lossCount}</td>
                    <td className="py-2.5 px-1 border border-black">NT$ {annualAnalysisStats.totalProfitTWD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-2.5 px-1 border border-black">NT$ {annualAnalysisStats.totalLossTWD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-2.5 px-1 border border-black"></td>
                  </tr>

                  <tr className="bg-[#ffe599] text-gray-900 font-bold text-[18px]">
                    <td className="py-2 px-1 border border-black">賺賠比</td>
                    <td className="py-2 px-1 border border-black">期望值(%)</td>
                    <td className="py-2 px-1 border border-black text-indigo-800">賺賠比(未實現)</td>
                    <td className="py-2 px-1 border border-black text-indigo-800">期望值(未實現)</td>
                    <td className="py-2 px-1 border border-black bg-white"></td>
                  </tr>
                  <tr className="bg-[#ffff00] text-gray-900 font-bold text-[22px]">
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.plRatio.toFixed(2)}</td>
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.evPerc.toFixed(2)}%</td>
                    <td className="py-2.5 px-1 border border-black text-indigo-900">{annualAnalysisStats.allPlRatio.toFixed(2)}</td>
                    <td className="py-2.5 px-1 border border-black text-indigo-900">{annualAnalysisStats.allEvPerc.toFixed(2)}%</td>
                    <td className="py-2.5 px-1 border border-black bg-white"></td>
                  </tr>
                </tbody>
              </table>
            </div>
         </div>
      )}

      {/* TenX Holdings Summary Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-200 bg-white shadow-sm mt-6 mb-8 w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl lg:text-2xl font-black text-slate-800 flex items-center gap-2">
            <Rocket className="text-indigo-500" size={24} />
            十倍潛力持倉明細
          </h2>
          <button 
            onClick={() => setIsAddingStock(true)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-all shadow-sm`}
          >
            <Plus size={16} /> 快速新增標的
          </button>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs lg:text-sm font-black uppercase tracking-widest border-b border-slate-100">
                <th className="p-4 w-[20%]">標的名稱</th>
                <th className="p-4 text-right w-[20%]">持股數</th>
                <th className="p-4 text-right w-[20%]">平均成本<br /><span className="text-[10px] lg:text-xs text-slate-400">總成本</span></th>
                <th className="p-4 text-right w-[20%]">當前現價<br /><span className="text-[10px] lg:text-xs text-slate-400">總市值</span></th>
                <th className="p-4 text-right w-[20%]">未實現損益<br /><span className="text-[10px] lg:text-xs text-slate-400">報酬率</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tenxDetails.map((stock) => (
                <tr key={stock.detailId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="font-black text-slate-800 text-lg lg:text-xl md:text-xl">{stock.ticker}</span>
                      <span className="text-sm lg:text-base text-slate-400 font-bold uppercase tracking-tight">{stock.name}</span>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        {stock.accountName && stock.accountName !== '未知帳戶' && (
                           <span className="text-xs lg:text-sm text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-lg shadow-sm border border-indigo-100">{stock.accountName}</span>
                        )}
                        {stock.tenXSubStrategy === 'WEEKLY' && (
                           <span className="text-xs lg:text-sm text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-lg shadow-sm border border-amber-100">週策略</span>
                        )}
                        {stock.tenXSubStrategy === 'MONTHLY' && (
                           <span className="text-xs lg:text-sm text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-lg shadow-sm border border-orange-100">月策略</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-slate-600 text-lg lg:text-xl">
                    {stock.heldQty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono font-black text-slate-800 text-lg lg:text-xl" title="平均成本">
                        ${stock.avgCostUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-sm lg:text-base text-slate-500 font-mono font-bold" title="總成本">
                        ${stock.stockCostUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono font-black text-slate-800 text-lg lg:text-xl" title="當前現價">
                        ${stock.currentPriceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-sm lg:text-base text-slate-500 font-mono font-bold" title="持倉市值">
                        ${stock.marketValueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className={`font-mono font-black text-lg lg:text-xl ${stock.marketValueUSD - stock.stockCostUSD >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} title="未實現損益 (金額)">
                        {stock.marketValueUSD - stock.stockCostUSD >= 0 ? '+' : ''}${(stock.marketValueUSD - stock.stockCostUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className={`font-mono text-sm lg:text-base font-bold px-2 py-0.5 rounded-lg ${stock.unPLRate >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`} title="未實現損益 (%)">
                        {stock.unPLRate >= 0 ? '+' : ''}{(stock.unPLRate * 100).toFixed(2)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {tenxDetails.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 italic font-medium">
                    目前沒有連動交易紀錄的十倍標的。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddingStock && (
        <QuickAddStockModal 
          onClose={() => setIsAddingStock(false)}
          onAddStock={onAddStock}
          marketFilter={marketFilter}
          suggestedCategory="十倍大盤策略"
          strategy="TENX"
        />
      )}

      {/* Embedded Stock Manager for TENX Target Management */}
      <div className="mt-8 pt-8 border-t border-slate-200">
        <h2 className="text-xl lg:text-2xl font-black text-slate-800 flex items-center gap-2 mb-6">
          <Settings className="text-indigo-500" size={24} />
          十倍標的管理
        </h2>
        <StockManager 
            stocks={stocks} 
            accounts={accounts}
            onUpdateStock={onUpdateStock} 
            onAddStock={onAddStock} 
            onDeleteStock={onDeleteStock || (() => {})} 
            marketFilter={marketFilter} 
            strategyFilter={strategyType}
            suggestedCategories={suggestedCategories}
            onUpdateSuggestedCategories={onUpdateSuggestedCategories}
            stockOrder={stockOrder}
            onUpdateOrder={onUpdateOrder}
        />
      </div>

    </div>
  );
};

export default TenXMarketStrategy;
