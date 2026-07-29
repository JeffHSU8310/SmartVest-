import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Stock, MarketFilter, Market, Account, Transaction, TransactionType } from '../types';
import { Search, LayoutGrid, List, Settings, RefreshCw, TrendingUp, AlertCircle, Plus, ArrowUpDown } from 'lucide-react';
import { fetchCurrentYahooQuote, fetchMADataForSymbol, formatMarketPrice, getTradingDaysCount } from '../utils';
import QuickAddStockModal from './QuickAddStockModal';
import StockManager from './StockManager';

const getDefenseExitStats = (s: Stock & { totalBought?: number, totalSold?: number, totalRealizedPnl?: number }) => {
   const initialShares = s.totalBought !== undefined ? s.totalBought : (Number(s.defenseActualShares) || 0);
   const buyPrice = Number(s.defenseBuyPrice) || 0;
   const buyFee = Number(s.defenseBuyFee) || 0;

   const getShares = (priceVal?: number | string, sharesVal?: number | string, defaultRatio: number = 0, isStopLoss: boolean = false, profitShares: number = 0) => {
       if (!priceVal) return 0;
       if (sharesVal !== undefined) return Number(sharesVal);
       if (isStopLoss) return Math.max(0, initialShares - profitShares);
       return Math.round(initialShares * defaultRatio);
   };

   const sma20Shares = getShares(s.defenseSellSma20Price, s.defenseSellSma20Shares, 0.25);
   const ema50Shares = getShares(s.defenseSellEma50Price, s.defenseSellEma50Shares, 0.50);
   const ema100Shares = getShares(s.defenseSellEma100Price, s.defenseSellEma100Shares, 0.25);
   
   const estSma20Shares = s.defenseSellSma20Shares !== undefined ? Number(s.defenseSellSma20Shares) : Math.round(initialShares * 0.25);
   const estEma50Shares = s.defenseSellEma50Shares !== undefined ? Number(s.defenseSellEma50Shares) : Math.round(initialShares * 0.50);
   const estEma100Shares = s.defenseSellEma100Shares !== undefined ? Number(s.defenseSellEma100Shares) : Math.round(initialShares * 0.25);

   const soldProfitShares = sma20Shares + ema50Shares + ema100Shares;
   const stopLossShares = getShares(s.defenseSellStopLossPrice, s.defenseSellStopLossShares, 0, true, soldProfitShares);

   const getTrxPnl = (sellPrice?: number|string, shares?: number, sellFee?: number|string, sellTax?: number|string) => {
       if (!sellPrice || !shares) return 0;
       const revenue = Number(sellPrice) * shares;
       const cogs = buyPrice * shares;
       const proratedBuyFee = initialShares > 0 ? buyFee * (shares / initialShares) : 0;
       return revenue - cogs - proratedBuyFee - (Number(sellFee) || 0) - (Number(sellTax) || 0);
   };

   const sma20Pnl = getTrxPnl(s.defenseSellSma20Price, sma20Shares, s.defenseSellSma20Fee, s.defenseSellSma20Tax);
   const ema50Pnl = getTrxPnl(s.defenseSellEma50Price, ema50Shares, s.defenseSellEma50Fee, s.defenseSellEma50Tax);
   const ema100Pnl = getTrxPnl(s.defenseSellEma100Price, ema100Shares, s.defenseSellEma100Fee, s.defenseSellEma100Tax);
   const stopLossPnl = getTrxPnl(s.defenseSellStopLossPrice, stopLossShares, s.defenseSellStopLossFee, s.defenseSellStopLossTax);

   if (s.defenseStatus === 'settled' && !s.defenseSellStopLossPrice && !s.defenseSellSma20Price && !s.defenseSellEma50Price && !s.defenseSellEma100Price) {
      return {
         sma20Shares: 0, ema50Shares: 0, ema100Shares: 0, stopLossShares: initialShares,
         unsoldShares: 0,
         realizedPnL: Number(s.defenseRealizedPnL) || 0,
         initialShares, buyPrice, buyFee, totalCost: 0, unsoldCost: 0
      };
   }

   const unsoldShares = s.totalSold !== undefined 
     ? Math.max(0, initialShares - s.totalSold)
     : Math.max(0, initialShares - soldProfitShares - stopLossShares);
   
   const realizedPnL = s.totalRealizedPnl !== undefined ? s.totalRealizedPnl : (sma20Pnl + ema50Pnl + ema100Pnl + stopLossPnl);

   // 總成本 (Total unsold cost)
   const unsoldProratedFee = initialShares > 0 ? buyFee * (unsoldShares / initialShares) : 0;
   const unsoldCost = (buyPrice * unsoldShares) + unsoldProratedFee;
   const initialTotalCost = (buyPrice * initialShares) + buyFee;

   return { 
     sma20Shares, ema50Shares, ema100Shares, stopLossShares, 
     estSma20Shares, estEma50Shares, estEma100Shares,
     unsoldShares, realizedPnL, initialShares, buyPrice, buyFee, 
     unsoldCost, initialTotalCost
   };
};

interface ValueDefenseTableProps {
  stocks: Stock[];
  transactions: Transaction[];
  accounts?: Account[];
  onUpdateStock: (stock: Stock) => void;
  onAddStock: (stock: Stock) => void;
  onDeleteStock?: (id: string) => void;
  onAddTransaction?: (stockId?: string, accountId?: string, strategy?: string) => void;
  marketFilter: MarketFilter;
  strategyType?: 'DEFENSE' | 'NOVA';
  suggestedCategories?: string[];
  onUpdateSuggestedCategories?: (categories: string[]) => void;
  stockOrder?: string[];
  onUpdateOrder?: (order: string[]) => void;
}

