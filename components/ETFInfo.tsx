
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Stock, ETFHolding, ETFDetails } from '../types';
import { RefreshCcw, Search, ExternalLink, Info, AlertCircle, PieChart, Layers, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchYahooHistoryUniversal } from '../utils';

const COLORS = { UP: '#ef4444', DOWN: '#22c55e' };
const CandleStickShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (!payload || typeof x !== 'number' || typeof y !== 'number') return null;
  const { open, close, high, low } = payload;
  if (open == null || close == null || high == null || low == null) return null;
  const isRising = close > open;
  const color = isRising ? COLORS.UP : COLORS.DOWN;
  const range = high - low;
  const ratio = range === 0 ? 0 : height / range;
  const openOffset = (high - open) * ratio;
  const closeOffset = (high - close) * ratio;
  const bodyTop = y + Math.min(openOffset, closeOffset);
  const bodyBottom = y + Math.max(openOffset, closeOffset);
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);

  return (
    <g>
      <line x1={x + width / 2} y1={y} x2={x + width / 2} y2={y + height} stroke={color} strokeWidth={1.5} />
      <rect x={x} y={bodyTop} width={width} height={bodyHeight} fill={color} stroke="none" />
    </g>
  );
};


const getOfficialUrl = (rawTicker: string, name: string) => {
  const ticker = rawTicker.replace(/\.TWO?$/i, '');
  if (ticker === '0050') return 'https://www.yuantaetfs.com/product/detail/0050/ratio';
  if (ticker === '00692') return 'https://websys.fsit.com.tw/FubonETF/Fund/Assets.aspx?stkId=00692';
  if (ticker === '00400A') return 'https://www.cathaysite.com.tw/ETF/detail/EEA?tab=etf3';
  if (ticker === '00988A') return 'https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=61YTW';
  if (ticker === '00697B') return 'https://www.yuantaetfs.com/product/detail/00697B/ratio';
  if (ticker === '00631L') return 'https://www.yuantaetfs.com/product/detail/00631L/ratio';
  if (ticker === 'VOO') return 'https://investor.vanguard.com/investment-products/etfs/profile/voo#portfolio-composition';
  if (ticker === 'VXUS') return 'https://investor.vanguard.com/investment-products/etfs/profile/vxus#portfolio-composition';
  if (ticker === 'SPYM') return 'https://www.ssga.com/us/en/intermediary/etfs/state-street-spdr-portfolio-sp-500-etf-spym';
  if (ticker === 'QQQ') return 'https://www.invesco.com/qqq-etf/en/about.html';
  if (name.includes('元大')) return `https://www.yuantaetfs.com/product/detail/${ticker}/ratio`;
  if (name.includes('富邦')) return `https://websys.fsit.com.tw/FubonETF/Fund/Assets.aspx?stkId=${ticker}`;
  if (name.includes('國泰')) return `https://www.cathaysite.com.tw/ETF/`; 
  if (name.includes('復華')) return `https://www.fhtrust.com.tw/ETF`;
  if (name.includes('群益')) return `https://www.capitalfund.com.tw/etf`;
  if (name.includes('中信') || name.includes('中國信託')) return `https://www.ctbcinvestments.com/Product/ETF`;
  return null;
};

import TechSettingsModal from './TechSettingsModal';
import { TechSettings } from '../types';

interface ETFInfoProps {
  stocks: Stock[];
  techSettings: TechSettings;
  onUpdateTechSettings: (s: TechSettings) => void;
}

