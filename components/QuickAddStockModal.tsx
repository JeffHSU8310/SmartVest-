import React, { useState } from 'react';
import { Stock, Market, MarketFilter } from '../types';
import { generateId, fetchCurrentYahooQuote } from '../utils';
import { Plus, X, Loader2 } from 'lucide-react';

interface QuickAddStockModalProps {
  onClose: () => void;
  onAddStock: (stock: Stock) => void;
  marketFilter?: MarketFilter;
  suggestedCategory?: string;
  strategy?: 'TENX';
}

const QuickAddStockModal: React.FC<QuickAddStockModalProps> = ({
  onClose,
  onAddStock,
  marketFilter = 'ALL',
  suggestedCategory = '',
  strategy
}) => {
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [stockMarket, setStockMarket] = useState<Market>(
    marketFilter === 'ALL' ? Market.TW : marketFilter as Market
  );
  const [currency, setCurrency] = useState<'TWD' | 'USD'>(
    (marketFilter as string) === 'US' ? 'USD' : 'TWD'
  );
  const [category, setCategory] = useState(suggestedCategory);

  const [lastFetchedTicker, setLastFetchedTicker] = useState('');

  const handleMarketChange = (newMarket: Market) => {
    setStockMarket(newMarket);
    if (newMarket === Market.US) setCurrency('USD');
    else if (newMarket === Market.TW) setCurrency('TWD');
  };

  const handleBlurTicker = async () => {
    const currentTicker = ticker.trim().toUpperCase();
    if (currentTicker && currentTicker.length >= 2 && currentTicker !== lastFetchedTicker) {
      setLastFetchedTicker(currentTicker);
      setIsFetchingName(true);
      try {
        let symbol = ticker.trim().toUpperCase();
        if (stockMarket === Market.TW && !symbol.includes('.')) {
          symbol += '.TW';
        }
        
        // Handle electron environments
        const isDesktopEnv = window.electronAPI?.isElectron || window.location.protocol === 'file:';
        let quoteData = null;
        
        const fetchQuote = async (sym: string) => {
            if (isDesktopEnv && window.electronAPI) {
                const res = await window.electronAPI.fetchYahooQuote(sym);
                return res.data ? { success: true, ...res.data } : null;
            } else {
                const apiRes = await fetchCurrentYahooQuote(sym);
                return (apiRes && apiRes.success) ? apiRes : null;
            }
        };

        if (stockMarket === Market.TW && !ticker.trim().includes('.')) {
            // Try .TW first
            quoteData = await fetchQuote(`${ticker.trim().toUpperCase()}.TW`);
            // If failed, try .TWO (OTC)
            if (!quoteData) {
                quoteData = await fetchQuote(`${ticker.trim().toUpperCase()}.TWO`);
            }
        } else {
            let symbol = ticker.trim().toUpperCase();
            quoteData = await fetchQuote(symbol);
        }

        if (quoteData && (quoteData.shortName || quoteData.longName)) {
          setName(quoteData.shortName || quoteData.longName || '');
        } else {
          setName('');
        }
      } catch (err) {
        console.error("Auto-fetch name failed", err);
      } finally {
        setIsFetchingName(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !name) return;

    onAddStock({
      id: generateId(),
      ticker: ticker.trim().toUpperCase(),
      name: name.trim(),
      category: category.trim(),
      market: stockMarket,
      currency: currency,
      strategy: strategy, 
      ...(strategy === 'TENX' && { isTenX: true })
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b border-blue-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Plus size={20} className="text-blue-600"/> 快速新增股票標的
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
            <X size={20}/>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">市場</label>
            <select
              value={stockMarket}
              onChange={e => handleMarketChange(e.target.value as Market)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={Market.TW}>台股 TW</option>
              <option value={Market.US}>美股 US</option>
              <option value={Market.FUND}>基金 FUND</option>
              <option value={Market.BOND}>債券 BOND</option>
              <option value={Market.COMMODITY}>原物料 CMDTY</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">代號 <span className="text-slate-400 font-normal ml-1">輸入後點擊空白處自動帶入名稱</span></label>
            <div className="relative">
              <input 
                value={ticker}
                onChange={e => setTicker(e.target.value)}
                onBlur={handleBlurTicker}
                placeholder="輸入代號 (例如: 2330)"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                required
              />
              {isFetchingName && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">名稱</label>
            <input 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="名稱自動帶入或手動輸入"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="space-y-1 hidden">
            <label className="block text-xs font-bold text-slate-500 uppercase">預設分類</label>
            <input 
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              readOnly
            />
          </div>
          <button 
            type="submit"
            className="w-full mt-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all text-sm shadow-sm"
          >
            確定新增並套用至此策略
          </button>
        </form>
      </div>
    </div>
  );
};

export default QuickAddStockModal;
