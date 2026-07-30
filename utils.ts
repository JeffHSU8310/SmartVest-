
import { Stock, Transaction, TransactionType, PortfolioItem, Market, Account, AssetSnapshot, GeneralAssetItem, CashTransaction, CSVSettings, CostMethod } from './types';

export const generateId = (): string => Math.random().toString(36).substring(2, 9);

export const getSharesBeforeDate = (stockId: string, targetDate: string, transactions: Transaction[]): number => {
  if (!targetDate) return 0;
  
  const normalizeDate = (d: string) => d.replace(/\//g, '-');
  const normalizedTarget = normalizeDate(targetDate);

  const relevantTxs = transactions.filter(t => {
    if (t.stockId !== stockId) return false;
    const tDate = normalizeDate(t.date);
    return tDate < normalizedTarget && (t.type === TransactionType.BUY || t.type === TransactionType.SELL);
  });
  
  let shares = 0;
  relevantTxs.forEach(tx => {
    if (tx.type === TransactionType.BUY) shares += tx.quantity;
    if (tx.type === TransactionType.SELL) shares -= tx.quantity;
  });
  
  return shares;
};

export const calculateStockPerformance = async (
    stock: Stock, 
    startDate: string, 
    endDate: string
): Promise<{
    success: boolean;
    startPrice?: number;
    endPrice?: number;
    dividends?: number;
    returnRate?: number;
    totalDiff?: number;
    error?: string;
    actualStartDate?: string;
}> => {
    try {
        const sDate = new Date(startDate);
        const eDate = new Date(endDate);
        
        const queryStart = new Date(sDate);
        queryStart.setDate(sDate.getDate() - 14); 
        
        const period1 = Math.floor(queryStart.getTime() / 1000);
        const period2 = Math.floor(eDate.getTime() / 1000) + 86400; 

        const yearsDiff = (eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        const interval = yearsDiff > 15 ? '1wk' : '1d';

        let symbol = stock.ticker;
        // Fix: Include Market.BOND for Taiwan logic (e.g. 00679B needs .TW/.TWO)
        if ((stock.market === Market.TW || stock.market === Market.BOND) && !symbol.includes('.')) symbol += '.TW';
        
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}&events=div|split`;
        
        let data: any = await safeFetchJson(targetUrl);

        if (!data?.chart?.result?.[0]) {
            try {
                const cleanTicker = stock.ticker.split('.')[0].toUpperCase();
                const isTW = stock.market === Market.TW || stock.market === Market.BOND || symbol.endsWith('.TW') || symbol.endsWith('.TWO');
                const dataset = isTW ? 'TaiwanStockPrice' : 'USStockPrice';
                const fmUrl = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${encodeURIComponent(cleanTicker)}&start_date=${startDate}&end_date=${endDate}`;
                const fmRes = await fetch(fmUrl);
                if (fmRes.ok) {
                    const fmJson = await fmRes.json();
                    if (fmJson.data && fmJson.data.length > 0) {
                        const startObj = fmJson.data[0];
                        const endObj = fmJson.data[fmJson.data.length - 1];
                        const sPrice = startObj.close ?? startObj.Close ?? 0;
                        const ePrice = endObj.close ?? endObj.Close ?? 0;
                        if (sPrice > 0 && ePrice > 0) {
                            const diff = ePrice - sPrice;
                            const rate = (diff / sPrice) * 100;
                            return {
                                success: true,
                                startPrice: sPrice,
                                endPrice: ePrice,
                                dividends: 0,
                                returnRate: rate,
                                totalDiff: diff,
                                actualStartDate: startObj.date
                            };
                        }
                    }
                }
            } catch (e) {}
        }

        if (!data?.chart?.result?.[0]) return { success: false, error: 'No Data' };

        const result = data.chart.result[0];
        const timestamps = result.timestamp || [];
        const quotes = result.indicators.quote[0];
        const adjCloses = result.indicators.adjclose?.[0]?.adjclose || [];
        
        const divEvents = result.events?.dividends || {};
        const splitEvents = result.events?.splits || {};

        if (timestamps.length === 0) return { success: false, error: 'Empty Timeline' };

        const targetStartTs = sDate.getTime() / 1000;
        const targetEndTs = eDate.getTime() / 1000 + 86399;
        const toDateStr = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0];

        let startIdx = -1;
        for(let i=0; i<timestamps.length; i++) {
            if (timestamps[i] >= targetStartTs && quotes.close[i] != null) {
                 startIdx = i; break;
            }
        }
        if (startIdx === -1) startIdx = 0;

        let endIdx = -1;
        for(let i=timestamps.length-1; i>=0; i--) {
            if (timestamps[i] <= targetEndTs && quotes.close[i] != null) {
                endIdx = i; break;
            }
        }
        if (endIdx === -1) endIdx = timestamps.length - 1;
        if (startIdx > endIdx) startIdx = endIdx;

        const actualStartTs = timestamps[startIdx];
        const actualStartDate = toDateStr(actualStartTs);

        const startRaw = quotes.close[startIdx] || 0;
        const endRaw = quotes.close[endIdx] || 0;
        const startAdj = adjCloses[startIdx] != null ? adjCloses[startIdx] : startRaw;
        const endAdj = adjCloses[endIdx] != null ? adjCloses[endIdx] : endRaw;

        const splitsArr = Object.values(splitEvents).map((s: any) => ({
            dateStr: toDateStr(s.date),
            ts: s.date,
            numerator: s.numerator,
            denominator: s.denominator,
            ratio: s.numerator / s.denominator
        })).sort((a: any, b: any) => a.ts - b.ts);

        let totalDiv = 0;
        Object.keys(divEvents).forEach(tsKey => {
            const ts = parseInt(tsKey);
            const divDateStr = toDateStr(ts);
            if (divDateStr >= actualStartDate && ts <= timestamps[endIdx]) {
                let rawAmount = divEvents[tsKey].amount;
                let adjustmentFactor = 1;
                splitsArr.forEach((split: any) => {
                    if (split.dateStr > divDateStr) {
                        adjustmentFactor *= split.ratio;
                    }
                });
                totalDiv += (rawAmount / adjustmentFactor);
            }
        });

        const priceDiff = endAdj - startAdj;
        const returnRate = startAdj > 0 ? (priceDiff / startAdj) * 100 : 0;

        return {
            success: true,
            startPrice: startAdj,
            endPrice: endAdj,
            dividends: 0, 
            returnRate,
            totalDiff: priceDiff,
            actualStartDate
        };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

