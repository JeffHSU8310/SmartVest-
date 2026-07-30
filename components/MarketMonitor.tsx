
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { KLineData, TechSettings, MAMode, HorizontalLineSetting } from '../types';
import { 
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea, Scatter
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, BarChart3, Users, 
  Plus, X, Check, Database, Edit2, Loader2, RefreshCw, Maximize2, Settings, Sliders, GripHorizontal, MoveVertical, Ruler, Download, Upload, Calendar, BrainCircuit, Search, Microscope, Zap, Filter, Gauge, Lock, Sparkles, Bot, Cpu, Table, Target
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import TechSettingsModal from './TechSettingsModal';
import { fetchYahooHistoryUniversal, fetchCurrentYahooQuote, getLocalTodayString, getLocalPastYearString, fetchFearGreedDirect } from '../utils';

const COLORS = {
  UP: '#ef4444',
  DOWN: '#22c55e',
  FOREIGN: '#3b82f6',
  TRUST: '#f59e0b',
  DEALER: '#8b5cf6',
  MARGIN: '#ec4899',
  SHORT: '#10b981',
  GRID: '#1e293b',
  TEXT: '#64748b',
  MA_DEFAULT: ['#fbce07', '#f97316', '#a855f7', '#3b82f6', '#10b981', '#94a3b8']
};

interface Props {
  data: KLineData[];
  onUpdateData: (newData: KLineData[]) => void;
  techSettings: TechSettings;
  onUpdateTechSettings: (settings: TechSettings) => void;
  initialSymbol?: string | null;
  onClearInitialSymbol?: () => void;
}

interface PatternVisual {
  x1: string;
  y1: number;
  x2: string;
  y2: number;
  stroke: string;
  label?: string;
}

interface PatternResult {
  name: string;
  detected: boolean;
  description: string;
  confidence: 'High' | 'Medium' | 'Low';
  details?: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  visuals?: PatternVisual[];
}

interface ChipSignal {
    title: string;
    type: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'WARNING';
    description: string;
    scoreImpact: number;
}

interface ChipAnalysisResult {
    score: number; 
    sentiment: 'Strongly Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strongly Bearish';
    signals: ChipSignal[];
    summary: string;
}

type SubChartType = 'VOL' | 'KD' | 'MACD' | 'RSI' | 'JR' | 'INST' | 'FOREIGN' | 'TRUST' | 'DEALER' | 'MARGIN' | 'SHORT' | 'BBW' | 'TX_FOREIGN' | 'MTX_RETAIL' | 'TMF_RETAIL';
type KLineType = 'DAY' | 'WEEK' | 'MONTH' | 'ADJ_DAY' | 'ADJ_WEEK' | 'ADJ_MONTH';

const formatNum = (val: number | undefined) => {
  if (val === undefined || isNaN(val)) return '0';
  return val.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const CandleStickShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  
  if (!payload || typeof x !== 'number' || typeof y !== 'number') return null;

  const { open, close, high, low, prevClose } = payload;
  
  if (open == null || close == null || high == null || low == null) return null;

  // 決定顏色：台灣股市一般是看與前收盤價的差異，但K線圖的實體(紅黑)是看開收盤價
  // isRising 決定K線是紅(收>開)或綠(收<開)
  // 如果收盤與開盤平盤，如果高於前一日收盤(漲)，我們也可以給紅，但一般就跟前一日收盤比
  // 如果也沒有prevClose，收=開則為黃(平盤)
  let kLineColor = COLORS.UP;
  if (close > open) kLineColor = COLORS.UP;
  else if (close < open) kLineColor = COLORS.DOWN;
  else {
    // 十字線或一字線
    if (prevClose && close > prevClose) kLineColor = COLORS.UP;
    else if (prevClose && close < prevClose) kLineColor = COLORS.DOWN;
    else kLineColor = '#fbce07'; // 平盤黃色
  }
  
  // 一字線判斷 (開=收=高=低) 代表開盤鎖到底
  const isOneLineLimit = (open === close && high === low && open === high);
  
  const range = high - low;
  const ratio = range === 0 ? 0 : height / range;
  
  const openOffset = (high - open) * ratio;
  const closeOffset = (high - close) * ratio;
  
  const bodyTop = y + Math.min(openOffset, closeOffset);
  const bodyBottom = y + Math.max(openOffset, closeOffset);
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);

  return (
    <g>
      <line 
        x1={x + width / 2} 
        y1={y} 
        x2={x + width / 2} 
        y2={y + height} 
        stroke={kLineColor} 
        strokeWidth={1.5} 
      />
      <rect 
        x={x} 
        y={bodyTop} 
        width={width} 
        height={isOneLineLimit ? 2 : bodyHeight} 
        fill={isOneLineLimit ? "#ffffff" : kLineColor} 
        stroke="none" 
      />
    </g>
  );
};

const BuyArrowShape = (props: any) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <g transform={`translate(${cx},${cy})`}>
      <text x={0} y={15} textAnchor="middle" fontSize={16}>🐂</text>
      <text x={0} y={28} textAnchor="middle" fill="#ef4444" fontSize={10} fontWeight="bold">買</text>
    </g>
  );
};

const SellArrowShape = (props: any) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <g transform={`translate(${cx},${cy})`}>
      <text x={0} y={-15} textAnchor="middle" fontSize={16}>🐻</text>
      <text x={0} y={-4} textAnchor="middle" fill="#10b981" fontSize={10} fontWeight="bold">賣</text>
    </g>
  );
};

const GaugeChart = ({ score, timestamp }: { score: number, timestamp: string }) => {
  const radius = 90;
  const innerRadius = 65; 
  const cx = 150;
  const cy = 115; 
  
  const needleAngle = -90 + (score / 100) * 180;

  const segments = [
    { label: 'Extreme Fear', min: 0, max: 25, color: '#ef4444', startAng: -180, endAng: -135 },
    { label: 'Fear', min: 25, max: 45, color: '#f97316', startAng: -135, endAng: -99 },
    { label: 'Neutral', min: 45, max: 55, color: '#eab308', startAng: -99, endAng: -81 },
    { label: 'Greed', min: 55, max: 75, color: '#a3e635', startAng: -81, endAng: -45 },
    { label: 'Extreme Greed', min: 75, max: 100, color: '#22c55e', startAng: -45, endAng: 0 },
  ];

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  }

  const describeArc = (x: number, y: number, r: number, startAngle: number, endAngle: number) => {
      const start = polarToCartesian(x, y, r, endAngle);
      const end = polarToCartesian(x, y, r, startAngle);
      const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
      return [
          "M", start.x, start.y, 
          "A", r, r, 0, largeArcFlag, 0, end.x, end.y
      ].join(" ");
  };

  const getCurrentLabelColor = (s: number) => {
      if (s <= 25) return '#ef4444';
      if (s <= 45) return '#f97316';
      if (s <= 55) return '#eab308';
      if (s <= 75) return '#a3e635';
      return '#22c55e';
  }
  
  return (
    <div className="flex flex-col items-center justify-center w-full h-full relative">
        <svg viewBox="0 0 300 150" className="w-full h-full max-h-[160px] overflow-visible select-none">
            {segments.map((seg, i) => {
                const gap = 1.5; 
                const sAng = seg.startAng + gap/2;
                const eAng = seg.endAng - gap/2;
                const pathD = describeArc(cx, cy, (radius + innerRadius)/2, sAng, eAng);
                const isActive = score >= seg.min && score <= seg.max;
                return (
                    <path 
                        key={i} 
                        d={pathD} 
                        fill="none" 
                        stroke={seg.color} 
                        strokeWidth={radius - innerRadius}
                        className="transition-all duration-500 ease-out"
                        style={{ opacity: isActive ? 1 : 0.2, filter: isActive ? `drop-shadow(0 0 4px ${seg.color})` : 'none' }}
                    />
                );
            })}
            
            {segments.map((seg, i) => {
                const midAngle = (seg.startAng + seg.endAng) / 2;
                const labelRadius = radius + 20; 
                const pos = polarToCartesian(cx, cy, labelRadius, midAngle);
                const isActive = score >= seg.min && score <= seg.max;
                let anchor = "middle";
                if (midAngle < -95) anchor = "end"; 
                if (midAngle > -85) anchor = "start";
                if (midAngle >= -95 && midAngle <= -85) anchor = "middle"; 
                if (i === 0) anchor = "start"; 
                if (i === 4) anchor = "end"; 

                return (
                    <text 
                        key={`label-${i}`} 
                        x={pos.x} 
                        y={pos.y} 
                        textAnchor="middle" 
                        alignmentBaseline="middle" 
                        className={`text-[9px] font-bold uppercase tracking-tighter transition-all duration-300 ${isActive ? 'fill-white' : 'fill-slate-600'}`}
                        style={{ 
                            textShadow: isActive ? `0 0 10px ${seg.color}` : 'none',
                            transformBox: 'fill-box',
                            transformOrigin: 'center'
                        }}
                    >
                        {seg.label}
                    </text>
                )
            })}

            <g style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                <path d={`M ${cx - 4} ${cy} L ${cx + 4} ${cy} L ${cx} ${cy - radius + 5} Z`} fill="white" filter="drop-shadow(0 0 2px rgba(0,0,0,0.5))" />
                <circle cx={cx} cy={cy} r="6" fill="#1e293b" stroke="white" strokeWidth="2" />
            </g>
            
            <g transform={`translate(${cx}, ${cy - 25})`}>
                <text textAnchor="middle" className="text-5xl font-black fill-white" style={{ filter: `drop-shadow(0 0 15px ${getCurrentLabelColor(score)}50)` }}>
                    {score}
                </text>
            </g>
        </svg>
        <div className="absolute bottom-0 text-[10px] text-slate-500 font-mono w-full text-center">
            Updated: {new Date(timestamp).toLocaleDateString()}
        </div>
    </div>
  );
}