const ValueDefenseTable: React.FC<ValueDefenseTableProps> = ({ 
  stocks, 
  transactions,
  accounts,
  onUpdateStock, 
  onAddStock, 
  onDeleteStock,
  onAddTransaction,
  marketFilter,
  strategyType = 'DEFENSE',
  suggestedCategories,
  onUpdateSuggestedCategories,
  stockOrder,
  onUpdateOrder
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'history' | 'settings' | 'targets'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const attemptedMAs = useRef(new Set<string>());
  
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [annualAnalysisYear, setAnnualAnalysisYear] = useState<string>('ALL');

  // Global Settings for this strategy
  const [totalCapital, setTotalCapital] = useState<string>(() => localStorage.getItem(strategyType === 'NOVA' ? 'nova_total_capital' : 'defense_total_capital') || '700000');
  const [riskFactor, setRiskFactor] = useState<string>(() => localStorage.getItem(strategyType === 'NOVA' ? 'nova_risk_factor' : 'defense_risk_factor') || '1.0');
  const [sortDateOrder, setSortDateOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    localStorage.setItem(strategyType === 'NOVA' ? 'nova_total_capital' : 'defense_total_capital', totalCapital);
  }, [totalCapital, strategyType]);

  useEffect(() => {
    localStorage.setItem(strategyType === 'NOVA' ? 'nova_risk_factor' : 'defense_risk_factor', riskFactor);
  }, [riskFactor, strategyType]);

  const numTotalCapital = parseFloat(totalCapital) || 0;
  const numRiskFactor = parseFloat(riskFactor) || 0;
  const riskCapital = numTotalCapital * (numRiskFactor / 100);

  // Filter defense stocks
  const allStrategyStocks = useMemo(() => {
    const validStockIds = new Set<string>();
    transactions.forEach(t => {
       if (strategyType === 'DEFENSE' && t.isDynamicBalancing) validStockIds.add(t.stockId);
       if (strategyType === 'NOVA' && t.isNova) validStockIds.add(t.stockId);
    });

    const relevantStocks = stocks.filter(s => {
       if (validStockIds.has(s.id)) return true;
       if (strategyType === 'DEFENSE') {
          return s.isDynamicBalancing || s.strategy === 'DEFENSE' || s.category === '動態平衡策略' || s.category?.includes('動態平衡');
       } else if (strategyType === 'NOVA') {
          return s.isNova || s.strategy === 'NOVA' || s.category === 'Nova策略' || s.category?.includes('Nova');
       }
       return false;
    });

    return relevantStocks.flatMap(s => {
       const stockTxs = transactions.filter(t => t.stockId === s.id);
       const strategyTxs = stockTxs.filter(t => strategyType === 'DEFENSE' ? t.isDynamicBalancing : t.isNova)
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
       
       if (strategyTxs.length === 0) {
           return [];
       }

       const cycles: typeof strategyTxs[] = [];
       let currentCycle: typeof strategyTxs = [];
       let currentShares = 0;

       strategyTxs.forEach(t => {
           if (currentCycle.length === 0) {
               if (t.type === TransactionType.BUY) {
                   currentCycle.push(t);
                   currentShares = Number(t.quantity) || 0;
                   if (currentShares <= 0) {
                       cycles.push(currentCycle);
                       currentCycle = [];
                       currentShares = 0;
                   }
               }
           } else {
               currentCycle.push(t);
               if (t.type === TransactionType.BUY) {
                   currentShares += (Number(t.quantity) || 0);
               } else if (t.type === TransactionType.SELL) {
                   currentShares -= (Number(t.quantity) || 0);
               }
               
               if (currentShares <= 0) {
                   cycles.push(currentCycle);
                   currentCycle = [];
                   currentShares = 0;
               }
           }
       });
       
       if (currentCycle.length > 0) {
           cycles.push(currentCycle);
       }

       return cycles.map((cycleTxs, index) => {
           const buyTx = cycleTxs.find(t => t.type === TransactionType.BUY);
           
           // Use a unique ID for each cycle to prevent rendering conflicts
           let updated = { ...s, id: cycles.length > 1 ? `${s.id}-cycle-${index}` : s.id } as Stock & { totalBought?: number, totalSold?: number, totalRealizedPnl?: number };

           let totalBought = 0;
           let totalSold = 0;
           let totalBoughtAmount = 0;
           
           cycleTxs.forEach(t => {
              if (t.type === TransactionType.BUY) {
                 const qty = Number(t.quantity) || 0;
                 totalBought += qty;
                 totalBoughtAmount += (t.price * qty) + (t.fee || 0);
              }
           });

           const avgBuyCost = totalBought > 0 ? (totalBoughtAmount / totalBought) : 0;
           let totalRealizedPnl = 0;

           cycleTxs.forEach(t => {
              if (t.type === TransactionType.SELL) {
                 const qty = Number(t.quantity) || 0;
                 totalSold += qty;
                 const revenue = (t.price * qty) - (t.fee || 0) - (t.tax || 0);
                 const cost = avgBuyCost * qty;
                 totalRealizedPnl += (revenue - cost);
              }
           });

           updated.totalBought = totalBought;
           updated.totalSold = totalSold;
           updated.totalRealizedPnl = totalRealizedPnl;
           (updated as any).cycleTxs = cycleTxs;

           if (buyTx) {
             updated.defenseBuyPrice = buyTx.price;
             updated.defenseActualShares = buyTx.quantity;
             updated.strategyDate = buyTx.date;
             updated.defenseBuyFee = buyTx.fee;
             updated.defenseStatus = 'active';
             updated.defenseStopLoss = buyTx.stopLossPrice;
             updated.strategySetupTime = buyTx.strategySetupTime;
             updated.isLongTerm = !!buyTx.isLongTerm;
             updated.isShortTerm = !!buyTx.isShortTerm;
             updated.novaPattern = buyTx.novaPattern;
             
             const qty = Number(buyTx.quantity) || 0;
             updated.defenseSellSma20Shares = Math.round(qty * 0.25);
             updated.defenseSellEma50Shares = Math.round(qty * 0.50);
             updated.defenseSellEma100Shares = Math.round(qty * 0.25);
           } else {
             updated.defenseBuyPrice = undefined;
             updated.defenseActualShares = 0;
             updated.defenseStatus = undefined;
             updated.strategyDate = undefined;
           }

           updated.defenseSellStopLossPrice = undefined;
           updated.defenseSellStopLossShares = 0;
           updated.defenseSellStopLossDate = undefined;
           updated.defenseSellStopLossFee = undefined;
           updated.defenseSellStopLossTax = undefined;

           updated.defenseSellSma20Price = undefined;
           updated.defenseSellSma20Date = undefined;
           updated.defenseSellSma20Fee = undefined;
           updated.defenseSellSma20Tax = undefined;

           updated.defenseSellEma50Price = undefined;
           updated.defenseSellEma50Date = undefined;
           updated.defenseSellEma50Fee = undefined;
           updated.defenseSellEma50Tax = undefined;

           updated.defenseSellEma100Price = undefined;
           updated.defenseSellEma100Date = undefined;
           updated.defenseSellEma100Fee = undefined;
           updated.defenseSellEma100Tax = undefined;

           const sellTxs = cycleTxs.filter(t => t.type === TransactionType.SELL);
           sellTxs.forEach(tx => {
         const note = (tx.note || '').toUpperCase();
         if (note.includes('止損') || note.includes('STOP LOSS') || note.includes('EXIT')) {
            updated.defenseSellStopLossPrice = tx.price;
            updated.defenseSellStopLossShares = tx.quantity;
            updated.defenseSellStopLossDate = tx.date;
            updated.defenseSellStopLossFee = tx.fee;
            updated.defenseSellStopLossTax = tx.tax;
         } else if (note.includes('SMA20')) {
            updated.defenseSellSma20Price = tx.price;
            updated.defenseSellSma20Shares = tx.quantity;
            updated.defenseSellSma20Date = tx.date;
            updated.defenseSellSma20Fee = tx.fee;
            updated.defenseSellSma20Tax = tx.tax;
         } else if (note.includes('EMA50')) {
            updated.defenseSellEma50Price = tx.price;
            updated.defenseSellEma50Shares = tx.quantity;
            updated.defenseSellEma50Date = tx.date;
            updated.defenseSellEma50Fee = tx.fee;
            updated.defenseSellEma50Tax = tx.tax;
         } else if (note.includes('EMA100')) {
            updated.defenseSellEma100Price = tx.price;
            updated.defenseSellEma100Shares = tx.quantity;
            updated.defenseSellEma100Date = tx.date;
            updated.defenseSellEma100Fee = tx.fee;
            updated.defenseSellEma100Tax = tx.tax;
         }
       });

       return updated;
       }); // Close map
    }); // Close flatMap
  }, [stocks, transactions, strategyType]);

  const defenseStocks = useMemo(() => {
    return allStrategyStocks.filter(s => getDefenseExitStats(s).unsoldShares > 0);
  }, [allStrategyStocks]);
  
  // Auto-fetch missing MA data for stocks in this view
  useEffect(() => {
    let mounted = true;
    const fetchMissingMA = async () => {
      // Find stocks that are missing sma20 and are active in defense/nova strategy
      const needsUpdate = defenseStocks.filter(s => !s.sma20 && !attemptedMAs.current.has(s.id));
      if (needsUpdate.length === 0) return;
      
      for (const stock of needsUpdate) {
        if (!mounted) break;
        attemptedMAs.current.add(stock.id);
        try {
          const isTw = stock.market === Market.TW;
          let targetSymbol = isTw && !stock.ticker.includes('.') ? `${stock.ticker}.TW` : stock.ticker;
          
          let maRes = await fetchMADataForSymbol(targetSymbol);
          if (!maRes && isTw && targetSymbol.endsWith('.TW')) {
              maRes = await fetchMADataForSymbol(stock.ticker + '.TWO');
          }
          if (maRes && mounted) {
              onUpdateStock({
                ...stock,
                sma20: maRes.sma20,
                ema50: maRes.ema50,
                ema100: maRes.ema100,
                currentPrice: stock.currentPrice || maRes.currentPrice,
                lastUpdateDate: maRes.lastUpdateDate || stock.lastUpdateDate,
                sma20BreakdownDate: maRes.sma20BreakdownDate,
                ema50BreakdownDate: maRes.ema50BreakdownDate,
                ema100BreakdownDate: maRes.ema100BreakdownDate
              });
          }
        } catch (e) {}
      }
    };
    fetchMissingMA();
    return () => { mounted = false; };
  }, [defenseStocks, onUpdateStock]);

  const settledStocks = useMemo(() => {
    return allStrategyStocks.filter(s => getDefenseExitStats(s).unsoldShares <= 0);
  }, [allStrategyStocks]);

  const annualAnalysisStats = useMemo(() => {
    const closedTrades: any[] = [];
    const allTrades: any[] = [];
    
    // Group relevant stocks
    allStrategyStocks.forEach((stock: any) => {
      const stats = getDefenseExitStats(stock);
      const isClosed = stats.unsoldShares <= 0;

      const isUSD = stock.currency === 'USD' || (stock.market === Market.US && !stock.currency);
      const cycleTxs = stock.cycleTxs || [];
      if (cycleTxs.length === 0) return;

      let costBasisTWD = 0;
      let proceedsTWD = 0;
      let year = '';
      let lastRate = 32;

      cycleTxs.forEach((t: any) => {
         const rate = Number(t.exchangeRate) || 32;
         lastRate = rate;
         const qty = Number(t.quantity) || 0;
         if (t.type === TransactionType.BUY) {
             const cost = t.price * qty + (t.fee || 0);
             costBasisTWD += isUSD ? cost * rate : cost;
             if (!year) year = t.date.substring(0, 4); // fallback year
         } else if (t.type === TransactionType.SELL) {
             const revenue = t.price * qty - (t.fee || 0) - (t.tax || 0);
             proceedsTWD += isUSD ? revenue * rate : revenue;
             year = t.date.substring(0, 4);
         }
      });
      
      let unrealizedProceedsTWD = 0;
      if (!isClosed) {
          const currentPrice = Number(stock.currentPrice) || 0;
          const currentVal = currentPrice * stats.unsoldShares;
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
  }, [allStrategyStocks, annualAnalysisYear, strategyType]);

  // Derived calculations for Overview
  const totalMarketValue = defenseStocks.reduce((sum, s) => {
    const stats = getDefenseExitStats(s);
    return sum + ((s.currentPrice || 0) * stats.unsoldShares);
  }, 0);

  const totalInvested = defenseStocks.reduce((sum, s) => {
    const stats = getDefenseExitStats(s);
    return sum + stats.unsoldCost;
  }, 0);

  const unrealizedPnL = defenseStocks.reduce((sum, s) => {
    const stats = getDefenseExitStats(s);
    return sum + (((s.currentPrice || 0) * stats.unsoldShares) - stats.unsoldCost);
  }, 0);

  const realizedPnL = allStrategyStocks.reduce((sum, s) => {
    return sum + getDefenseExitStats(s).realizedPnL;
  }, 0);

  const totalPnL = unrealizedPnL + realizedPnL;
  const pnlPercentage = numTotalCapital > 0 ? (totalPnL / numTotalCapital) * 100 : 0;
  
  const capitalUtilization = numTotalCapital > 0 ? (totalInvested / numTotalCapital) * 100 : 0;
  
  const totalRiskExposure = defenseStocks.reduce((sum, s) => {
    const stats = getDefenseExitStats(s);
    const stopP = Number(s.defenseStopLoss) || 0;
    if (stats.buyPrice && stopP && stats.unsoldShares) {
      return sum + ((stats.buyPrice - stopP) * stats.unsoldShares);
    }
    return sum;
  }, 0);
  
  const riskExposurePercentage = numTotalCapital > 0 ? (totalRiskExposure / numTotalCapital) * 100 : 0;

  // All Unrealized PnL
  const allUnrealizedPnL = [...defenseStocks]
    .map(s => {
      const stats = getDefenseExitStats(s);
      return {
        ...s,
        pnl: ((s.currentPrice || 0) - stats.buyPrice) * stats.unsoldShares,
        pnlPerc: stats.buyPrice ? (((s.currentPrice || 0) - stats.buyPrice) / stats.buyPrice) * 100 : 0,
        unsoldShares: stats.unsoldShares
      };
    })
    .filter(s => s.unsoldShares > 0)
    .sort((a, b) => b.pnl - a.pnl);

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    try {
      const updatePromises = defenseStocks.map(async (stock) => {
        try {
          const isTw = stock.market === Market.TW;
          const symbol = isTw && !stock.ticker.includes('.') ? `${stock.ticker}.TW` : stock.ticker;
          
          let quoteData = null;
          // Use fetchMADataForSymbol which internally fetches history and gives currentPrice, sma20, ema50, ema100
          
          let targetSymbol = symbol;
          let maRes = null;
          
          if (typeof window !== 'undefined' && (window as any).electronAPI) {
              const res = await (window as any).electronAPI.fetchYahooQuote(symbol);
              if (res.data) quoteData = { currentPrice: res.data.regularMarketPrice };
              else if (isTw) {
                  const otcRes = await (window as any).electronAPI.fetchYahooQuote(stock.ticker + '.TWO');
                  if (otcRes.data) {
                      quoteData = { currentPrice: otcRes.data.regularMarketPrice };
                      targetSymbol = stock.ticker + '.TWO';
                  }
              }
              
              // Also try to get MA data robustly
              try {
                  maRes = await fetchMADataForSymbol(targetSymbol);
                  if (!maRes && isTw && targetSymbol.endsWith('.TW')) {
                      maRes = await fetchMADataForSymbol(stock.ticker + '.TWO');
                  }
                  if (maRes) {
                     quoteData = { ...quoteData, ...maRes, currentPrice: quoteData?.currentPrice || maRes.currentPrice };
                  }
              } catch(e) {}
          } else {
              maRes = await fetchMADataForSymbol(targetSymbol);
              if (!maRes && isTw && targetSymbol.endsWith('.TW')) {
                  maRes = await fetchMADataForSymbol(stock.ticker + '.TWO');
                  if (maRes) targetSymbol = stock.ticker + '.TWO';
              }
              if (maRes) {
                 quoteData = maRes;
              } else {
                 const apiRes = await fetchCurrentYahooQuote(symbol);
                 if (apiRes.success && apiRes.regularMarketPrice) {
                     quoteData = { currentPrice: apiRes.regularMarketPrice };
                 } else if (isTw) {
                     const otcApiRes = await fetchCurrentYahooQuote(stock.ticker + '.TWO');
                     if (otcApiRes.success && otcApiRes.regularMarketPrice) {
                         quoteData = { currentPrice: otcApiRes.regularMarketPrice };
                     }
                 }
              }
          }

          if (quoteData && quoteData.currentPrice) {
             onUpdateStock({
               ...stock,
               currentPrice: quoteData.currentPrice,
               sma20: quoteData.sma20,
               ema50: quoteData.ema50,
               ema100: quoteData.ema100,
               lastUpdateDate: quoteData.lastUpdateDate || stock.lastUpdateDate,
               sma20BreakdownDate: quoteData.sma20BreakdownDate || stock.sma20BreakdownDate,
               ema50BreakdownDate: quoteData.ema50BreakdownDate || stock.ema50BreakdownDate,
               ema100BreakdownDate: quoteData.ema100BreakdownDate || stock.ema100BreakdownDate
             });
          }
        } catch (e) {
          console.warn('Failed to update', stock.ticker, e);
        }
      });
      
      await Promise.all(updatePromises);
      
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSyncTransactions = () => {
    setIsRefreshing(true);
    // Data is now dynamically mapped in allStrategyStocks memo hook
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDisplayFiltered = useMemo(() => {
    let list = activeTab === 'positions' ? defenseStocks : settledStocks;
    if (marketFilter !== 'ALL') list = list.filter(s => s.market === marketFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(s => s.ticker.toLowerCase().includes(term) || s.name.toLowerCase().includes(term));
    }
    
    // Sort by strategyDate
    list = [...list].sort((a, b) => {
        const timeA = a.strategyDate ? new Date(a.strategyDate).getTime() : 0;
        const timeB = b.strategyDate ? new Date(b.strategyDate).getTime() : 0;
        return sortDateOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    return list;
  }, [defenseStocks, settledStocks, marketFilter, searchTerm, activeTab, sortDateOrder]);

  const triggeredStocks = useMemo(() => {
    return defenseStocks.filter(s => {
      const stats = getDefenseExitStats(s);
      if (stats.unsoldShares <= 0) return false;
      const currentPrice = Number(s.currentPrice);
      const stopLoss = Number(s.defenseStopLoss);
      return !isNaN(currentPrice) && currentPrice > 0 && !isNaN(stopLoss) && stopLoss > 0 && currentPrice <= stopLoss;
    });
  }, [defenseStocks]);

  const profitTakingStocks = useMemo(() => {
    return defenseStocks.filter(s => {
      const currentPrice = Number(s.currentPrice);
      if (isNaN(currentPrice) || currentPrice <= 0) return false;
      
      const buyPrice = Number(s.defenseBuyPrice || 0);

      const stats = getDefenseExitStats(s);
      if (stats.unsoldShares <= 0) return false;

      // Only give take-profit alerts if we are actually in profit (at least 20%)
      if (currentPrice <= buyPrice * 1.2) return false;

      // Ensure they actually have a position remaining and haven't fully recorded this target
      const belowSma20 = !s.defenseSellSma20Price && s.sma20 && currentPrice < s.sma20;
      const belowEma50 = !s.defenseSellEma50Price && s.ema50 && currentPrice < s.ema50;
      const belowEma100 = !s.defenseSellEma100Price && s.ema100 && currentPrice < s.ema100;

      return belowSma20 || belowEma50 || belowEma100;
    }).map(s => {
        const stats = getDefenseExitStats(s);
        const currentPrice = Number(s.currentPrice);
        const triggers = [];
        const breakdownDates = [];
        if (!s.defenseSellSma20Price && s.sma20 && currentPrice < s.sma20) {
            triggers.push(`SMA20 ($${s.sma20.toFixed(2)})`);
            if (s.sma20BreakdownDate) breakdownDates.push(`SMA20於 ${s.sma20BreakdownDate} 跌破`);
        }
        if (!s.defenseSellEma50Price && s.ema50 && currentPrice < s.ema50) {
            triggers.push(`EMA50 ($${s.ema50.toFixed(2)})`);
            if (s.ema50BreakdownDate) breakdownDates.push(`EMA50於 ${s.ema50BreakdownDate} 跌破`);
        }
        if (!s.defenseSellEma100Price && s.ema100 && currentPrice < s.ema100) {
            triggers.push(`EMA100 ($${s.ema100.toFixed(2)})`);
            if (s.ema100BreakdownDate) breakdownDates.push(`EMA100於 ${s.ema100BreakdownDate} 跌破`);
        }
        return { ...s, triggers, breakdownDates };
    });
  }, [defenseStocks]);


  const slowProfitStocks = useMemo(() => {
    return defenseStocks.filter(s => {
      const stats = getDefenseExitStats(s);
      if (stats.unsoldShares <= 0) return false;
      
      const currentPrice = Number(s.currentPrice);
      if (isNaN(currentPrice) || currentPrice <= 0) return false;
      const buyPrice = Number(s.defenseBuyPrice || 0);
      if (buyPrice <= 0) return false;
      
      if (!s.strategyDate) return false;
      const tradingDays = getTradingDaysCount(s.strategyDate);
      
      const profitPerc = (currentPrice - buyPrice) / buyPrice;
      
      return tradingDays >= 40 && profitPerc < 0.20;
    }).map(s => {
        const currentPrice = Number(s.currentPrice);
        const buyPrice = Number(s.defenseBuyPrice || 0);
        const profitPerc = ((currentPrice - buyPrice) / buyPrice) * 100;
        const tradingDays = getTradingDaysCount(s.strategyDate!);
        return { ...s, profitPerc, tradingDays };
    });
  }, [defenseStocks]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full mx-auto">
      
      {triggeredStocks.length > 0 && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-top-2 flex flex-col gap-2">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-bold text-rose-800">
                停損提示：有持倉標的已經到達停損價格！
              </h3>
              <div className="mt-2 text-sm text-rose-700">
                <ul className="list-disc pl-5 space-y-1 font-mono font-medium">
                  {triggeredStocks.map(s => (
                    <li key={s.id}>
                      {s.name} ({s.ticker}) - 目前市價: <span className="font-bold">${s.currentPrice !== undefined ? formatMarketPrice(Number(s.currentPrice), s.market) : 0}</span>, 停損價: <span className="font-bold text-rose-800">${Number(s.defenseStopLoss).toFixed(2)}</span>
                      {s.lastUpdateDate && <span className="text-xs text-rose-600/70 ml-2">(事件發生日: {s.lastUpdateDate})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {profitTakingStocks.length > 0 && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-top-2 mt-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <TrendingUp className="h-5 w-5 text-blue-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-bold text-blue-800">
                獲利出場提示：股價已跌破設定均線，建議部分停利！
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <ul className="list-disc pl-5 space-y-1 font-mono font-medium">
                  {profitTakingStocks.map(s => (
                    <li key={s.id}>
                      {s.name} ({s.ticker}) - 目前市價: <span className="font-bold">${s.currentPrice !== undefined ? formatMarketPrice(Number(s.currentPrice), s.market) : 0}</span>, 跌破: <span className="font-bold text-blue-800">{s.triggers.join(', ')}</span>
                      {s.breakdownDates && s.breakdownDates.length > 0 && (
                          <div className="text-xs text-blue-600/70 mt-0.5 ml-2">
                             ({s.breakdownDates.join(' / ')})
                          </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {slowProfitStocks.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-top-2 mt-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-bold text-amber-800">
                持倉時間提示：部位持有超過 40 個交易日，且獲利未達 20%！
              </h3>
              <div className="mt-2 text-sm text-amber-700">
                <ul className="list-disc pl-5 space-y-1 font-mono font-medium">
                  {slowProfitStocks.map(s => (
                    <li key={s.id}>
                      {s.name} ({s.ticker}) - 持有 <span className="font-bold text-amber-800">{s.tradingDays}</span> 個交易日, 目前獲利: <span className="font-bold">{s.profitPerc.toFixed(1)}%</span>
                      {s.lastUpdateDate && <span className="text-xs text-amber-700/70 ml-2">(資料日期: {s.lastUpdateDate})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-200/60 shadow-sm bg-white/70 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className={`${strategyType === 'NOVA' ? 'bg-fuchsia-600 shadow-fuchsia-500/20' : 'bg-blue-600 shadow-blue-500/20'} p-2 rounded-xl text-white shadow-md`}>
            <LayoutGrid size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
             {strategyType === 'NOVA' ? 'Nova策略 交易紀錄' : '動態平衡策略'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {onAddTransaction && (
            <button 
              onClick={() => onAddTransaction(undefined, undefined, strategyType)}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-1 text-sm font-bold shadow-sm hover:shadow-md transition-all"
            >
              <Plus size={16} /><span>(股)記一筆</span>
            </button>
          )}
          <button 
            onClick={() => setIsAddingStock(true)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold bg-slate-800 text-white rounded-xl transition-all hover:bg-slate-700 shadow-sm`}
          >
            <Plus size={16} /> 快速新增標的
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>
          <button 
            onClick={handleSyncTransactions}
            disabled={isRefreshing}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold bg-slate-50 border rounded-xl transition-all disabled:opacity-50 ${strategyType === 'NOVA' ? 'text-fuchsia-600 border-fuchsia-100 hover:bg-fuchsia-50' : 'text-blue-600 border-blue-100 hover:bg-blue-100'}`}
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} /> 同步交易紀錄
          </button>
          
          <button 
            onClick={handleRefreshPrices}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} /> 本地更新股價
          </button>
          <div className="h-6 w-px bg-slate-200 mx-2"></div>
          
          <button 
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'overview' ? `bg-white shadow-sm border border-slate-200 ${strategyType === 'NOVA' ? 'text-fuchsia-600' : 'text-blue-600'}` : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <LayoutGrid size={16} /> 總覽
          </button>
          <button 
            onClick={() => setActiveTab('positions')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'positions' ? `bg-white shadow-sm border border-slate-200 ${strategyType === 'NOVA' ? 'text-fuchsia-600' : 'text-blue-600'}` : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <List size={16} /> 部位管理
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'history' ? `bg-white shadow-sm border border-slate-200 ${strategyType === 'NOVA' ? 'text-fuchsia-600' : 'text-blue-600'}` : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings size={16} /> 已結清
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'settings' ? `bg-white shadow-sm border border-slate-200 ${strategyType === 'NOVA' ? 'text-fuchsia-600' : 'text-blue-600'}` : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings size={16} /> 設定
          </button>
          <button 
            onClick={() => setActiveTab('targets')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'targets' ? `bg-white shadow-sm border border-slate-200 ${strategyType === 'NOVA' ? 'text-fuchsia-600' : 'text-blue-600'}` : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings size={16} /> 標的管理
          </button>
        </div>
      </div>

      {isAddingStock && (
        <QuickAddStockModal 
          onClose={() => setIsAddingStock(false)}
          onAddStock={onAddStock}
          marketFilter={marketFilter}
          suggestedCategory={strategyType === 'DEFENSE' ? '動態平衡策略' : 'Nova策略'}
          strategy={strategyType}
        />
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in slide-in-from-right-4">
          <div className="mb-2">
            <h2 className="text-xl font-bold text-slate-800">總覽摘要</h2>
            <p className="text-sm text-slate-500 mt-1">檢視您的投資組合整體表現與風險暴露程度</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="glass-panel p-6 rounded-2xl border border-slate-200/60 bg-white/60">
              <p className="text-sm font-semibold text-slate-500 mb-2">帳戶總損益</p>
              <p className={`text-3xl font-black mb-1 ${totalPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                ${totalPnL >= 0 ? '+' : ''}{Math.round(totalPnL).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 font-medium">佔本金 {totalPnL > 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%</p>
            </div>
            
            <div className="glass-panel p-6 rounded-2xl border border-slate-200/60 bg-white/60">
              <p className="text-sm font-semibold text-slate-500 mb-2">未實現損益</p>
              <p className={`text-3xl font-black mb-1 ${unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                ${unrealizedPnL >= 0 ? '+' : ''}{Math.round(unrealizedPnL).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 font-medium">持倉中部位的浮動損益</p>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-slate-200/60 bg-white/60">
              <p className="text-sm font-semibold text-slate-500 mb-2">已實現損益</p>
              <p className={`text-3xl font-black mb-1 ${realizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                ${realizedPnL >= 0 ? '+' : ''}{Math.round(realizedPnL).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 font-medium">已結清部位的實際獲利</p>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-slate-200/60 bg-white/60">
              <p className="text-sm font-semibold text-slate-500 mb-2">總持有市值</p>
              <p className="text-3xl font-black mb-1 text-slate-800">
                ${Math.round(totalMarketValue).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 font-medium">投入成本 ${Math.round(totalInvested).toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 glass-panel p-6 rounded-2xl border border-slate-200/60 bg-white/60">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp size={20} className="text-blue-500" />
                <h3 className="font-bold text-slate-800">所有未實現獲利/虧損</h3>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {allUnrealizedPnL.length > 0 ? allUnrealizedPnL.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                     <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{s.name}</span>
                        <span className="text-xs text-slate-500 font-mono">{s.ticker}</span>
                     </div>
                     <div className="text-right">
                        <p className={`font-black font-mono ${s.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                           ${s.pnl >= 0 ? '+' : ''}{Math.round(s.pnl).toLocaleString()}
                        </p>
                        <p className={`text-xs font-bold ${s.pnlPerc >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                           {s.pnlPerc >= 0 ? '+' : ''}{s.pnlPerc.toFixed(2)}%
                        </p>
                     </div>
                  </div>
                )) : (
                  <p className="text-center text-slate-400 py-8">暫無資料</p>
                )}
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-slate-200/60 bg-white/60">
              <div className="flex items-center gap-2 mb-6">
                <AlertCircle size={20} className="text-blue-500" />
                <h3 className="font-bold text-slate-800">風險概況</h3>
              </div>
              <p className="text-xs text-slate-500 mb-6">總體資金的曝險與運用</p>
              
              <div className="space-y-6">
                 <div>
                    <div className="flex justify-between items-end mb-2">
                       <span className="text-sm font-semibold text-slate-600">資金使用率</span>
                       <span className="text-sm font-black text-slate-800 font-mono">{capitalUtilization.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                       <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{width: `${Math.min(100, capitalUtilization)}%`}}></div>
                    </div>
                 </div>

                 <div>
                    <div className="flex justify-between items-end mb-2">
                       <span className="text-sm font-semibold text-slate-600 flex flex-col">
                          總體風險暴露 <span className="text-xs text-slate-400 font-normal">(停損預估損失)</span>
                       </span>
                       <div className="text-right">
                          <span className="text-sm font-black text-slate-800 font-mono block">${Math.round(totalRiskExposure).toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400">佔總本金 {riskExposurePercentage.toFixed(2)}%</span>
                       </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                       <div className={`h-2.5 rounded-full transition-all ${riskExposurePercentage > 5 ? 'bg-rose-500' : riskExposurePercentage > 2 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{width: `${Math.min(100, riskExposurePercentage * 10)}%`}}></div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(activeTab === 'positions' || activeTab === 'history') && (
        <div className="space-y-6 animate-in slide-in-from-right-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800">{activeTab === 'positions' ? '部位管理' : '已結清部位'}</h2>
              <p className="text-sm text-slate-500 mt-1">{activeTab === 'positions' ? '記錄並追蹤您所有的交易部位' : '已完全結清出場的歷史部位'}</p>
            </div>
          </div>

          {activeTab === 'history' && (
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
                    <option key={y} value={y}>{y} 年</option>
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
                    <td className="py-2 px-1 border border-black">總獲利(TWD)</td>
                    <td className="py-2 px-1 border border-black">總虧損(TWD)</td>
                    <td className="py-2 px-1 border border-black bg-white"></td>
                  </tr>
                  <tr className="bg-white text-gray-900 font-semibold text-[20px]">
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.winCount}</td>
                    <td className="py-2.5 px-1 border border-black">{annualAnalysisStats.lossCount}</td>
                    <td className="py-2.5 px-1 border border-black text-emerald-600">{Math.round(annualAnalysisStats.totalProfitTWD).toLocaleString()}</td>
                    <td className="py-2.5 px-1 border border-black text-rose-600">{Math.round(annualAnalysisStats.totalLossTWD).toLocaleString()}</td>
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

          <div className="glass-panel rounded-2xl bg-white shadow-sm border border-slate-200/60 overflow-hidden">
             
             <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4 bg-slate-50/50">
               <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    {activeTab === 'positions' ? `持倉中部位 (${handleDisplayFiltered.length})` : `已結清 (${handleDisplayFiltered.length})`}
                  </span>
               </div>
               <div className="relative w-full md:w-64">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                 <input 
                   type="text" 
                   placeholder="搜尋股號/名稱..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl w-full focus:ring-2 focus:ring-blue-500 outline-none"
                 />
               </div>
             </div>

             <div className="overflow-x-auto pb-4">
                <table className="w-full text-left border-collapse min-w-[1400px]">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 text-xs font-bold leading-tight">
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white min-w-[110px]">股號/名稱</th>
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-center">策略</th>
                        <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-center">策略成立<br/>日期</th>
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-center">
                          <button onClick={() => setSortDateOrder(prev => prev === 'asc' ? 'desc' : 'asc')} className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors mx-auto">
                              買入日期
                              <ArrowUpDown size={12} className={sortDateOrder === 'desc' ? "text-blue-600" : "opacity-40"} />
                          </button>
                       </th>
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-right">買均價</th>
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-right">起初<br/>總股數</th>
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-right">起初<br/>總成本</th>
                       <th rowSpan={1} colSpan={3} className="px-3 py-1.5 border-r border-slate-200 text-center bg-rose-50 text-rose-700">止損出場相關</th>
                       <th rowSpan={1} colSpan={9} className="px-3 py-1.5 border-r border-slate-200 text-center bg-blue-50 text-blue-700">獲利出場相關</th>
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-right text-indigo-700">未出清<br/>股數</th>
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-right text-indigo-700">未結清<br/>成本</th>
                       <th rowSpan={3} className="px-3 py-2 border-r border-slate-200 bg-white text-right w-24">現價</th>
                       <th rowSpan={3} className="px-3 py-2 bg-white text-right w-24">未實現損益(TWD) /<br/>已實現損益(TWD)</th>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-medium leading-tight">
                       <th colSpan={3} className="px-2 py-1 border-r border-slate-200 text-center bg-rose-50/50">止損比例 (100%)</th>
                       <th colSpan={3} className="px-2 py-1 border-r border-slate-200 text-center bg-blue-50/50">SMA20 (25%)</th>
                       <th colSpan={3} className="px-2 py-1 border-r border-slate-200 text-center bg-blue-50/50">EMA50 (50%)</th>
                       <th colSpan={3} className="px-2 py-1 border-r border-slate-200 text-center bg-blue-50/50">EMA100 (25%)</th>
                    </tr>
                    <tr className="bg-white border-b border-slate-200 text-slate-500 text-[10px] font-medium leading-tight">
                       <th className="px-2 py-1 text-right bg-rose-50/30 border-r border-slate-100">設定<br/>止損價</th>
                       <th className="px-2 py-1 text-right bg-rose-50/30 border-r border-slate-100">實際<br/>止損價</th>
                       <th className="px-2 py-1 text-center bg-rose-50/30 border-r border-slate-200">止損日</th>

                       <th className="px-2 py-1 text-right bg-blue-50/30 border-r border-slate-100">賣出價</th>
                       <th className="px-2 py-1 text-right bg-blue-50/30 border-r border-slate-100">估計<br/>股數</th>
                       <th className="px-2 py-1 text-center bg-blue-50/30 border-r border-slate-200">賣出日</th>
                       
                       <th className="px-2 py-1 text-right bg-blue-50/30 border-r border-slate-100">賣出價</th>
                       <th className="px-2 py-1 text-right bg-blue-50/30 border-r border-slate-100">估計<br/>股數</th>
                       <th className="px-2 py-1 text-center bg-blue-50/30 border-r border-slate-200">賣出日</th>

                       <th className="px-2 py-1 text-right bg-blue-50/30 border-r border-slate-100">賣出價</th>
                       <th className="px-2 py-1 text-right bg-blue-50/30 border-r border-slate-100">估計<br/>股數</th>
                       <th className="px-2 py-1 text-center bg-blue-50/30 border-r border-slate-200">賣出日</th>
                    </tr>
                  </thead>
                  <tbody>
                     {handleDisplayFiltered.map(s => {
                        const stats = getDefenseExitStats(s);
                        const isSettled = stats.unsoldShares <= 0;
                        const currP = Number(s.currentPrice) || 0;
                        
                        const pnl = isSettled ? stats.realizedPnL : (((currP * stats.unsoldShares) - stats.unsoldCost) + stats.realizedPnL);

                        return (
                           <tr key={s.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isSettled ? 'opacity-60 saturate-50' : ''}`}>
                              <td className="px-3 py-3 border-r border-slate-100 bg-white min-w-[110px]">
                                 <div className="flex flex-col">
                                    <span className="font-bold text-slate-800 text-sm">{s.name}</span>
                                    <span className="text-xs text-slate-500 font-mono">{s.ticker}</span>
                                 </div>
                              </td>
                              <td className="px-3 py-3 border-r border-slate-100 text-center bg-white">
                                 <div className="flex flex-col gap-1 items-center">
                                    {strategyType === 'NOVA' ? (
                                      s.novaPattern ? (
                                        <span className="px-2 py-0.5 bg-fuchsia-50 text-fuchsia-600 text-[10px] font-bold rounded-md border border-fuchsia-100">
                                          {s.novaPattern === 'C1_BREAKOUT' ? '已突破高點' : 
                                           s.novaPattern === 'C2_READY' ? '準備突破高點' :
                                           s.novaPattern === 'C3_RETEST' ? '突破後回測再突破' : 
                                           s.novaPattern === 'NONE' ? '無型態' : s.novaPattern}
                                        </span>
                                      ) : <span className="text-slate-400 text-[10px]">-</span>
                                    ) : (
                                      <>
                                        {s.isLongTerm && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-md border border-indigo-100">長期</span>}
                                        {s.isShortTerm && <span className="px-2 py-0.5 bg-violet-50 text-violet-600 text-[10px] font-bold rounded-md border border-violet-100">短期</span>}
                                        {!s.isLongTerm && !s.isShortTerm && <span className="text-slate-400 text-[10px]">-</span>}
                                      </>
                                    )}
                                 </div>
                              </td>
                              <td className="px-3 py-3 border-r border-slate-100 text-center bg-white">
                                 {s.strategySetupTime ? (
                                    <span className="px-2 py-0.5 bg-slate-50 text-slate-600 text-[10px] font-mono font-bold rounded-md border border-slate-100">
                                      {s.strategySetupTime.replace(/-/g, '')}
                                    </span>
                                 ) : (
                                    <span className="text-slate-400 text-[10px]">-</span>
                                 )}
                              </td>
                              <td className="px-3 py-3 border-r border-slate-100 text-center bg-white">
                                 <span className="text-xs text-slate-600 font-mono" title={s.strategyDate}>{s.strategyDate?.slice(0, 10) || ''}</span>
                              </td>
                              <td className="px-3 py-3 border-r border-slate-100 text-right bg-white">
                                 <div className="text-sm font-mono font-bold text-slate-800">${s.defenseBuyPrice ?? 0}</div>
                              </td>
                              <td className="px-3 py-3 border-r border-slate-200 text-right bg-white">
                                 <div className="text-sm font-mono font-bold text-slate-600">{stats.initialShares}</div>
                              </td>
                              <td className="px-3 py-3 border-r border-slate-200 text-right bg-white">
                                 <div className="text-sm font-mono font-bold text-slate-600">${Math.round(stats.initialTotalCost).toLocaleString()}</div>
                              </td>

                              <td className="px-2 py-3 border-r border-slate-100 text-right bg-rose-50/20">
                                 <div className="text-sm font-mono font-bold text-rose-500">${s.defenseStopLoss ?? '-'}</div>
                              </td>
                              <td className="px-2 py-3 border-r border-slate-100 text-right bg-rose-50/20">
                                 <div className="text-sm font-mono font-medium text-rose-600">{s.defenseSellStopLossPrice ? `$${s.defenseSellStopLossPrice}` : '-'}</div>
                              </td>
                              <td className="px-2 py-3 border-r border-slate-200 text-center bg-rose-50/20">
                                 <div className="text-xs font-mono text-slate-500">{s.defenseSellStopLossDate?.slice(5) || '-'}</div>
                              </td>

                              <td className="px-2 py-3 border-r border-slate-100 text-right bg-blue-50/20">
                                 <div className="flex justify-end gap-2 items-center">
                                     {s.sma20 ? (
                                         <div className="flex flex-col items-end" title="最新SMA20數值 (跌破即建議停利)">
                                            <span className="text-[9px] text-blue-400 font-bold leading-none mb-0.5">MA20</span>
                                            <span className="text-xs font-mono font-bold bg-blue-100/50 text-blue-700 px-1 py-0.5 rounded border border-blue-200">
                                               {s.sma20.toFixed(2)}
                                            </span>
                                         </div>
                                     ) : <span className="text-slate-400 text-[10px] scale-90">查無資料</span>}
                                     {s.defenseSellSma20Price && (
                                         <div className="flex flex-col items-end border-l border-blue-100 pl-2">
                                            <span className="text-[9px] text-blue-500/80 font-bold leading-none mb-0.5">賣出價</span>
                                            <span className="text-sm font-mono font-medium text-blue-600">
                                                ${s.defenseSellSma20Price}
                                            </span>
                                         </div>
                                     )}
                                 </div>
                              </td>
                              <td className="px-2 py-3 border-r border-slate-100 text-right bg-blue-50/20">
                                 <div className="text-sm font-mono text-slate-600">{stats.estSma20Shares}</div>
                              </td>
                              <td className="px-2 py-3 border-r border-slate-200 text-center bg-blue-50/20">
                                 <div className="text-xs font-mono text-slate-500">{s.defenseSellSma20Date?.slice(5) || '-'}</div>
                              </td>

                              <td className="px-2 py-3 border-r border-slate-100 text-right bg-blue-50/20">
                                 <div className="flex justify-end gap-2 items-center">
                                     {s.ema50 ? (
                                         <div className="flex flex-col items-end" title="最新EMA50數值 (跌破即建議停利)">
                                            <span className="text-[9px] text-blue-400 font-bold leading-none mb-0.5">EMA50</span>
                                            <span className="text-xs font-mono font-bold bg-blue-100/50 text-blue-700 px-1 py-0.5 rounded border border-blue-200">
                                               {s.ema50.toFixed(2)}
                                            </span>
                                         </div>
                                     ) : <span className="text-slate-400 text-[10px] scale-90">查無資料</span>}
                                     {s.defenseSellEma50Price && (
                                         <div className="flex flex-col items-end border-l border-blue-100 pl-2">
                                            <span className="text-[9px] text-blue-500/80 font-bold leading-none mb-0.5">賣出價</span>
                                            <span className="text-sm font-mono font-medium text-blue-600">
                                                ${s.defenseSellEma50Price}
                                            </span>
                                         </div>
                                     )}
                                 </div>
                              </td>
                              <td className="px-2 py-3 border-r border-slate-100 text-right bg-blue-50/20">
                                 <div className="text-sm font-mono text-slate-600">{stats.estEma50Shares}</div>
                              </td>
                              <td className="px-2 py-3 border-r border-slate-200 text-center bg-blue-50/20">
                                 <div className="text-xs font-mono text-slate-500">{s.defenseSellEma50Date?.slice(5) || '-'}</div>
                              </td>

                              <td className="px-2 py-3 border-r border-slate-100 text-right bg-blue-50/20">
                                 <div className="flex justify-end gap-2 items-center">
                                     {s.ema100 ? (
                                         <div className="flex flex-col items-end" title="最新EMA100數值 (跌破即建議停利)">
                                            <span className="text-[9px] text-blue-400 font-bold leading-none mb-0.5">EMA100</span>
                                            <span className="text-xs font-mono font-bold bg-blue-100/50 text-blue-700 px-1 py-0.5 rounded border border-blue-200">
                                               {s.ema100.toFixed(2)}
                                            </span>
                                         </div>
                                     ) : <span className="text-slate-400 text-[10px] scale-90">查無資料</span>}
                                     {s.defenseSellEma100Price && (
                                         <div className="flex flex-col items-end border-l border-blue-100 pl-2">
                                            <span className="text-[9px] text-blue-500/80 font-bold leading-none mb-0.5">賣出價</span>
                                            <span className="text-sm font-mono font-medium text-blue-600">
                                                ${s.defenseSellEma100Price}
                                            </span>
                                         </div>
                                     )}
                                 </div>
                              </td>
                              <td className="px-2 py-3 border-r border-slate-100 text-right bg-blue-50/20">
                                 <div className="text-sm font-mono text-slate-600">{stats.estEma100Shares}</div>
                              </td>
                              <td className="px-2 py-3 border-r border-slate-200 text-center bg-blue-50/20">
                                 <div className="text-xs font-mono text-slate-500">{s.defenseSellEma100Date?.slice(5) || '-'}</div>
                              </td>

                              <td className="px-3 py-3 border-r border-slate-200 text-right bg-white">
                                 <div className="text-sm font-mono font-bold text-indigo-600">{stats.unsoldShares}</div>
                              </td>
                              <td className="px-3 py-3 border-r border-slate-200 text-right bg-white">
                                 <div className="text-sm font-mono font-bold text-indigo-600">${Math.round(stats.unsoldCost).toLocaleString()}</div>
                              </td>

                              <td className="px-3 py-3 border-r border-slate-200 text-right font-mono font-bold text-slate-700 bg-white">
                                 ${s.currentPrice !== undefined ? formatMarketPrice(s.currentPrice, s.market) : 0}
                              </td>
                              
                              <td className="px-3 py-3 text-right bg-white font-bold">
                                 <p className={`text-sm font-black font-mono ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    ${pnl >= 0 ? '+' : ''}{Math.round(pnl).toLocaleString()}
                                 </p>
                              </td>
                           </tr>
                        );
                     })}
                     {handleDisplayFiltered.length === 0 && (
                        <tr>
                           <td colSpan={14} className="py-12 text-center text-slate-400">目前沒有相關部位。</td>
                        </tr>
                     )}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in slide-in-from-right-4">
          <h2 className="text-xl font-bold text-slate-800">策略設定</h2>
          <div className="glass-panel p-8 rounded-2xl max-w-xl border border-slate-200 shadow-sm bg-white">
             <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">準備本金總額</label>
                  <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                     <input 
                        type="number"
                        value={totalCapital}
                        onChange={(e) => setTotalCapital(e.target.value)}
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-8 pr-4 font-mono font-bold text-slate-800 focus:ring-2 outline-none transition-all ${strategyType === 'NOVA' ? 'focus:ring-fuchsia-500' : 'focus:ring-blue-500'}`}
                     />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">設定此策略可以動用的總本金。</p>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">風平係數 (單筆風險比例) %</label>
                  <div className="relative">
                     <input 
                        type="number"
                        step="0.1"
                        value={riskFactor}
                        onChange={(e) => setRiskFactor(e.target.value)}
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-mono font-bold text-slate-800 focus:ring-2 outline-none transition-all ${strategyType === 'NOVA' ? 'focus:ring-fuchsia-500' : 'focus:ring-blue-500'}`}
                     />
                     <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">例如 1% 時，若本金為 70萬，單筆最大停損風險設定為 7,000 元。</p>
                </div>

                <div className={`mt-8 pt-6 flex items-center justify-between p-4 rounded-xl ${strategyType === 'NOVA' ? 'bg-fuchsia-50' : 'bg-blue-50'}`}>
                   <span className={`font-bold ${strategyType === 'NOVA' ? 'text-fuchsia-800' : 'text-blue-800'}`}>目前單筆風險限制資金:</span>
                   <span className={`text-2xl font-black font-mono ${strategyType === 'NOVA' ? 'text-fuchsia-600' : 'text-blue-600'}`}>${Math.round(riskCapital).toLocaleString()}</span>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'targets' && (
        <div className="animate-in slide-in-from-right-4 pt-4">
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
      )}
    </div>
  );
};

export default React.memo(ValueDefenseTable);
