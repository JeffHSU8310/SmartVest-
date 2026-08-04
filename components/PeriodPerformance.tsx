import React, { useState, useEffect } from 'react';
import { PortfolioItem, Transaction, TransactionType } from '../types';
import { fetchHistoricalPrice, fetchYahooHistoryUniversal, withTimeout } from '../utils';
import { Activity, Clock, TrendingUp, TrendingDown, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  portfolio: PortfolioItem[];
  transactions: Transaction[];
  exchangeRate: number;
}

// 單一標的預抓 450 天 K 線的時間上限
const KLINE_PREFETCH_TIMEOUT_MS = 15000;
// 快取沒涵蓋到、需要個別補抓的單一日期價格的時間上限
const MISSING_PRICE_TIMEOUT_MS = 10000;

export default function PeriodPerformance({ portfolio, transactions, exchangeRate }: Props) {
  const [loading, setLoading] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [data, setData] = useState<{
    '1M': { returnPercent: number, returnValue: number, label: string } | null;
    '6M': { returnPercent: number, returnValue: number, label: string } | null;
    '1Y': { returnPercent: number, returnValue: number, label: string } | null;
  }>({ '1M': null, '6M': null, '1Y': null });

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
      
      // Month
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      // Half Year
      const currentHalf = now.getMonth() < 6 ? 1 : 2; // In July (month=6), currentHalf is 2
      const lastHalfStart = currentHalf === 1 ? new Date(now.getFullYear() - 1, 6, 1) : new Date(now.getFullYear(), 0, 1);
      const lastHalfEnd = currentHalf === 1 ? new Date(now.getFullYear() - 1, 11, 31) : new Date(now.getFullYear(), 5, 30);

      // Year
      const currentYearStart = new Date(now.getFullYear(), 0, 1);
      const currentYearEnd = new Date(now.getFullYear(), 11, 31);

      const periods = [
        { key: '1M', label: `${lastMonthStart.getMonth() + 1}月`, startDate: lastMonthStart, endDate: lastMonthEnd },
        { key: '6M', label: `${lastHalfStart.getFullYear()}${lastHalfStart.getMonth()===0?'上':'下'}半年度`, startDate: lastHalfStart, endDate: lastHalfEnd },
        { key: '1Y', label: `${currentYearStart.getFullYear()}年度`, startDate: currentYearStart, endDate: currentYearEnd }
      ];

      const relevantPortfolio = portfolio.filter(p => {
        // Include if currently held OR had any past transactions 
        return p.totalShares > 0 || transactions.some(t => t.stockId === p.stock.id);
      });

      // 沒有掛牌代號的基金在 Yahoo / FinMind 都查無 K 線，硬抓只會耗掉整段
      // 逾時（每檔 15 秒）才失敗，卻是區間績效等待時間的主要來源。
      // 判斷方式與股價更新一致：有數字代號或英文代號的（境外掛牌標的）不算，
      // 只排除真正查不到的那種。
      const isUnfetchableFund = (stock: any): boolean => {
        const ticker = String(stock?.ticker || '');
        const looksListed =
          /^[0-9]{4,6}[A-Z]?(\.TW|\.TWO)?$/i.test(ticker) || /^[A-Z]{1,5}$/.test(ticker);
        if (looksListed) return false;
        return (
          stock?.market === 'FUND' ||
          !!stock?.category?.includes('基金') ||
          !!stock?.name?.includes('基金')
        );
      };

      // 極速優化：一次平行預抓所有持股標的過去 450 天 K 線歷史，並以 localStorage 進行持久化快取
      const uniqueSymbols = Array.from(new Set(
        relevantPortfolio
          .filter(p => !isUnfetchableFund(p.stock))
          .map(p => p.stock.ticker || p.stock.id)
      ));
      const nowSec = Math.floor(now.getTime() / 1000);
      const period1Sec = nowSec - 450 * 86400;
      const symbolPriceMap = new Map<string, Map<string, number>>();

      const KLINE_CACHE_KEY = 'smartvest_kline_persistent_v1';
      try {
        const cachedJson = localStorage.getItem(KLINE_CACHE_KEY);
        if (cachedJson) {
          const parsed = JSON.parse(cachedJson);
          if (parsed.timestamp && (Date.now() - parsed.timestamp < 12 * 3600 * 1000) && parsed.data) {
            Object.entries(parsed.data).forEach(([sym, dateObj]: [string, any]) => {
              symbolPriceMap.set(sym, new Map<string, number>(Object.entries(dateObj)));
            });
          }
        }
      } catch (e) {}

      const symbolsToFetch = uniqueSymbols.filter(sym => !symbolPriceMap.has(sym) || forceRefresh > 0);

      if (symbolsToFetch.length > 0) {
        await Promise.all(
          symbolsToFetch.map(async (sym) => {
            try {
              // 加上時間上限：外部來源失聯時，單一標的的歷史抓取會層層退路
              // （主代號 → .TWO → FinMind），累積起來可以拖到一分鐘以上。
              const historyData = await withTimeout(
                fetchYahooHistoryUniversal(sym, period1Sec, nowSec + 86400, '1d'),
                KLINE_PREFETCH_TIMEOUT_MS,
              );
              let result = historyData?.chart?.result?.[0] || (historyData?.indicators?.quote?.[0] ? historyData : null);
              if (result && result.indicators?.quote?.[0] && result.timestamp) {
                const quote = result.indicators.quote[0];
                const timestamps: number[] = result.timestamp;
                const datePriceMap = new Map<string, number>();
                for (let i = 0; i < timestamps.length; i++) {
                  if (quote.close[i] != null) {
                    const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
                    datePriceMap.set(dateStr, quote.close[i]);
                  }
                }
                symbolPriceMap.set(sym, datePriceMap);
              }
            } catch (e) {}
          })
        );

        try {
          const dataToSave: Record<string, Record<string, number>> = {};
          symbolPriceMap.forEach((dateMap, sym) => {
            dataToSave[sym] = Object.fromEntries(dateMap);
          });
          localStorage.setItem(KLINE_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: dataToSave }));
        } catch (e) {}
      }

      const formatDateStr = (d: Date) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;

      // 預抓失敗的標的（例如沒有掛牌代號的基金）再查幾次都是同樣結果 ——
      // fetchHistoricalPrice 走的也是同一組來源。過去沒有記錄這件事，
      // 同一檔會在 4 個期間 × 起訖點總共重複走完整代理鏈 8 次，
      // 這正是區間績效動輒卡上百秒的主因。這裡記下來直接略過。
      const unresolvableSymbols = new Set<string>([
        ...uniqueSymbols.filter(sym => !symbolPriceMap.has(sym)),
        // 上面已排除、根本沒送去預抓的基金，同樣不要再逐日期補打網路
        ...relevantPortfolio
          .filter(p => isUnfetchableFund(p.stock))
          .map(p => p.stock.ticker || p.stock.id),
      ]);

      // 從已預抓的 K 線表就地查價（往前找最多 14 天的最近交易日），
      // 純記憶體運算、不觸網。
      const lookupFromCache = (symbol: string, targetDateStr: string): number | null => {
        const dateMap = symbolPriceMap.get(symbol);
        if (!dateMap) return null;
        const tDate = new Date(targetDateStr);
        for (let d = 0; d < 14; d++) {
          const checkD = new Date(tDate);
          checkD.setDate(tDate.getDate() - d);
          const checkStr = checkD.toISOString().split('T')[0];
          if (dateMap.has(checkStr)) {
            return dateMap.get(checkStr)!;
          }
        }
        return null;
      };

      // 把所有期間 × 所有標的需要的 (代號, 日期) 一次列出來，快取查不到的
      // 才補打網路，而且是「去重後一次並行」。原本是在雙層迴圈裡逐一 await，
      // 等於把每一次網路等待時間全部相加。
      const nowStrForPrefetch = formatDateStr(new Date());
      const neededKeys = new Set<string>();
      for (const period of periods) {
        const startStr = formatDateStr(period.startDate);
        const endStr = formatDateStr(period.endDate);
        const effectiveEnd = endStr > nowStrForPrefetch ? nowStrForPrefetch : endStr;
        for (const item of relevantPortfolio) {
          const symbol = item.stock.ticker || item.stock.id;
          if (unresolvableSymbols.has(symbol)) continue;
          neededKeys.add(`${symbol}|${startStr}`);
          neededKeys.add(`${symbol}|${effectiveEnd}`);
        }
      }

      const resolvedPrices = new Map<string, number>();
      const missingKeys: string[] = [];
      neededKeys.forEach(key => {
        const sepAt = key.lastIndexOf('|');
        const sym = key.slice(0, sepAt);
        const dateStr = key.slice(sepAt + 1);
        const cached = lookupFromCache(sym, dateStr);
        if (cached !== null) resolvedPrices.set(key, cached);
        else missingKeys.push(key);
      });

      if (missingKeys.length > 0) {
        await Promise.all(
          missingKeys.map(async (key) => {
            const sepAt = key.lastIndexOf('|');
            const sym = key.slice(0, sepAt);
            const dateStr = key.slice(sepAt + 1);
            try {
              const price = await withTimeout(
                fetchHistoricalPrice(sym, dateStr),
                MISSING_PRICE_TIMEOUT_MS,
              );
              if (price !== null && price !== undefined) resolvedPrices.set(key, price);
            } catch (e) {}
          })
        );
      }

      // 到這裡所有價格都已在記憶體中，後續計算不再有任何網路等待。
      const getHistoricalPriceFast = (symbol: string, targetDateStr: string): number | null => {
        const hit = resolvedPrices.get(`${symbol}|${targetDateStr}`);
        if (hit !== undefined) return hit;
        return lookupFromCache(symbol, targetDateStr);
      };
      
      const results: any = { '1M': null, '6M': null, '1Y': null };

      for (const period of periods) {
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
                   endPrice = getHistoricalPriceFast(symbol, effectiveEndDateStr);
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
               const startPrice = getHistoricalPriceFast(symbol, startDateStr);
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
        
        results[period.key as '1M'|'6M'|'1Y'] = {
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

  const isWebEnv = typeof window !== 'undefined' && !(window as any).electronAPI;

  if (!useCache) {
      if (!isWebEnv || forceRefresh > 0) {
          calculatePerformance();
      }
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
                <p className="text-xs text-slate-500 mt-0.5">雲端網頁版已取消自動背景計算以避免拖慢連線，如需估算請手動點擊更新</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
         {(['1M', '6M', '1Y'] as const).map(key => {
             const periodData = data[key];
             const isLoaded = periodData !== null;
             const isPositive = isLoaded && periodData.returnPercent >= 0;
             const labels = { '1M': '上個月績效', '6M': '上半年度績效', '1Y': '今年度績效' };
             
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
