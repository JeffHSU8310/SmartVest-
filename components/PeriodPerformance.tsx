import React, { useState, useEffect } from 'react';
import { PortfolioItem, Transaction, TransactionType } from '../types';
import { fetchHistoricalPrice } from '../utils';
import { Activity, Clock, TrendingUp, TrendingDown, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  portfolio: PortfolioItem[];
  transactions: Transaction[];
  exchangeRate: number;
}

export default function PeriodPerformance({ portfolio, transactions, exchangeRate }: Props) {
  const [loading, setLoading] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [data, setData] = useState<{
    '1W': { returnPercent: number, returnValue: number, label: string } | null;
    '1M': { returnPercent: number, returnValue: number, label: string } | null;
    '6M': { returnPercent: number, returnValue: number, label: string } | null;
    '1Y': { returnPercent: number, returnValue: number, label: string } | null;
  }>({ '1W': null, '1M': null, '6M': null, '1Y': null });

  useEffect(() => {
    let mounted = true;
    
    const now = new Date();
    const getWeek = (date: Date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return `${d.getUTCFullYear()}-${Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7)}`;
    };

    const hash = JSON.stringify({ w: getWeek(now) });

    let useCache = false;
    // Only use cache if not explicitly refreshing
    if (forceRefresh === 0) {
        const cachedStr = localStorage.getItem('periodPerformanceCache');
        if (cachedStr) {
            try {
                const parsed = JSON.parse(cachedStr);
                if (parsed.hash === hash && parsed.data) {
                    setData(parsed.data);
                    useCache = true;
                }
            } catch (e) {
                // ignore
            }
        }
    }

    const calculatePerformance = async () => {
      setLoading(true);
      try {
      const now = new Date();
      
      // Week (Mon-Fri)
      const currentDayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const lastMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDayOfWeek - 6);
      const lastFriday = new Date(lastMonday.getFullYear(), lastMonday.getMonth(), lastMonday.getDate() + 4);
      const prevMonday = new Date(lastMonday.getFullYear(), lastMonday.getMonth(), lastMonday.getDate() - 7);
      const prevFriday = new Date(prevMonday.getFullYear(), prevMonday.getMonth(), prevMonday.getDate() + 4);

      // Month
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);

      // Half Year
      const currentHalf = now.getMonth() < 6 ? 1 : 2; // In July (month=6), currentHalf is 2
      const lastHalfStart = currentHalf === 1 ? new Date(now.getFullYear() - 1, 6, 1) : new Date(now.getFullYear(), 0, 1);
      const lastHalfEnd = currentHalf === 1 ? new Date(now.getFullYear() - 1, 11, 31) : new Date(now.getFullYear(), 5, 30);
      const prevHalfStart = currentHalf === 1 ? new Date(now.getFullYear() - 1, 0, 1) : new Date(now.getFullYear() - 1, 6, 1);
      const prevHalfEnd = currentHalf === 1 ? new Date(now.getFullYear() - 1, 5, 30) : new Date(now.getFullYear() - 1, 11, 31);

      // Year
      const currentYearStart = new Date(now.getFullYear(), 0, 1);
      const currentYearEnd = new Date(now.getFullYear(), 11, 31);
      const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const prevYearEnd = new Date(now.getFullYear() - 1, 11, 31);

      const periods = [
        { key: '1W', label: `${lastMonday.getMonth()+1}/${lastMonday.getDate()}~${lastFriday.getMonth()+1}/${lastFriday.getDate()}`, startDate: lastMonday, endDate: lastFriday },
        { key: '1M', label: `${lastMonthStart.getMonth() + 1}月`, startDate: lastMonthStart, endDate: lastMonthEnd },
        { key: '6M', label: `${lastHalfStart.getFullYear()}${lastHalfStart.getMonth()===0?'上':'下'}半年度`, startDate: lastHalfStart, endDate: lastHalfEnd },
        { key: '1Y', label: `${currentYearStart.getFullYear()}年度`, startDate: currentYearStart, endDate: currentYearEnd }
      ];

      const relevantPortfolio = portfolio.filter(p => {
        // Include if currently held OR had any past transactions 
        return p.totalShares > 0 || transactions.some(t => t.stockId === p.stock.id);
      });
      
      const results: any = { '1W': null, '1M': null, '6M': null, '1Y': null };

      for (const period of periods) {
        const formatDateStr = (d: Date) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        const startDateStr = formatDateStr(period.startDate);
        const endDateStr = formatDateStr(period.endDate);
        
        let beginningValue = 0;
        let netAdditions = 0;
        let totalCashIn = 0;
        let endingValue = 0;

        for (const item of relevantPortfolio) {
           const symbol = item.stock.ticker || item.stock.id;
           const isUS = item.stock.market === 'US' || item.stock.currency === 'USD';
           const exRate = isUS ? exchangeRate : 1;

           const getSharesAndTxs = (dateStr: string) => {
               const txs = transactions.filter(t => t.stockId === item.stock.id && t.date <= dateStr);
               let shares = 0;
               txs.forEach(t => {
                   if (t.type === TransactionType.BUY) shares += t.quantity;
                   else if (t.type === TransactionType.SELL) shares -= t.quantity;
                   else if (t.type === TransactionType.SPLIT) {
                       if (shares > 0 && t.quantity > 0) shares *= t.quantity;
                   }
               });
               return { shares, txs };
           };

           const { shares: endShares, txs: endTxs } = getSharesAndTxs(endDateStr);
           
           if (endShares === 0 && !transactions.some(t => t.stockId === item.stock.id && t.date > startDateStr && t.date <= endDateStr)) {
               continue;
           }

           if (endShares > 0) {
               const nowStr = formatDateStr(new Date());
               let endPrice: number | null = null;
               
               if (endDateStr >= nowStr && endShares === item.totalShares) {
                   endPrice = item.marketValue / item.totalShares;
               } else {
                   const effectiveEndDateStr = endDateStr > nowStr ? nowStr : endDateStr;
                   endPrice = await fetchHistoricalPrice(symbol, effectiveEndDateStr);
               }

               if (endPrice !== null) {
                   endingValue += (endShares * endPrice) * exRate;
               } else {
                   let fallbackPrice = item.averageCost;
                   if (fallbackPrice === 0 && endTxs.length > 0) {
                       const lastBuy = [...endTxs].reverse().find(t => t.type === TransactionType.BUY);
                       if (lastBuy) fallbackPrice = lastBuy.price;
                   }
                   endingValue += (endShares * fallbackPrice) * exRate;
               }
           }

           const { shares: startShares, txs: startTxs } = getSharesAndTxs(startDateStr);
           
           if (startShares > 0) {
               const startPrice = await fetchHistoricalPrice(symbol, startDateStr);
               if (startPrice !== null) {
                   beginningValue += (startShares * startPrice) * exRate;
               } else {
                   let fallbackPrice = item.averageCost;
                   if (fallbackPrice === 0 && startTxs.length > 0) {
                       const lastBuy = [...startTxs].reverse().find(t => t.type === TransactionType.BUY);
                       if (lastBuy) fallbackPrice = lastBuy.price;
                   }
                   beginningValue += (startShares * fallbackPrice) * exRate;
               }
           }

           const periodTxs = transactions.filter(t => t.stockId === item.stock.id && t.date > startDateStr && t.date <= endDateStr);
           periodTxs.forEach(t => {
               let val = 0;
               if (t.type === TransactionType.BUY) {
                   val = (t.price * t.quantity + (t.fee || 0));
                   totalCashIn += val * (t.exchangeRate || exRate);
               }
               else if (t.type === TransactionType.SELL) {
                   val = -(t.price * t.quantity - (t.fee || 0) - (t.tax || 0));
               }
               else if (t.type === TransactionType.DIVIDEND) {
                   val = -(t.price * t.quantity - (t.fee || 0)); 
               }

               netAdditions += val * (t.exchangeRate || exRate);
           });
        }
        
        const periodReturn = endingValue - beginningValue - netAdditions;
        const capitalBase = beginningValue + totalCashIn;
        const returnPercent = capitalBase > 0 ? (periodReturn / capitalBase) * 100 : 0;
        
        results[period.key as '1W'|'1M'|'6M'|'1Y'] = {
            returnPercent,
            returnValue: periodReturn,
            label: period.label
        };
      }
      
      if (mounted) {
        setData(results);
        localStorage.setItem('periodPerformanceCache', JSON.stringify({ hash, data: results }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (mounted) setLoading(false);
    }
  };

  if (!useCache) {
      calculatePerformance();
  }
  return () => { mounted = false; };
}, [portfolio, transactions, exchangeRate, forceRefresh]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-6">
         <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
               <Activity size={20} />
             </div>
             <div>
                <h3 className="font-bold text-slate-800 text-lg">區間績效比較 (估算)</h3>
                <p className="text-xs text-slate-500 mt-0.5">每週自動結算一次，如有更動可手動更新</p>
             </div>
         </div>
         <div className="flex items-center gap-2">
             {loading && (
               <div className="flex items-center gap-2 text-slate-500 text-sm font-bold mr-3">
                 <Loader2 size={16} className="animate-spin" />
                 <span>計算中...</span>
               </div>
             )}
             <button
                 onClick={() => setForceRefresh(prev => prev + 1)}
                 disabled={loading}
                 className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                 title="重新結算當前績效"
             >
                 <RefreshCw size={14} /> 重新計算
             </button>
         </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
         {(['1W', '1M', '6M', '1Y'] as const).map(key => {
             const periodData = data[key];
             const isLoaded = periodData !== null;
             const isPositive = isLoaded && periodData.returnPercent >= 0;
             const labels = { '1W': '上週績效', '1M': '上個月績效', '6M': '上半年度績效', '1Y': '今年度績效' };
             
             return (
                 <div key={key} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col items-center justify-center min-h-[120px]">
                     <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{isLoaded ? periodData.label : labels[key]}</div>
                     
                     {!isLoaded ? (
                         <div className="text-slate-400 text-sm font-medium">尚未計算</div>
                     ) : (
                         <>
                             <div className={`text-2xl font-black font-mono flex items-center gap-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                 {isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                                 {isPositive ? '+' : ''}{periodData.returnPercent.toFixed(2)}%
                             </div>
                             <div className={`text-sm font-bold mt-1 ${isPositive ? 'text-emerald-700/70' : 'text-rose-700/70'}`}>
                                 {isPositive ? '+' : ''}{Math.round(periodData.returnValue).toLocaleString()}
                             </div>
                         </>
                     )}
                 </div>
             );
         })}
      </div>
    </div>
  );
}