interface FifoLot {
    quantity: number;
    totalCost: number; 
    totalCostTWD: number; 
    date: string;
}

export const calculatePortfolio = (stocks: Stock[], transactions: Transaction[], method: CostMethod = 'FIFO'): PortfolioItem[] => {
  const accountStockMap = new Map<string, PortfolioItem & { lots: FifoLot[] }>();

  const getAccountStockItem = (stockId: string, accountId: string) => {
    const key = `${stockId}_${accountId}`;
    if (!accountStockMap.has(key)) {
      const stock = stocks.find(s => s.id === stockId);
      if (!stock) return null;
      accountStockMap.set(key, {
        stock,
        totalShares: 0,
        averageCost: 0,
        totalCost: 0,
        totalCostTWD: 0, 
        cycleInitialCost: 0,
        cycleInitialCostTWD: 0,
        marketValue: 0,
        totalDividend: 0,
        realizedGain: 0,
        historicalRealizedGain: 0,
        historicalRealizedGainTWD: 0,
        historicalDividend: 0,
        historicalDividendTWD: 0,
        unrealizedGain: 0,
        unrealizedGainPercent: 0,
        totalReturn: 0,
        totalReturnPercent: 0,
        costMethod: method,
        lots: [] 
      });
    }
    return accountStockMap.get(key)!;
  };

  const sortedTransactions = [...transactions].sort((a, b) => {
    const getEffectiveDate = (tx: Transaction) => {
       if (tx.type === TransactionType.DIVIDEND && tx.exDividendDate) {
           return tx.exDividendDate.replace(/\//g, '-');
       }
       return tx.date.replace(/\//g, '-');
    };
    const dateA = getEffectiveDate(a);
    const dateB = getEffectiveDate(b);
    const timeA = new Date(dateA).getTime();
    const timeB = new Date(dateB).getTime();
    
    if (timeA !== timeB) return timeA - timeB;
    
    const order = { [TransactionType.BUY]: 1, [TransactionType.DIVIDEND]: 2, [TransactionType.SPLIT]: 3, [TransactionType.SELL]: 4 };
    return (order[a.type] || 99) - (order[b.type] || 99);
  });

  sortedTransactions.forEach(tx => {
    const item = getAccountStockItem(tx.stockId, tx.accountId || 'default');
    if (!item) return;

    const fee = tx.fee || 0;
    const totalTxAmount = tx.price * tx.quantity;
    const rate = tx.exchangeRate || 1; 

    if (tx.type === TransactionType.BUY) {
      const txCost = totalTxAmount + fee;
      const txCostTWD = txCost * rate;
      
      if (method === 'FIFO') {
          item.lots.push({
              quantity: tx.quantity,
              totalCost: txCost,
              totalCostTWD: txCostTWD,
              date: tx.date
          });
      }

      const prevTotalCost = item.totalShares * item.averageCost;
      const newTotalCost = prevTotalCost + txCost;
      const newTotalShares = item.totalShares + tx.quantity;
      
      item.totalShares = newTotalShares;
      
      item.cycleInitialCost = (item.cycleInitialCost || 0) + txCost;
      item.cycleInitialCostTWD = (item.cycleInitialCostTWD || 0) + txCostTWD;
      
      if (method === 'AVG') {
          item.totalCost = newTotalCost;
          item.averageCost = newTotalShares > 0 ? newTotalCost / newTotalShares : 0;
      } else {
          item.totalCost += txCost; 
          item.averageCost = item.totalShares > 0 ? item.totalCost / item.totalShares : 0;
      }
      
      item.totalCostTWD = (item.totalCostTWD || 0) + txCostTWD;

    } else if (tx.type === TransactionType.SELL) {
      const netIncome = totalTxAmount - fee - (tx.tax || 0); 
      
      if (method === 'AVG') {
          const costBasis = item.averageCost * tx.quantity;
          const gain = netIncome - costBasis;

          item.realizedGain += gain;
          item.totalShares -= tx.quantity;
          item.totalCost -= costBasis;
          
          const totalSharesBeforeSell = item.totalShares + tx.quantity;
          const avgCostTWD = totalSharesBeforeSell > 0 ? (item.totalCostTWD || 0) / totalSharesBeforeSell : 0;
          const costBasisTWD = avgCostTWD * tx.quantity;
          
          const netIncomeTWD = netIncome * rate;
          const gainTWD = netIncomeTWD - costBasisTWD;
          item.realizedGainTWD = (item.realizedGainTWD || 0) + gainTWD;
          
          item.totalCostTWD = (item.totalCostTWD || 0) - costBasisTWD;

      } else {
          let sharesToSell = tx.quantity;
          let costBasis = 0;
          let costBasisTWD = 0;

          while (sharesToSell > 0 && item.lots.length > 0) {
              const currentLot = item.lots[0]; 
              
              if (currentLot.quantity > sharesToSell) {
                  const costPortion = (currentLot.totalCost / currentLot.quantity) * sharesToSell;
                  const costPortionTWD = (currentLot.totalCostTWD / currentLot.quantity) * sharesToSell;
                  
                  costBasis += costPortion;
                  costBasisTWD += costPortionTWD;
                  
                  currentLot.totalCost -= costPortion;
                  currentLot.totalCostTWD -= costPortionTWD;
                  currentLot.quantity -= sharesToSell;
                  sharesToSell = 0;
              } else {
                  costBasis += currentLot.totalCost;
                  costBasisTWD += currentLot.totalCostTWD;
                  
                  sharesToSell -= currentLot.quantity;
                  item.lots.shift(); 
              }
          }

          const gain = netIncome - costBasis;
          item.realizedGain += gain;
          item.totalShares -= tx.quantity;
          item.totalCost -= costBasis;
          
          const netIncomeTWD = netIncome * rate;
          const gainTWD = netIncomeTWD - costBasisTWD;
          item.realizedGainTWD = (item.realizedGainTWD || 0) + gainTWD;
          
          item.totalCostTWD = (item.totalCostTWD || 0) - costBasisTWD;
          item.averageCost = item.totalShares > 0 ? item.totalCost / item.totalShares : 0;
      }
      
      if (item.totalShares <= 1e-12) { 
        item.totalShares = 0;
        item.totalCost = 0;
        item.totalCostTWD = 0;
        item.cycleInitialCost = 0;
        item.cycleInitialCostTWD = 0;
        item.averageCost = 0;
        item.lots = [];
        item.historicalRealizedGain = (item.historicalRealizedGain || 0) + item.realizedGain;
        item.historicalRealizedGainTWD = (item.historicalRealizedGainTWD || 0) + (item.realizedGainTWD || 0);
        item.historicalDividend = (item.historicalDividend || 0) + item.totalDividend;
        item.historicalDividendTWD = (item.historicalDividendTWD || 0) + (item.totalDividendTWD || 0);
        item.realizedGain = 0;
        item.realizedGainTWD = 0;
        item.totalDividend = 0;
        item.totalDividendTWD = 0;
      }

    } else if (tx.type === TransactionType.DIVIDEND) {
      const totalDividend = (tx.price * tx.quantity) - fee;
      const totalDividendTWD = totalDividend * rate;
      if (item.totalShares <= 1e-12) {
        item.historicalDividend = (item.historicalDividend || 0) + totalDividend;
        item.historicalDividendTWD = (item.historicalDividendTWD || 0) + totalDividendTWD;
      } else {
        item.totalDividend += totalDividend;
        item.totalDividendTWD = (item.totalDividendTWD || 0) + totalDividendTWD;
      }
    } else if (tx.type === TransactionType.SPLIT) {
      const splitRatio = tx.quantity; 
      if (item.totalShares > 0 && splitRatio > 0) {
        item.totalShares *= splitRatio;
        item.averageCost = item.totalCost / item.totalShares;
        if (method === 'FIFO') {
          item.lots.forEach(lot => {
            lot.quantity *= splitRatio;
          });
        }
      }
    }
  });

  const stockPortfolioMap = new Map<string, PortfolioItem>();

  stocks.forEach(stock => {
    stockPortfolioMap.set(stock.id, {
      stock,
      totalShares: 0,
      averageCost: 0,
      totalCost: 0,
      totalCostTWD: 0, 
      cycleInitialCost: 0,
      cycleInitialCostTWD: 0,
      marketValue: 0,
      totalDividend: 0,
      realizedGain: 0,
      historicalRealizedGain: 0,
      historicalRealizedGainTWD: 0,
      historicalDividend: 0,
      historicalDividendTWD: 0,
      unrealizedGain: 0,
      unrealizedGainPercent: 0,
      totalReturn: 0,
      totalReturnPercent: 0,
      costMethod: method,
    });
  });

  accountStockMap.forEach((item, key) => {
    const stockId = item.stock.id;
    const aggregated = stockPortfolioMap.get(stockId);
    if (aggregated) {
      aggregated.totalShares += item.totalShares;
      aggregated.totalCost += item.totalCost;
      aggregated.totalCostTWD = (aggregated.totalCostTWD || 0) + (item.totalCostTWD || 0);
      aggregated.cycleInitialCost = (aggregated.cycleInitialCost || 0) + (item.cycleInitialCost || 0);
      aggregated.cycleInitialCostTWD = (aggregated.cycleInitialCostTWD || 0) + (item.cycleInitialCostTWD || 0);
      aggregated.totalDividend += item.totalDividend;
      aggregated.totalDividendTWD = (aggregated.totalDividendTWD || 0) + (item.totalDividendTWD || 0);
      aggregated.realizedGain += item.realizedGain;
      aggregated.realizedGainTWD = (aggregated.realizedGainTWD || 0) + (item.realizedGainTWD || 0);
      aggregated.historicalRealizedGain = (aggregated.historicalRealizedGain || 0) + (item.historicalRealizedGain || 0);
      aggregated.historicalRealizedGainTWD = (aggregated.historicalRealizedGainTWD || 0) + (item.historicalRealizedGainTWD || 0);
      aggregated.historicalDividend = (aggregated.historicalDividend || 0) + (item.historicalDividend || 0);
      aggregated.historicalDividendTWD = (aggregated.historicalDividendTWD || 0) + (item.historicalDividendTWD || 0);
    }
  });

  return Array.from(stockPortfolioMap.values()).map(item => {
    item.averageCost = item.totalShares > 0 ? item.totalCost / item.totalShares : 0;
    const refPrice = item.stock.currentPrice !== undefined ? item.stock.currentPrice : item.averageCost;
    
    item.marketValue = item.totalShares * refPrice;
    item.unrealizedGain = item.marketValue - item.totalCost;
    item.unrealizedGainPercent = item.totalCost > 0 ? (item.unrealizedGain / item.totalCost) * 100 : 0;
    
    item.totalReturn = item.realizedGain + item.unrealizedGain + item.totalDividend;
    
    // Use cycleInitialCost as denominator to prevent ROI distortion after partial sales
    const denominator = (item.cycleInitialCost && item.cycleInitialCost > 0) ? item.cycleInitialCost : item.totalCost;
    item.totalReturnPercent = denominator > 0 ? (item.totalReturn / denominator) * 100 : 0;
    
    return item;
  }).filter(p => p.totalShares > 0 || p.realizedGain !== 0 || p.totalDividend !== 0 || (p.historicalRealizedGain && p.historicalRealizedGain !== 0) || (p.historicalDividend && p.historicalDividend !== 0));
};

export const exportToCSV = (
    transactions: Transaction[], 
    stocks: Stock[], 
    accounts: Account[], 
    assetHistory: AssetSnapshot[],
    generalAssets: GeneralAssetItem[] = [],
    cashTransactions: CashTransaction[] = [],
    householdTransactions: CashTransaction[] = [],
    settings: CSVSettings = {}
) => {
  const stockMap = new Map(stocks.map(s => [s.id, s]));
  const accountMap = new Map(accounts.map(a => [a.id, a]));

  const headers = ['日期', '市場(TW/US)', '代號', '名稱', '分類', '交易類別', '每股股息', '股數', '成交價金', '手續費', '稅金', '總金額', '台幣總金額', '備註', '匯率', '帳戶名稱', '目前市價', '除息日', '配發日', '定期定額', '股利再投入', '帳戶ID', '交割日期', '股息入帳帳戶ID'];
  
  const txRows = transactions.map(tx => {
    const stock = stockMap.get(tx.stockId);
    const accountName = accountMap.get(tx.accountId)?.name || '';
    
    const typeLabel = {
      [TransactionType.BUY]: '買進',
      [TransactionType.SELL]: '賣出',
      [TransactionType.DIVIDEND]: '領息'
    }[tx.type];

    const dateStr = tx.date.replace(/\//g, '-');
    const exDateStr = (tx.exDividendDate || '').replace(/\//g, '-');
    const payDateStr = (tx.paymentDate || '').replace(/\//g, '-');
    const settlementDateStr = (tx.settlementDate || '').replace(/\//g, '-');
    
    const principal = tx.price * tx.quantity;
    const fee = tx.fee || 0;
    const tax = tx.tax || 0;
    let totalAmount = principal;
    if (tx.type === TransactionType.BUY) totalAmount += fee;
    else if (tx.type === TransactionType.SELL) totalAmount = totalAmount - fee - tax;
    
    const exchangeRate = tx.exchangeRate || 1;
    const totalTWD = Math.round(totalAmount * exchangeRate);
    const dividendPerShare = tx.type === TransactionType.DIVIDEND ? tx.price : '';

    const isDCA = tx.isDCA ? 'Y' : '';
    const isDRIP = tx.isDRIP ? 'Y' : '';

    return [
      dateStr,
      stock?.market || '',
      stock?.ticker || '',
      `"${(stock?.name || '').replace(/"/g, '""')}"`,
      `"${(stock?.category || '').replace(/"/g, '""')}"`,
      typeLabel,
      dividendPerShare,
      tx.quantity,
      principal, 
      fee,
      tax,       
      totalAmount,
      totalTWD,
      `"${(tx.note || '').replace(/"/g, '""')}"`,
      exchangeRate,
      `"${accountName.replace(/"/g, '""')}"`,
      stock?.currentPrice || '',
      exDateStr,
      payDateStr,
      isDCA,
      isDRIP,
      tx.accountId, 
      settlementDateStr,
      tx.dividendAccountId || ''
    ].join(',');
  });

  const stockRows = stocks.map(s => {
      // Use column index 16 (ExDate) to store dividendMonths
      return [
        '#系統備份',
        s.market,
        s.ticker,
        `"${s.name.replace(/"/g, '""')}"`,
        `"${(s.category || '').replace(/"/g, '""')}"`,
        '[股票設定]',
        '', '', '', '', '', '', '', 
        s.id, 
        '', '',
        `"${s.currentPrice || ''}"`,
        s.dividendMonths ? s.dividendMonths.join('|') : '', // Store dividend months here
        '', '', '', '', ''
      ].join(',');
    });

  const accountRows = accounts.map(a => {
      return [
        '#系統備份',
        a.id, 
        a.isSecurities ? 'Y' : 'N', 
        `"${a.name.replace(/"/g, '""')}"`,
        a.isCash ? 'Y' : 'N', 
        '[帳戶設定]', 
        a.excludeFromTotals ? 'Y' : 'N', 
        a.linkedCashAccountId || '', 
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ].join(',');
    });

  const historyHeader = ['#資產趨勢', '日期', '總成本TWD', '總市值TWD', '未實現損益TWD', '除息收益(含息變動)'];
  const historyRows = assetHistory.map(h => {
    return [
      '#資產趨勢',
      h.date,
      h.totalCostTWD,
      h.totalMarketValueTWD,
      h.unrealizedPLTWD,
      h.todayDividendTWD || 0
    ].join(',');
  });

  const assetHeader = ['#一般資產', 'ID', '名稱', '類別', '類型', '金額', '連結ID', '排除', '備註', '原始金額', '利率', '還款方式', '月本', '月利', '借款日', '到期日', '銀行', '借款類型', '質押標的ID', '質押張數', '擔保市值'];
  const assetRows = generalAssets.map(a => {
      return [
          '#一般資產',
          a.id,
          `"${a.name.replace(/"/g, '""')}"`,
          a.category,
          a.type,
          a.value,
          a.isLinked ? 'Y' : 'N',
          a.isExcluded ? 'Y' : 'N',
          `"${(a.note || '').replace(/"/g, '""')}"`,
          a.originalAmount || '',
          a.interestRate || '',
          a.amortizationMethod || '',
          a.monthlyPrincipal || '',
          a.monthlyInterest || '',
          a.loanDate || '',
          a.maturityDate || '',
          `"${(a.bank || '').replace(/"/g, '""')}"`,
          a.loanType || '',
          a.targetStockId || '',
          a.pledgeLots || '',
          a.collateralValue || ''
      ].join(',');
  });

  const allCashTxs = [...cashTransactions, ...householdTransactions];
  const cashHeader = ['#現金收支', 'ID', '日期', '帳戶ID', '類型', '金額', '主類別', '子類別', '備註', '來源ID', '轉出帳戶ID', '轉入帳戶ID', '群組(Household/Invest)'];
  const cashRows = allCashTxs.map(c => {
      const isHousehold = householdTransactions.some(h => h.id === c.id) ? 'H' : 'I';
      return [
          '#現金收支',
          c.id,
          c.date,
          c.accountId,
          c.type,
          c.amount,
          `"${(c.category || '').replace(/"/g, '""')}"`,
          `"${(c.subCategory || '').replace(/"/g, '""')}"`,
          `"${(c.note || '').replace(/"/g, '""')}"`,
          c.sourceTransactionId || '',
          c.fromAccountId || '',
          c.toAccountId || '',
          isHousehold
      ].join(',');
  });

  const settingsRows = [];
  if (settings.appTitle) settingsRows.push(`#系統設定,APP_TITLE,"${settings.appTitle}"`);
  if (settings.autoSyncStartDate) settingsRows.push(`#系統設定,AUTO_SYNC_DATE,${settings.autoSyncStartDate}`);
  if (settings.stockOrder) settingsRows.push(`#系統設定,STOCK_ORDER,${settings.stockOrder.join('|')}`);
  if (settings.navOrder) settingsRows.push(`#系統設定,NAV_ORDER,${settings.navOrder.join('|')}`);

  const csvContent = '\uFEFF' + [
    headers.join(','), 
    ...accountRows, 
    ...stockRows,   
    ...txRows,      
    '', 
    historyHeader.join(','),
    ...historyRows,
    '',
    assetHeader.join(','),
    ...assetRows,
    '',
    cashHeader.join(','),
    ...cashRows,
    '',
    ...settingsRows
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `smartvest_full_export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const safeFetchJson = async (targetUrl: string, init?: RequestInit): Promise<any> => {
    try {
        const res = await fetch(targetUrl, init);
        if (res.ok) {
            const text = await res.text();
            if (text && text.trim().startsWith('{')) {
                return JSON.parse(text);
            }
        }
    } catch (e) {}

    const proxies = [
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    for (const proxyFn of proxies) {
        try {
            const pUrl = proxyFn(targetUrl);
            const res = await fetch(pUrl, init);
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('{')) {
                    return JSON.parse(text);
                }
            }
        } catch (e) {}
    }

    return null;
};

export const fetchTWStockOfficialPrice = async (ticker: string): Promise<{ price: number; prevClose?: number; name?: string } | null> => {
    const cleanTicker = ticker.split('.')[0].trim().toUpperCase();
    const urls = [
        `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${cleanTicker}.tw`,
        `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${cleanTicker}.tw`
    ];

    for (const url of urls) {
        try {
            const json = await safeFetchJson(url);
            if (json?.msgArray?.[0]) {
                const item = json.msgArray[0];
                const y = parseFloat(item.y);
                const z = parseFloat(item.z);
                const price = (!isNaN(z) && z > 0) ? z : (!isNaN(y) ? y : 0);
                if (price > 0) {
                    return {
                        price,
                        prevClose: !isNaN(y) ? y : price,
                        name: item.n
                    };
                }
            }
        } catch (e) {}
    }
    return null;
};

export const corsFetch = async (targetUrl: string, init?: RequestInit): Promise<Response> => {
    try {
        const directRes = await fetch(targetUrl, init);
        if (directRes.ok) return directRes;
    } catch (e) {}

    const proxies = [
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    for (const proxyFn of proxies) {
        try {
            const pUrl = proxyFn(targetUrl);
            const proxyRes = await fetch(pUrl, init);
            if (proxyRes.ok) return proxyRes;
        } catch (e) {}
    }

    throw new Error(`無法連線至目標 URL: ${targetUrl}`);
};

export const fetchYahooChartDirect = async (symbol: string, range: string = '5d', interval: string = '1d') => {
    let cleanSymbol = symbol.trim();
    if (!cleanSymbol.includes('.') && /^\d{4}$/.test(cleanSymbol)) {
        cleanSymbol = `${cleanSymbol}.TW`;
    }

    const targets = [cleanSymbol];
    if (cleanSymbol.endsWith('.TW')) {
        targets.push(cleanSymbol.replace('.TW', '.TWO'));
    }

    for (const sym of targets) {
        const rawUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`;
        try {
            const res = await corsFetch(rawUrl);
            if (res.ok) {
                const json = await res.json();
                if (json?.chart?.result?.[0]) {
                    return json.chart.result[0];
                }
            }
        } catch (e) {}
    }
    return null;
};

export const fetchFinMindQuote = async (symbol: string): Promise<any> => {
    try {
        const cleanSymbol = symbol.trim().split('.')[0].toUpperCase();
        const isTW = symbol.endsWith('.TW') || symbol.endsWith('.TWO') || /^\d{4,6}[A-Za-z]?$/.test(cleanSymbol);
        const dataset = isTW ? 'TaiwanStockPrice' : 'USStockPrice';
        
        const now = new Date();
        const dStr = new Date(now.getTime() - 15 * 86400 * 1000).toISOString().split('T')[0];
        
        const url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${encodeURIComponent(cleanSymbol)}&start_date=${dStr}`;
        const res = await fetch(url);
        if (res.ok) {
            const json = await res.json();
            if (json.data && json.data.length > 0) {
                const latest = json.data[json.data.length - 1];
                const prev = json.data.length > 1 ? json.data[json.data.length - 2] : latest;
                const price = latest.close ?? latest.Close ?? 0;
                const prevClose = prev.close ?? prev.Close ?? price;
                
                if (price > 0) {
                    return {
                        success: true,
                        regularMarketPrice: price,
                        previousClose: prevClose,
                        shortName: cleanSymbol,
                        symbol: symbol,
                        currency: isTW ? 'TWD' : 'USD',
                        marketState: 'REGULAR'
                    };
                }
            }
        }
    } catch (e) {
        console.warn('FinMind quote fetch failed for ' + symbol, e);
    }
    return { success: false };
};

export const fetchCurrentYahooQuote = async (symbol: string): Promise<any> => {
    try {
        if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.fetchYahooQuote) {
            const res = await (window as any).electronAPI.fetchYahooQuote(symbol);
            if (res && res.data) {
                return {
                    success: true,
                    ...res.data
                };
            }
        }

        // 1. 優先使用百分之百開放 CORS 的 FinMind API
        const fmRes = await fetchFinMindQuote(symbol);
        if (fmRes.success) {
            return fmRes;
        }

        // 2. 備援打 TWSE 官方
        const cleanSymbol = symbol.trim();
        const ticker = cleanSymbol.split('.')[0];
        const isTW = cleanSymbol.endsWith('.TW') || cleanSymbol.endsWith('.TWO') || /^\d{4,6}[A-Za-z]?$/.test(ticker);

        if (isTW) {
            const twData = await fetchTWStockOfficialPrice(ticker);
            if (twData && twData.price > 0) {
                return {
                    success: true,
                    regularMarketPrice: twData.price,
                    previousClose: twData.prevClose || twData.price,
                    shortName: twData.name || ticker,
                    symbol: symbol,
                    currency: 'TWD',
                    marketState: 'REGULAR'
                };
            }
        }

        // 3. 全球標的直連
        const chartData = await fetchYahooChartDirect(symbol, '5d', '1d');
        if (chartData && chartData.meta) {
            const meta = chartData.meta;
            const quotes = chartData.indicators?.quote?.[0];
            const closes = quotes?.close || [];
            const validCloses = closes.filter((c: any) => typeof c === 'number' && !isNaN(c));
            const lastClose = validCloses.length > 0 ? validCloses[validCloses.length - 1] : meta.regularMarketPrice;

            return {
                success: true,
                regularMarketPrice: meta.regularMarketPrice ?? lastClose,
                previousClose: meta.chartPreviousClose ?? meta.previousClose ?? lastClose,
                shortName: meta.shortName || meta.symbol || symbol,
                symbol: meta.symbol || symbol,
                currency: meta.currency || 'TWD',
                marketState: meta.marketState || 'REGULAR'
            };
        }
    } catch (e) {
        console.warn("fetchCurrentYahooQuote failed", e);
    }
    return { success: false, error: 'No data' };
};

export const fetchYahooHistoryUniversal = async (symbol: string, period1: number, period2: number, interval: string = '1d') => {
    if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.fetchYahooHistory) {
        const res = await (window as any).electronAPI.fetchYahooHistory({ symbol, period1, period2, interval });
        if (res && res.error) {
            throw new Error(res.error);
        }
        return res && res.data ? res.data : res;
    }

    let cleanSymbol = symbol.trim();
    if (!cleanSymbol.includes('.') && /^\d{4}$/.test(cleanSymbol)) {
        cleanSymbol = `${cleanSymbol}.TW`;
    }

    const rawUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?period1=${period1}&period2=${period2}&interval=${interval}`;
    try {
        const res = await corsFetch(rawUrl);
        if (!res.ok) throw new Error("API response error: " + res.status);
        const json = await res.json();
        if (json?.chart?.result?.[0]) {
            return json.chart.result[0];
        }
        throw new Error("Yahoo Finance returned invalid payload");
    } catch (err: any) {
        if (cleanSymbol.endsWith('.TW')) {
            const fallbackSymbol = cleanSymbol.replace('.TW', '.TWO');
            const fbUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fallbackSymbol)}?period1=${period1}&period2=${period2}&interval=${interval}`;
            const fbRes = await corsFetch(fbUrl);
            if (fbRes.ok) {
                const fbJson = await fbRes.json();
                if (fbJson?.chart?.result?.[0]) {
                    return fbJson.chart.result[0];
                }
            }
        }
        throw err;
    }
};

export const fetchFearGreedDirect = async (): Promise<any> => {
    try {
        if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.fetchFearGreed) {
            const res = await (window as any).electronAPI.fetchFearGreed();
            if (res?.data?.fear_and_greed) return res.data.fear_and_greed;
        }

        const url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
        const res = await corsFetch(url);
        if (res.ok) {
            const json = await res.json();
            if (json?.fear_and_greed) {
                return json.fear_and_greed;
            }
        }
    } catch (e) {
        console.warn('Direct fetch for Fear & Greed failed, returning fallback', e);
    }
    return {
        score: 55,
        rating: 'neutral',
        timestamp: new Date().toISOString()
    };
};

export const fetchTWSEEtfDirect = async (): Promise<any> => {
    try {
        if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.fetchTWSE) {
            const res = await (window as any).electronAPI.fetchTWSE();
            if (res?.data) return res.data;
        }

        const url = 'https://mis.twse.com.tw/stock/api/getETFInfo.jsp';
        const res = await corsFetch(url);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn('Direct fetch for TWSE ETF failed', e);
    }
    return null;
};

export const fetchTwseOpenDataDirect = async (type: 'prices' | 'pe' | 'inst' | 'margin'): Promise<any> => {
    try {
        let endpoint = '';
        if (type === 'prices') endpoint = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
        else if (type === 'pe') endpoint = 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL';
        else if (type === 'inst') endpoint = 'https://openapi.twse.com.tw/v1/fund/T86_ALL';
        else if (type === 'margin') endpoint = 'https://openapi.twse.com.tw/v1/margin/MI_MARGIN';

        if (endpoint) {
            const res = await corsFetch(endpoint);
            if (res.ok) return await res.json();
        }
    } catch (e) {
        console.warn(`fetchTwseOpenDataDirect ${type} failed`, e);
    }
    return [];
};



export const fetchDcaPrice = async (symbol: string, targetDate: string): Promise<{price: number, date: string, isEstimated?: boolean} | null> => {
    try {
        const d = new Date(targetDate);
        const period1 = Math.floor(d.getTime() / 1000) - 86400 * 10; // -10 days to get previous prices if needed
        const d2 = new Date(targetDate);
        d2.setDate(d2.getDate() + 10); // Look forward up to 10 days
        const period2 = Math.floor(d2.getTime() / 1000);
        
        let fetchSymbol = symbol;
        if (!fetchSymbol.includes('.') && /^\d{4}$/.test(fetchSymbol)) {
            fetchSymbol = `${fetchSymbol}.TW`;
        }

        const historyData = await fetchYahooHistoryUniversal(fetchSymbol, period1, period2, '1d');
        
        let result = null;
        if (historyData?.chart?.result?.[0]) {
            result = historyData.chart.result[0];
        } else if (historyData?.indicators?.quote?.[0]) {
            result = historyData;
        }
        
        if (!result) return null;
        
        const quote = result.indicators?.quote?.[0];
        const timestamps = result.timestamp;
        
        if (!quote || !quote.close || !timestamps) return null;
        
        // Find the first timestamp that is >= targetDate (ignoring time)
        const targetDateObj = new Date(targetDate);
        targetDateObj.setHours(0,0,0,0);
        
        
        let exactOrLaterMatch = null;
        let latestBeforeMatch = null;
        
        for (let i = 0; i < timestamps.length; i++) {
            const tsDate = new Date(timestamps[i] * 1000);
            tsDate.setHours(0,0,0,0);
            
            const p = result.indicators?.adjclose?.[0]?.adjclose?.[i] != null ? result.indicators.adjclose[0].adjclose[i] : quote.close[i];
            
            if (p != null) {
                const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
                if (tsDate.getTime() === targetDateObj.getTime()) {
                    return { price: p, date: dateStr, isEstimated: false };
                } else if (tsDate.getTime() > targetDateObj.getTime()) {
                    if (!exactOrLaterMatch) {
                        exactOrLaterMatch = { price: p, date: dateStr, isEstimated: false };
                    }
                } else if (tsDate.getTime() < targetDateObj.getTime()) {
                    latestBeforeMatch = { price: p, date: dateStr, isEstimated: true };
                }
            }
        }
        
        if (latestBeforeMatch) return latestBeforeMatch;
        if (exactOrLaterMatch) return exactOrLaterMatch;
        return null;

    } catch (error) {
        console.error('Error fetching DCA price:', error);
        return null;
    }
};

export const fetchHistoricalPrice = async (symbol: string, targetDate: string): Promise<number | null> => {
    try {
        const d = new Date(targetDate);
        const period2 = Math.floor(d.getTime() / 1000) + 86400 * 2; // +2 days to ensure we get the target date due to timezone
        const d1 = new Date(targetDate);
        d1.setDate(d1.getDate() - 14); // Look back up to 14 days to find the closest trading day
        const period1 = Math.floor(d1.getTime() / 1000);
        
        let fetchSymbol = symbol;
        if (!fetchSymbol.includes('.') && /^\d{4}$/.test(fetchSymbol)) {
            fetchSymbol = `${fetchSymbol}.TW`;
        } else if (!fetchSymbol.includes('.') && /^[a-zA-Z0-9]+$/.test(fetchSymbol)) {
           // Not doing TWO automatically as we can't be sure, but we assume TW if 4 digits
        }

        const historyData = await fetchYahooHistoryUniversal(fetchSymbol, period1, period2, '1d');
        
        let result = null;
        if (historyData?.chart?.result?.[0]) {
            result = historyData.chart.result[0];
        } else if (historyData?.indicators?.quote?.[0]) {
            result = historyData; // Simplified proxy structure
        }
        
        if (!result) return null;
        
        const quote = result.indicators?.quote?.[0];
        const timestamps = result.timestamp;
        
        if (!quote || !quote.close || !timestamps) return null;
        
        let bestPrice: number | null = null;
        const targetTime = d.getTime() / 1000;
        
        for (let i = timestamps.length - 1; i >= 0; i--) {
            if (timestamps[i] <= targetTime + 86400 && quote.close[i] != null) {
                bestPrice = quote.close[i];
                break;
            }
        }
        return bestPrice;
    } catch (e) {
        console.error("Failed to fetch historical price for", symbol, e);
        return null;
    }
};

export const downloadCSVTemplate = () => {
  const headers = ['日期(YYYY-MM-DD)', '市場(TW/US)', '代號', '名稱', '分類(選填)', '交易類別(買進/賣出/領息)', '每股股息(領息用)', '股數', '成交價金(必填)', '手續費(選填)', '稅金(選填)', '總金額', '台幣總金額(選填)', '備註', '匯率(選填)', '帳戶名稱(選填)', '目前市價(選填)', '除息日(選填)', '配發日(選填)', '定期定額(Y/N)', '股利再投入(Y/N)', '帳戶ID(系統用)', '交割日期(選填)'];
  const example1 = ['2023-01-15', 'TW', '2330', '台積電', '半導體', '買進', '', '1000', '500000', '20', '0', '500020', '500020', '定期定額扣款', '1', '主帳戶', '580', '', '', 'Y', '', '', '2023-01-17'];
  
  const csvContent = '\uFEFF' + [headers.join(','), example1.join(',')].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'import_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const getLocalTodayString = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localD = new Date(d.getTime() - (offset * 60 * 1000));
    return localD.toISOString().split('T')[0];
};

export const getLocalPastDateString = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const offset = d.getTimezoneOffset();
    const localD = new Date(d.getTime() - (offset * 60 * 1000));
    return localD.toISOString().split('T')[0];
};

export const getLocalPastYearString = (years: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    const offset = d.getTimezoneOffset();
    const localD = new Date(d.getTime() - (offset * 60 * 1000));
    return localD.toISOString().split('T')[0];
};

export const calculateSMA = (data: number[], period: number) => {
    if (data.length < period) return null;
    const slice = data.slice(data.length - period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
};

export const calculateEMA = (data: number[], period: number) => {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period; // Start with SMA
    for (let i = period; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }
    return ema;
};

export const formatMarketPrice = (price: number, market: Market | string): string => {
    if (typeof price !== 'number' || isNaN(price)) return `${price}`;
    
    if (market === Market.TW) {
        if (price < 50) return price.toFixed(2);
        if (price < 500) return price.toFixed(1);
        return price.toFixed(0);
    }
    
    if (market === 'FUND') {
        return Number(price.toFixed(4)).toString();
    }
    
    // US or others
    return Number(price.toFixed(2)).toString();
};

export const fetchMADataForSymbol = async (symbol: string) => {

    try {
        const d = new Date();
        const period2 = Math.floor(d.getTime() / 1000) + 86400; // include today
        
        const d2 = new Date();
        d2.setDate(d2.getDate() - 300); // go back 300 days
        const period1 = Math.floor(d2.getTime() / 1000);
        
        const historyData = await fetchYahooHistoryUniversal(symbol, period1, period2, '1d');
        
        let result = null;
        if (historyData?.chart?.result?.[0]) {
            result = historyData.chart.result[0];
        } else if (historyData?.indicators?.quote?.[0]) {
            result = historyData; // Simplified proxy structure
        }
        
        if (!result) return null;
        
        const quote = result.indicators.quote[0];
        const timestamps = result.timestamp;
        
        if (!quote || !quote.close || !timestamps) return null;
        
        const validPrices: number[] = [];
        const validDates: string[] = [];
        for (let i = 0; i < quote.close.length; i++) {
            if (quote.close[i] !== null && quote.close[i] !== undefined) {
                validPrices.push(quote.close[i]);
                validDates.push(new Date(timestamps[i] * 1000).toISOString().split('T')[0]);
            }
        }
        
        if (validPrices.length === 0) return null;
        
        const currentPrice = validPrices[validPrices.length - 1];
        const lastUpdateDate = validDates[validDates.length - 1];

        const calculateSMAArray = (prices: number[], period: number) => {
            const arr = new Array(prices.length).fill(null);
            for (let i = period - 1; i < prices.length; i++) {
                let sum = 0;
                for (let j = i - period + 1; j <= i; j++) sum += prices[j];
                arr[i] = sum / period;
            }
            return arr;
        };

        const calculateEMAArray = (prices: number[], period: number) => {
            const arr = new Array(prices.length).fill(null);
            if (prices.length < period) return arr;
            let sum = 0;
            for (let i = 0; i < period; i++) sum += prices[i];
            arr[period - 1] = sum / period;
            const k = 2 / (period + 1);
            for (let i = period; i < prices.length; i++) {
                arr[i] = (prices[i] * k) + (arr[i - 1] * (1 - k));
            }
            return arr;
        };

        const sma20Arr = calculateSMAArray(validPrices, 20);
        const ema50Arr = calculateEMAArray(validPrices, 50);
        const ema100Arr = calculateEMAArray(validPrices, 100);

        const sma20 = sma20Arr[sma20Arr.length - 1];
        const ema50 = ema50Arr[ema50Arr.length - 1];
        const ema100 = ema100Arr[ema100Arr.length - 1];

        const findBreakdownDate = (prices: number[], mas: any[], dates: string[]) => {
             if (prices.length === 0 || mas[mas.length - 1] === null) return null;
             if (prices[prices.length - 1] >= mas[mas.length - 1]) return null;
             
             let breakdownIdx = prices.length - 1;
             for (let i = prices.length - 2; i >= 0; i--) {
                 if (mas[i] === null) break;
                 if (prices[i] >= mas[i]) {
                     breakdownIdx = i + 1; // Crossed down on the day after
                     break;
                 } else {
                     breakdownIdx = i;
                 }
             }
             return dates[breakdownIdx];
        };

        const sma20BreakdownDate = findBreakdownDate(validPrices, sma20Arr, validDates);
        const ema50BreakdownDate = findBreakdownDate(validPrices, ema50Arr, validDates);
        const ema100BreakdownDate = findBreakdownDate(validPrices, ema100Arr, validDates);
        
        return { 
            sma20, ema50, ema100, 
            currentPrice, lastUpdateDate,
            sma20BreakdownDate, ema50BreakdownDate, ema100BreakdownDate
        };
    } catch (e) {
        console.warn('Failed to fetch MA data for', symbol, e);
        return null;
    }
};


export const getTradingDaysCount = (startDateStr: string) => {
    const start = new Date(startDateStr);
    const end = new Date();
    let count = 0;
    let current = new Date(start);
    // set to midnight to avoid time issues
    current.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    while(current < end) {
        current.setDate(current.getDate() + 1);
        if (current.getDay() !== 0 && current.getDay() !== 6) {
            count++;
        }
    }
    return count;
};