const MarketMonitor: React.FC<Props> = ({ data = [], onUpdateData, techSettings, onUpdateTechSettings, initialSymbol, onClearInitialSymbol }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingTR, setIsUpdatingTR] = useState(false);
  const [fearGreed, setFearGreed] = useState<{ score: number, rating: string, timestamp: string } | null>(null);
  
  const [kLineType, setKLineType] = useState<KLineType>('DAY');

  const [showEntryForm, setShowEntryForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryOpen, setEntryOpen] = useState('');
  const [entryHigh, setEntryHigh] = useState('');
  const [entryLow, setEntryLow] = useState('');
  const [entryClose, setEntryClose] = useState('');
  const [entryVolume, setEntryVolume] = useState('');
  const [entryForeign, setEntryForeign] = useState('');
  const [entryTrust, setEntryTrust] = useState('');
  const [entryDealer, setEntryDealer] = useState('');
  const [entryMarginBal, setEntryMarginBal] = useState('');
  const [entryMarginChange, setEntryMarginChange] = useState('');
  const [entryShortBal, setEntryShortBal] = useState('');
  const [entryShortChange, setEntryShortChange] = useState('');
  // New entry state for Total Return Index
  const [entryTaiexTR, setEntryTaiexTR] = useState('');
  const [entryTxForeign, setEntryTxForeign] = useState('');
  const [entryMtxRetail, setEntryMtxRetail] = useState('');
  const [entryTmfRetail, setEntryTmfRetail] = useState('');

  const [tableStartDate, setTableStartDate] = useState(() => getLocalPastYearString(2));
  const [tableEndDate, setTableEndDate] = useState(() => getLocalTodayString());
  
  const [inputStartDate, setInputStartDate] = useState(tableStartDate);
  const [inputEndDate, setInputEndDate] = useState(tableEndDate);

  const [showSettings, setShowSettings] = useState(false);
  const [subChartType, setSubChartType] = useState<SubChartType>('VOL');
  
  const [showPatternModal, setShowPatternModal] = useState(false);
  const [showChipModal, setShowChipModal] = useState(false);
  const [showPerformanceModal, setShowPerformanceModal] = useState(false);
  
  // AI related state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiReport, setAiReport] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('smartvest_gemini_api_key') || '');
  const [tempApiKey, setTempApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.0-flash-exp'); // Default model
  
  const [showCustomRangeModal, setShowCustomRangeModal] = useState(false);
  const [customChartStart, setCustomChartStart] = useState('');
  const [customChartEnd, setCustomChartEnd] = useState('');

  const [viewWindow, setViewWindow] = useState<{start: number, end: number}>({ start: 0, end: 0 });
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [currentHoverItem, setCurrentHoverItem] = useState<any>(null); 
  
  const [mainChartHeight, setMainChartHeight] = useState(300);
  const isResizing = useRef(false);

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWindow = useRef({ start: 0, end: 0 });

  const scrollbarRef = useRef<HTMLDivElement>(null);
  const isScrollbarDragging = useRef<'left' | 'right' | 'move' | null>(null);
  const scrollbarDragStartX = useRef(0);
  const scrollbarDragStartWindow = useRef({ start: 0, end: 0 });

  const csvInputRef = useRef<HTMLInputElement>(null);

  const [tempSettings, setTempSettings] = useState<TechSettings>(techSettings);

  useEffect(() => {
      setTempSettings(techSettings);
  }, [techSettings]);

  useEffect(() => {
      fetchFearGreed();
  }, []);

  const fetchFearGreed = async () => {
      try {
          const fg = await fetchFearGreedDirect();
          if (fg && fg.score != null) {
              setFearGreed({
                  score: Math.round(fg.score),
                  rating: fg.rating || (fg.score > 75 ? 'extreme greed' : fg.score > 55 ? 'greed' : fg.score > 45 ? 'neutral' : fg.score > 25 ? 'fear' : 'extreme fear'),
                  timestamp: fg.timestamp || new Date().toISOString()
              });
          }
      } catch (e) {
          console.warn('Failed to fetch Fear & Greed Index', e);
      }
  };

  const [viewMode, setViewMode] = useState<'INDEX' | 'STOCK'>('INDEX');
  const [indexType, setIndexType] = useState<'TAIEX' | 'TX'>('TAIEX');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchStatus, setSearchStatus] = useState('');
  const [stockData, setStockData] = useState<KLineData[]>([]);
  const [stockInfo, setStockInfo] = useState<{symbol: string, name: string} | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const sourceData = useMemo(() => {
      return viewMode === 'INDEX' ? data : stockData;
  }, [viewMode, data, stockData]);

  const rangeFilteredData = useMemo(() => {
      if (!sourceData) return [];
      let filtered = sourceData
        .filter(d => d.date >= tableStartDate && d.date <= tableEndDate)
        .sort((a, b) => a.date.localeCompare(b.date));
        
      if (viewMode === 'INDEX' && indexType === 'TX') {
          filtered = filtered.filter(d => d.txClose !== undefined && d.txClose !== null && !isNaN(d.txClose)).map(d => {
              return {
                  ...d,
                  open: d.txOpen!,
                  high: d.txHigh!,
                  low: d.txLow!,
                  close: d.txClose!,
                  volume: d.txVolume || 0
              };
          });
      }
      return filtered;
  }, [sourceData, tableStartDate, tableEndDate, viewMode, indexType]);

  useEffect(() => {
      if (viewMode === 'INDEX' && indexType === 'TX' && !isLoading) {
          if (data.length > 0) {
              const recentData = data.slice(-10);
              const hasTxData = recentData.some(d => d.txClose !== undefined);
              if (!hasTxData) {
                  fetchLatestMarket();
              }
          } else {
              fetchLatestMarket();
          }
      }
  }, [viewMode, indexType, data.length]);

  const aggregatedData = useMemo(() => {
    if (rangeFilteredData.length === 0) return rangeFilteredData;

    let grouped: KLineData[] = [];
    const isWeek = kLineType === 'WEEK' || kLineType === 'ADJ_WEEK';
    const isMonth = kLineType === 'MONTH' || kLineType === 'ADJ_MONTH';
    const isAdj = kLineType.startsWith('ADJ_');

    if (!isWeek && !isMonth) {
        grouped = [...rangeFilteredData];
    } else {
        let currentCandle: KLineData | null = null;
        let currentPeriodKey = '';

        rangeFilteredData.forEach((item) => {
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
                if (currentCandle) grouped.push(currentCandle);
                currentPeriodKey = key;
                currentCandle = { ...item };
            } else if (currentCandle) {
                currentCandle.high = Math.max(currentCandle.high, item.high);
                currentCandle.low = Math.min(currentCandle.low, item.low);
                currentCandle.close = item.close; 
                
                if (currentCandle.adjHigh !== undefined && item.adjHigh !== undefined) {
                    currentCandle.adjHigh = Math.max(currentCandle.adjHigh, item.adjHigh);
                }
                if (currentCandle.adjLow !== undefined && item.adjLow !== undefined) {
                    currentCandle.adjLow = Math.min(currentCandle.adjLow, item.adjLow);
                }
                if (item.adjClose !== undefined) {
                    currentCandle.adjClose = item.adjClose;
                }

                currentCandle.volume += item.volume;
                currentCandle.foreign = (currentCandle.foreign || 0) + (item.foreign || 0);
                currentCandle.trust = (currentCandle.trust || 0) + (item.trust || 0);
                currentCandle.dealer = (currentCandle.dealer || 0) + (item.dealer || 0);
                currentCandle.marginBalance = item.marginBalance;
                currentCandle.shortBalance = item.shortBalance;
                currentCandle.marginChange = (currentCandle.marginChange || 0) + (item.marginChange || 0);
                currentCandle.shortChange = (currentCandle.shortChange || 0) + (item.shortChange || 0);
                currentCandle.taiexTotalReturn = item.taiexTotalReturn;
                currentCandle.date = item.date; 
            }
        });
        if (currentCandle) grouped.push(currentCandle);
    }
    
    if (isAdj) {
        return grouped.map(item => ({
            ...item,
            open: item.adjOpen ?? item.open,
            high: item.adjHigh ?? item.high,
            low: item.adjLow ?? item.low,
            close: item.adjClose ?? item.close
        }));
    }

    return grouped;
  }, [rangeFilteredData, kLineType]);

  useEffect(() => {
    if (aggregatedData.length > 0) {
        const count = aggregatedData.length;
        const start = Math.max(0, count - 60);
        setViewWindow({ start, end: count });
    } else {
        setViewWindow({ start: 0, end: 0 });
    }
  }, [aggregatedData.length]);

  const handleApplyFilter = () => {
      setTableStartDate(inputStartDate);
      setTableEndDate(inputEndDate);
  };

  const handleResetTwoYears = () => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 2);
      const start = d.toISOString().split('T')[0];
      const end = new Date().toISOString().split('T')[0];
      setInputStartDate(start);
      setInputEndDate(end);
      setTableStartDate(start);
      setTableEndDate(end);
  };

  const handleShowAll = () => {
      if (data.length === 0) return;
      const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
      const start = sorted[0].date;
      const end = sorted[sorted.length - 1].date;
      setInputStartDate(start);
      setInputEndDate(end);
      setTableStartDate(start);
      setTableEndDate(end);
  };

  const tableData = useMemo(() => {
      return [...rangeFilteredData].sort((a, b) => b.date.localeCompare(a.date));
  }, [rangeFilteredData]);

  // Performance Analysis Logic
  const performanceAnalysis = useMemo(() => {
    const validData = data
        .filter(d => typeof d.taiexTotalReturn === 'number' && !isNaN(d.taiexTotalReturn) && d.taiexTotalReturn > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

    if (validData.length === 0) return [];

    const monthCloses = new Map<string, number>();
    const yearsSet = new Set<string>();

    validData.forEach(d => {
        const [y, m] = d.date.split('-');
        yearsSet.add(y);
        monthCloses.set(`${y}-${m}`, d.taiexTotalReturn!);
    });

    const sortedYears = Array.from(yearsSet).sort().reverse();
    const matrix: any[] = [];

    sortedYears.forEach(year => {
        const row: any = { year };
        
        // Determine Year Start Price (Basis for YTD)
        let yearStartPrice: number | undefined;
        const prevYearDec = `${parseInt(year) - 1}-12`;
        if (monthCloses.has(prevYearDec)) {
            yearStartPrice = monthCloses.get(prevYearDec);
        } else {
            // Fallback to first record of the year
            const firstRec = validData.find(d => d.date.startsWith(year));
            if (firstRec) yearStartPrice = firstRec.taiexTotalReturn;
        }

        // Monthly Returns
        for (let m = 1; m <= 12; m++) {
            const mStr = m.toString().padStart(2, '0');
            const currKey = `${year}-${mStr}`;
            const currPrice = monthCloses.get(currKey);

            if (currPrice !== undefined) {
                // Determine Month Start Price
                let monthStartPrice: number | undefined;
                
                // Try Prev Month Close
                let prevKey = '';
                if (m === 1) prevKey = `${parseInt(year) - 1}-12`;
                else prevKey = `${year}-${(m - 1).toString().padStart(2, '0')}`;
                
                monthStartPrice = monthCloses.get(prevKey);

                // Fallback: If prev month close missing (e.g. data starts mid-year), use first record of CURRENT month
                if (monthStartPrice === undefined) {
                     const firstRecOfMonth = validData.find(d => d.date.startsWith(currKey));
                     if (firstRecOfMonth) monthStartPrice = firstRecOfMonth.taiexTotalReturn;
                }

                if (monthStartPrice !== undefined && monthStartPrice > 0) {
                    row[mStr] = ((currPrice - monthStartPrice) / monthStartPrice) * 100;
                } else {
                    row[mStr] = null;
                }
            } else {
                row[mStr] = null;
            }
        }

        // Yearly Return (YTD)
        if (yearStartPrice) {
            // Find last available month in this year
            let lastPrice: number | undefined;
            for (let m = 12; m >= 1; m--) {
                const k = `${year}-${m.toString().padStart(2, '0')}`;
                if (monthCloses.has(k)) {
                    lastPrice = monthCloses.get(k);
                    break;
                }
            }
            if (lastPrice !== undefined) {
                row['YTD'] = ((lastPrice - yearStartPrice) / yearStartPrice) * 100;
            } else {
                row['YTD'] = null;
            }
        } else {
            row['YTD'] = null;
        }

        matrix.push(row);
    });

    return matrix;
  }, [data]);

  const resetForm = () => {
    setEntryDate(new Date().toISOString().split('T')[0]);
    setEntryOpen(''); setEntryHigh(''); setEntryLow(''); setEntryClose(''); setEntryVolume('');
    setEntryForeign(''); setEntryTrust(''); setEntryDealer('');
    setEntryMarginBal(''); setEntryMarginChange('');
    setEntryShortBal(''); setEntryShortChange('');
    setEntryTaiexTR('');
    setEntryTxForeign(''); setEntryMtxRetail(''); setEntryTmfRetail('');
    setIsEditing(false);
  };

  const handleEditItem = (item: KLineData) => {
    setEntryDate(item.date);
    setEntryOpen(item.open.toString());
    setEntryHigh(item.high.toString());
    setEntryLow(item.low.toString());
    setEntryClose(item.close.toString());
    if (item.volume !== undefined) {
        if (viewMode === 'INDEX') setEntryVolume(indexType === 'TX' ? item.volume.toString() : (item.volume / 100000000).toString());
        else if (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) setEntryVolume(Math.floor(item.volume / 1000).toString());
        else setEntryVolume(Math.round(item.volume).toString());
    } else {
        setEntryVolume('');
    }
    setEntryForeign(item.foreign?.toString() || '');
    setEntryTrust(item.trust?.toString() || '');
    setEntryDealer(item.dealer?.toString() || '');
    setEntryMarginBal(item.marginBalance?.toString() || '');
    setEntryMarginChange(item.marginChange?.toString() || '');
    setEntryShortBal(item.shortBalance?.toString() || '');
    setEntryShortChange(item.shortChange?.toString() || '');
    setEntryTaiexTR(item.taiexTotalReturn?.toString() || '');
    setEntryTxForeign(item.foreignTxNet?.toString() || '');
    setEntryMtxRetail(item.retailMtxNet?.toString() || '');
    setEntryTmfRetail(item.retailTmfNet?.toString() || '');
    setIsEditing(true);
    setShowEntryForm(true);
  };

  const handleUpdateTaiexTR = async () => {
      if (isUpdatingTR) return;
      setIsUpdatingTR(true);

      try {
          // Find all unique months in the LAST 50 DAYS of `data` that DO NOT have `taiexTotalReturn`
          const missingMonths = new Set<string>();
          const recentData = data.slice(-50); // Only look at the latest 50 days
          recentData.forEach(d => {
              if (d.taiexTotalReturn == null && typeof d.date === 'string' && d.date.length >= 7) {
                  // d.date is '2026-04-20' -> '20260401'
                  missingMonths.add(d.date.substring(0, 7).replace('-', '') + '01');
              }
          });
          
          if (missingMonths.size === 0) {
              setIsUpdatingTR(false);
              return;
          }

          let updatedCount = 0;
          const newDataMap = new Map(data.map(d => [d.date, d]));
          
          // To avoid API limit, fetch up to 3 months at a time
          const monthsToFetch = Array.from(missingMonths).sort((a,b) => b.localeCompare(a)).slice(0, 3);
          
          for (let i = 0; i < monthsToFetch.length; i++) {
              const m = monthsToFetch[i];
              try {
                  const targetUrl = `https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?date=${m}&response=json`;
                  const res = await fetch(targetUrl);
                  
                  if (!res.ok) continue;
                  
                  const fetchedData = await res.json();
                  if (fetchedData && fetchedData.stat === 'OK' && Array.isArray(fetchedData.data)) {
                      fetchedData.data.forEach((row: any[]) => {
                          const dateStrRaw = row[0]; // e.g. "115/04/01"
                          if (dateStrRaw && typeof dateStrRaw === 'string') {
                              const parts = dateStrRaw.split('/');
                              if (parts.length === 3) {
                                  const year = parseInt(parts[0]) + 1911;
                                  const monthStr = parts[1].padStart(2, '0');
                                  const dayStr = parts[2].padStart(2, '0');
                                  const dateIso = `${year}-${monthStr}-${dayStr}`;
                                  
                                  const trValueRaw = row[1]; // e.g. "75,674.58"
                                  const trValue = parseFloat(String(trValueRaw).replace(/,/g, ''));

                                  if (!isNaN(trValue)) {
                                      const existing = newDataMap.get(dateIso);
                                      if (existing && existing.taiexTotalReturn == null) {
                                          newDataMap.set(dateIso, { ...existing, taiexTotalReturn: trValue });
                                          updatedCount++;
                                      }
                                  }
                              }
                          }
                      });
                  }
                  
                  // Avoid rate limit
                  if (i < monthsToFetch.length - 1) {
                      await new Promise(r => setTimeout(r, 500));
                  }
              } catch (err) {
                  console.error('Error fetching ' + m, err);
              }
          }

          if (updatedCount > 0) {
              const finalData = Array.from(newDataMap.values()).sort((a, b) => a.date.localeCompare(b.date));
              onUpdateData(finalData);
          }

      } catch (e) {
          console.error(e);
      } finally {
          setIsUpdatingTR(false);
      }
  };

  const fetchLatestMarket = async () => {
    if (isLoading) return;
    setIsLoading(true);
    
    await fetchFearGreed();

    try {
      const now = new Date();
      now.setFullYear(now.getFullYear() - 2);
      const startIso = now.toISOString().split('T')[0];
      const endIso = new Date().toISOString().split('T')[0];

      let priceData: any = null;
      let instData: any = null;
      let marginData: any = null;
      let txData: any = null;
      let mtxData: any = null;
      let tmfData: any = null;
      let txPriceData: any = null;

      try {
          const priceUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=TAIEX&start_date=${startIso}&end_date=${endIso}`;
          const instUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockTotalInstitutionalInvestors&start_date=${startIso}&end_date=${endIso}`;
          const mgnUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockTotalMarginPurchaseShortSale&start_date=${startIso}&end_date=${endIso}`;
          const txUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanFuturesInstitutionalInvestors&data_id=TX&start_date=${startIso}&end_date=${endIso}`;
          const mtxUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanFuturesInstitutionalInvestors&data_id=MTX&start_date=${startIso}&end_date=${endIso}`;
          const tmfUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanFuturesInstitutionalInvestors&data_id=TMF&start_date=${startIso}&end_date=${endIso}`;
          const txPriceUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanFuturesDaily&data_id=TX&start_date=${startIso}&end_date=${endIso}`;
          
          const [priceRes, instRes, mgnRes, txRes, mtxRes, tmfRes, txPriceRes] = await Promise.all([
              fetch(priceUrl),
              fetch(instUrl),
              fetch(mgnUrl),
              fetch(txUrl),
              fetch(mtxUrl),
              fetch(tmfUrl),
              fetch(txPriceUrl)
          ]);
          
          if (priceRes.ok) priceData = await priceRes.json();
          if (instRes.ok) instData = await instRes.json();
          if (mgnRes.ok) marginData = await mgnRes.json();
          if (txRes.ok) txData = await txRes.json();
          if (mtxRes.ok) mtxData = await mtxRes.json();
          if (tmfRes.ok) tmfData = await tmfRes.json();
          if (txPriceRes.ok) txPriceData = await txPriceRes.json();
      } catch (e) {
          console.warn('Finmind setup error', e);
      }
      
      if (!priceData || !priceData.data || priceData.data.length === 0) {
          throw new Error('未能取得股價資料，請稍後再試');
      }

      const instByDate = new Map<string, any>();
      if (instData?.data) {
          instData.data.forEach((item: any) => {
              if (!instByDate.has(item.date)) instByDate.set(item.date, { foreign: 0, trust: 0, dealer: 0 });
              const dateRec = instByDate.get(item.date);
              const net = (item.buy - item.sell) / 100000000;
              if (item.name === 'Foreign_Investor' || item.name === 'Foreign_Dealer_Self') {
                  dateRec.foreign += net;
              } else if (item.name === 'Investment_Trust') {
                  dateRec.trust += net;
              } else if (item.name === 'Dealer_self' || item.name === 'Dealer_Hedging') {
                  dateRec.dealer += net;
              }
          });
      }

      const marginByDate = new Map<string, any>();
      if (marginData?.data) {
          marginData.data.forEach((item: any) => {
              if (!marginByDate.has(item.date)) marginByDate.set(item.date, {});
              const dateRec = marginByDate.get(item.date);
              if (item.name === 'MarginPurchaseMoney') {
                  dateRec.marginBalance = item.TodayBalance / 100000000;
                  dateRec.marginChange = (item.TodayBalance - item.YesBalance) / 100000000;
              } else if (item.name === 'ShortSale') {
                  dateRec.shortBalance = item.TodayBalance;
                  dateRec.shortChange = item.TodayBalance - item.YesBalance;
              }
          });
      }

      const futuresByDate = new Map<string, any>();
      const processFutures = (data: any, id: string) => {
          if (!data?.data) return;
          data.data.forEach((item: any) => {
              if (!futuresByDate.has(item.date)) {
                  futuresByDate.set(item.date, { txInst: 0, mtxInst: 0, tmfInst: 0, foreignTx: 0 });
              }
              const dateRec = futuresByDate.get(item.date);
              const netOI = item.long_open_interest_balance_volume - item.short_open_interest_balance_volume;
              
              if (id === 'TX') {
                  dateRec.txInst += netOI;
                  if (item.institutional_investors === '外資') {
                      dateRec.foreignTx += netOI;
                  }
              } else if (id === 'MTX') {
                  dateRec.mtxInst += netOI;
              } else if (id === 'TMF') {
                  dateRec.tmfInst += netOI;
              }
          });
      };
      
      if (txData) processFutures(txData, 'TX');
      if (mtxData) processFutures(mtxData, 'MTX');
      if (tmfData) processFutures(tmfData, 'TMF');

            const txPriceByDate = new Map<string, any>();
      if (txPriceData && txPriceData.data) {
          txPriceData.data.forEach((item: any) => {
              if (item.trading_session === 'position' && !item.contract_date.includes('/')) {
                  if (!txPriceByDate.has(item.date) || item.contract_date < txPriceByDate.get(item.date).contract_date) {
                      txPriceByDate.set(item.date, item);
                  }
              }
          });
      }
      
      const dataMap = new Map<string, KLineData>(data.map(d => [d.date, d]));
      
      priceData.data.forEach((priceItem: any) => {
          const date = priceItem.date;
          const existing = dataMap.get(date);
          
          const roundedOpen = Math.round(priceItem.open * 100) / 100;
          const roundedHigh = Math.round(priceItem.max * 100) / 100;
          const roundedLow = Math.round(priceItem.min * 100) / 100;
          const roundedClose = Math.round(priceItem.close * 100) / 100;
          const vol = priceItem.Trading_money;

          const instVals = instByDate.get(date) || {};
          const marginVals = marginByDate.get(date) || {};
          const futuresVals = futuresByDate.get(date) || {};

          const foreignTxNet = futuresVals.foreignTx !== undefined ? futuresVals.foreignTx : existing?.foreignTxNet;
          const retailMtxNet = futuresVals.mtxInst !== undefined ? -futuresVals.mtxInst : existing?.retailMtxNet;
          const retailTmfNet = futuresVals.tmfInst !== undefined ? -futuresVals.tmfInst : existing?.retailTmfNet;

          const txPriceVals = txPriceByDate.get(date);
          const txOpen = txPriceVals ? txPriceVals.open : existing?.txOpen;
          const txHigh = txPriceVals ? txPriceVals.max : existing?.txHigh;
          const txLow = txPriceVals ? txPriceVals.min : existing?.txLow;
          const txClose = txPriceVals ? txPriceVals.close : existing?.txClose;
          const txVolume = txPriceVals ? txPriceVals.volume : existing?.txVolume;

          const newData: KLineData = {
              date, 
              open: roundedOpen, 
              high: roundedHigh, 
              low: roundedLow, 
              close: roundedClose,
              volume: vol || existing?.volume || 0,
              foreign: instVals.foreign !== undefined ? (Math.round(instVals.foreign * 100) / 100) : existing?.foreign, 
              trust: instVals.trust !== undefined ? (Math.round(instVals.trust * 100) / 100) : existing?.trust, 
              dealer: instVals.dealer !== undefined ? (Math.round(instVals.dealer * 100) / 100) : existing?.dealer,
              marginBalance: marginVals.marginBalance !== undefined ? (Math.round(marginVals.marginBalance * 100) / 100) : existing?.marginBalance, 
              marginChange: marginVals.marginChange !== undefined ? (Math.round(marginVals.marginChange * 100) / 100) : existing?.marginChange, 
              shortBalance: marginVals.shortBalance !== undefined ? marginVals.shortBalance : existing?.shortBalance, 
              shortChange: marginVals.shortChange !== undefined ? marginVals.shortChange : existing?.shortChange,
              taiexTotalReturn: existing?.taiexTotalReturn, // Keep TR index if already available
              foreignTxNet,
              retailMtxNet,
              retailTmfNet,
              foreignTxNetChange: existing?.foreignTxNetChange,
              retailMtxNetChange: existing?.retailMtxNetChange,
              retailTmfNetChange: existing?.retailTmfNetChange,
              txOpen,
              txHigh,
              txLow,
              txClose,
              txVolume
          };
          dataMap.set(date, newData);
      });

      // Calculate changes for futures (sort and compare with previous)
      const sortedKeys = Array.from(dataMap.keys()).sort();
      for (let i = 0; i < sortedKeys.length; i++) {
          const key = sortedKeys[i];
          const curr = dataMap.get(key)!;
          if (i > 0) {
              const prev = dataMap.get(sortedKeys[i - 1])!;
              if (curr.foreignTxNet !== undefined && prev.foreignTxNet !== undefined) {
                  curr.foreignTxNetChange = curr.foreignTxNet - prev.foreignTxNet;
              }
              if (curr.retailMtxNet !== undefined && prev.retailMtxNet !== undefined) {
                  curr.retailMtxNetChange = curr.retailMtxNet - prev.retailMtxNet;
              }
              if (curr.retailTmfNet !== undefined && prev.retailTmfNet !== undefined) {
                  curr.retailTmfNetChange = curr.retailTmfNet - prev.retailTmfNet;
              }
          } else {
              curr.foreignTxNetChange = 0;
              curr.retailMtxNetChange = 0;
              curr.retailTmfNetChange = 0;
          }
      }
      
      // 嘗試透過 Yahoo Finance 取得大盤即時資訊
      try {
          const isDesktopEnv = (window as any).electronAPI?.isElectron || window.location.protocol === 'file:';
          let rQuote = null;
          if (isDesktopEnv && (window as any).electronAPI?.fetchYahooQuote) {
             const yfRes = await (window as any).electronAPI.fetchYahooQuote('^TWII');
             rQuote = yfRes && yfRes.data ? yfRes.data : null;
          } else {
             const fetchRes = await fetchCurrentYahooQuote('^TWII');
             rQuote = fetchRes && fetchRes.success ? fetchRes : null;
          }
          if (rQuote && rQuote.regularMarketPrice && rQuote.regularMarketTime) {
              let rDate: Date;
              if (typeof rQuote.regularMarketTime === 'number') {
                  rDate = new Date(rQuote.regularMarketTime * 1000);
              } else {
                  rDate = new Date(rQuote.regularMarketTime);
              }
              const localDateMatch = rDate.toISOString().split('T')[0];
              let targetDate = localDateMatch;
              
              const existingToday = dataMap.get(targetDate);
              const openVal = rQuote.regularMarketOpen || existingToday?.open || rQuote.regularMarketPrice;
              const highVal = rQuote.regularMarketDayHigh || Math.max(existingToday?.high || 0, rQuote.regularMarketPrice);
              const lowVal = rQuote.regularMarketDayLow || Math.min(existingToday?.low || rQuote.regularMarketPrice, rQuote.regularMarketPrice);
              const closeVal = rQuote.regularMarketPrice;
              
              dataMap.set(targetDate, {
                  ...existingToday,
                  date: targetDate,
                  open: Math.round(openVal * 100) / 100,
                  high: Math.round(highVal * 100) / 100,
                  low: Math.round(lowVal * 100) / 100,
                  close: Math.round(closeVal * 100) / 100,
                  // Keep FinMind Trading_money if available, otherwise don't overwrite with Yahoo's volume because they use different scales
                  volume: existingToday?.volume || 0,
                  foreign: existingToday?.foreign,
                  trust: existingToday?.trust,
                  dealer: existingToday?.dealer,
                  marginBalance: existingToday?.marginBalance,
                  marginChange: existingToday?.marginChange,
                  shortBalance: existingToday?.shortBalance,
                  shortChange: existingToday?.shortChange,
                  taiexTotalReturn: existingToday?.taiexTotalReturn
              });
          }
      } catch (e) {
          console.warn('Yahoo Finance instant quote failed', e);
      }
      
      const finalData = Array.from(dataMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      if (finalData.length > 0) {
          const maxDate = finalData[finalData.length - 1].date;
          if (maxDate > tableEndDate) {
              setTableEndDate(maxDate);
              setInputEndDate(maxDate);
          }
      }
      onUpdateData(finalData);
    } catch (error) { console.error(error); alert('更新失敗: 無法取得最新市場數據'); } finally { setIsLoading(false); }
  };

  const handleSearchStock = async (overrideSymbol?: string) => {
    const searchSymbol = overrideSymbol || searchInputRef.current?.value;
    if (!searchSymbol || isSearching) return;
    setIsSearching(true);
    setSearchStatus('');
    
    try {
        let symbol = searchSymbol.toUpperCase().trim();
        // Heuristic: If it starts with a digit and doesn't contain a dot, assume TW stock and append .TW
        if (!symbol.includes('.') && /^[0-9]/.test(symbol)) {
            symbol += '.TW'; 
        }
        
        if (symbol.endsWith('.US')) {
            symbol = symbol.replace('.US', '');
        }
        if (symbol.endsWith('.JP')) {
            symbol = symbol.replace('.JP', '.T');
        }
        
        // Fix US class shares formatting
        const usClassShares = ['BRK.B', 'BRK.A', 'BF.B', 'BF.A'];
        if (usClassShares.includes(symbol)) {
            symbol = symbol.replace('.', '-');
        }

        let chartData: any = null;
        let finalSymbol = symbol;

        const period2 = Math.floor(Date.now() / 1000);
        const period1 = period2 - 5 * 365 * 24 * 60 * 60; // 5 years

        const fetchHistoryFallback = async (sym: string) => {
            try {
                return await fetchYahooHistoryUniversal(sym, period1, period2, '1d');
            } catch (e) {
                console.warn(`Failed to fetch ${sym}`, e);
                return null;
            }
        };

        chartData = await fetchHistoryFallback(symbol);

        if ((!chartData || !chartData.timestamp || chartData.timestamp.length === 0) && symbol.endsWith('.TW')) {
            const otcSymbol = symbol.replace('.TW', '.TWO');
            const otcData = await fetchHistoryFallback(otcSymbol);
            if (otcData && otcData.timestamp && otcData.timestamp.length > 0) {
                chartData = otcData;
                finalSymbol = otcSymbol;
            }
        }

        if (chartData) {
            let actualData = chartData;
            if (chartData.chart?.result?.[0]) {
                actualData = chartData.chart.result[0];
            }

            const newStockData: KLineData[] = [];
            let fullName = finalSymbol;

            if (Array.isArray(actualData)) {
                actualData.forEach(item => {
                    if (item.open != null && item.close != null) {
                        const date = typeof item.date === 'string' ? item.date.split('T')[0] : new Date(item.date).toISOString().split('T')[0];
                        const open = item.open;
                        const high = item.high;
                        const low = item.low;
                        const close = item.close;
                        const vol = item.volume || 0;
                        const adjCloseParam = item.adjClose || item.close;
                        
                        let adjOpen = open;
                        let adjHigh = high;
                        let adjLow = low;
                        if (adjCloseParam != null && close > 0) {
                            const adjFactor = adjCloseParam / close;
                            adjOpen = open * adjFactor;
                            adjHigh = high * adjFactor;
                            adjLow = low * adjFactor;
                        }

                        newStockData.push({
                            date,
                            open: Math.round(open * 100) / 100,
                            high: Math.round(high * 100) / 100,
                            low: Math.round(low * 100) / 100,
                            close: Math.round(close * 100) / 100,
                            adjOpen: Math.round(adjOpen * 100) / 100,
                            adjHigh: Math.round(adjHigh * 100) / 100,
                            adjLow: Math.round(adjLow * 100) / 100,
                            adjClose: Math.round(adjCloseParam * 100) / 100,
                            volume: (vol || 0),
                        });
                    }
                });
                if (actualData.length > 0 && actualData[0].symbol) {
                     fullName = actualData[0].symbol;
                }
            } else {
                const { timestamp, indicators, meta } = actualData;
                if (meta?.symbol) fullName = meta.symbol;
                
                const quote = indicators?.quote?.[0];
                const adjclose = indicators?.adjclose?.[0]?.adjclose;

                if (timestamp && (quote || adjclose)) {
                    timestamp.forEach((ts: number, i: number) => {
                    const date = new Date(ts * 1000).toISOString().split('T')[0];
                    let open, high, low, close, vol;
                    
                    if (quote && quote.open?.[i] != null) {
                        open = quote.open[i];
                        high = quote.high[i];
                        low = quote.low[i];
                        close = quote.close[i];
                        vol = quote.volume[i];
                    } else if (adjclose && adjclose[i] != null) {
                        // Fallback to adjclose only if quote is missing
                        open = high = low = close = adjclose[i];
                        vol = 0;
                    }
                    
                    if (open != null && high != null && low != null && close != null) {
                        let adjOpen = open;
                        let adjHigh = high;
                        let adjLow = low;
                        let adjCloseParam = close;

                        if (adjclose && adjclose[i] != null && close > 0) {
                            const adjFactor = adjclose[i] / close;
                            adjOpen = open * adjFactor;
                            adjHigh = high * adjFactor;
                            adjLow = low * adjFactor;
                            adjCloseParam = adjclose[i];
                        }

                        newStockData.push({
                            date,
                            open: Math.round(open * 100) / 100,
                            high: Math.round(high * 100) / 100,
                            low: Math.round(low * 100) / 100,
                            close: Math.round(close * 100) / 100,
                            adjOpen: Math.round(adjOpen * 100) / 100,
                            adjHigh: Math.round(adjHigh * 100) / 100,
                            adjLow: Math.round(adjLow * 100) / 100,
                            adjClose: Math.round(adjCloseParam * 100) / 100,
                            volume: (vol || 0),
                        });
                    }
                });
            }
        }

        if (newStockData.length > 0) {
                let sortedData = newStockData.sort((a, b) => a.date.localeCompare(b.date));
                
                try {
                    let quoteRes = await fetchCurrentYahooQuote(finalSymbol);
                    if (!quoteRes || !quoteRes.success) {
                        // try TW mapping if it failed
                        let sym = finalSymbol;
                        if (sym.endsWith('.TWO')) sym = sym.replace('.TWO', '.TW');
                        else if (sym.endsWith('.TW')) sym = sym.replace('.TW', '.TWO');
                        const altQuote = await fetchCurrentYahooQuote(sym);
                        if (altQuote && altQuote.success) {
                            quoteRes = altQuote;
                        }
                    }

                    if (quoteRes && quoteRes.success) {
                        if (quoteRes.shortName) fullName = quoteRes.shortName;
                        if (quoteRes.regularMarketPrice && quoteRes.regularMarketTime) {
                            let rDate: Date;
                            if (typeof quoteRes.regularMarketTime === 'number') {
                                rDate = new Date(quoteRes.regularMarketTime * 1000);
                            } else {
                                rDate = new Date(quoteRes.regularMarketTime);
                            }
                            const localDateMatch = rDate.toISOString().split('T')[0];
                            const targetDate = localDateMatch;
                            
                            const existingIndex = sortedData.findIndex(d => d.date === targetDate);
                            const existingToday = existingIndex >= 0 ? sortedData[existingIndex] : null;
                            
                            const openVal = quoteRes.regularMarketOpen || existingToday?.open || quoteRes.regularMarketPrice;
                            const highVal = quoteRes.regularMarketDayHigh || Math.max(existingToday?.high || 0, quoteRes.regularMarketPrice);
                            const lowVal = quoteRes.regularMarketDayLow || Math.min(existingToday?.low || quoteRes.regularMarketPrice, quoteRes.regularMarketPrice);
                            const closeVal = quoteRes.regularMarketPrice;
                            
                            const newDataPoint = {
                                date: targetDate,
                                open: Math.round(openVal * 100) / 100,
                                high: Math.round(highVal * 100) / 100,
                                low: Math.round(lowVal * 100) / 100,
                                close: Math.round(closeVal * 100) / 100,
                                adjOpen: Math.round(openVal * 100) / 100, // Not perfectly adj, but best proxy for intra-day
                                adjHigh: Math.round(highVal * 100) / 100,
                                adjLow: Math.round(lowVal * 100) / 100,
                                adjClose: Math.round(closeVal * 100) / 100,
                                volume: quoteRes.regularMarketVolume ? quoteRes.regularMarketVolume : (existingToday?.volume || 0)
                            };
                            
                            if (existingIndex >= 0) {
                                sortedData[existingIndex] = { ...existingToday, ...newDataPoint };
                            } else {
                                sortedData.push(newDataPoint);
                            }
                        }
                    }
                } catch (e) {}
                
                // Fetch institutional and margin data from FinMind if it's a TW stock
                if (finalSymbol.endsWith('.TW') || finalSymbol.endsWith('.TWO')) {
                     const twSymbol = finalSymbol.split('.')[0];
                     const now = new Date();
                     const startIso = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                     const endIso = now.toISOString().split('T')[0];
                     
                     try {
                         const instUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${twSymbol}&start_date=${startIso}&end_date=${endIso}`;
                         const mgnUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMarginPurchaseShortSale&data_id=${twSymbol}&start_date=${startIso}&end_date=${endIso}`;
                         
                         const [instRes, mgnRes] = await Promise.all([
                             fetch(instUrl).catch(()=>null), 
                             fetch(mgnUrl).catch(()=>null)
                         ]);
                         
                         let instData, marginData;
                         if (instRes && instRes.ok) instData = await instRes.json();
                         if (mgnRes && mgnRes.ok) marginData = await mgnRes.json();
                         
                         const instByDate = new Map<string, any>();
                         if (instData?.data) {
                             instData.data.forEach((item: any) => {
                                 if (!instByDate.has(item.date)) instByDate.set(item.date, { foreign: 0, trust: 0, dealer: 0 });
                                 const dateRec = instByDate.get(item.date);
                                 const netBuy = (item.buy || 0) - (item.sell || 0);
                                 if (item.name.includes('Foreign_Investor')) dateRec.foreign += netBuy;
                                 else if (item.name.includes('Investment_Trust')) dateRec.trust += netBuy;
                                 else if (item.name.includes('Dealer')) dateRec.dealer += netBuy;
                             });
                         }
                         
                         const marginByDate = new Map<string, any>();
                         if (marginData?.data) {
                             marginData.data.forEach((item: any) => {
                                 marginByDate.set(item.date, {
                                     marginBalance: item.MarginPurchaseTodayBalance,
                                     marginChange: item.MarginPurchaseTodayBalance - item.MarginPurchaseYesterdayBalance,
                                     shortBalance: item.ShortSaleTodayBalance,
                                     shortChange: item.ShortSaleTodayBalance - item.ShortSaleYesterdayBalance
                                 });
                             });
                         }
                         
                         sortedData.forEach(candle => {
                             const i = instByDate.get(candle.date);
                             if (i) {
                                 candle.foreign = Math.round(i.foreign / 1000);
                                 candle.trust = Math.round(i.trust / 1000);
                                 candle.dealer = Math.round(i.dealer / 1000);
                             }
                             const m = marginByDate.get(candle.date);
                             if (m) {
                                 candle.marginBalance = m.marginBalance;
                                 candle.marginChange = m.marginChange;
                                 candle.shortBalance = m.shortBalance;
                                 candle.shortChange = m.shortChange;
                             }
                         });
                     } catch(e) {
                         console.warn('Failed to fetch Finmind stock data', e);
                     }
                }

                sortedData.sort((a, b) => a.date.localeCompare(b.date));

                setStockData(sortedData);
                setStockInfo({ symbol: finalSymbol, name: fullName });
                setViewMode('STOCK');
                setSearchStatus('');
                
                // Reset view window
                const count = sortedData.length;
                const start = Math.max(0, count - 60);
                setViewWindow({ start, end: count });
                
                // Reset date range to cover data
                if (sortedData.length > 0) {
                    setTableStartDate(sortedData[0].date);
                    setTableEndDate(sortedData[sortedData.length - 1].date);
                    setInputStartDate(sortedData[0].date);
                    setInputEndDate(sortedData[sortedData.length - 1].date);
                }
            } else {
                setSearchStatus('查無資料');
            }
        } else {
            setSearchStatus('查無資料');
        }

    } catch (e) {
        console.error(e);
        setSearchStatus('搜尋失敗');
    } finally {
        setIsSearching(false);
    }
  };

  const calculateEMA = (current: number, prevEMA: number, period: number) => {
    const k = 2 / (period + 1);
    return (current - prevEMA) * k + prevEMA;
  };

  const processedData = useMemo(() => {
    let rsiPrevAvgGain = 0; let rsiPrevAvgLoss = 0; let macdPrevFastEMA = 0; let macdPrevSlowEMA = 0; let macdPrevSignalEMA = 0; let kdPrevK = 50; let kdPrevD = 50;
    let jrKdPrevK = 50; let jrKdPrevD = 50; let jrRsiPrevAvgGain = 0; let jrRsiPrevAvgLoss = 0; let jrTrendPrevEMA = 50;
    let prevJrJ = 50; let prevJrRsi = 50; let prevJrTrend = 50; let defensePrevEMA = 0;
    let lastAccBuyIndex = -1; let lastAccBuyPrice = 0;
    let swingPosition: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    const jrRsiHistory: number[] = [];
    const jrRawJWindow: number[] = [];
    const jrRsvSmaWindow: number[] = [];
    const jrKSmaWindow: number[] = [];
    let biasPrevEMA: number | undefined = undefined;
    let bias2PrevEMA: number | undefined = undefined;
    const prevEmaValues = new Map<number, number>();

    return aggregatedData.map((item, index, arr) => {
      const newItem: any = { 
        ...item, 
        candleRange: [item.low, item.high], 
        institutionalTotal: (item.foreign || 0) + (item.trust || 0) + (item.dealer || 0),
        prevClose: index > 0 ? arr[index - 1].close : item.open
      };

      techSettings.mas.forEach((ma, maIndex) => {
        if (ma.visible) {
            let val: number | null = null; const p = ma.period; const mode = ma.mode;
            if (index >= p - 1) {
                const slice = arr.slice(index - p + 1, index + 1);
                if (mode === 'SMA') {
                    const sum = slice.reduce((acc, curr) => acc + curr.close, 0); val = sum / p;
                } else if (mode === 'WMA') {
                    let numerator = 0; let denominator = 0;
                    slice.forEach((candle, i) => { const weight = i + 1; numerator += candle.close * weight; denominator += weight; });
                    val = numerator / denominator;
                } else if (mode === 'EMA') {
                    const prevEMA = prevEmaValues.get(maIndex);
                    if (prevEMA === undefined) { const sum = slice.reduce((acc, curr) => acc + curr.close, 0); val = sum / p; } 
                    else { const k = 2 / (p + 1); val = (item.close - prevEMA) * k + prevEMA; }
                    prevEmaValues.set(maIndex, val);
                } else if (mode === 'S-EMA') {
                    const prevEMA = prevEmaValues.get(maIndex);
                    if (prevEMA === undefined) { const sum = slice.reduce((acc, curr) => acc + curr.close, 0); val = sum / p; } 
                    else { val = (item.close + (p - 1) * prevEMA) / p; }
                    prevEmaValues.set(maIndex, val);
                }
            }
            if (val !== null) { newItem[`ma_${maIndex}`] = val; }
        }
      });

      if (techSettings.bias && techSettings.bias.visible) {
          const p = techSettings.bias.period || 20;
          const mode = techSettings.bias.mode || 'SMA';
          let maVal: number | null = null;
          if (index >= p - 1) {
              const slice = arr.slice(index - p + 1, index + 1);
              if (mode === 'SMA') {
                  const sum = slice.reduce((acc, curr) => acc + curr.close, 0); maVal = sum / p;
              } else if (mode === 'EMA') {
                  if (biasPrevEMA === undefined) { const sum = slice.reduce((acc, curr) => acc + curr.close, 0); maVal = sum / p; } 
                  else { const k = 2 / (p + 1); maVal = (item.close - biasPrevEMA) * k + biasPrevEMA; }
                  biasPrevEMA = maVal;
              }
          }
          if (maVal !== null && maVal !== 0) {
              newItem.bias = ((item.close - maVal) / maVal) * 100;
          }
      }

      if (techSettings.bias2 && techSettings.bias2.visible) {
          const p = techSettings.bias2.period || 60;
          const mode = techSettings.bias2.mode || 'SMA';
          let maVal: number | null = null;
          if (index >= p - 1) {
              const slice = arr.slice(index - p + 1, index + 1);
              if (mode === 'SMA') {
                  const sum = slice.reduce((acc, curr) => acc + curr.close, 0); maVal = sum / p;
              } else if (mode === 'EMA') {
                  if (bias2PrevEMA === undefined) { const sum = slice.reduce((acc, curr) => acc + curr.close, 0); maVal = sum / p; } 
                  else { const k = 2 / (p + 1); maVal = (item.close - bias2PrevEMA) * k + bias2PrevEMA; }
                  bias2PrevEMA = maVal;
              }
          }
          if (maVal !== null && maVal !== 0) {
              newItem.bias2 = ((item.close - maVal) / maVal) * 100;
          }
      }

      if (techSettings.bollinger) {
          const { middle, upper1, lower1, upper2, lower2 } = techSettings.bollinger;
          const period = middle.period;
          if (index >= period - 1) {
              const slice = arr.slice(index - period + 1, index + 1);
              const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
              const ma = sum / period;
              const squaredDiffs = slice.map(curr => Math.pow(curr.close - ma, 2));
              const avgSquaredDiff = squaredDiffs.reduce((acc, curr) => acc + curr, 0) / period;
              const stdDev = Math.sqrt(avgSquaredDiff);

              if (middle.visible) newItem.bb_middle = ma;
              if (upper1.visible) newItem.bb_upper1 = ma + (upper1.stdDev * stdDev);
              if (lower1.visible) newItem.bb_lower1 = ma - (lower1.stdDev * stdDev);
              if (upper2.visible) newItem.bb_upper2 = ma + (upper2.stdDev * stdDev);
              if (lower2.visible) newItem.bb_lower2 = ma - (lower2.stdDev * stdDev);
          }
      }

      if (techSettings.bbw) {
          const { period, stdDev } = techSettings.bbw;
          if (index >= period - 1) {
              const slice = arr.slice(index - period + 1, index + 1);
              const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
              const ma = sum / period;
              const squaredDiffs = slice.map(curr => Math.pow(curr.close - ma, 2));
              const avgSquaredDiff = squaredDiffs.reduce((acc, curr) => acc + curr, 0) / period;
              const sDev = Math.sqrt(avgSquaredDiff);
              
              if (ma > 0) {
                  const upper = ma + (stdDev * sDev);
                  const lower = ma - (stdDev * sDev);
                  newItem.bbw = ((upper - lower) / ma) * 100; // Represented as percentage
              } else {
                  newItem.bbw = 0;
              }
          }
      }

      if (index === 0) { rsiPrevAvgGain = 0; rsiPrevAvgLoss = 0; } else {
        const change = item.close - arr[index - 1].close; const gain = change > 0 ? change : 0; const loss = change < 0 ? Math.abs(change) : 0;
        if (index < techSettings.rsi.period) {
          rsiPrevAvgGain += gain; rsiPrevAvgLoss += loss;
          if (index === techSettings.rsi.period - 1) { rsiPrevAvgGain /= techSettings.rsi.period; rsiPrevAvgLoss /= techSettings.rsi.period; }
        } else {
          rsiPrevAvgGain = (rsiPrevAvgGain * (techSettings.rsi.period - 1) + gain) / techSettings.rsi.period; rsiPrevAvgLoss = (rsiPrevAvgLoss * (techSettings.rsi.period - 1) + loss) / techSettings.rsi.period;
          const rs = rsiPrevAvgLoss === 0 ? 100 : rsiPrevAvgGain / rsiPrevAvgLoss; newItem.rsi = 100 - (100 / (1 + rs));
        }
      }

      if (index === 0) { macdPrevFastEMA = item.close; macdPrevSlowEMA = item.close; macdPrevSignalEMA = 0; } else {
        macdPrevFastEMA = calculateEMA(item.close, macdPrevFastEMA, techSettings.macd.fast); macdPrevSlowEMA = calculateEMA(item.close, macdPrevSlowEMA, techSettings.macd.slow);
        const dif = macdPrevFastEMA - macdPrevSlowEMA;
        if (index === 0) macdPrevSignalEMA = dif; else macdPrevSignalEMA = calculateEMA(dif, macdPrevSignalEMA, techSettings.macd.signal);
        newItem.dif = dif; newItem.dem = macdPrevSignalEMA; newItem.osc = dif - macdPrevSignalEMA;
      }

      if (index >= techSettings.kd.period - 1) {
        const slice = arr.slice(index - techSettings.kd.period + 1, index + 1); const highestHigh = Math.max(...slice.map(d => d.high)); const lowestLow = Math.min(...slice.map(d => d.low));
        let rsv = 50; if (highestHigh !== lowestLow) rsv = ((item.close - lowestLow) / (highestHigh - lowestLow)) * 100;
        const k = (2/3) * kdPrevK + (1/3) * rsv; const d = (2/3) * kdPrevD + (1/3) * k;
        newItem.k = k; newItem.d = d; kdPrevK = k; kdPrevD = d;
      }

      if (techSettings.jr) {
          const { jPeriod, rsiPeriod } = techSettings.jr;
          if (index >= jPeriod - 1) {
            const slice = arr.slice(index - jPeriod + 1, index + 1); 
            const highestHigh = Math.max(...slice.map(d => d.high)); 
            const lowestLow = Math.min(...slice.map(d => d.low));
            let rsv = 50; if (highestHigh !== lowestLow) rsv = ((item.close - lowestLow) / (highestHigh - lowestLow)) * 100;
            
            // J calculation modes
            const smoothMode = techSettings.jr?.smoothMode || 'S-EMA';
            let k = 50; let d = 50;

            if (smoothMode === 'SMA') {
              jrRsvSmaWindow.push(rsv);
              if (jrRsvSmaWindow.length > 3) jrRsvSmaWindow.shift();
              k = jrRsvSmaWindow.reduce((a, b) => a + b, 0) / jrRsvSmaWindow.length;
              
              jrKSmaWindow.push(k);
              if (jrKSmaWindow.length > 3) jrKSmaWindow.shift();
              d = jrKSmaWindow.reduce((a, b) => a + b, 0) / jrKSmaWindow.length;
            } else if (smoothMode === 'EMA') {
              const kAlpha = 2 / (3 + 1);
              k = (rsv - jrKdPrevK) * kAlpha + jrKdPrevK; 
              d = (k - jrKdPrevD) * kAlpha + jrKdPrevD;
              jrKdPrevK = k; jrKdPrevD = d;
            } else { // S-EMA (Wilder's Smoothing or standard KD smoothing)
              const kAlpha = 1 / 3;
              k = (rsv - jrKdPrevK) * kAlpha + jrKdPrevK; 
              d = (k - jrKdPrevD) * kAlpha + jrKdPrevD;
              jrKdPrevK = k; jrKdPrevD = d;
            }
            
            const raw_j = 3 * k - 2 * d;
            
            // Normalization Window
            const normPeriod = techSettings.jr?.normalizePeriod || 60;
            
            let j_norm = raw_j;
            if (jrRawJWindow.length >= 1) {
              const min_j = Math.min(...jrRawJWindow);
              const max_j = Math.max(...jrRawJWindow);
              if (max_j !== min_j) {
                j_norm = ((raw_j - min_j) / (max_j - min_j)) * 100;
              } else {
                j_norm = 50;
              }
            } else {
              j_norm = 50; // Initial value before we have a window
            }

            jrRawJWindow.push(raw_j);
            if (jrRawJWindow.length > normPeriod) jrRawJWindow.shift();
            
            newItem.jr_j = j_norm;
          }

          if (index === 0) { jrRsiPrevAvgGain = 0; jrRsiPrevAvgLoss = 0; jrTrendPrevEMA = 50; } else {
            const change = item.close - arr[index - 1].close; const gain = change > 0 ? change : 0; const loss = change < 0 ? Math.abs(change) : 0;
            const emaAlpha = 2 / (rsiPeriod + 1);
            if (index === 1) {
              jrRsiPrevAvgGain = gain; jrRsiPrevAvgLoss = loss;
            } else {
              jrRsiPrevAvgGain = (gain - jrRsiPrevAvgGain) * emaAlpha + jrRsiPrevAvgGain;
              jrRsiPrevAvgLoss = (loss - jrRsiPrevAvgLoss) * emaAlpha + jrRsiPrevAvgLoss;
            }
            const rs = jrRsiPrevAvgLoss === 0 ? 100 : jrRsiPrevAvgGain / jrRsiPrevAvgLoss; 
            newItem.jr_rsi = 100 - (100 / (1 + rs));
            
            const trendPeriod = techSettings.jr?.trendPeriod || 9;
            const trendEmaAlpha = 2 / (trendPeriod + 1);
            if (index === 1) jrTrendPrevEMA = newItem.jr_rsi;
            else jrTrendPrevEMA = (newItem.jr_rsi - jrTrendPrevEMA) * trendEmaAlpha + jrTrendPrevEMA;
            newItem.jr_trend = jrTrendPrevEMA;
          }

          if (newItem.jr_j === undefined) newItem.jr_j = 50;
          if (newItem.jr_rsi === undefined) newItem.jr_rsi = 50;
          if (newItem.jr_trend === undefined) newItem.jr_trend = 50;

          if (index > 0) {
              newItem.jr_j_dir = newItem.jr_j > prevJrJ ? 'up' : (newItem.jr_j < prevJrJ ? 'down' : 'flat');
              newItem.jr_rsi_dir = newItem.jr_rsi > prevJrRsi ? 'up' : (newItem.jr_rsi < prevJrRsi ? 'down' : 'flat');
              newItem.jr_trend_dir = newItem.jr_trend > prevJrTrend ? 'up' : (newItem.jr_trend < prevJrTrend ? 'down' : 'flat');

              // 計算 MA 作為長線趨勢生命線/防守線
              const strategyMode = techSettings.jr?.strategyMode || 'SWING';
              const defensePeriod = techSettings.jr?.maDefensePeriod || 60;
              const defenseMode = techSettings.jr?.maDefenseMode || 'SMA';
              
              let defenseMA: number | null = null;
              if (index >= defensePeriod - 1) {
                  const slice = arr.slice(index - defensePeriod + 1, index + 1);
                  if (defenseMode === 'SMA') {
                      defenseMA = slice.reduce((acc, curr) => acc + curr.close, 0) / defensePeriod;
                  } else if (defenseMode === 'WMA') {
                      let numerator = 0; let denominator = 0;
                      slice.forEach((candle, i) => { const weight = i + 1; numerator += candle.close * weight; denominator += weight; });
                      defenseMA = numerator / denominator;
                  } else if (defenseMode === 'EMA') {
                      if (defensePrevEMA === 0) { defenseMA = slice.reduce((acc, curr) => acc + curr.close, 0) / defensePeriod; }
                      else { const k = 2 / (defensePeriod + 1); defenseMA = (item.close - defensePrevEMA) * k + defensePrevEMA; }
                      defensePrevEMA = defenseMA;
                  } else if (defenseMode === 'S-EMA') {
                      if (defensePrevEMA === 0) { defenseMA = slice.reduce((acc, curr) => acc + curr.close, 0) / defensePeriod; }
                      else { defenseMA = (item.close + (defensePeriod - 1) * defensePrevEMA) / defensePeriod; }
                      defensePrevEMA = defenseMA;
                  }
              }

              // 自動判斷進出場信號 (無持倉記憶，純看當下長線邏輯)
              // 均線過濾：收盤價需站上生命線，或雖然在線下但極度超賣強力反轉
              const isPriceAboveMA = defenseMA !== null ? item.close > defenseMA : true;

              const isKdGoldenCross = kdPrevK <= kdPrevD && newItem.k > newItem.d;
              const isKdDeadCross = kdPrevK >= kdPrevD && newItem.k < newItem.d;
              
              const isJrGoldenCross = prevJrJ <= prevJrRsi && newItem.jr_j > newItem.jr_rsi;
              const isJrDeadCross = prevJrJ >= prevJrRsi && newItem.jr_j < newItem.jr_rsi;
              const isRsiTrendGoldenCross = prevJrRsi <= prevJrTrend && newItem.jr_rsi > newItem.jr_trend;
              const isRsiTrendDeadCross = prevJrRsi >= prevJrTrend && newItem.jr_rsi < newItem.jr_trend;

              // === ACCUMULATE 模式：長期存股 (左側買進加碼) ===
              // 採用純 JR 指標判斷左側買點 (對多頭回檔極度靈敏)
              const bias = defenseMA !== null ? (item.close - defenseMA) / defenseMA : 0;
              const isRedCandle = item.close >= item.open; // 紅K或十字線
              
              const accJrJThresh = techSettings.jr?.accJrJThresh ?? 10;
              const accJrRsiThresh1 = techSettings.jr?.accJrRsiThresh1 ?? 50;
              const accJrRsiThresh2 = techSettings.jr?.accJrRsiThresh2 ?? 45;
              const accCooldownDays = techSettings.jr?.accCooldownDays ?? 5;
              const accPriceDropThresh = techSettings.jr?.accPriceDropThresh ?? 0.03;

              // 1. JR 極度超賣 (左側接刀)：J 值跌破 10，代表短線極度恐慌，且當日無實體大黑K (收紅或十字)
              const isJrExtremeOversold = newItem.jr_j < accJrJThresh && isRedCandle;

              // 2. JR 低檔金叉 (右側確認)：RSI 在 50 以下位階，J 線由下往上穿越 RSI 形成金叉
              const isJrLowGoldenCross = prevJrRsi < accJrRsiThresh1 && isJrGoldenCross;

              // 3. JR 趨勢反彈：RSI 跌破 Trend 線不久，隨即在相對低檔 (< 45) 發生 RSI 向上突破 Trend
              const isJrTrendRebound = prevJrRsi < accJrRsiThresh2 && isRsiTrendGoldenCross;

              // 匯總加碼條件
              const isAccumulateSignal = strategyMode === 'ACCUMULATE' && (isJrExtremeOversold || isJrLowGoldenCross || isJrTrendRebound);

              // 頻率控制 (Cool-down)
              let isAccumulateBuy = false;
              if (isAccumulateSignal) {
                  const daysSinceLastBuy = index - lastAccBuyIndex;
                  const priceDropSinceLastBuy = lastAccBuyPrice > 0 ? (lastAccBuyPrice - item.close) / lastAccBuyPrice : 0;
                  
                  if (lastAccBuyIndex === -1 || daysSinceLastBuy >= accCooldownDays || priceDropSinceLastBuy > accPriceDropThresh) {
                      isAccumulateBuy = true;
                      lastAccBuyIndex = index;
                      lastAccBuyPrice = item.close;
                  }
              }

              // === SWING 模式：波段交易 (多空雙向與防守) ===

              let isSwingBuy = false;
              let isSwingSell = false;

              if (strategyMode === 'SWING') {
                  const swingKdThreshBuy = techSettings.jr?.swingKdThreshBuy ?? 65;
                  const swingJrRsiThreshBuy = techSettings.jr?.swingJrRsiThreshBuy ?? 65;
                  const swingKdThreshBreakout = techSettings.jr?.swingKdThreshBreakout ?? 80;
                  const swingKdThreshOversold = techSettings.jr?.swingKdThreshOversold ?? 25;
                  const swingJrJThreshOversold = techSettings.jr?.swingJrJThreshOversold ?? 25;
                  const swingJrRsiThreshOversold = techSettings.jr?.swingJrRsiThreshOversold ?? 35;
                  
                  const swingKdThreshSell = techSettings.jr?.swingKdThreshSell ?? 75;
                  const swingJrRsiThreshSell = techSettings.jr?.swingJrRsiThreshSell ?? 70;
                  const swingMaStopLossDrop = techSettings.jr?.swingMaStopLossDrop ?? 0.995;
                  const swingKdThreshWeak = techSettings.jr?.swingKdThreshWeak ?? 50;
                  const swingJrRsiThreshWeak = techSettings.jr?.swingJrRsiThreshWeak ?? 50;

                  // 波段進場作多 (LONG)
                  if (swingPosition !== 'LONG') {
                      // 1. 回檔契機買點：在多頭趨勢下(股價大於生命線)，指標於低檔或中位階發生黃金交叉
                      const isTrendPullbackBuy = isPriceAboveMA && ((isKdGoldenCross && newItem.k < swingKdThreshBuy) || (isJrGoldenCross && newItem.jr_rsi < swingJrRsiThreshBuy) || isRsiTrendGoldenCross);
                      
                      // 2. 突破買點：今日收盤強勢站上生命線，且指標維持多頭排列且未過熱
                      const isBreakoutBuy = defenseMA !== null && item.close > defenseMA && (index === 0 || arr[index-1].close <= defenseMA) && (newItem.k > newItem.d || newItem.jr_j > newItem.jr_rsi) && newItem.k < swingKdThreshBreakout;
                      
                      // 3. 恐慌底背離買點：價格在生命線下，但在極度超賣區發生強力金叉
                      const isDeepOversoldRebound = !isPriceAboveMA && ((newItem.k < swingKdThreshOversold && isKdGoldenCross) || (newItem.jr_j < swingJrJThreshOversold && isJrGoldenCross) || (newItem.jr_rsi < swingJrRsiThreshOversold && isRsiTrendGoldenCross));
                      
                      if (isTrendPullbackBuy || isBreakoutBuy || isDeepOversoldRebound) {
                          isSwingBuy = true;
                          swingPosition = 'LONG';
                      }
                  }

                  // 波段出場作空 (SHORT/EXIT)
                  if (swingPosition === 'LONG') {
                      // 出場條件 1: 高檔反轉 - 指標於高檔發生死亡交叉 (KD 或 JR 領先死叉)
                      const isOverboughtSell = (newItem.k > swingKdThreshSell && isKdDeadCross) || (newItem.jr_rsi > swingJrRsiThreshSell && isJrDeadCross) || (newItem.jr_rsi > swingJrRsiThreshSell && isRsiTrendDeadCross);
                      
                      // 出場條件 2: 停損防守 - 有效跌破生命線 (今日收盤低於線且昨日收盤在線之上)
                      const isBreakMAStopLoss = defenseMA !== null && item.close < (defenseMA * swingMaStopLossDrop) && (index > 0 && arr[index - 1].close >= defenseMA);

                      // 出場條件 3: 弱勢確立 - 指標在 50 以下發生死叉，顯示反彈無力，直接退出
                      const isWeakFailure = !isPriceAboveMA && ((newItem.k < swingKdThreshWeak && isKdDeadCross) || (newItem.jr_rsi < swingJrRsiThreshWeak && isJrDeadCross) || (newItem.jr_rsi < swingJrRsiThreshWeak && isRsiTrendDeadCross));
                      
                      if (isOverboughtSell || isBreakMAStopLoss || isWeakFailure) {
                          isSwingSell = true;
                          swingPosition = 'NONE';
                      }
                  }
              }

              if (isAccumulateBuy || isSwingBuy) {
                  newItem.jr_buy_signal = item.low * 0.985;
              }
              if (isSwingSell) {
                  newItem.jr_sell_signal = item.high * 1.015;
              }
          } else {
              newItem.jr_j_dir = 'flat';
              newItem.jr_rsi_dir = 'flat';
              newItem.jr_trend_dir = 'flat';
          }
          jrRsiHistory.push(newItem.jr_rsi);
          if (jrRsiHistory.length > 5) jrRsiHistory.shift();
          prevJrJ = newItem.jr_j;
          prevJrRsi = newItem.jr_rsi;
          prevJrTrend = newItem.jr_trend;
      }

      return newItem;
    });
  }, [aggregatedData, techSettings]);

  const displayData = useMemo(() => {
    if (processedData.length === 0) return [];
    const start = Math.max(0, Math.floor(viewWindow.start));
    const end = Math.min(processedData.length, Math.ceil(viewWindow.end));
    if (end - start < 2) return processedData.slice(Math.max(0, processedData.length - 60), processedData.length);
    return processedData.slice(start, end);
  }, [processedData, viewWindow]);

  const yDomain = useMemo(() => {
    if (displayData.length === 0) return ['auto', 'auto'];
    let min = Infinity;
    let max = -Infinity;
    displayData.forEach(d => {
      if (d.low < min) min = d.low;
      if (d.high > max) max = d.high;
      techSettings.mas.forEach((ma, i) => {
        if (ma.visible) {
           const maVal = (d as any)[`ma_${i}`];
           if (maVal) {
             if (maVal < min) min = maVal;
             if (maVal > max) max = maVal;
           }
        }
      });
      if (techSettings.bollinger) {
          const b = techSettings.bollinger;
          if (b.middle.visible && (d as any).bb_middle) { min = Math.min(min, (d as any).bb_middle); max = Math.max(max, (d as any).bb_middle); }
          if (b.upper1.visible && (d as any).bb_upper1) { min = Math.min(min, (d as any).bb_upper1); max = Math.max(max, (d as any).bb_upper1); }
          if (b.lower1.visible && (d as any).bb_lower1) { min = Math.min(min, (d as any).bb_lower1); max = Math.max(max, (d as any).bb_lower1); }
          if (b.upper2.visible && (d as any).bb_upper2) { min = Math.min(min, (d as any).bb_upper2); max = Math.max(max, (d as any).bb_upper2); }
          if (b.lower2.visible && (d as any).bb_lower2) { min = Math.min(min, (d as any).bb_lower2); max = Math.max(max, (d as any).bb_lower2); }
      }
    });
    const padding = (max - min) * 0.1;
    return [min - padding, max + padding];
  }, [displayData, techSettings.mas]);

  const rangeStats = useMemo(() => {
    if (processedData.length === 0) return null;
    const period = techSettings.rangeAnalysis?.period || 60; 
    const startIndex = Math.max(0, processedData.length - period);
    const sliceData = processedData.slice(startIndex);
    if (sliceData.length === 0) return null;

    let high = -Infinity;
    let low = Infinity;
    sliceData.forEach(d => {
      if (d.high > high) high = d.high;
      if (d.low < low) low = d.low;
    });

    return {
      period: sliceData.length,
      high,
      low
    };
  }, [processedData, techSettings.rangeAnalysis]);

  const setTimeRangePreset = (days: number) => {
    if (processedData.length === 0) return;
    const end = processedData.length;
    const start = Math.max(0, end - days);
    setViewWindow({ start, end });
  };

  const openCustomRangeModal = () => {
    if (processedData.length > 0) {
       const startIdx = Math.max(0, Math.floor(viewWindow.start));
       const endIdx = Math.min(processedData.length - 1, Math.ceil(viewWindow.end - 1));
       const currentStart = processedData[startIdx]?.date?.split('T')[0] || '';
       const currentEnd = processedData[endIdx]?.date?.split('T')[0] || '';
       setCustomChartStart(currentStart);
       setCustomChartEnd(currentEnd);
    }
    setShowCustomRangeModal(true);
  };

  const handleApplyCustomChartRange = () => {
     if (processedData.length === 0) {
         setShowCustomRangeModal(false);
         return;
     }
     
     let startIndex = 0;
     let endIndex = processedData.length;
     
     if (customChartStart) {
         const foundIdx = processedData.findIndex(d => d.date >= customChartStart);
         if (foundIdx !== -1) startIndex = foundIdx;
     }
     if (customChartEnd) {
         const foundIdx = processedData.findIndex(d => d.date > customChartEnd);
         if (foundIdx !== -1) endIndex = foundIdx;
     }

     if (startIndex < endIndex) {
         setViewWindow({ start: startIndex, end: endIndex });
     }
     setShowCustomRangeModal(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWindow.current = { ...viewWindow };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const diff = dragStartX.current - e.clientX;
    const containerWidth = chartContainerRef.current?.clientWidth || 1000;
    const count = viewWindow.end - viewWindow.start;
    const moveCount = (diff / containerWidth) * count;

    let newStart = dragStartWindow.current.start + moveCount;
    let newEnd = dragStartWindow.current.end + moveCount;

    if (newStart < 0) {
       newEnd -= newStart;
       newStart = 0;
    }
    if (newEnd > processedData.length) {
       newStart -= (newEnd - processedData.length);
       newEnd = processedData.length;
    }
    if (newStart < 0) newStart = 0; 

    setViewWindow({ start: newStart, end: newEnd });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    isScrollbarDragging.current = null;
  };

  const startResizing = (e: React.MouseEvent) => {
    isResizing.current = true;
    const startY = e.clientY;
    const startHeight = mainChartHeight;
    const handleResize = (ev: MouseEvent) => {
       const newHeight = startHeight + (ev.clientY - startY);
       setMainChartHeight(Math.max(200, Math.min(800, newHeight)));
    };
    const stopResize = () => {
       isResizing.current = false;
       window.removeEventListener('mousemove', handleResize);
       window.removeEventListener('mouseup', stopResize);
    };
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
  };

  const handleScrollbarMouseDown = (e: React.MouseEvent, type: 'left' | 'right' | 'move') => {
    e.stopPropagation();
    isScrollbarDragging.current = type;
    scrollbarDragStartX.current = e.clientX;
    scrollbarDragStartWindow.current = { ...viewWindow };

    const handleScrollbarMouseMove = (ev: MouseEvent) => {
        if (!isScrollbarDragging.current || !scrollbarRef.current) return;
        const barWidth = scrollbarRef.current.clientWidth;
        const totalCount = processedData.length || 1;
        const diffPx = ev.clientX - scrollbarDragStartX.current;
        const diffCount = (diffPx / barWidth) * totalCount;
        
        let { start, end } = scrollbarDragStartWindow.current;

        if (isScrollbarDragging.current === 'move') {
            start += diffCount;
            end += diffCount;
            if (start < 0) { end -= start; start = 0; }
            if (end > totalCount) { start -= (end - totalCount); end = totalCount; }
            if (start < 0) start = 0;
        } else if (isScrollbarDragging.current === 'left') {
            start += diffCount;
            if (start < 0) start = 0;
            if (start > end - 10) start = end - 10; 
        } else if (isScrollbarDragging.current === 'right') {
            end += diffCount;
            if (end > totalCount) end = totalCount;
            if (end < start + 10) end = start + 10;
        }

        setViewWindow({ start, end });
    };

    const stopScrollbarDrag = () => {
        isScrollbarDragging.current = null;
        window.removeEventListener('mousemove', handleScrollbarMouseMove);
        window.removeEventListener('mouseup', stopScrollbarDrag);
    };

    window.addEventListener('mousemove', handleScrollbarMouseMove);
    window.addEventListener('mouseup', stopScrollbarDrag);
  };

  const analyzePatterns = useMemo(() => {
    const results: PatternResult[] = [];
    if (displayData.length < 10) return results;

    const margin = techSettings.rangeAnalysis?.tolerance || 0.03; 
    const windowData = displayData;
    const lastIdx = windowData.length - 1;
    const last = windowData[lastIdx];

    const getPivots = (data: any[], count: number) => {
        const pivots: { type: 'peak' | 'trough', price: number, date: string, idx: number }[] = [];
        for (let i = 2; i < data.length - 2; i++) {
            const current = data[i];
            const prev1 = data[i-1];
            const prev2 = data[i-2];
            const next1 = data[i+1];
            const next2 = data[i+2];

            if (current.high > prev1.high && current.high > prev2.high && current.high > next1.high && current.high > next2.high) {
                pivots.push({ type: 'peak', price: current.high, date: current.date, idx: i });
            }
            if (current.low < prev1.low && current.low < prev2.low && current.low < next1.low && current.low < next2.low) {
                pivots.push({ type: 'trough', price: current.low, date: current.date, idx: i });
            }
        }
        return pivots;
    };

    const pivots = getPivots(windowData, 5);
    const peaks = pivots.filter(p => p.type === 'peak');
    const troughs = pivots.filter(p => p.type === 'trough');

    const prev = windowData[lastIdx - 1];
    
    // Existing Price Patterns
    if (prev.close < prev.open && last.close > last.open && last.open < prev.close && last.close > prev.open) {
        results.push({
            name: '多頭吞噬 (Bullish Engulfing)',
            detected: true,
            description: '多方強勢反撲，覆蓋前日跌勢',
            confidence: 'Medium',
            details: '第二根紅K實體完全包覆第一根黑K實體，顯示多方力道強勁。',
            type: 'BULLISH',
            visuals: [{ x1: prev.date, y1: prev.high, x2: last.date, y2: last.high, stroke: '#ef4444' }]
        });
    }

    if (troughs.length >= 2) {
        const t1 = troughs[troughs.length - 2];
        const t2 = troughs[troughs.length - 1];
        const diff = Math.abs(t1.price - t2.price) / t1.price;
        const midPeaks = peaks.filter(p => p.idx > t1.idx && p.idx < t2.idx);
        if (diff < margin && midPeaks.length > 0) {
            const neck = midPeaks[midPeaks.length - 1];
            results.push({
                name: 'W底 (Double Bottom)',
                detected: true,
                description: '雙重底打底完成',
                confidence: diff < 0.01 ? 'High' : 'Medium',
                details: `第一低點 ${t1.price.toFixed(0)}，第二低點 ${t2.price.toFixed(0)}。突破頸線 ${neck.price.toFixed(0)} 為轉強訊號。`,
                type: 'BULLISH',
                visuals: [
                    { x1: t1.date, y1: t1.price, x2: neck.date, y2: neck.price, stroke: '#f59e0b' },
                    { x1: neck.date, y1: neck.price, x2: t2.date, y2: t2.price, stroke: '#f59e0b' },
                    { x1: t2.date, y1: t2.price, x2: last.date, y2: last.close, stroke: '#f59e0b' }
                ]
            });
        }
    }

    if (peaks.length >= 2) {
        const p1 = peaks[peaks.length - 2];
        const p2 = peaks[peaks.length - 1];
        const diff = Math.abs(p1.price - p2.price) / p1.price;
        const midTroughs = troughs.filter(t => t.idx > p1.idx && t.idx < p2.idx);
        if (diff < margin && midTroughs.length > 0) {
            const neck = midTroughs[midTroughs.length - 1];
            results.push({
                name: 'M頭 (Double Top)',
                detected: true,
                description: '雙重頂形成，賣壓沉重',
                confidence: diff < 0.01 ? 'High' : 'Medium',
                details: `高點分別為 ${p1.price.toFixed(0)} 與 ${p2.price.toFixed(0)}。跌破頸線 ${neck.price.toFixed(0)} 則型態確立。`,
                type: 'BEARISH',
                visuals: [
                    { x1: p1.date, y1: p1.price, x2: neck.date, y2: neck.price, stroke: '#3b82f6' },
                    { x1: neck.date, y1: neck.price, x2: p2.date, y2: p2.price, stroke: '#3b82f6' },
                    { x1: p2.date, y1: p2.price, x2: last.date, y2: last.close, stroke: '#3b82f6' }
                ]
            });
        }
    }

    if (troughs.length >= 2) {
        const prevSupport = troughs[troughs.length - 2];
        const breakTrough = troughs[troughs.length - 1];
        if (breakTrough.price < prevSupport.price * (1 - 0.005) && last.close > prevSupport.price) {
            results.push({
                name: '破底翻 (Spring)',
                detected: true,
                description: '假跌破誘空完成',
                confidence: 'High',
                details: `跌破支撐 ${prevSupport.price.toFixed(0)} 後迅速站回，為強烈底部反轉訊號。`,
                type: 'BULLISH',
                visuals: [
                    { x1: prevSupport.date, y1: prevSupport.price, x2: breakTrough.date, y2: breakTrough.price, stroke: '#ec4899' },
                    { x1: breakTrough.date, y1: breakTrough.price, x2: last.date, y2: last.close, stroke: '#ec4899' }
                ]
            });
        }
    }

    if (peaks.length >= 1 && troughs.length >= 2) {
        const t1 = troughs[troughs.length - 2];
        const p1 = peaks[peaks.length - 1];
        const t2 = windowData.slice(p1.idx, lastIdx).reduce((min, d, i) => d.low < min.price ? { price: d.low, date: d.date, idx: p1.idx + i } : min, { price: Infinity, date: '', idx: -1 });
        
        if (p1.idx > t1.idx && t2.idx > p1.idx && t2.price > t1.price && last.close > p1.price) {
            results.push({
                name: 'N字形突破 (N-Pattern)',
                detected: true,
                description: '上升趨勢確認',
                confidence: 'High',
                details: `起漲點 ${t1.price.toFixed(0)}，前高 ${p1.price.toFixed(0)}，回測低點 ${t2.price.toFixed(0)}。目前已突破前高，展開新一波攻勢。`,
                type: 'BULLISH',
                visuals: [
                    { x1: t1.date, y1: t1.price, x2: p1.date, y2: p1.price, stroke: '#f43f5e' },
                    { x1: p1.date, y1: p1.price, x2: t2.date, y2: t2.price, stroke: '#f43f5e' },
                    { x1: t2.date, y1: t2.price, x2: last.date, y2: last.close, stroke: '#f43f5e' }
                ]
            });
        }
    }

    const rangeLookback = 20;
    if (windowData.length > rangeLookback) {
        const slice = windowData.slice(lastIdx - rangeLookback, lastIdx);
        const rHigh = Math.max(...slice.map(d => d.high));
        const rLow = Math.min(...slice.map(d => d.low));
        const rangeWidth = (rHigh - rLow) / rLow;

        if (rangeWidth < 0.04) { 
            if (last.close > rHigh) {
                results.push({
                    name: '區間突破 (Range Breakout)',
                    detected: true,
                    description: '突破盤整箱體',
                    confidence: 'Medium',
                    details: `在 ${rangeLookback} 天盤整後向上突破箱頂 ${rHigh.toFixed(0)}。`,
                    type: 'BULLISH',
                    visuals: [{ x1: slice[0].date, y1: rHigh, x2: last.date, y2: rHigh, stroke: '#ef4444' }]
                });
            } else if (last.close < rLow) {
                results.push({
                    name: '區間跌破 (Range Breakdown)',
                    detected: true,
                    description: '跌破盤整箱體',
                    confidence: 'Medium',
                    details: `跌破箱底 ${rLow.toFixed(0)}，短期轉弱。`,
                    type: 'BEARISH',
                    visuals: [{ x1: slice[0].date, y1: rLow, x2: last.date, y2: rLow, stroke: '#22c55e' }]
                });
            }
        }
    }

    // Technical Indicator Analysis
    if (last.k !== undefined && last.d !== undefined && prev.k !== undefined && prev.d !== undefined) {
        // KD Golden Cross
        if (prev.k < prev.d && last.k > last.d && last.k < 30) {
            results.push({
                name: 'KD低檔黃金交叉',
                detected: true,
                description: 'KD指標在低檔區交叉向上',
                confidence: 'Medium',
                details: `K值由 ${prev.k.toFixed(2)} 上穿 D值 ${last.d.toFixed(2)}，且位於低檔區(<30)，視為反彈訊號。`,
                type: 'BULLISH',
                visuals: [{ x1: prev.date, y1: last.low, x2: last.date, y2: last.low, stroke: '#f59e0b' }]
            });
        }
        // KD Death Cross
        if (prev.k > prev.d && last.k < last.d && last.k > 70) {
            results.push({
                name: 'KD高檔死亡交叉',
                detected: true,
                description: 'KD指標在高檔區交叉向下',
                confidence: 'Medium',
                details: `K值由 ${prev.k.toFixed(2)} 下穿 D值 ${last.d.toFixed(2)}，且位於高檔區(>70)，留意回檔風險。`,
                type: 'BEARISH',
                visuals: [{ x1: prev.date, y1: last.high, x2: last.date, y2: last.high, stroke: '#a855f7' }]
            });
        }
        // KD Passivation (High)
        if (last.k > 80 && prev.k > 80) {
             results.push({
                name: 'KD高檔鈍化',
                detected: true,
                description: 'K值持續大於80，多頭強勢',
                confidence: 'High',
                details: `K值連續處於80以上，顯示買盤強勁，股價可能持續創高，但也需提防隨時反轉。`,
                type: 'BULLISH'
            });
        }
    }

    // RSI Analysis
    if (last.rsi !== undefined) {
        if (last.rsi > 75) {
             results.push({
                name: 'RSI 過熱',
                detected: true,
                description: 'RSI 指標進入超買區',
                confidence: 'Medium',
                details: `RSI 目前為 ${last.rsi.toFixed(1)}，短線過熱，不宜追高。`,
                type: 'BEARISH'
            });
        } else if (last.rsi < 25) {
             results.push({
                name: 'RSI 超賣',
                detected: true,
                description: 'RSI 指標進入超賣區',
                confidence: 'Medium',
                details: `RSI 目前為 ${last.rsi.toFixed(1)}，短線乖離過大，有機會反彈。`,
                type: 'BULLISH'
            });
        }
    }

    // MACD Analysis
    if (last.dif !== undefined && last.dem !== undefined && prev.dif !== undefined && prev.dem !== undefined) {
        if (prev.dif < prev.dem && last.dif > last.dem) {
             const position = last.dif > 0 ? '零軸上' : '零軸下';
             results.push({
                name: `MACD 黃金交叉 (${position})`,
                detected: true,
                description: 'DIF 向上突破 MACD',
                confidence: last.dif > 0 ? 'High' : 'Medium',
                details: `MACD 快線(DIF)向上穿越慢線，趨勢轉強。`,
                type: 'BULLISH'
            });
        }
        if (prev.dif > prev.dem && last.dif < last.dem) {
             const position = last.dif > 0 ? '零軸上' : '零軸下';
             results.push({
                name: `MACD 死亡交叉 (${position})`,
                detected: true,
                description: 'DIF 向下突破 MACD',
                confidence: last.dif < 0 ? 'High' : 'Medium',
                details: `MACD 快線(DIF)向下穿越慢線，趨勢轉弱。`,
                type: 'BEARISH'
            });
        }
    }
    
    return results;
  }, [displayData, techSettings.rangeAnalysis]);

  const analyzeChips = useMemo((): ChipAnalysisResult => {
     if (displayData.length === 0) return { score: 50, sentiment: 'Neutral', signals: [], summary: '無數據' };
     
     const last = displayData[displayData.length - 1];
     const prev = displayData.length > 1 ? displayData[displayData.length - 2] : last;
     
     let score = 50;
     const signals: ChipSignal[] = [];

     if ((last.foreign || 0) > 10) {
         score += 10;
         signals.push({ title: '外資大買', type: 'BULLISH', description: '外資大幅買超，有利多頭', scoreImpact: 10 });
     } else if ((last.foreign || 0) < -10) {
         score -= 10;
         signals.push({ title: '外資大賣', type: 'BEARISH', description: '外資大幅賣超，需留意賣壓', scoreImpact: -10 });
     }

     if ((last.trust || 0) > 5) {
         score += 15;
         signals.push({ title: '投信加碼', type: 'BULLISH', description: '投信進場，可能為作帳行情', scoreImpact: 15 });
     }

     // Tu-Yang Tong-Mai (Foreign + Trust Buy)
     if ((last.foreign || 0) > 10 && (last.trust || 0) > 5) {
         score += 10;
         signals.push({ title: '土洋同買', type: 'BULLISH', description: '外資與投信同步大幅買超，共識強烈。', scoreImpact: 10 });
     }

     // Margin Analysis (Retail Sentiment)
     const marginChange = last.marginChange || 0;
     
     if (marginChange > 5) {
         if (last.close < (prev.close || last.close)) {
             score -= 15;
             signals.push({ title: '融資套牢', type: 'BEARISH', description: '股價下跌且融資大幅增加，散戶接刀跡象明顯。', scoreImpact: -15 });
         } else {
             score -= 5;
             signals.push({ title: '融資增加', type: 'NEUTRAL', description: '股價上漲伴隨融資增加，散戶參與度提高。', scoreImpact: -5 });
         }
     } else if (marginChange < -5) {
         if (last.close > (prev.close || last.close)) {
             score += 10;
             signals.push({ title: '融資減肥', type: 'BULLISH', description: '股價上漲且融資減少，籌碼趨於安定。', scoreImpact: 10 });
         } else {
             score += 5; // Good for long term bottom
             signals.push({ title: '融資停損', type: 'BULLISH', description: '股價下跌伴隨融資大減，清洗浮額有利落底。', scoreImpact: 5 });
         }
     }

     // Short Analysis (Squeeze Potential)
     const shortChange = last.shortChange || 0;
     
     if (shortChange > 500) { // arbitrary threshold for "significant"
         if (last.close > (prev.close || last.close)) {
             score += 15;
             signals.push({ title: '軋空訊號', type: 'BULLISH', description: '股價上漲且融券大增，具備軋空條件。', scoreImpact: 15 });
         }
     } else if (shortChange < -500) {
         // Covering
         signals.push({ title: '融券回補', type: 'NEUTRAL', description: '空單進行回補，買盤支撐但軋空力道減弱。', scoreImpact: 0 });
     }

     score = Math.max(0, Math.min(100, score));
     let sentiment: any = 'Neutral';
     if (score >= 80) sentiment = 'Strongly Bullish';
     else if (score >= 60) sentiment = 'Bullish';
     else if (score <= 20) sentiment = 'Strongly Bearish';
     else if (score <= 40) sentiment = 'Bearish';

     return {
         score,
         sentiment,
         signals,
         summary: `綜合評分 ${score}，籌碼面呈現${sentiment === 'Neutral' ? '中性' : sentiment.includes('Bullish') ? '偏多' : '偏空'}格局。`
     };
  }, [displayData]);

  const generateAiReport = async () => {
      setAiLoading(true);
      setAiReport('');
      setShowAiModal(true);

      try {
          if (!apiKey) {
              setAiReport('請先至「設定」中輸入 Gemini API Key 才能進行 AI 分析。');
              setAiLoading(false);
              // Open settings to let user input
              setTempSettings(techSettings);
              setTempApiKey(apiKey);
              setShowSettings(true);
              return;
          }

          // Prepare Data Context (Last 20 days)
          const recentData = [...sourceData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-20);
          
          if (recentData.length === 0) {
              setAiReport('目前無市場數據可供分析。');
              setAiLoading(false);
              return;
          }

          const dataString = recentData.map(d => 
              `Date: ${d.date}, Close: ${d.close}, Vol: ${(viewMode === 'INDEX' ? (indexType === 'TX' ? d.volume : d.volume/100000000) : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? d.volume/1000 : d.volume)).toFixed(1)}, ` +
              `Foreign: ${d.foreign || 0}, Trust: ${d.trust || 0}, MarginChange: ${d.marginChange || 0}`
          ).join('\n');

          const prompt = `
            You are a professional financial analyst for the Taiwan Stock Market (TAIEX).
            Based on the following recent 20 days of market data (Close price, Volume in Billions, Institutional Buy/Sell in Billions, Margin Change), provide a comprehensive strategic report.
            
            Data:
            ${dataString}

            Please structure your response in Traditional Chinese (Markdown format) with the following sections:
            1. **市場趨勢判讀 (Market Trend)**: Analyze the price action and volume. Is it Bullish, Bearish, or Consolidation?
            2. **籌碼面分析 (Chip Analysis)**: Interpret the Foreign and Trust movements. Are institutions buying or fleeing?
            3. **關鍵支撐與壓力 (Support & Resistance)**: Based on recent highs/lows and integer levels.
            4. **操作建議與進出場時機 (Actionable Advice)**: specifically tell me WHEN to buy or sell. E.g., "Buy on pullback to X", "Sell on rally to Y", or "Wait for breakout". Be specific.
            5. **風險提示 (Risk Warning)**: What should the investor watch out for?

            Keep it concise but professional.
          `;

          const ai = new GoogleGenAI({ apiKey: apiKey });
          const response = await ai.models.generateContent({
              model: aiModel, // Use state variable for model selection
              contents: prompt,
          });

          setAiReport(response.text || 'AI 無法產生回應，請稍後再試。');

      } catch (error: any) {
          console.error("AI Generation Error", error);
          let errorMsg = error.message || '未知錯誤';

          // Handle 429 Resource Exhausted (Quota)
          if (typeof errorMsg === 'string' && (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('Quota'))) {
              errorMsg = 'API 使用額度已達上限 (429)。\n建議切換至 "Gemini 2.0 Flash" 或 "Gemini 1.5 Flash" 模型，或稍後再試。';
          }

          setAiReport(`分析失敗: ${errorMsg}\n\n請確認 API Key 是否設定正確，或嘗試更換其他模型。`);
      } finally {
          setAiLoading(false);
      }
  };

  const handleExportCSV = () => {
    const volStr = viewMode === 'INDEX' ? (indexType === 'TX' ? '(口)' : '(億)') : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) ? '(張)' : '(股)';
    const instStr = viewMode === 'INDEX' ? '(億)' : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) ? '(張)' : '(股)';
    const mgnStr = viewMode === 'INDEX' ? '(億)' : '(張)';
    
    const headers = ['日期', '開盤', '最高', '最低', '收盤', `成交量${volStr}`, `外資${instStr}`, `投信${instStr}`, `自營商${instStr}`, `融資餘額${mgnStr}`, `融資增減${mgnStr}`, '融券餘額(張)', '融券增減(張)', '加權報酬指數'];
    let exportData = [...sourceData];
    if (viewMode === 'INDEX' && indexType === 'TX') {
        exportData = exportData.filter(d => d.txClose !== undefined && d.txClose !== null && !isNaN(d.txClose)).map(d => ({
            ...d, open: d.txOpen!, high: d.txHigh!, low: d.txLow!, close: d.txClose!, volume: d.txVolume || 0
        }));
    }
    const rows = exportData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(d => [
        d.date, 
        d.open, 
        d.high, 
        d.low, 
        d.close, 
        d.volume ? (viewMode === 'INDEX' ? (indexType === 'TX' ? d.volume : d.volume / 100000000) : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? Math.floor(d.volume / 1000) : Math.round(d.volume))) : 0, 
        d.foreign || 0, 
        d.trust || 0, 
        d.dealer || 0, 
        d.marginBalance || 0, 
        d.marginChange || 0, 
        d.shortBalance || 0, 
        d.shortChange || 0,
        d.taiexTotalReturn || ''
    ].join(','));
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `market_data_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(row => row.trim() !== '');
        if (rows.length < 2) { alert('CSV 內容為空或格式錯誤'); return; }
        const newItems: KLineData[] = [];
        for (let i = 1; i < rows.length; i++) {
           const cols = rows[i].split(',').map(c => c.trim());
           if (cols.length < 5) continue; 
           const date = cols[0]; if (!date || isNaN(parseFloat(cols[1]))) continue;
           newItems.push({
             date: date, open: parseFloat(cols[1]), high: parseFloat(cols[2]), low: parseFloat(cols[3]), close: parseFloat(cols[4]),
             volume: (parseFloat(cols[5]) || 0) * 100000000, 
             foreign: parseFloat(cols[6]) || undefined, trust: parseFloat(cols[7]) || undefined, dealer: parseFloat(cols[8]) || undefined,
             marginBalance: parseFloat(cols[9]) || undefined, marginChange: parseFloat(cols[10]) || undefined, shortBalance: parseFloat(cols[11]) || undefined, shortChange: parseFloat(cols[12]) || undefined,
             taiexTotalReturn: parseFloat(cols[13]) || undefined
           });
        }
        if (newItems.length === 0) { alert('未解析到有效數據'); return; }
        
        const map = new Map<string, KLineData>(data.map(p => [p.date, p]));
        newItems.forEach(item => map.set(item.date, item));
        const finalData = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
        onUpdateData(finalData);
        alert(`成功匯入 ${newItems.length} 筆市場數據`);
      } catch (err) { alert('匯入失敗，請檢查 CSV 格式是否正確'); console.error(err); }
    };
    reader.readAsText(file); if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const CustomMainChartTooltip = () => null;

  const saveSettings = () => { 
      onUpdateTechSettings(tempSettings); 
      setApiKey(tempApiKey);
      localStorage.setItem('smartvest_gemini_api_key', tempApiKey);
      setShowSettings(false); 
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    
    let volVal = parseFloat(entryVolume) || 0;
    if (viewMode === 'INDEX') volVal = indexType === 'TX' ? volVal : volVal * 100000000;
    else if (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) volVal = volVal * 1000;
    
    const newItem: Partial<KLineData> & { date: string } = {
        date: entryDate, foreign: parseFloat(entryForeign) || undefined, trust: parseFloat(entryTrust) || undefined, dealer: parseFloat(entryDealer) || undefined,
        marginBalance: parseFloat(entryMarginBal) || undefined, marginChange: parseFloat(entryMarginChange) || undefined, shortBalance: parseFloat(entryShortBal) || undefined, shortChange: parseFloat(entryShortChange) || undefined,
        taiexTotalReturn: parseFloat(entryTaiexTR) || undefined,
        foreignTxNet: parseFloat(entryTxForeign) || undefined,
        retailMtxNet: parseFloat(entryMtxRetail) || undefined,
        retailTmfNet: parseFloat(entryTmfRetail) || undefined
    };
    
    if (viewMode === 'INDEX') {
        let newData = [...data];
        const idx = newData.findIndex(d => d.date === entryDate); 
        if (idx >= 0) { 
            newData[idx] = { ...newData[idx], ...newItem }; 
        } else { 
            newData.push(newItem as KLineData);
            newData.sort((a, b) => a.date.localeCompare(b.date)); 
        }
        onUpdateData(newData);
    } else {
        let newData = [...stockData];
        const idx = newData.findIndex(d => d.date === entryDate); 
        if (idx >= 0) { 
            newData[idx] = { ...newData[idx], ...newItem }; 
        } else { 
            newData.push(newItem as KLineData);
            newData.sort((a, b) => a.date.localeCompare(b.date)); 
        }
        setStockData(newData);
    }
    
    setShowEntryForm(false); resetForm();
  };

  useEffect(() => {
     if (initialSymbol) {
         if (searchInputRef.current) {
             searchInputRef.current.value = initialSymbol;
         }
         setViewMode('STOCK');
         handleSearchStock(initialSymbol);
     } else if (initialSymbol === null) {
         setViewMode('INDEX');
         if (searchInputRef.current) searchInputRef.current.value = '';
     }
  }, [initialSymbol]);

  const latest = rangeFilteredData.length > 0 ? rangeFilteredData[rangeFilteredData.length - 1] : {} as KLineData;
  const latestInst = useMemo(() => {
    if (rangeFilteredData.length === 0) return {} as KLineData;
    // 不往前找昨天的數據，直接取最新一筆 K 線數據
    return rangeFilteredData[rangeFilteredData.length - 1];
  }, [rangeFilteredData]);

  const latestMargin = useMemo(() => {
    if (rangeFilteredData.length === 0) return {} as KLineData;
    // 不往前找昨天的數據，直接取最新一筆 K 線數據，如果沒有融資融券數據就會顯示為空
    return rangeFilteredData[rangeFilteredData.length - 1];
  }, [rangeFilteredData]);

  const totalInst = (latestInst.foreign || 0) + (latestInst.trust || 0) + (latestInst.dealer || 0);

  const analysisPeriod = techSettings.rangeAnalysis?.period ?? 60;
  const analysisTolerance = techSettings.rangeAnalysis?.tolerance ?? 0.03;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className={`grid grid-cols-1 gap-4 ${viewMode === 'INDEX' ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
        {/* ... (Keep existing layout) ... */}
        <div className="lg:col-span-3 bg-slate-900 rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-blue-600 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row gap-6 h-full">
            <div className="flex-1 pr-0 md:pr-4">
                <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center gap-2 text-slate-400">
                     <Activity size={16} />
                     <span className="text-xs font-bold uppercase tracking-widest text-blue-400">
                        {viewMode === 'INDEX' ? (indexType === 'TAIEX' ? 'TSEC: 加權指數 (TAIEX)' : 'TAIFEX: 台指期貨 (TX)') : `STOCK: ${stockInfo?.symbol || ''} (${stockInfo?.name || ''})`}
                     </span>
                   </div>
                   <div className="flex items-center gap-2">
                       {viewMode === 'INDEX' && (
                           <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                               <button onClick={() => setIndexType('TAIEX')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${indexType === 'TAIEX' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>加權</button>
                               <button onClick={() => setIndexType('TX')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${indexType === 'TX' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>台指</button>
                           </div>
                       )}
                       {viewMode === 'STOCK' && (
                           <button 
                               onClick={() => {
                                   setViewMode('INDEX');
                                   if (searchInputRef.current) searchInputRef.current.value = '';
                                   handleResetTwoYears();
                                   if (onClearInitialSymbol) onClearInitialSymbol();
                               }}
                               className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-lg active:scale-95"
                           >
                               <Database size={12} />
                               回大盤
                           </button>
                       )}
                       <div className="flex flex-col items-end relative">
                           <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                               <input 
                                   type="text" 
                                   ref={searchInputRef}
                                   onKeyDown={(e) => e.key === 'Enter' && handleSearchStock()}
                                   placeholder="輸入代號 (ex: 2330)"
                                   className="bg-transparent border-none text-white text-[10px] px-2 py-0.5 w-24 focus:outline-none placeholder-slate-500 font-mono"
                               />
                               <button 
                                   onClick={() => handleSearchStock()}
                                   disabled={isSearching}
                                   className="p-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-md transition-all shadow-md active:scale-95"
                               >
                                   {isSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                               </button>
                           </div>
                           {searchStatus && <span className="absolute top-full right-0 text-[10px] text-red-400 mt-1 whitespace-nowrap">{searchStatus}</span>}
                       </div>
                       {viewMode === 'INDEX' && (
                           <button onClick={fetchLatestMarket} disabled={isLoading} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-lg active:scale-95">
                              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                              更新
                           </button>
                       )}
                   </div>
                </div>
                {/* ... (Keep existing content) ... */}
                <div className="flex items-baseline gap-3 mt-1">
                  <div className="text-lg font-bold text-slate-400 flex items-center gap-3">
                     {rangeFilteredData.length > 1 ? (
                        (() => {
                            const prev = rangeFilteredData[rangeFilteredData.length-2];
                            const change = latest.close - prev.close;
                            const pct = (change / prev.close) * 100;
                            const isTW = viewMode === 'INDEX' || stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO');
                            const isLimitUp = isTW && pct > 9.5;
                            const isLimitDown = isTW && pct < -9.5;
                            
                            return (
                              <>
                                <h2 className={`text-4xl font-black font-mono tracking-tighter px-2 rounded-lg ${isLimitUp ? 'bg-rose-500 text-white' : isLimitDown ? 'bg-emerald-500 text-white' : 'text-white'}`}>
                                    {latest.close ? formatNum(latest.close) : '0.00'}
                                </h2>
                                <span className={`${isLimitUp ? 'text-rose-400 font-black' : isLimitDown ? 'text-emerald-400 font-black' : change >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {change>=0?'+':''}{formatNum(change)} ({pct.toFixed(2)}%)
                                </span>
                              </>
                            );
                        })()
                     ) : (
                        <h2 className="text-4xl font-black font-mono tracking-tighter text-white">{latest.close ? formatNum(latest.close) : '0.00'}</h2>
                     )}
                  </div>
                </div>
                <div className="flex gap-4 mt-4 text-[10px] font-medium text-slate-400 border-t border-white/10 pt-3">
                   <div className="flex flex-col">
                       <span className="opacity-60">成交量</span>
                       <span className="text-white font-mono text-xs">
                           {latest.volume ? (
                               viewMode === 'INDEX' ? (indexType === 'TX' ? `${latest.volume.toLocaleString()} 口` : `${(latest.volume / 100000000).toFixed(2)} 億`) :
                               (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) ? `${Math.floor(latest.volume / 1000).toLocaleString()} 張` :
                               `${Math.round(latest.volume).toLocaleString()} 股`
                           ) : '0.00'}
                       </span>
                   </div>
                   <div className="flex flex-col">
                       <span className="opacity-60">開盤</span>
                       <span className="text-white font-mono text-xs">{formatNum(latest.open)}</span>
                   </div>
                   <div className="flex flex-col">
                       <span className="opacity-60">高/低</span>
                       <span className="text-white font-mono text-xs">{formatNum(latest.high)} / {formatNum(latest.low)}</span>
                   </div>
                </div>
            </div>

            <div className="hidden md:block w-px bg-white/10 self-stretch"></div>
            <div className="md:hidden h-px w-full bg-white/10"></div>

            <div className="md:w-1/3 flex flex-col justify-between">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Gauge size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest text-blue-400">CNN Fear & Greed</span>
                </div>
                
                <div className="flex flex-col items-center justify-center flex-1 py-1">
                    {fearGreed ? (
                        <GaugeChart score={fearGreed.score} timestamp={fearGreed.timestamp} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                            <Loader2 size={20} className="animate-spin" />
                            <span className="text-xs">Loading Index...</span>
                        </div>
                    )}
                </div>
            </div>
          </div>
        </div>
        
        {/* ... (Keep other top cards) ... */}
        <div className="lg:col-span-1 bg-white rounded-3xl p-4 border border-slate-100 shadow-lg flex flex-col justify-center gap-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                    <Users size={18} className="text-blue-600" />
                    <span className="font-bold text-slate-700">三大法人 {viewMode === 'INDEX' ? '(億)' : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? '(張)' : '(股)')}</span>
                </div>
                <span className={`font-mono font-bold text-lg ${totalInst > 0 ? 'text-rose-500' : totalInst < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {totalInst > 0 ? '+' : ''}{formatNum(totalInst)}
                </span>
            </div>
            <div className="space-y-2 text-sm font-medium">
                <div className="flex justify-between">
                    <span className="text-slate-500">外資</span>
                    <span className={`font-mono ${latestInst.foreign! > 0 ? 'text-rose-500' : latestInst.foreign! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>{latestInst.foreign !== undefined ? formatNum(latestInst.foreign) : '-'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">投信</span>
                    <span className={`font-mono ${latestInst.trust! > 0 ? 'text-rose-500' : latestInst.trust! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>{latestInst.trust !== undefined ? formatNum(latestInst.trust) : '-'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">自營商</span>
                    <span className={`font-mono ${latestInst.dealer! > 0 ? 'text-rose-500' : latestInst.dealer! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>{latestInst.dealer !== undefined ? formatNum(latestInst.dealer) : '-'}</span>
                </div>
            </div>
        </div>

        <div className="lg:col-span-1 bg-white rounded-3xl p-4 border border-slate-100 shadow-lg flex flex-col justify-center gap-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-1">
                <TrendingUp size={18} className="text-purple-600" />
                <span className="font-bold text-slate-700">融資融券</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-2 text-sm">
                <div className="flex flex-col">
                    <span className="text-xs text-slate-400">融資增減{viewMode === 'INDEX' ? '(億)' : '(張)'}</span>
                    <span className={`font-mono font-bold ${latestMargin.marginChange! > 0 ? 'text-rose-500' : latestMargin.marginChange! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                       {latestMargin.marginChange !== undefined ? (latestMargin.marginChange > 0 ? '+' : '') + formatNum(latestMargin.marginChange) : '-'}
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-slate-400">融券增減(張)</span>
                    <span className={`font-mono font-bold ${latestMargin.shortChange! > 0 ? 'text-rose-500' : latestMargin.shortChange! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                       {latestMargin.shortChange !== undefined ? (latestMargin.shortChange > 0 ? '+' : '') + formatNum(latestMargin.shortChange) : '-'}
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-slate-400">融資餘額{viewMode === 'INDEX' ? '(億)' : '(張)'}</span>
                    <span className="font-mono font-bold text-slate-700">
                       {latestMargin.marginBalance !== undefined ? formatNum(latestMargin.marginBalance) : '-'}
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-slate-400">融券餘額(張)</span>
                    <span className="font-mono font-bold text-slate-700">
                       {latestMargin.shortBalance !== undefined ? Math.round(latestMargin.shortBalance).toLocaleString() : '-'}
                    </span>
                </div>
            </div>
        </div>

        {viewMode === 'INDEX' && (
          <div className="lg:col-span-1 bg-white rounded-3xl p-4 border border-slate-100 shadow-lg flex flex-col justify-center gap-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-1">
                  <Database size={18} className="text-indigo-600" />
                  <span className="font-bold text-slate-700">期貨未平倉</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-2 text-sm">
                  <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400">外資台指(淨)</span>
                      <span className={`font-mono font-bold ${latestMargin.foreignTxNet! > 0 ? 'text-rose-500' : latestMargin.foreignTxNet! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                         {latestMargin.foreignTxNet !== undefined ? latestMargin.foreignTxNet.toLocaleString() : '-'}
                      </span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400">外資台指增減</span>
                      <span className={`font-mono font-bold ${latestMargin.foreignTxNetChange! > 0 ? 'text-rose-500' : latestMargin.foreignTxNetChange! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                         {latestMargin.foreignTxNetChange !== undefined ? (latestMargin.foreignTxNetChange > 0 ? '+' : '') + latestMargin.foreignTxNetChange.toLocaleString() : '-'}
                      </span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400">散戶小台(淨)</span>
                      <span className={`font-mono font-bold ${latestMargin.retailMtxNet! > 0 ? 'text-rose-500' : latestMargin.retailMtxNet! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                         {latestMargin.retailMtxNet !== undefined ? latestMargin.retailMtxNet.toLocaleString() : '-'}
                      </span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400">散戶小台增減</span>
                      <span className={`font-mono font-bold ${latestMargin.retailMtxNetChange! > 0 ? 'text-rose-500' : latestMargin.retailMtxNetChange! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                         {latestMargin.retailMtxNetChange !== undefined ? (latestMargin.retailMtxNetChange > 0 ? '+' : '') + latestMargin.retailMtxNetChange.toLocaleString() : '-'}
                      </span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400">散戶微台(淨)</span>
                      <span className={`font-mono font-bold ${latestMargin.retailTmfNet! > 0 ? 'text-rose-500' : latestMargin.retailTmfNet! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                         {latestMargin.retailTmfNet !== undefined ? latestMargin.retailTmfNet.toLocaleString() : '-'}
                      </span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400">散戶微台增減</span>
                      <span className={`font-mono font-bold ${latestMargin.retailTmfNetChange! > 0 ? 'text-rose-500' : latestMargin.retailTmfNetChange! < 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                         {latestMargin.retailTmfNetChange !== undefined ? (latestMargin.retailTmfNetChange > 0 ? '+' : '') + latestMargin.retailTmfNetChange.toLocaleString() : '-'}
                      </span>
                  </div>
              </div>
          </div>
        )}
      </div>

      {/* ... (Main Chart Section) ... */}
      <div 
         ref={chartContainerRef}
         className="bg-[#0b0e14] rounded-3xl p-6 shadow-2xl border border-slate-800 flex flex-col select-none relative"
         onMouseDown={handleMouseDown}
         onMouseMove={handleMouseMove}
         onMouseUp={handleMouseUp}
         onMouseLeave={handleMouseUp}
         style={{ cursor: isDragging.current ? 'grabbing' : 'default' }}
      >
        <div className="flex flex-col gap-2 mb-2 select-none relative z-20">
           <div className="flex xl:flex-nowrap flex-wrap items-center gap-2 w-full">
               <h3 className="text-white font-bold flex items-center gap-1.5 text-base shrink-0"><BarChart3 className="text-blue-400" size={18} />K線圖</h3>
               {rangeStats && aggregatedData.length > 0 && (
                    <div className="flex items-center gap-2 px-2 py-0.5 bg-slate-900/80 rounded-lg border border-blue-500/30 bg-blue-500/10 backdrop-blur-md shadow-lg shadow-blue-900/20 shrink-0">
                        <div className="flex items-center gap-1 text-[10px] font-bold font-mono">
                            <span className="text-slate-400">區間天數:</span>
                            <span className="text-white">{rangeStats.period}</span>
                        </div>
                        <div className="w-px h-3 bg-slate-700"></div>
                        <div className="flex items-center gap-1 text-[10px] font-bold font-mono">
                            <span className="text-slate-400">高點:</span>
                            <span className="text-rose-500">{formatNum(rangeStats.high)}</span>
                        </div>
                        <div className="w-px h-3 bg-slate-700"></div>
                        <div className="flex items-center gap-1 text-[10px] font-bold font-mono">
                            <span className="text-slate-400">低點:</span>
                            <span className="text-emerald-500">{formatNum(rangeStats.low)}</span>
                        </div>
                    </div>
               )}
               
               <div className="flex bg-slate-800/50 p-0.5 rounded-lg shadow-inner border border-slate-700/50 shrink-0">
                   {[30, 60, 120, 240, 480].map(days => (
                       <button key={days} onClick={(e) => { e.stopPropagation(); setTimeRangePreset(days); }} className="px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all text-slate-400 hover:text-white hover:bg-slate-700">{days >= 480 ? '2Y' : days >= 240 ? '1Y' : days >= 120 ? '6M' : days >= 60 ? '3M' : '1M'}</button>
                   ))}
                   <button onClick={(e) => { e.stopPropagation(); openCustomRangeModal(); }} className="px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all text-slate-400 hover:text-white hover:bg-slate-700">自訂</button>
               </div>
               
               <div className="flex items-center bg-slate-900/80 p-0.5 rounded-lg border border-slate-700 shrink-0">
                  {(['DAY', 'WEEK', 'MONTH', 'ADJ_DAY', 'ADJ_WEEK', 'ADJ_MONTH'] as const).map(type => (
                      <button key={type} onClick={(e) => { e.stopPropagation(); setKLineType(type); }} className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md transition-all ${kLineType === type ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>{type === 'DAY' ? '日' : type === 'WEEK' ? '週' : type === 'MONTH' ? '月' : type === 'ADJ_DAY' ? '還原日' : type === 'ADJ_WEEK' ? '還原週' : '還原月'}</button>
                  ))}
               </div>
               
               <div className="flex items-center gap-1 shrink-0">
                   <button onClick={(e) => { e.stopPropagation(); generateAiReport(); }} className="px-1.5 py-0.5 rounded-lg text-[10px] font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:brightness-110 transition-all flex items-center gap-1 shadow-md">
                      <Sparkles size={10} /> AI預測
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); setShowChipModal(true); }} className="px-1.5 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/50 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1 shadow-sm">
                      <Microscope size={10} /> 籌碼診斷
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); setShowPatternModal(true); }} className="px-1.5 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/10 border border-amber-500/50 text-amber-500 hover:bg-amber-500 hover:text-white transition-all flex items-center gap-1 shadow-sm">
                      <BrainCircuit size={10} /> 型態診斷
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); setTempSettings(techSettings); setTempApiKey(apiKey); setShowSettings(true); }} className="px-1.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all flex items-center gap-1 border border-slate-700">
                      <Settings size={10} /> 設定
                   </button>
               </div>
               
               {(() => {
                    const itemToShow = currentHoverItem || (displayData.length > 0 ? displayData[displayData.length - 1] : null);
                    if (!itemToShow) return null;

                    let changeStr = '';
                    let isLimitUp = false;
                    let isLimitDown = false;
                    const refPrice = itemToShow.prevClose || itemToShow.open;
                    const isUp = itemToShow.close > refPrice;
                    const isDown = itemToShow.close < refPrice;

                    const isTW = viewMode === 'INDEX' || stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO');
                    if (itemToShow.prevClose && itemToShow.prevClose > 0) {
                        const change = itemToShow.close - itemToShow.prevClose;
                        const pct = (change / itemToShow.prevClose) * 100;
                        isLimitUp = isTW && pct > 9.5;
                        isLimitDown = isTW && pct < -9.5;
                        changeStr = `${change > 0 ? '+' : ''}${formatNum(change)} (${pct.toFixed(2)}%)`;
                    } else {
                        const change = itemToShow.close - itemToShow.open;
                        const pct = (change / itemToShow.open) * 100;
                        changeStr = `${change > 0 ? '+' : ''}${formatNum(change)} (${pct.toFixed(2)}%)`;
                    }

                    return (
                    <div className="flex flex-nowrap justify-end items-center gap-x-2 text-[10px] xl:text-[11px] 2xl:text-[12px] font-mono font-bold text-slate-200 px-2 py-1 rounded-lg border border-slate-700 bg-slate-800/80 ml-auto select-none shrink overflow-hidden max-w-full">
                        <span className={currentHoverItem ? "text-blue-400 whitespace-nowrap" : "text-amber-500 whitespace-nowrap"}>{itemToShow.date}</span>
                        <span className="whitespace-nowrap">開:<span className="text-white ml-0.5">{formatNum(itemToShow.open)}</span></span>
                        <span className="whitespace-nowrap">高:<span className="text-white ml-0.5">{formatNum(itemToShow.high)}</span></span>
                        <span className="whitespace-nowrap">低:<span className="text-white ml-0.5">{formatNum(itemToShow.low)}</span></span>
                        <span className="whitespace-nowrap flex items-center gap-1 border-l border-slate-600 pl-1.5 ml-0.5">
                            收:<span className={`ml-0.5 ${isLimitUp ? 'px-1 rounded bg-rose-500 text-white' : isLimitDown ? 'px-1 rounded bg-emerald-500 text-white' : isUp ? 'text-rose-500' : isDown ? 'text-emerald-500' : 'text-white'}`}>{formatNum(itemToShow.close)}</span>
                            <span className={`${isLimitUp ? 'text-rose-400' : isLimitDown ? 'text-emerald-400' : isUp ? 'text-rose-500' : isDown ? 'text-emerald-500' : 'text-slate-400'}`}>{changeStr}</span>
                        </span>
                        <span className="whitespace-nowrap border-l border-slate-600 pl-1.5 ml-0.5">量:<span className="text-white ml-0.5">{
                           viewMode === 'INDEX' ? (indexType === 'TX' ? `${itemToShow.volume.toLocaleString()}口` : `${(itemToShow.volume / 100000000).toFixed(2)}億`) :
                           (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) ? `${Math.floor(itemToShow.volume / 1000).toLocaleString()}張` :
                           `${Math.round(itemToShow.volume).toLocaleString()}股`
                       }</span></span>
                       {itemToShow.bias !== undefined && techSettings.bias?.visible && (
                           <span className="ml-0.5 flex items-center gap-0.5 border-l border-slate-600 pl-1.5 whitespace-nowrap"><span className="text-slate-400">{techSettings.bias.mode}{techSettings.bias.period}乖離:</span><span className={`${itemToShow.bias > 0 ? 'text-rose-500' : itemToShow.bias < 0 ? 'text-emerald-500' : 'text-white'}`}>{itemToShow.bias > 0 ? '+' : ''}{itemToShow.bias.toFixed(2)}%</span></span>
                       )}
                       {itemToShow.bias2 !== undefined && techSettings.bias2?.visible && (
                           <span className="ml-0.5 flex items-center gap-0.5 border-l border-slate-600 pl-1.5 whitespace-nowrap"><span className="text-slate-400">{techSettings.bias2.mode}{techSettings.bias2.period}乖離:</span><span className={`${itemToShow.bias2 > 0 ? 'text-rose-500' : itemToShow.bias2 < 0 ? 'text-emerald-500' : 'text-white'}`}>{itemToShow.bias2 > 0 ? '+' : ''}{itemToShow.bias2.toFixed(2)}%</span></span>
                       )}
                    </div>
                   );
               })()}
           </div>
        </div>

        {/* ... (Keep existing Chart components) ... */}
        <div className="mb-2 px-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {techSettings.mas.map((ma, index) => {
                    if (!ma.visible) return null;
                    const targetItem = currentHoverItem || displayData[displayData.length - 1];
                    const val = targetItem ? targetItem[`ma_${index}` as keyof KLineData] : null;
                    if (val == null) return null;
                    let trendIcon = null; let trendClass = 'text-slate-400';
                    const idx = processedData.findIndex(d => d.date === targetItem.date);
                    if (idx > 0) { const prevVal = processedData[idx - 1][`ma_${index}` as keyof KLineData] as number; if (prevVal != null) { const diff = (val as number) - prevVal; if (diff > 0.01) { trendIcon = '↑'; trendClass = 'text-rose-500'; } else if (diff < -0.01) { trendIcon = '↓'; trendClass = 'text-emerald-500'; } else { trendIcon = '-'; } } }
                    return (<div key={index} style={{ color: ma.color }} className="flex items-center gap-1 font-mono font-bold text-sm"><span>{ma.mode}{ma.period}:</span><span>{formatNum(val as number)}</span>{trendIcon && <span className={`${trendClass} text-xs`}>{trendIcon}</span>}</div>);
                })}
                {techSettings.bollinger && (() => {
                    const targetItem = currentHoverItem || displayData[displayData.length - 1];
                    if (!targetItem) return null;
                    const b = techSettings.bollinger;
                    return (
                        <>
                            {b.middle.visible && targetItem.bb_middle !== undefined && (
                                <div style={{ color: b.middle.color }} className="flex items-center gap-1 font-mono font-bold text-sm">
                                    <span>BB中:</span><span>{formatNum(targetItem.bb_middle)}</span>
                                </div>
                            )}
                            {b.upper1.visible && targetItem.bb_upper1 !== undefined && (
                                <div style={{ color: b.upper1.color }} className="flex items-center gap-1 font-mono font-bold text-sm">
                                    <span>BB上1:</span><span>{formatNum(targetItem.bb_upper1)}</span>
                                </div>
                            )}
                            {b.lower1.visible && targetItem.bb_lower1 !== undefined && (
                                <div style={{ color: b.lower1.color }} className="flex items-center gap-1 font-mono font-bold text-sm">
                                    <span>BB下1:</span><span>{formatNum(targetItem.bb_lower1)}</span>
                                </div>
                            )}
                            {b.upper2.visible && targetItem.bb_upper2 !== undefined && (
                                <div style={{ color: b.upper2.color }} className="flex items-center gap-1 font-mono font-bold text-sm">
                                    <span>BB上2:</span><span>{formatNum(targetItem.bb_upper2)}</span>
                                </div>
                            )}
                            {b.lower2.visible && targetItem.bb_lower2 !== undefined && (
                                <div style={{ color: b.lower2.color }} className="flex items-center gap-1 font-mono font-bold text-sm">
                                    <span>BB下2:</span><span>{formatNum(targetItem.bb_lower2)}</span>
                                </div>
                            )}
                        </>
                    );
                })()}
            </div>
        </div>

        <div style={{ height: mainChartHeight, transition: isResizing.current ? 'none' : 'height 0.2s' }} className="w-full relative">
           <ResponsiveContainer width="100%" height="100%">
              <ComposedChart 
                data={displayData} 
                margin={{ top: 25, right: 0, left: 0, bottom: 0 }} 
                syncId="marketChart"
                onMouseMove={(props: any) => { if (props && props.activePayload && props.activePayload.length > 0) { setCurrentHoverItem(props.activePayload[0].payload); } }}
                onMouseLeave={() => setCurrentHoverItem(null)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.GRID} vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: COLORS.TEXT, fontSize: 10 }} minTickGap={30} />
                <YAxis domain={yDomain} orientation="right" axisLine={false} tickLine={false} tick={{ fill: COLORS.TEXT, fontSize: 11 }} width={70} tickFormatter={(val) => Math.floor(val).toLocaleString()} />
                
                {rangeStats && aggregatedData.length > 0 && (
                  <ReferenceArea
                    x1={aggregatedData[Math.max(0, aggregatedData.length - rangeStats.period)].date}
                    x2={aggregatedData[aggregatedData.length - 1].date}
                    y1={rangeStats.low}
                    y2={rangeStats.high}
                    fill="#8b5cf6"
                    fillOpacity={0.15}
                    stroke="#7c3aed"
                    strokeOpacity={0.5}
                    strokeDasharray="5 5"
                    ifOverflow="visible"
                  />
                )}

                {analyzePatterns.map((pattern, pIdx) => (
                    pattern.visuals?.map((vis, vIdx) => (
                        <ReferenceLine 
                            key={`pat-${pIdx}-${vIdx}`}
                            segment={[{ x: vis.x1, y: vis.y1 }, { x: vis.x2, y: vis.y2 }]}
                            stroke={vis.stroke}
                            strokeDasharray="3 3"
                            strokeWidth={1.5}
                            label={vis.label ? { position: 'insideTopRight', value: vis.label, fill: vis.stroke, fontSize: 10 } : undefined}
                            ifOverflow="extendDomain"
                        />
                    ))
                ))}

                {techSettings.horizontalLines?.map((line) => (line.visible !== false) && (
                    <ReferenceLine
                        key={line.id}
                        y={line.value}
                        stroke={line.color}
                        strokeWidth={1.5}
                        strokeDasharray={line.style === 'dashed' ? '5 5' : line.style === 'dotted' ? '2 2' : undefined}
                        ifOverflow="extendDomain"
                    />
                ))}

                <Tooltip content={<CustomMainChartTooltip />} cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '3 3' }} />
                
                <Bar dataKey="candleRange" name="K線" shape={<CandleStickShape />} isAnimationActive={false} />

                {techSettings.mas.map((ma, i) => ma.visible && (
                   <Line key={`ma-line-${i}`} type="monotone" dataKey={`ma_${i}`} name={`${ma.mode}${ma.period}`} stroke={ma.color} dot={false} strokeWidth={1} isAnimationActive={false} />
                ))}
                {techSettings.bollinger?.middle.visible && <Line type="monotone" dataKey="bb_middle" stroke={techSettings.bollinger.middle.color} dot={false} strokeWidth={1} isAnimationActive={false} />}
                {techSettings.bollinger?.upper1.visible && <Line type="monotone" dataKey="bb_upper1" stroke={techSettings.bollinger.upper1.color} dot={false} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />}
                {techSettings.bollinger?.lower1.visible && <Line type="monotone" dataKey="bb_lower1" stroke={techSettings.bollinger.lower1.color} dot={false} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />}
                {techSettings.bollinger?.upper2.visible && <Line type="monotone" dataKey="bb_upper2" stroke={techSettings.bollinger.upper2.color} dot={false} strokeWidth={1} strokeDasharray="5 5" isAnimationActive={false} />}
                {techSettings.bollinger?.lower2.visible && <Line type="monotone" dataKey="bb_lower2" stroke={techSettings.bollinger.lower2.color} dot={false} strokeWidth={1} strokeDasharray="5 5" isAnimationActive={false} />}
                
                {techSettings.jr && <Scatter dataKey="jr_buy_signal" shape={<BuyArrowShape />} isAnimationActive={false} />}
                {techSettings.jr && <Scatter dataKey="jr_sell_signal" shape={<SellArrowShape />} isAnimationActive={false} />}
              </ComposedChart>
           </ResponsiveContainer>
        </div>

        <div onMouseDown={startResizing} className="h-4 w-full flex items-center justify-center cursor-row-resize hover:bg-slate-800/50 transition-colors my-1 group"><div className="w-16 h-1 bg-slate-700 rounded-full group-hover:bg-blue-500 transition-colors"></div></div>

        <div ref={scrollbarRef} className="h-6 w-full bg-slate-900 rounded-md relative mb-3 overflow-hidden select-none border border-slate-800">
            <div className="absolute top-0 bottom-0 bg-blue-600/30 border-l border-r border-blue-500 hover:bg-blue-600/40 cursor-grab active:cursor-grabbing group" style={{ left: `${(viewWindow.start / (aggregatedData.length || 1)) * 100}%`, width: `${((viewWindow.end - viewWindow.start) / (aggregatedData.length || 1)) * 100}%` }} onMouseDown={(e) => handleScrollbarMouseDown(e, 'move')}>
                <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors z-10" onMouseDown={(e) => handleScrollbarMouseDown(e, 'left')} />
                <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors z-10" onMouseDown={(e) => handleScrollbarMouseDown(e, 'right')} />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 pointer-events-none"><GripHorizontal size={12} className="text-white" /></div>
            </div>
        </div>

        <div className="flex flex-wrap gap-2 bg-slate-900/50 p-1 rounded-lg w-full border border-slate-800 mb-2">
           {(['VOL', 'KD', 'MACD', 'RSI', 'JR', 'INST', 'FOREIGN', 'TRUST', 'DEALER', 'MARGIN', 'SHORT', 'BBW', 'TX_FOREIGN', 'MTX_RETAIL', 'TMF_RETAIL'] as const).map(t => {
              const labels: Record<string, string> = { VOL: '成交量', KD: 'KD', MACD: 'MACD', RSI: 'RSI', JR: 'JR', INST: '法人合計', FOREIGN: '外資', TRUST: '投信', DEALER: '自營商', MARGIN: '融資', SHORT: '融券', BBW: 'BBW', TX_FOREIGN: '外資台指', MTX_RETAIL: '散戶小台', TMF_RETAIL: '散戶微台' };
              return (<button key={t} onClick={(e) => { e.stopPropagation(); setSubChartType(t); }} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${subChartType === t ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>{labels[t]}</button>);
           })}
        </div>

        <div className="h-[160px] w-full border-t border-slate-800 pt-2">
           <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={displayData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }} syncId="marketChart">
                 <CartesianGrid strokeDasharray="3 3" stroke={COLORS.GRID} vertical={false} />
                 <XAxis dataKey="date" hide />
                 <YAxis 
                    orientation="right" 
                    yAxisId={0}
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: COLORS.TEXT, fontSize: 10 }} 
                    width={70} 
                    tickFormatter={(val) => {
                       if (subChartType === 'VOL') {
                          if (viewMode === 'INDEX') {
                              return indexType === 'TX' ? (val >= 10000 ? (val / 10000).toFixed(1) + '萬口' : val + '口') : (val / 100000000).toFixed(0) + '億';
                          } else {
                              if (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) {
                                  return (val / 1000).toFixed(0) + '張';
                              } else {
                                  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                                  if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
                                  return Math.round(val).toString();
                              }
                          }
                       }
                       if (['FOREIGN', 'TRUST', 'DEALER', 'INST', 'MARGIN'].includes(subChartType)) {
                          return val.toFixed(0) + '億';
                       }
                       if (subChartType === 'SHORT') {
                           if (Math.abs(val) >= 1000) return (val/1000).toFixed(0) + 'k';
                           return val.toFixed(0);
                       }
                       if (subChartType === 'BBW') {
                           return val.toFixed(1) + '%';
                       }
                       if (['TX_FOREIGN', 'MTX_RETAIL', 'TMF_RETAIL'].includes(subChartType)) {
                           if (Math.abs(val) >= 1000) return (val/1000).toFixed(1) + 'k';
                           return val.toFixed(0);
                       }
                       return val.toFixed(0);
                    }} 
                 />
                 <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} 
                    itemStyle={{ fontSize: '11px', fontWeight: 'bold' }} 
                    labelStyle={{ display: 'none' }} 
                    formatter={(value: number, name: string, props: any) => {
                        if (name === '成交量') {
                            if (viewMode === 'INDEX') {
                                return indexType === 'TX' ? [value.toLocaleString() + ' 口', name] : [(value / 100000000).toFixed(2) + ' 億', name];
                            } else {
                                if (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) {
                                    return [Math.floor(value / 1000).toLocaleString() + ' 張', name];
                                } else {
                                    return [Math.round(value).toLocaleString() + ' 股', name];
                                }
                            }
                        }
                        if (['外資', '投信', '自營商', '法人合計', '融資餘額'].includes(name)) {
                            return [value.toFixed(2) + ' 億', name];
                        }
                        
                        if (subChartType === 'JR' && props && props.payload) {
                            let arrow = '';
                            if (name.startsWith('J')) {
                                arrow = props.payload.jr_j_dir === 'up' ? ' ↑' : (props.payload.jr_j_dir === 'down' ? ' ↓' : ' -');
                            } else if (name.startsWith('RSI')) {
                                arrow = props.payload.jr_rsi_dir === 'up' ? ' ↑' : (props.payload.jr_rsi_dir === 'down' ? ' ↓' : ' -');
                            } else if (name.startsWith('Trend')) {
                                arrow = props.payload.jr_trend_dir === 'up' ? ' ↑' : (props.payload.jr_trend_dir === 'down' ? ' ↓' : ' -');
                            }
                            return [value.toFixed(2) + arrow, name];
                        }

                        if (subChartType === 'BBW') {
                            return [value.toFixed(2) + '%', name];
                        }
                        
                        if (['外資台指(淨)', '外資台指增減', '散戶小台(淨)', '散戶小台增減', '散戶微台(淨)', '散戶微台增減'].includes(name)) {
                            return [value.toLocaleString() + ' 口', name];
                        }

                        if (typeof value === 'number') {
                            return [value.toFixed(2), name];
                        }
                        return [value, name];
                    }}
                 />
                 {subChartType === 'VOL' && (<Bar dataKey="volume" name="成交量" fill="#3b82f6" isAnimationActive={false}>{displayData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.close > entry.open ? COLORS.UP : COLORS.DOWN} />))}</Bar>)}
                 {subChartType === 'KD' && (<><Line type="monotone" dataKey="k" name="K" stroke="#fbce07" dot={false} strokeWidth={1.5} /><Line type="monotone" dataKey="d" name="D" stroke="#a855f7" dot={false} strokeWidth={1.5} /></>)}
                 {subChartType === 'MACD' && (<><Bar dataKey="osc" name="OSC" isAnimationActive={false}>{displayData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.osc >= 0 ? COLORS.UP : COLORS.DOWN} />))}</Bar><Line type="monotone" dataKey="dif" name="DIF" stroke="#fbce07" dot={false} strokeWidth={1.5} /><Line type="monotone" dataKey="dem" name="MACD" stroke="#3b82f6" dot={false} strokeWidth={1.5} /></>)}
                 {subChartType === 'RSI' && (<Line type="monotone" dataKey="rsi" name={`RSI (${techSettings.rsi.period})`} stroke="#10b981" dot={false} strokeWidth={1.5} />)}
                 {subChartType === 'JR' && (<><Line type="monotone" dataKey="jr_j" name={`J (${techSettings.jr?.jPeriod || 9})`} stroke="#fbce07" dot={false} strokeWidth={1.5} /><Line type="monotone" dataKey="jr_rsi" name={`RSI (${techSettings.jr?.rsiPeriod || 14})`} stroke="#10b981" dot={false} strokeWidth={1.5} /><Line type="monotone" dataKey="jr_trend" name={`Trend (${techSettings.jr?.trendPeriod || 9})`} stroke="#a855f7" dot={false} strokeWidth={2} strokeDasharray="3 3" /></>)}
                 {subChartType === 'INST' && (<Line type="monotone" dataKey="institutionalTotal" name="法人合計" stroke="#fff" dot={false} strokeWidth={2} />)}
                 {subChartType === 'FOREIGN' && (<Line type="monotone" dataKey="foreign" name="外資" stroke={COLORS.FOREIGN} dot={false} strokeWidth={2} />)}
                 {subChartType === 'TRUST' && (<Line type="monotone" dataKey="trust" name="投信" stroke={COLORS.TRUST} dot={false} strokeWidth={2} />)}
                 {subChartType === 'DEALER' && (<Line type="monotone" dataKey="dealer" name="自營商" stroke={COLORS.DEALER} dot={false} strokeWidth={2} />)}
                 {subChartType === 'MARGIN' && (<Line type="monotone" dataKey="marginBalance" name="融資餘額" stroke={COLORS.MARGIN} dot={false} strokeWidth={2} />)}
                 {subChartType === 'SHORT' && (<Line type="monotone" dataKey="shortBalance" name="融券餘額" stroke={COLORS.SHORT} dot={false} strokeWidth={2} />)}
                 {subChartType === 'BBW' && (<Line type="monotone" dataKey="bbw" name="BBW" stroke={techSettings.bbw?.color || '#3b82f6'} dot={false} strokeWidth={2} />)}
                 {subChartType === 'TX_FOREIGN' && (<><Bar dataKey="foreignTxNetChange" name="外資台指增減" isAnimationActive={false}>{displayData.map((entry, index) => (<Cell key={`cell-${index}`} fill={(entry.foreignTxNetChange || 0) >= 0 ? COLORS.UP : COLORS.DOWN} />))}</Bar><Line type="monotone" dataKey="foreignTxNet" name="外資台指(淨)" stroke="#3b82f6" dot={false} strokeWidth={1.5} /></>)}
                 {subChartType === 'MTX_RETAIL' && (<><Bar dataKey="retailMtxNetChange" name="散戶小台增減" isAnimationActive={false}>{displayData.map((entry, index) => (<Cell key={`cell-${index}`} fill={(entry.retailMtxNetChange || 0) >= 0 ? COLORS.UP : COLORS.DOWN} />))}</Bar><Line type="monotone" dataKey="retailMtxNet" name="散戶小台(淨)" stroke="#f59e0b" dot={false} strokeWidth={1.5} /></>)}
                 {subChartType === 'TMF_RETAIL' && (<><Bar dataKey="retailTmfNetChange" name="散戶微台增減" isAnimationActive={false}>{displayData.map((entry, index) => (<Cell key={`cell-${index}`} fill={(entry.retailTmfNetChange || 0) >= 0 ? COLORS.UP : COLORS.DOWN} />))}</Bar><Line type="monotone" dataKey="retailTmfNet" name="散戶微台(淨)" stroke="#ec4899" dot={false} strokeWidth={1.5} /></>)}
                 {['MACD', 'INST', 'FOREIGN', 'TRUST', 'DEALER', 'TX_FOREIGN', 'MTX_RETAIL', 'TMF_RETAIL'].includes(subChartType) && (<ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />)}
              </ComposedChart>
           </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm overflow-hidden">
         <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 gap-4">
            <div className="flex flex-wrap items-center gap-4">
                <h4 className="font-bold text-slate-800 flex items-center gap-2 whitespace-nowrap">
                    <Maximize2 size={18} className="text-purple-600" /> 詳細市場數據紀錄 (單位：{viewMode === 'INDEX' ? '點 / 億' : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? '元 / 張' : '元 / 股')})
                </h4>
                <div className="flex items-center gap-2">
                    <button onClick={() => { resetForm(); setShowEntryForm(true); }} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-100 transition-all whitespace-nowrap">
                        <Plus size={12}/> 手動新增
                    </button>
                    <button 
                        onClick={() => setShowPerformanceModal(true)} 
                        className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-indigo-100 transition-all border border-indigo-100 shadow-sm"
                        title="查看加權報酬指數的每月與年度績效"
                    >
                        <Table size={14}/> 報酬指數績效
                    </button>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200 overflow-x-auto max-w-full">
                     <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-100 shadow-sm">
                        <input type="date" value={inputStartDate} onChange={e => setInputStartDate(e.target.value)} className="bg-transparent outline-none w-20 text-slate-700" />
                        <span>~</span>
                        <input type="date" value={inputEndDate} onChange={e => setInputEndDate(e.target.value)} className="bg-transparent outline-none w-20 text-slate-700" />
                     </div>
                     
                     <button onClick={handleApplyFilter} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold shadow-sm hover:bg-blue-700 transition-all whitespace-nowrap">
                        確認讀取
                     </button>
                     <div className="w-px h-4 bg-slate-300 mx-1 hidden sm:block"></div>
                     <button onClick={handleResetTwoYears} className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded text-[10px] font-bold hover:bg-slate-100 hover:text-slate-800 transition-all whitespace-nowrap">
                        近 2 年
                     </button>
                     <button onClick={handleShowAll} className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded text-[10px] font-bold hover:bg-slate-100 hover:text-slate-800 transition-all whitespace-nowrap">
                        全部資料
                     </button>
                </div>
                
                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded whitespace-nowrap">
                    顯示: {tableData.length} / {data.length} 筆
                </span>
            </div>

            <div className="flex items-center gap-2">
                <button onClick={handleExportCSV} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-all"><Download size={14}/> 匯出CSV</button>
                <input type="file" accept=".csv" ref={csvInputRef} onChange={handleImportCSV} className="hidden" />
                <button onClick={() => csvInputRef.current?.click()} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-all"><Upload size={14}/> 匯入CSV</button>
            </div>
         </div>
         
         <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
               <div className="max-h-[400px] overflow-y-auto custom-scrollbar relative">
                  <table className="w-full text-xs text-left whitespace-nowrap">
                     <thead className="bg-slate-50 text-slate-400 uppercase font-bold sticky top-0 z-10 shadow-sm text-center">
                        <tr>
                           <th className="py-3 px-4 bg-slate-50 text-left min-w-[90px]">日期</th>
                           <th className="py-3 px-3 bg-slate-50">開盤</th><th className="py-3 px-3 bg-slate-50">最高</th><th className="py-3 px-3 bg-slate-50">最低</th><th className="py-3 px-3 bg-slate-50">收盤</th><th className="py-3 px-3 bg-slate-50">成交量{viewMode === 'INDEX' ? (indexType === 'TX' ? '(口)' : '(億)') : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO')) ? '(張)' : '(股)'}</th><th className="py-3 px-3 bg-slate-50 text-blue-600">法人合計</th><th className="py-3 px-3 bg-slate-50">外資</th><th className="py-3 px-3 bg-slate-50">投信</th><th className="py-3 px-3 bg-slate-50">自營商</th><th className="py-3 px-3 bg-slate-50">融資餘額</th><th className="py-3 px-3 bg-slate-50">融資增減</th><th className="py-3 px-3 bg-slate-50">融券餘額</th><th className="py-3 px-3 bg-slate-50">融券增減</th>
                           {viewMode === 'INDEX' && (
                               <>
                                   <th className="py-3 px-3 bg-slate-50 text-blue-600">外資台指(淨)</th><th className="py-3 px-3 bg-slate-50 text-blue-600">外資台指增減</th>
                                   <th className="py-3 px-3 bg-slate-50 text-orange-500">散戶小台(淨)</th><th className="py-3 px-3 bg-slate-50 text-orange-500">散戶小台增減</th>
                                   <th className="py-3 px-3 bg-slate-50 text-pink-500">散戶微台(淨)</th><th className="py-3 px-3 bg-slate-50 text-pink-500">散戶微台增減</th>
                               </>
                           )}
                           <th className="py-3 px-3 bg-slate-50 text-indigo-600 min-w-[120px]">
                                <div className="flex items-center justify-center gap-1">
                                    報酬指數
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleUpdateTaiexTR(); }}
                                        disabled={isUpdatingTR}
                                        className="p-1 rounded-full hover:bg-indigo-100 text-indigo-500 transition-colors disabled:opacity-50"
                                        title="從 TWSE OpenAPI 更新當月報酬指數"
                                    >
                                        {isUpdatingTR ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
                                    </button>
                                </div>
                           </th>
                           <th className="py-3 px-3 bg-slate-50 text-center">
                                <div className="flex items-center justify-center gap-1">
                                    操作
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); fetchLatestMarket(); }}
                                        disabled={isLoading}
                                        className="p-1 rounded-full hover:bg-indigo-100 text-indigo-500 transition-colors disabled:opacity-50"
                                        title="從 Finmind 更新近3個月加權指數"
                                    >
                                        {isLoading ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
                                    </button>
                                </div>
                           </th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 text-center">
                        {tableData.map((d, i) => {
                           const totalInst = (d.foreign || 0) + (d.trust || 0) + (d.dealer || 0);
                           
                           // 30-Day Lock Logic
                           const recordDateObj = new Date(d.date);
                           const limitDate = new Date();
                           limitDate.setDate(limitDate.getDate() - 30);
                           limitDate.setHours(0, 0, 0, 0); 
                           recordDateObj.setHours(0, 0, 0, 0);
                           const isLocked = recordDateObj < limitDate;

                           return (
                             <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="py-3 px-4 font-medium text-slate-500 text-left">{d.date}</td>
                                <td className="py-3 px-3 font-mono text-slate-600">{formatNum(d.open)}</td><td className="py-3 px-3 font-mono text-rose-500">{formatNum(d.high)}</td><td className="py-3 px-3 font-mono text-emerald-500">{formatNum(d.low)}</td><td className="py-3 px-3 font-bold text-slate-800 font-mono">{formatNum(d.close)}</td><td className="py-3 px-3 font-mono text-slate-600">{d.volume ? (viewMode === 'INDEX' ? formatNum(indexType === 'TX' ? d.volume : d.volume / 100000000) : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? Math.floor(d.volume / 1000) : Math.round(d.volume)).toLocaleString()) : '0'}</td>
                                <td className={`py-3 px-3 font-bold font-mono ${totalInst >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{totalInst > 0 ? '+' : ''}{formatNum(totalInst)}</td>
                                <td className={`py-3 px-3 font-mono ${d.foreign! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{formatNum(d.foreign)}</td>
                                <td className={`py-3 px-3 font-mono ${d.trust! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{formatNum(d.trust)}</td>
                                <td className={`py-3 px-3 font-mono ${d.dealer! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{formatNum(d.dealer)}</td>
                                <td className="py-3 px-3 text-slate-600 font-mono">{formatNum(d.marginBalance)}</td><td className={`py-3 px-3 font-bold font-mono ${d.marginChange! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{d.marginChange! > 0 ? '+' : ''}{formatNum(d.marginChange)}</td>
                                <td className="py-3 px-3 text-slate-600 font-mono">{formatNum(d.shortBalance)}</td><td className={`py-3 px-3 font-bold font-mono ${d.shortChange! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{d.shortChange! > 0 ? '+' : ''}{formatNum(d.shortChange)}</td>
                                {viewMode === 'INDEX' && (
                                    <>
                                        <td className={`py-3 px-3 font-mono ${d.foreignTxNet! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{d.foreignTxNet !== undefined ? d.foreignTxNet.toLocaleString() : '-'}</td>
                                        <td className={`py-3 px-3 font-bold font-mono ${d.foreignTxNetChange! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{d.foreignTxNetChange! > 0 ? '+' : ''}{d.foreignTxNetChange !== undefined ? d.foreignTxNetChange.toLocaleString() : '-'}</td>
                                        <td className={`py-3 px-3 font-mono ${d.retailMtxNet! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{d.retailMtxNet !== undefined ? d.retailMtxNet.toLocaleString() : '-'}</td>
                                        <td className={`py-3 px-3 font-bold font-mono ${d.retailMtxNetChange! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{d.retailMtxNetChange! > 0 ? '+' : ''}{d.retailMtxNetChange !== undefined ? d.retailMtxNetChange.toLocaleString() : '-'}</td>
                                        <td className={`py-3 px-3 font-mono ${d.retailTmfNet! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{d.retailTmfNet !== undefined ? d.retailTmfNet.toLocaleString() : '-'}</td>
                                        <td className={`py-3 px-3 font-bold font-mono ${d.retailTmfNetChange! >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{d.retailTmfNetChange! > 0 ? '+' : ''}{d.retailTmfNetChange !== undefined ? d.retailTmfNetChange.toLocaleString() : '-'}</td>
                                    </>
                                )}
                                <td className="py-3 px-3 font-mono text-indigo-600 font-bold">{formatNum(d.taiexTotalReturn)}</td>
                                <td className="py-3 px-3 text-center">
                                    {isLocked ? (
                                        <div className="flex justify-center text-slate-300" title="超過30天無法修改">
                                            <Lock size={14} />
                                        </div>
                                    ) : (
                                        <button onClick={() => handleEditItem(d)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Edit2 size={14} /></button>
                                    )}
                                </td>
                             </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      </div>

      {showPerformanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 border border-slate-200">
              <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-indigo-100 flex justify-between items-center">
                 <h3 className="font-bold text-indigo-800 flex items-center gap-2">
                    <Table size={20} className="text-indigo-600"/> 加權報酬指數 (Taiex Total Return) 績效表
                 </h3>
                 <button onClick={() => setShowPerformanceModal(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
              </div>
              <div className="p-6 max-h-[80vh] overflow-y-auto custom-scrollbar bg-slate-50/30">
                 {performanceAnalysis.length === 0 ? (
                     <div className="text-center py-12 text-slate-400">
                         <Search size={48} className="mx-auto mb-2 opacity-20"/>
                         <p>無相關數據可供分析，請確認已輸入或更新報酬指數資料。</p>
                     </div>
                 ) : (
                     <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                         <div className="overflow-x-auto">
                             <table className="w-full text-sm text-center">
                                 <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                                     <tr>
                                         <th className="py-3 px-2 text-left pl-4 w-20">年份</th>
                                         {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                                             <th key={m} className="py-3 px-2 w-16">{m}月</th>
                                         ))}
                                         <th className="py-3 px-2 text-indigo-700 bg-indigo-50 w-20 border-l border-slate-200">年度YTD</th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-100">
                                     {performanceAnalysis.map((row: any) => (
                                         <tr key={row.year} className="hover:bg-slate-50 transition-colors">
                                             <td className="py-3 px-2 font-bold text-slate-700 text-left pl-4 bg-slate-50/50">{row.year}</td>
                                             {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                                                 const val = row[m.toString().padStart(2, '0')];
                                                 return (
                                                     <td key={m} className="py-3 px-2">
                                                         {val !== null ? (
                                                             <span className={`font-mono font-bold ${val >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                                 {val > 0 ? '+' : ''}{val.toFixed(3)}%
                                                             </span>
                                                         ) : (
                                                             <span className="text-slate-200">-</span>
                                                         )}
                                                     </td>
                                                 );
                                             })}
                                             <td className="py-3 px-2 bg-indigo-50/30 border-l border-slate-100">
                                                 {row.YTD !== null ? (
                                                     <span className={`font-mono font-black ${row.YTD >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                         {row.YTD > 0 ? '+' : ''}{row.YTD.toFixed(3)}%
                                                     </span>
                                                 ) : (
                                                     <span className="text-slate-200">-</span>
                                                 )}
                                             </td>
                                         </tr>
                                     ))}
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 )}
                 <div className="mt-4 text-[10px] text-slate-400 px-2 flex flex-col gap-1">
                     <p>※ 績效計算方式：(期末報酬指數 - 期初報酬指數) / 期初報酬指數 * 100%。</p>
                     <p>※ 月績效採當月最後交易日與上月最後交易日比較；年績效(YTD)採當年最後交易日與去年最後交易日比較。</p>
                 </div>
              </div>
              <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                  <button onClick={() => setShowPerformanceModal(false)} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95">關閉</button>
              </div>
           </div>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 z-50 animate-in fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 border border-slate-200">
              <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                 <div className="flex items-center gap-4">
                    <h3 className="font-bold text-indigo-800 flex items-center gap-2"><Bot size={20} className="text-purple-600"/> AI 智能市場趨勢預測</h3>
                    <div className="flex items-center gap-2 bg-white/50 p-1 rounded-lg border border-indigo-100">
                        <select 
                            value={aiModel} 
                            onChange={(e) => setAiModel(e.target.value)} 
                            className="bg-transparent text-xs font-bold text-indigo-600 outline-none cursor-pointer hover:bg-white/80 px-2 py-1 rounded"
                        >
                            <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (建議)</option>
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (高額度)</option>
                            <option value="gemini-3-flash-preview">Gemini 3 Flash (預覽)</option>
                            <option value="gemini-3-pro-preview">Gemini 3 Pro (高階/易達上限)</option>
                        </select>
                        <button 
                            onClick={generateAiReport} 
                            disabled={aiLoading}
                            className="p-1.5 text-indigo-500 hover:text-white hover:bg-indigo-500 rounded transition-colors disabled:opacity-50"
                            title="使用所選模型重新分析"
                        >
                            <RefreshCw size={14} className={aiLoading ? 'animate-spin' : ''}/>
                        </button>
                    </div>
                 </div>
                 <button onClick={() => setShowAiModal(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
              </div>
              <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar bg-slate-50/30">
                 {aiLoading ? (
                     <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
                         <div className="relative">
                             <div className="absolute inset-0 bg-purple-200 rounded-full animate-ping opacity-75"></div>
                             <div className="relative bg-white p-3 rounded-full shadow-sm"><Sparkles size={24} className="text-purple-500 animate-pulse"/></div>
                         </div>
                         <p className="font-bold text-sm">正在使用 {aiModel.replace('-preview', '').replace('-exp', '')} 分析市場數據...</p>
                         <p className="text-xs text-slate-400">AI 分析可能需要幾秒鐘的時間</p>
                     </div>
                 ) : (
                     <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                         <div className="whitespace-pre-wrap">{aiReport}</div>
                         <div className="mt-6 pt-4 border-t border-slate-200 text-[10px] text-slate-400 text-center">
                             免責聲明：AI 分析僅供參考，不代表投資建議。投資人應獨立判斷審慎評估。
                         </div>
                     </div>
                 )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                  <button onClick={() => setShowAiModal(false)} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 shadow-md transition-all active:scale-95">關閉報告</button>
              </div>
           </div>
        </div>
      )}

      {showChipModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 z-50 animate-in fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 border border-slate-200">
              <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-indigo-100 flex justify-between items-center">
                 <h3 className="font-bold text-indigo-800 flex items-center gap-2"><Microscope size={20} className="text-indigo-600"/> 籌碼智能診斷</h3>
                 <button onClick={() => setShowChipModal(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
              </div>
              <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar bg-slate-50/50">
                 <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4 flex flex-col items-center">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">籌碼多空評分</div>
                    <div className="relative flex items-center justify-center w-32 h-16 overflow-hidden mb-2">
                        <div className="absolute top-0 w-32 h-32 rounded-full border-[12px] border-slate-100 border-l-rose-500 border-t-slate-200" style={{ transform: `rotate(${analyzeChips.score * 1.8 - 45}deg)`, transition: 'transform 1s ease-out' }}></div>
                        <div className="text-3xl font-black text-slate-800 mt-8">{analyzeChips.score}</div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${analyzeChips.sentiment.includes('Bullish') ? 'bg-rose-100 text-rose-600' : analyzeChips.sentiment.includes('Bearish') ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {analyzeChips.sentiment === 'Strongly Bullish' ? '強力看多' : analyzeChips.sentiment === 'Bullish' ? '偏多看待' : analyzeChips.sentiment === 'Neutral' ? '中性觀望' : analyzeChips.sentiment === 'Bearish' ? '偏空看待' : '強力看空'}
                    </div>
                    <p className="text-xs text-slate-500 mt-3 text-center leading-relaxed px-4">{analyzeChips.summary}</p>
                 </div>

                 <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 px-1"><Zap size={14}/> 關鍵籌碼洞察</h4>
                    {analyzeChips.signals.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                            <span className="text-xs">目前無顯著籌碼特徵</span>
                        </div>
                    ) : (
                        analyzeChips.signals.map((signal, idx) => (
                            <div key={idx} className={`bg-white p-3 rounded-xl border shadow-sm flex gap-3 ${signal.type === 'BULLISH' ? 'border-l-4 border-l-rose-500' : signal.type === 'BEARISH' ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-slate-400'}`}>
                                <div className={`mt-0.5 p-1.5 rounded-full h-fit ${signal.type === 'BULLISH' ? 'bg-rose-100 text-rose-600' : signal.type === 'BEARISH' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                    {signal.type === 'BULLISH' ? <TrendingUp size={16}/> : signal.type === 'BEARISH' ? <TrendingDown size={16}/> : <Activity size={16}/>}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h5 className="font-bold text-slate-800 text-sm">{signal.title}</h5>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${signal.scoreImpact > 0 ? 'bg-rose-50 text-rose-600' : signal.scoreImpact < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {signal.scoreImpact > 0 ? `+${signal.scoreImpact}` : signal.scoreImpact}分
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">{signal.description}</p>
                                </div>
                            </div>
                        ))
                    )}
                 </div>
              </div>
              <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                  <button onClick={() => setShowChipModal(false)} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95">關閉診斷</button>
              </div>
           </div>
        </div>
      )}

      {showPatternModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 z-50 animate-in fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 border border-slate-200">
              <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-white border-b border-amber-100 flex justify-between items-center">
                 <h3 className="font-bold text-amber-800 flex items-center gap-2"><BrainCircuit size={20} className="text-amber-600"/> 技術型態智能診斷</h3>
                 <button onClick={() => setShowPatternModal(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
              </div>
              <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar bg-slate-50/50">
                 <div className="mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 mb-2"><Settings size={16} className="text-slate-400"/><span className="text-xs font-bold text-slate-700">分析參數設定</span></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">分析區間 (天)</label>
                            <input 
                                type="number" 
                                value={analysisPeriod} 
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    const current = techSettings.rangeAnalysis || { period: 60, tolerance: 0.03 };
                                    onUpdateTechSettings({
                                        ...techSettings,
                                        rangeAnalysis: { 
                                            ...current,
                                            period: isNaN(val) ? 60 : val
                                        }
                                    });
                                }} 
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">容許誤差 (%)</label>
                            <input 
                                type="number" 
                                step="0.1" 
                                value={parseFloat((analysisTolerance * 100).toFixed(1))} 
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    const current = techSettings.rangeAnalysis || { period: 60, tolerance: 0.03 };
                                    onUpdateTechSettings({
                                        ...techSettings,
                                        rangeAnalysis: { 
                                            ...current,
                                            tolerance: isNaN(val) ? 0.03 : (val / 100)
                                        }
                                    });
                                }} 
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                            />
                        </div>
                    </div>
                 </div>
                 <div className="space-y-4">
                    {analyzePatterns.length === 0 ? (<div className="text-center py-8 text-slate-400"><Search size={48} className="mx-auto mb-2 opacity-20"/><p>目前區間內未偵測到顯著的標準型態</p></div>) : (
                       analyzePatterns.map((pattern, idx) => (
                          <div key={idx} className={`bg-white rounded-xl p-4 border shadow-sm transition-all hover:shadow-md ${pattern.type === 'BULLISH' ? 'border-l-4 border-l-rose-500 border-t-slate-100 border-r-slate-100 border-b-slate-100' : pattern.type === 'BEARISH' ? 'border-l-4 border-l-emerald-500 border-t-slate-100 border-r-slate-100 border-b-slate-100' : 'border-l-4 border-l-slate-400 border-slate-100'}`}>
                             <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2"><h4 className="font-bold text-slate-800 text-lg">{pattern.name}</h4><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${pattern.type === 'BULLISH' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{pattern.type === 'BULLISH' ? '多方訊號' : '空方訊號'}</span></div>
                                <span className={`text-xs font-bold px-2 py-1 rounded ${pattern.confidence === 'High' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>信心度: {pattern.confidence}</span>
                             </div>
                             <p className="text-sm text-slate-600 mb-2 font-medium">{pattern.description}</p>
                             <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-500 font-mono leading-relaxed border border-slate-100">{pattern.details}</div>
                          </div>
                       ))
                    )}
                 </div>
              </div>
              <div className="p-4 border-t border-slate-100 bg-white flex justify-end"><button onClick={() => setShowPatternModal(false)} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 shadow-md transition-all active:scale-95">關閉診斷</button></div>
           </div>
        </div>
      )}

      {showCustomRangeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold text-slate-800">自訂顯示區間</h3>
                 <button onClick={() => setShowCustomRangeModal(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
              </div>
              <div className="p-6 space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">起始日期</label>
                      <input type="date" value={customChartStart} onChange={e => setCustomChartStart(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">結束日期</label>
                      <input type="date" value={customChartEnd} onChange={e => setCustomChartEnd(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                 <button onClick={() => setShowCustomRangeModal(false)} className="px-4 py-2 text-slate-600 font-bold rounded-lg hover:bg-slate-200 transition-all">取消</button>
                 <button onClick={handleApplyCustomChartRange} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition-all active:scale-95">套用</button>
              </div>
           </div>
        </div>
      )}

      {showSettings && (
        <TechSettingsModal
            techSettings={techSettings}
            onUpdateTechSettings={(newSettings) => {
                onUpdateTechSettings(newSettings);
                setTempSettings(newSettings);
                setApiKey(localStorage.getItem('smartvest_gemini_api_key') || '');
            }}
            onClose={() => setShowSettings(false)}
        />
    )}

      {showEntryForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEntry} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center"><h3 className="font-bold text-slate-800 flex items-center gap-2">{isEditing ? <Edit2 size={18} className="text-blue-600"/> : <Plus size={18} className="text-blue-600"/>} {isEditing ? '修改市場數據' : '新增每日數據'}</h3><button type="button" onClick={() => { setShowEntryForm(false); resetForm(); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20}/></button></div>
             <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="col-span-full md:col-span-1 space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">日期</label><input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required disabled={isEditing} /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">開盤</label><input type="number" step="0.01" value={entryOpen} onChange={e => setEntryOpen(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">最高</label><input type="number" step="0.01" value={entryHigh} onChange={e => setEntryHigh(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">最低</label><input type="number" step="0.01" value={entryLow} onChange={e => setEntryLow(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">收盤</label><input type="number" step="0.01" value={entryClose} onChange={e => setEntryClose(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">成交量{viewMode === 'INDEX' ? (indexType === 'TX' ? '(口)' : '(億)') : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? '(張)' : '(股)')}</label><input type="number" step="0.01" value={entryVolume} onChange={e => setEntryVolume(e.target.value)} className="w-full px-4 py-2 border rounded-xl" required /></div>
                
                {/* New: 加權報酬指數 Input */}
                <div className="col-span-full h-px bg-slate-100 my-2"></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-indigo-500 uppercase">加權報酬指數</label><input type="number" step="0.01" value={entryTaiexTR} onChange={e => setEntryTaiexTR(e.target.value)} className="w-full px-4 py-2 border rounded-xl border-indigo-200 bg-indigo-50/20 focus:border-indigo-500" placeholder="選填 (SYS: IR0001)" /></div>

                <div className="col-span-full h-px bg-slate-100 my-2"></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-blue-500 uppercase">外資台指(淨)</label><input type="number" step="1" value={entryTxForeign} onChange={e => setEntryTxForeign(e.target.value)} className="w-full px-4 py-2 border rounded-xl" placeholder="留空" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-orange-500 uppercase">散戶小台(淨)</label><input type="number" step="1" value={entryMtxRetail} onChange={e => setEntryMtxRetail(e.target.value)} className="w-full px-4 py-2 border rounded-xl" placeholder="留空" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-pink-500 uppercase">散戶微台(淨)</label><input type="number" step="1" value={entryTmfRetail} onChange={e => setEntryTmfRetail(e.target.value)} className="w-full px-4 py-2 border rounded-xl" placeholder="留空" /></div>

                <div className="col-span-full h-px bg-slate-100 my-2"></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-blue-500 uppercase">外資{viewMode === 'INDEX' ? '(億)' : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? '(張)' : '(股)')}</label><input type="number" step="0.01" value={entryForeign} onChange={e => setEntryForeign(e.target.value)} className="w-full px-4 py-2 border rounded-xl" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-amber-500 uppercase">投信{viewMode === 'INDEX' ? '(億)' : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? '(張)' : '(股)')}</label><input type="number" step="0.01" value={entryTrust} onChange={e => setEntryTrust(e.target.value)} className="w-full px-4 py-2 border rounded-xl" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-purple-500 uppercase">自營{viewMode === 'INDEX' ? '(億)' : (stockInfo?.symbol?.endsWith('.TW') || stockInfo?.symbol?.endsWith('.TWO') ? '(張)' : '(股)')}</label><input type="number" step="0.01" value={entryDealer} onChange={e => setEntryDealer(e.target.value)} className="w-full px-4 py-2 border rounded-xl" /></div>
                <div className="col-span-full h-px bg-slate-100 my-2"></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-rose-500 uppercase">融資餘額{viewMode === 'INDEX' ? '(億)' : '(張)'}</label><input type="number" step="0.01" value={entryMarginBal} onChange={e => setEntryMarginBal(e.target.value)} className="w-full px-4 py-2 border rounded-xl" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-rose-500 uppercase">融資增減{viewMode === 'INDEX' ? '(億)' : '(張)'}</label><input type="number" step="0.01" value={entryMarginChange} onChange={e => setEntryMarginChange(e.target.value)} className="w-full px-4 py-2 border rounded-xl" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-emerald-500 uppercase">融券餘額(張)</label><input type="number" step="0.01" value={entryShortBal} onChange={e => setEntryShortBal(e.target.value)} className="w-full px-4 py-2 border rounded-xl" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-emerald-500 uppercase">融券增減(張)</label><input type="number" step="0.01" value={entryShortChange} onChange={e => setEntryShortChange(e.target.value)} className="w-full px-4 py-2 border rounded-xl" /></div>
             </div>
             <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
                <button type="button" onClick={() => { setShowEntryForm(false); resetForm(); }} className="px-6 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-colors text-sm">取消</button>
                <button type="submit" className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg transition-all active:scale-95 flex items-center gap-2"><Check size={18}/> {isEditing ? '更新數據' : '儲存數據'}</button>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default React.memo(MarketMonitor);
