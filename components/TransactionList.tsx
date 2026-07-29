
import React, { useState, useMemo } from 'react';
import { Transaction, Stock, TransactionType, Market, Account, MarketFilter } from '../types';
import { Edit2, Trash2, ArrowUpRight, ArrowDownRight, Coins, X, Filter, Search, Tag, Plus, Calculator, Lock, Calendar, Split, Eye, EyeOff } from 'lucide-react';
import { calculatePortfolio } from '../utils';

interface Props {
  transactions: Transaction[];
  stocks: Stock[];
  accounts: Account[];
  marketFilter: MarketFilter;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  onAddTransaction: (stockId?: string, accountId?: string, strategy?: string) => void;
}

const TransactionList: React.FC<Props> = ({ transactions, stocks, accounts, marketFilter, onEdit, onDelete, onAddTransaction }) => {
  const [filterAccountId, setFilterAccountId] = useState('ALL');
  const [filterStockId, setFilterStockId] = useState('ALL');
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showVirtual, setShowVirtual] = useState(false);

  const stockMap = new Map<string, Stock>();
  stocks.forEach(s => stockMap.set(s.id, s));

  const accountMap = new Map<string, Account>();
  accounts.forEach(a => accountMap.set(a.id, a));
  
  const securitiesAccounts = useMemo(() => {
    return accounts.filter(a => a.isSecurities !== false);
  }, [accounts]);

  // 全域按時間排序的交易紀錄，用於計算特定時點的歷史平均成本
  const chronologicallySortedAllTxs = useMemo(() => {
    return [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions]);
  
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        const stock = stockMap.get(t.stockId);
        if (marketFilter !== 'ALL' && stock?.market !== marketFilter) return false;
        if (filterAccountId !== 'ALL' && t.accountId !== filterAccountId) return false;
        if (filterStockId !== 'ALL' && t.stockId !== filterStockId) return false;
        if (filterType !== 'ALL' && t.type !== filterType) return false;
        if (startDate && t.date < startDate) return false;
        if (endDate && t.date > endDate) return false;
        if (!showVirtual && accountMap.get(t.accountId)?.excludeFromTotals) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, marketFilter, filterAccountId, filterStockId, filterType, stocks, startDate, endDate, showVirtual]);

  const availableStocks = useMemo(() => {
    const marketStocks = stocks.filter(s => marketFilter === 'ALL' || s.market === marketFilter);
    if (filterAccountId === 'ALL') return marketStocks;

    const accountStockIds = new Set<string>();
    transactions.forEach(t => {
      if (t.accountId === filterAccountId) {
        accountStockIds.add(t.stockId);
      }
    });

    return marketStocks.filter(s => accountStockIds.has(s.id));
  }, [stocks, transactions, marketFilter, filterAccountId]);

  // 輔助函式：計算特定賣出交易的已實現損益
  const getRealizedGainForSell = (tx: Transaction) => {
    if (tx.type !== TransactionType.SELL) return null;

    // 獲取標的資訊
    const stock = stocks.find(s => s.id === tx.stockId);
    if (!stock) return null;

    // 確定這筆交易在時間軸上的位置（使用 ID 防止同日期排序混亂）
    const txDateMs = new Date(tx.date).getTime();
    const txIndexInTimeline = chronologicallySortedAllTxs.findIndex(t => t.id === tx.id);

    // 找出所有在「這筆賣出之前」發生的同帳戶同標的交易
    const txsBefore = chronologicallySortedAllTxs.filter((t, idx) => {
        if (t.accountId !== tx.accountId || t.stockId !== tx.stockId) return false;
        const tDateMs = new Date(t.date).getTime();
        if (tDateMs < txDateMs) return true;
        if (tDateMs === txDateMs && idx < txIndexInTimeline) return true;
        return false;
    });

    const txsWithCurrent = [...txsBefore, tx];

    // 計算這筆交易之前的已實現損益
    const portfolioBefore = calculatePortfolio([stock], txsBefore, 'FIFO');
    const realizedBefore = portfolioBefore.reduce((sum, p) => sum + p.realizedGain + (p.historicalRealizedGain || 0), 0);
    const realizedBeforeTWD = portfolioBefore.reduce((sum, p) => sum + (p.realizedGainTWD || 0) + (p.historicalRealizedGainTWD || 0), 0);

    // 計算包含這筆交易的已實現損益
    const portfolioAfter = calculatePortfolio([stock], txsWithCurrent, 'FIFO');
    const realizedAfter = portfolioAfter.reduce((sum, p) => sum + p.realizedGain + (p.historicalRealizedGain || 0), 0);
    const realizedAfterTWD = portfolioAfter.reduce((sum, p) => sum + (p.realizedGainTWD || 0) + (p.historicalRealizedGainTWD || 0), 0);

    const gain = realizedAfter - realizedBefore;
    const gainTWD = realizedAfterTWD - realizedBeforeTWD;

    return { gain, gainTWD };
  };

  const handleAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterAccountId(e.target.value);
    setFilterStockId('ALL');
  };

  const getIcon = (type: TransactionType) => {
    switch (type) {
      case TransactionType.BUY: return <ArrowDownRight className="text-emerald-500" size={18} />;
      case TransactionType.SELL: return <ArrowUpRight className="text-rose-500" size={18} />;
      case TransactionType.DIVIDEND: return <Coins className="text-amber-500" size={18} />;
      case TransactionType.SPLIT: return <Split className="text-purple-500" size={18} />;
    }
  };

  const getLabel = (type: TransactionType) => {
    switch (type) {
      case TransactionType.BUY: return '買進';
      case TransactionType.SELL: return '賣出';
      case TransactionType.DIVIDEND: return '領息';
      case TransactionType.SPLIT: return '股票分割';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
               <ListIcon size={20} />
            </div>
            <h3 className="font-bold text-slate-800 text-lg">交易紀錄 <span className="text-sm font-normal text-slate-500 ml-1">({filteredTransactions.length} 筆)</span></h3>
            <button 
              onClick={() => onAddTransaction()}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2.5 py-1 rounded-full flex items-center gap-1 text-[10px] font-bold shadow-md hover:shadow-lg transition-all ml-1"
            >
                <Plus size={12} /><span>(股)記一筆</span>
            </button>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
           <div className="flex items-center gap-2 bg-white px-1 py-1 rounded-xl border border-slate-200 shadow-sm">
             <div className="flex items-center gap-2 pl-3 bg-slate-50 rounded-lg px-2 py-1">
                <Filter size={14} className="text-slate-400"/>
                <span className="text-xs font-bold text-slate-500">帳戶</span>
                <select 
                  value={filterAccountId}
                  onChange={handleAccountChange}
                  className="bg-transparent text-sm text-slate-700 font-bold py-1 pr-1 focus:outline-none cursor-pointer max-w-[120px]"
                >
                  <option value="ALL">全部</option>
                  {securitiesAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
             </div>

             <div className="w-px h-6 bg-slate-200"></div>

             <div className="flex items-center gap-2 pl-1 pr-1">
                <Search size={14} className="text-slate-400"/>
                <span className="text-xs font-bold text-slate-500">股票</span>
                <select 
                  value={filterStockId}
                  onChange={(e) => setFilterStockId(e.target.value)}
                  className="bg-transparent text-sm text-slate-700 font-bold py-1 pr-1 focus:outline-none cursor-pointer max-w-[140px]"
                >
                  <option value="ALL">全部</option>
                  {availableStocks.map(s => <option key={s.id} value={s.id}>{s.ticker} {s.name}</option>)}
                </select>
             </div>

             <div className="w-px h-6 bg-slate-200"></div>

             <div className="flex items-center gap-2 pl-1 pr-2">
                <Tag size={14} className="text-slate-400"/>
                <span className="text-xs font-bold text-slate-500">類別</span>
                <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as TransactionType | 'ALL')}
                  className="bg-transparent text-sm text-slate-700 font-bold py-1 pr-1 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">全部</option>
                  <option value={TransactionType.BUY}>買進</option>
                  <option value={TransactionType.SELL}>賣出</option>
                  <option value={TransactionType.DIVIDEND}>領息</option>
                  <option value={TransactionType.SPLIT}>股票分割</option>
                </select>
             </div>

             <div className="w-px h-6 bg-slate-200"></div>

             <div className="flex items-center gap-2 pl-1 pr-2">
                <Calendar size={14} className="text-slate-400"/>
                <span className="text-xs font-bold text-slate-500">日期</span>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-600 focus:outline-none focus:border-blue-400 w-24"
                />
                <span className="text-slate-300">~</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-600 focus:outline-none focus:border-blue-400 w-24"
                />
             </div>

             <div className="w-px h-6 bg-slate-200"></div>

             <button
                onClick={() => setShowVirtual(!showVirtual)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  showVirtual 
                    ? 'bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200' 
                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-200'
                }`}
                title={showVirtual ? '隱藏虛擬帳戶交易' : '顯示虛擬帳戶交易'}
             >
                {showVirtual ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>虛擬帳戶</span>
             </button>

             {(filterAccountId !== 'ALL' || filterStockId !== 'ALL' || filterType !== 'ALL' || startDate || endDate) && (
               <button 
                 onClick={() => { setFilterAccountId('ALL'); setFilterStockId('ALL'); setFilterType('ALL'); setStartDate(''); setEndDate(''); }}
                 className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                 title="清除篩選"
               >
                 <X size={16} />
               </button>
             )}
           </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-bold">交易日期</th>
              <th className="px-6 py-4 font-bold">交割日期</th>
              <th className="px-6 py-4 font-bold">帳戶</th>
              <th className="px-6 py-4 font-bold">股票</th>
              <th className="px-6 py-4 font-bold">類別</th>
              <th className="px-6 py-4 font-bold text-right">單價</th>
              <th className="px-6 py-4 font-bold text-right">數量</th>
              <th className="px-6 py-4 font-bold text-right">總金額</th>
              <th className="px-6 py-4 font-bold">備註</th>
              <th className="px-6 py-4 font-bold text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                     <div className="p-4 bg-slate-50 rounded-full text-slate-300">
                        <Filter size={32} />
                     </div>
                     <p className="text-slate-400 font-medium">沒有符合篩選條件的交易紀錄</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredTransactions.map(tx => {
                const stock = stockMap.get(tx.stockId);
                const account = tx.accountId ? accountMap.get(tx.accountId) : null;
                const principal = tx.price * tx.quantity;
                const fee = tx.fee || 0;
                const tax = tx.tax || 0;
                let total = principal;

                if (tx.type === TransactionType.BUY) total = principal + fee;
                else if (tx.type === TransactionType.SELL) total = principal - fee - tax;
                else if (tx.type === TransactionType.DIVIDEND) total = principal - fee;
                else if (tx.type === TransactionType.SPLIT) total = 0;
                
                // 重要修正：判斷幣別而非判斷市場
                const isUSD = stock?.currency === 'USD' || (stock?.market === Market.US && !stock?.currency);
                
                const realizedGainData = tx.type === TransactionType.SELL ? getRealizedGainForSell(tx) : null;
                const realizedGain = realizedGainData ? realizedGainData.gain : null;
                const realizedGainTWD = realizedGainData ? realizedGainData.gainTWD : null;
                
                // 使用交易時的匯率或標的預設匯率計算台幣估計值
                const twdTotal = (isUSD && tx.type !== TransactionType.SPLIT) ? Math.abs(total) * (tx.exchangeRate || 1) : null;

                // 30-Day Lock Logic
                const txDateObj = new Date(tx.date);
                const limitDate = new Date();
                limitDate.setDate(limitDate.getDate() - 30);
                limitDate.setHours(0, 0, 0, 0); 
                txDateObj.setHours(0, 0, 0, 0);
                const isLocked = txDateObj < limitDate;

                return (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">{tx.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono text-xs">{tx.settlementDate || '-'}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                         {account?.name || '未分類'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {stock ? (
                        <div className="flex flex-col">
                           <span className="font-bold text-slate-800">{stock.name}</span>
                           <span className="text-[10px] text-slate-400 font-mono bg-slate-100 w-fit px-1 rounded">{stock.ticker}</span>
                        </div>
                      ) : <span className="text-red-400 font-bold">Unknown</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getIcon(tx.type)}
                        <span className={`font-bold ${
                           tx.type === TransactionType.BUY ? 'text-emerald-700' : 
                           tx.type === TransactionType.SELL ? 'text-rose-700' : 
                           tx.type === TransactionType.DIVIDEND ? 'text-amber-700' : 'text-purple-700'
                        }`}>
                          {getLabel(tx.type)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {tx.isDCA && <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded border border-sky-200 font-bold whitespace-nowrap">定期定額</span>}
                        {tx.isDRIP && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 font-bold whitespace-nowrap">股利再投入</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-600">
                      {(tx.type === TransactionType.DIVIDEND || tx.type === TransactionType.SPLIT) ? '-' : tx.price.toLocaleString(undefined, { maximumFractionDigits: isUSD ? 4 : 2, minimumFractionDigits: isUSD ? 2 : 2 })}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-600">
                      {tx.type === TransactionType.DIVIDEND ? '-' : tx.quantity.toLocaleString(undefined, { maximumFractionDigits: 5 })}
                    </td>
                    <td className={`px-6 py-4 text-right font-mono font-bold ${tx.type === TransactionType.BUY ? 'text-emerald-600' : tx.type === TransactionType.SPLIT ? 'text-purple-600' : 'text-rose-600'}`}>
                      {tx.type === TransactionType.SPLIT ? '-' : (
                      <div className="flex flex-col items-end">
                         <div>
                            <span className="text-xs text-slate-400 mr-1 font-normal">{isUSD ? 'USD' : 'TWD'}</span>
                            {Math.abs(total).toLocaleString(undefined, { maximumFractionDigits: isUSD ? 2 : 0, minimumFractionDigits: isUSD ? 2 : 0 })}
                         </div>
                         {/* 顯示美金項目的台幣約略值 */}
                         {isUSD && twdTotal !== null && (
                             <div className="text-xs text-slate-400 font-medium mt-0.5 whitespace-nowrap">
                                 ≈ NT$ {Math.round(twdTotal).toLocaleString()}
                             </div>
                         )}
                         {realizedGain !== null && (
                            <div className="flex flex-col items-end gap-0.5 mt-1">
                               <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border ${realizedGain >= 0 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                  <Calculator size={10} />
                                  已實現: {realizedGain >= 0 ? '+' : ''}{realizedGain.toLocaleString(undefined, { maximumFractionDigits: isUSD ? 2 : 0 })}
                               </div>
                               {isUSD && realizedGainTWD !== null && (
                                  <div className={`text-[10px] font-mono opacity-80 ${realizedGain >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                     ≈ NT$ {Math.round(realizedGainTWD).toLocaleString()}
                                  </div>
                               )}
                            </div>
                         )}
                      </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 max-w-xs">
                       {tx.type === TransactionType.DIVIDEND && (tx.exDividendDate || tx.paymentDate) && (
                          <div className="flex flex-wrap gap-x-2 text-[10px] text-blue-600/80 mb-1 font-mono bg-blue-50 rounded px-1.5 py-0.5 w-fit border border-blue-100">
                            {tx.exDividendDate && <span>除:{tx.exDividendDate.split('-').slice(1).join('/')}</span>}
                            {tx.paymentDate && <span>配:{tx.paymentDate.split('-').slice(1).join('/')}</span>}
                          </div>
                       )}
                       <div className="truncate text-xs" title={tx.note}>{tx.note}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       {isLocked ? (
                           <div className="flex justify-end gap-2 text-slate-300" title="超過30天無法修改/刪除">
                               <Lock size={16} />
                           </div>
                       ) : (
                           <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                              onClick={() => onEdit(tx)}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                              title="編輯"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => onDelete(tx.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors"
                              title="刪除"
                            >
                              <Trash2 size={16} />
                            </button>
                           </div>
                       )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ListIcon = ({size}: {size: number}) => (
   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
   </svg>
);

export default React.memo(TransactionList);