const ETFInfo: React.FC<ETFInfoProps> = ({ stocks, techSettings, onUpdateTechSettings }) => {
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [details, setDetails] = useState<ETFDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activeChartSymbol, setActiveChartSymbol] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartName, setChartName] = useState("");
  const [chartInterval, setChartInterval] = useState<'1d' | '1wk' | '1mo' | '1d_adj' | '1wk_adj' | '1mo_adj'>('1d');
  const [chartZoom, setChartZoom] = useState<number>(60); // default to 3 months of trading days
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (activeChartSymbol) {
      setChartLoading(true);
      
      let fetchSymbol = activeChartSymbol;
      const isTW = /^[0-9]{4,6}/.test(fetchSymbol); 
      if (isTW && !fetchSymbol.includes('.')) {
          fetchSymbol += '.TW'; // default to TW
      }
      if (fetchSymbol.endsWith('.US')) {
          fetchSymbol = fetchSymbol.replace('.US', '');
      }
      if (fetchSymbol.endsWith('.JP')) {
          fetchSymbol = fetchSymbol.replace('.JP', '.T');
      }
      
      // Fix US class shares formatting (e.g. BRK.B -> BRK-B)
      const usClassShares = ['BRK.B', 'BRK.A', 'BF.B', 'BF.A'];
      if (usClassShares.includes(fetchSymbol.toUpperCase())) {
          fetchSymbol = fetchSymbol.toUpperCase().replace('.', '-');
      }

      const period2 = Math.floor(Date.now() / 1000);
      const period1 = period2 - 365 * 10 * 24 * 60 * 60; // 10 years of data
      const intervalParam = chartInterval.replace('_adj', '') as '1d' | '1wk' | '1mo';
      const isAdj = chartInterval.includes('_adj');
      
      fetchYahooHistoryUniversal(fetchSymbol, period1, period2, intervalParam).then(data => {
         const result = data?.chart?.result?.[0] || data;
         if (result && result.timestamp) {
             const cData: any[] = [];
             result.timestamp.forEach((ts: number, i: number) => {
                 const quote = result.indicators?.quote?.[0];
                 const adjclose = result.indicators?.adjclose?.[0]?.adjclose?.[i];
                 if (quote && quote.open?.[i] != null) {
                     let open = quote.open[i];
                     let high = quote.high[i];
                     let low = quote.low[i];
                     let close = quote.close[i];
                     
                     if (isAdj && adjclose != null && close > 0) {
                         const factor = adjclose / close;
                         open *= factor;
                         high *= factor;
                         low *= factor;
                         close = adjclose;
                     }
                     
                     cData.push({
                         date: new Date(ts * 1000).toISOString().split('T')[0],
                         open: open,
                         high: high,
                         low: low,
                         close: close,
                         candleRange: [low, high]
                     });
                 }
             });
             
             // Calculate MAs
             const prevEmaValues = new Map<number, number>();
             const processedData = cData.map((item, index, arr) => {
                 const newItem: any = { ...item };
                 techSettings.mas.forEach((ma, maIndex) => {
                     if (!ma.visible) return;
                     const p = ma.period;
                     const mode = ma.mode || 'SMA';
                     if (index >= p - 1) {
                         const slice = arr.slice(index - p + 1, index + 1);
                         
                         if (mode === 'SMA') {
                             const sum = slice.reduce((acc, curr) => acc + curr.close, 0); 
                             newItem[`ma_${maIndex}`] = sum / p;
                         } else if (mode === 'WMA') {
                             let wSum = 0; let weightSum = 0;
                             for (let i = 0; i < p; i++) { const w = i + 1; wSum += slice[i].close * w; weightSum += w; }
                             newItem[`ma_${maIndex}`] = wSum / weightSum;
                         } else if (mode === 'EMA' || mode === 'S-EMA') {
                             if (index === p - 1) { const sum = slice.reduce((acc, curr) => acc + curr.close, 0); const val = sum / p; prevEmaValues.set(maIndex, val); newItem[`ma_${maIndex}`] = val; } 
                             else {
                                 const prev = prevEmaValues.get(maIndex)!; const k = 2 / (p + 1);
                                 const val = (item.close - prev) * k + prev; prevEmaValues.set(maIndex, val);
                                 newItem[`ma_${maIndex}`] = val;
                             }
                         }
                     }
                 });
                 return newItem;
             });

             setChartData(processedData);
         } else {
             setChartData([]);

         }
      }).catch(e => {
         console.warn("Chart fetch error", e);
         setChartData([]);
      }).finally(() => {
         setChartLoading(false);
      });
    } else {
      setChartData([]);
    }
  }, [activeChartSymbol, chartInterval]);

  useEffect(() => {
    // Scroll to the end when chartData or chartZoom changes
    if (scrollRef.current && chartData.length > 0) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [chartData, chartZoom]);

  const displayChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    
    const now = new Date();
    let startDate = new Date();
    
    if (chartZoom === 20) {
        startDate.setMonth(now.getMonth() - 1);
    } else if (chartZoom === 60) {
        startDate.setMonth(now.getMonth() - 3);
    } else if (chartZoom === 120) {
        startDate.setMonth(now.getMonth() - 6);
    } else if (chartZoom === 240) {
        startDate.setFullYear(now.getFullYear() - 1);
    } else if (chartZoom === 480) {
        startDate.setFullYear(now.getFullYear() - 2);
    } else {
        startDate.setMonth(now.getMonth() - 3);
    }
    
    const startTimeStr = startDate.toISOString().split('T')[0];
    return chartData.filter(d => d.date >= startTimeStr);
  }, [chartData, chartZoom]);

  const { twEtfs, usEtfs, otherEtfs, totalEtfs } = useMemo(() => {
    const etfs = stocks.filter(s => s.category?.toUpperCase().includes('ETF'));
    const uniqueEtfs = Array.from(new Set(etfs.map(s => s.ticker)))
      .map(ticker => etfs.find(s => s.ticker === ticker)!);
      
    const tw: Stock[] = [];
    const us: Stock[] = [];
    const other: Stock[] = [];
    
    uniqueEtfs.forEach(s => {
      if (s.market === 'TW') tw.push(s);
      else if (s.market === 'US') us.push(s);
      else other.push(s);
    });
    return { twEtfs: tw, usEtfs: us, otherEtfs: other, totalEtfs: uniqueEtfs.length };
  }, [stocks]);

  const fetchHoldings = async (stock: Stock) => {
    setLoading(true);
    setError(null);
    setDetails(null);
    try {
      let symbol = stock.ticker;
      if (stock.market === 'TW' && !symbol.includes('.')) {
        symbol += '.TW';
      }
      
      let res: Response | null = null;
      let apiData = null;
      
      // 1. Try backend API or Electron IPC directly
      try {
          const isDesktop = window?.location?.protocol === 'file:' || window?.location?.protocol?.includes('app') || window?.location?.protocol?.includes('tauri');
          
          if (isDesktop && window.electronAPI && window.electronAPI.fetchETFHoldings) {
              const res = await window.electronAPI.fetchETFHoldings(symbol);
              if (res.data) {
                  apiData = res.data;
              }
          }
      } catch (e) {
          console.warn("Backend API not reachable. Falling back to client-side fetching.");
      }

      if (apiData) {
          setDetails(apiData);
          setLoading(false);
          return;
      }

      // 2. Client-Side Fallback (Scraping MoneyDJ directly via Proxy)
      const cleanSymbol = symbol.replace('.TWO', '').replace('.TW', '');
      const isTW = stock.market === 'TW' || symbol.endsWith('.TW') || /^[0-9]{4,6}[A-Za-z]?$/.test(cleanSymbol);
      const targetMdjSymbol = isTW ? `${cleanSymbol}.TW` : cleanSymbol;
      const mdjUrl = `https://www.moneydj.com/ETF/X/Basic/Basic0007.xdjhtm?etfid=${targetMdjSymbol}`;
      
      const proxies = [
          'https://api.codetabs.com/v1/proxy?quest=',
          'https://api.allorigins.win/raw?url=',
          'https://corsproxy.io/?'
      ];
      
      let html = '';
      for (const proxy of proxies) {
          try {
              const proxyRes = await fetch(proxy + encodeURIComponent(mdjUrl));
              if (proxyRes.ok) {
                  html = await proxyRes.text();
                  if (html.includes('<table')) break;
              }
          } catch(e) { continue; }
      }
      
      if (!html) {
          throw new Error('無法連線至外部資料源 (CORS/Proxy Error)');
      }

      // Parse HTML with DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const holdings: any[] = [];
      const tables = Array.from(doc.querySelectorAll('table'));
      tables.forEach(table => {
          const trs = Array.from(table.querySelectorAll('tr'));
          if (trs.length === 0) return;
          const headerText = trs[0].textContent?.replace(/\s+/g, '') || '';
          if (headerText.includes('名稱') && headerText.includes('比例')) {
              for (let i = 1; i < trs.length; i++) {
                  const cells = Array.from(trs[i].querySelectorAll('td'));
                  if (cells.length >= 2) {
                      let hName = cells[0].textContent?.trim() || '';
                      let weightStr = cells[1].textContent?.trim() || '';
                      let weight = parseFloat(weightStr);
                      
                      let hSym = '';
                      const symMatch = hName.match(/\((.*?)\)/);
                      if (symMatch) {
                          hSym = symMatch[1];
                          hName = hName.replace(/\(.*?\)/, '').trim();
                      }
                      
                      if (hName && !isNaN(weight)) {
                          holdings.push({
                              symbol: hSym,
                              name: hName,
                              weight
                          });
                      }
                  }
              }
          }
      });

      if (holdings.length === 0) {
          throw new Error('找不到該 ETF 的持股資料 (可能已下市或無公開資料)');
      }

      setDetails({
          ticker: symbol,
          name: stock.name,
          updatedAt: new Date().toISOString(),
          holdings: holdings.sort((a, b) => b.weight - a.weight),
          expenseRatio: undefined,
          yield: undefined
      });
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStock) {
      setActiveChartSymbol(selectedStock.ticker);
      setChartName(selectedStock.name);
      fetchHoldings(selectedStock);
    }
  }, [selectedStock]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Layers className="text-blue-500" />
            庫存 ETF 資訊
          </h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Inventory ETF Details & Holdings</p>
        </div>
        
        <div className="flex gap-2 items-center text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border border-amber-200 shadow-sm">
          <AlertCircle size={14} />
          <span>資料來源：Yahoo Finance (部分台股 ETF 可能查無持股)</span>
        </div>
      </div>

      {/* ETF Tags */}
      <div className="glass-panel rounded-2xl p-4 shadow-sm space-y-4">
        {totalEtfs > 0 ? (
          <>
            {twEtfs.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                  <Search size={14} /> 台股 ETF
                </h3>
                <div className="flex flex-wrap gap-2">
                  {twEtfs.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStock(s)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        selectedStock?.id === s.id
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {usEtfs.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                  <Search size={14} /> 美股 ETF
                </h3>
                <div className="flex flex-wrap gap-2">
                  {usEtfs.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStock(s)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        selectedStock?.id === s.id
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {otherEtfs.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                  <Search size={14} /> 其他市場 ETF
                </h3>
                <div className="flex flex-wrap gap-2">
                  {otherEtfs.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStock(s)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        selectedStock?.id === s.id
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-slate-400 text-sm py-4 italic">目前沒有標記為 ETF 的標的，請至股票管理設定分類。</div>
        )}
      </div>

      {/* ETF Content */}
      <AnimatePresence mode="wait">
        {selectedStock ? (
          <motion.div
            key={selectedStock.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <RefreshCcw className="animate-spin text-blue-500" size={32} />
                <p className="text-slate-500 font-bold">正在載入持股明細...</p>
              </div>
            ) : error ? (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-500">
                  <AlertCircle size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-rose-800">資料查詢失敗</h3>
                  <p className="text-rose-600">{error}</p>
                </div>
                <button 
                  onClick={() => fetchHoldings(selectedStock)}
                  className="px-4 py-2 bg-rose-500 text-white rounded-lg font-bold hover:bg-rose-600 transition-colors"
                >
                  重試
                </button>
              </div>
            ) : details ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Basic Info */}
                <div className="lg:col-span-1 space-y-6 sticky top-6">
                  <div className="glass-panel rounded-3xl p-6 shadow-sm border-l-4 border-l-blue-500">
                    <div 
                      className="mb-4 cursor-pointer hover:bg-slate-50 p-2 -ml-2 rounded-xl transition-colors"
                      onClick={() => {
                         setActiveChartSymbol(details.ticker);
                         setChartName(details.name);
                      }}
                    >
                      <span className="bg-blue-100 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">ETF SUMMARY</span>
                      <h3 className="text-2xl font-black text-slate-800 mt-1">{details.name}</h3>
                      <p className="text-slate-500 font-mono text-sm">{details.ticker}</p>
                    </div>

                    <div className="w-full bg-[#0f172a] p-4 rounded-2xl border border-slate-800 mt-4 shadow-inner">
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{activeChartSymbol}</span>
                          <p className="text-sm font-black text-white">{chartName}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                           <div className="flex bg-slate-800/50 rounded-lg p-0.5 shadow-inner border border-slate-700/50">
                               {[20, 60, 120, 240, 480].map((zoom) => (
                                   <button 
                                       key={zoom} 
                                       onClick={(e) => { e.stopPropagation(); setChartZoom(zoom); }} 
                                       className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all ${chartZoom === zoom ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                                   >
                                       {zoom === 480 ? '2Y' : zoom === 240 ? '1Y' : zoom === 120 ? '6M' : zoom === 60 ? '3M' : '1M'}
                                   </button>
                               ))}
                           </div>
                           <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                               {['1d', '1wk', '1mo', '1d_adj', '1wk_adj', '1mo_adj'].map((intv) => (
                                   <button 
                                       key={intv} 
                                       onClick={(e) => { e.stopPropagation(); setChartInterval(intv as any); }} 
                                       className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${chartInterval === intv ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                   >
                                       {intv === '1d' ? '日' : intv === '1wk' ? '週' : intv === '1mo' ? '月' : intv === '1d_adj' ? '還原日' : intv === '1wk_adj' ? '還原週' : '還原月'}
                                   </button>
                               ))}
                           </div>
                           <button onClick={(e) => { e.stopPropagation(); setShowSettings(true); }} className="px-1.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all flex items-center gap-1 border border-slate-700">
                               <Settings size={12}/>
                           </button>
                           {chartLoading && <RefreshCcw className="animate-spin text-blue-500 ml-1" size={14} />}
                        </div>
                      </div>
                      
                      <div className="h-56 w-full mt-4">
                        <div style={{ width: '100%', height: '100%' }}>
                          {displayChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={displayChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                                <XAxis dataKey="date" hide />
                                <YAxis 
                                  domain={['auto', 'auto']} 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fontSize: 10, fill: '#64748b' }} 
                                  width={70}
                                  orientation="right"
                                  tickFormatter={(val) => Math.floor(val).toLocaleString()}
                                />
                                <Tooltip 
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-800 text-white p-2 rounded-lg text-xs shadow-xl border border-slate-700">
                                          <p className="font-mono text-slate-400 mb-1">{data.date}</p>
                                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                            <span className="text-slate-400">開盤</span>
                                            <span className="text-right font-mono">{data.open?.toFixed(2)}</span>
                                            <span className="text-slate-400">最高</span>
                                            <span className="text-right font-mono text-rose-400">{data.high?.toFixed(2)}</span>
                                            <span className="text-slate-400">最低</span>
                                            <span className="text-right font-mono text-emerald-400">{data.low?.toFixed(2)}</span>
                                            <span className="text-slate-400">收盤</span>
                                            <span className="text-right font-mono font-bold">{data.close?.toFixed(2)}</span>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Bar dataKey="candleRange" shape={<CandleStickShape />} isAnimationActive={false} />
                                {techSettings.mas.map((ma, i) => ma.visible && (
                                   <Line key={`ma-line-${i}`} type="monotone" dataKey={`ma_${i}`} name={`${ma.mode}${ma.period}`} stroke={ma.color} dot={false} strokeWidth={1} isAnimationActive={false} />
                                ))}
                              </ComposedChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex items-center justify-center h-full text-xs text-slate-500">
                              {chartLoading ? '載入中...' : '無 K 線資料'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 flex items-center justify-between text-[10px] text-slate-400">
                      <span>資料更新時間</span>
                      <span>{new Date(details.updatedAt).toLocaleString()}</span>
                    </div>
                    
                    <button 
                      onClick={() => fetchHoldings(selectedStock)}
                      className="w-full mt-4 py-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100"
                    >
                      <RefreshCcw size={14} /> 立即更新數據
                    </button>
                  </div>
                  
                  {/* Market info link */}
                  <div className="glass-panel rounded-3xl p-6 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                       <Info size={16} className="text-blue-400"/> 
                       外部資訊連結
                    </h4>
                    <div className="space-y-2">
                      <a 
                        href={`https://tw.stock.yahoo.com/quote/${selectedStock.ticker}${selectedStock.market === 'TW' ? '.TW' : ''}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 bg-white hover:bg-blue-50 border border-slate-100 rounded-xl transition-all group"
                      >
                        <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600 transition-colors">Yahoo 股市</span>
                        <ExternalLink size={14} className="text-slate-300 group-hover:text-blue-400" />
                      </a>
                      
                      {(() => {
                        const officialUrl = getOfficialUrl(selectedStock.ticker, selectedStock.name);
                        return officialUrl ? (
                          <a 
                            href={officialUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-xl transition-all group"
                          >
                            <span className="text-sm font-bold text-emerald-700 group-hover:text-emerald-800 transition-colors">發行商官網 (持股明細)</span>
                            <ExternalLink size={14} className="text-emerald-400 group-hover:text-emerald-600" />
                          </a>
                        ) : null;
                      })()}

                      <a 
                        href={`https://www.google.com/search?q=${encodeURIComponent(details.name + ' 持股')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 bg-white hover:bg-blue-50 border border-slate-100 rounded-xl transition-all group"
                      >
                        <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600 transition-colors">Google 搜尋持股</span>
                        <ExternalLink size={14} className="text-slate-300 group-hover:text-blue-400" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Holdings List */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="glass-panel rounded-3xl p-6 shadow-sm flex flex-col max-h-[85vh]">
                    <div className="flex flex-col mb-6 shrink-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                          <PieChart className="text-blue-500" size={20} />
                          持股明細及占比
                        </h3>
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">Top {details.holdings.length}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <AlertCircle size={12} className="inline mr-1 text-slate-400" />
                        註：因多數公開資訊網站及發行商防爬蟲限制，目前主要提供最新「前十大持股」之中英文名稱資訊。
                      </p>
                    </div>

                    <div className="overflow-x-auto overflow-y-auto flex-1 classic-scrollbar pr-2">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="py-4 text-xs font-black text-slate-400 uppercase pl-2">標的</th>
                            <th className="py-4 text-xs font-black text-slate-400 uppercase text-right">權重占比</th>
                            <th className="py-4 text-xs font-black text-slate-400 uppercase text-right pr-2">占比視覺化</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {details.holdings.map((h, idx) => (
                            <tr 
                                key={idx} 
                                className={`hover:bg-slate-50 transition-colors group cursor-pointer ${activeChartSymbol === h.symbol ? 'bg-blue-50/50' : ''}`}
                                onClick={() => {
                                  if (h.symbol) {
                                    setActiveChartSymbol(h.symbol);
                                    setChartName(h.name);
                                  }
                                }}
                            >
                              <td className="py-4 pl-2">
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-slate-700 group-hover:text-blue-600 transition-colors">{h.name}</span>
                                    {h.sector && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wider border border-slate-200">{h.sector}</span>}
                                  </div>
                                  {h.symbol && <span className="text-[10px] font-mono text-slate-400 mt-0.5">{h.symbol}</span>}
                                </div>
                              </td>
                              <td className="py-4 text-right pr-4">
                                <span className="text-sm font-black text-slate-700">{h.weight.toFixed(2)}%</span>
                              </td>
                              <td className="py-4 pr-2 w-32 md:w-48">
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${h.weight}%` }}
                                    transition={{ duration: 1, delay: idx * 0.05 }}
                                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600"
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 bg-white/50 backdrop-blur-sm border border-slate-200 border-dashed rounded-[40px] text-slate-400">
            <PieChart size={64} strokeWidth={1} className="mb-6 opacity-20" />
            <h3 className="text-xl font-bold">請點選上方 ETF 標籤</h3>
            <p className="text-sm">檢視該 ETF 的詳細持股與基本資料</p>
          </div>
        )}
      </AnimatePresence>
      {showSettings && (
        <TechSettingsModal
            techSettings={techSettings}
            onUpdateTechSettings={onUpdateTechSettings}
            onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default ETFInfo;
