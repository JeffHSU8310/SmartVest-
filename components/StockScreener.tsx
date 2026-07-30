import CustomTechRulesEditor from "./CustomTechRulesEditor";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Filter,
  RefreshCcw,
  Download,
  Play,
  AlertCircle,
  Database,
  ChevronDown,
  ChevronRight,
  Activity,
  Loader2,
  Save,
  Trash2,
  XCircle,
  Eraser,
} from "lucide-react";
import { fetchYahooHistoryUniversal, calculateSMA, fetchTwseOpenDataDirect } from "../utils";

interface StockPoolItem {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume: number; // in lots (張)
  pe: number;
  eps: number;
  instForeign: number;
  instTrust: number;
  instDealer: number;
  instNetBuy: number;
  marginBalance?: number; 
  marginDiff?: number;    
  shortBalance?: number;  
  shortDiff?: number;     
  pb: number;
  dividendYield: number;
  market: "TWSE" | "TPEx";
  assetType: "Stock" | "ETF" | "ETN" | "Warrant";
  ma20?: number | null;
  ma60?: number | null;
  status?: "pending" | "scanning" | "passed" | "failed";
  isLimit?: boolean;
}

export type CustomTechRuleType =
  | "MA_ARRANGEMENT"
  | "PRICE_MA_BIAS"
  | "CONSECUTIVE_PRICE_MA"
  | "MA_VS_DEDUCT"
  | "MA_TREND";

export interface CustomTechRule {
  id: string;
  type: CustomTechRuleType;
  params: any;
}

interface ScreenerConfig {
  minPrice: string;
  maxPrice: string;
  maxPe: string;
  minYield: string;
  minEps: string;
  minInstNetBuy: string;
  instForeignDir: "buy" | "sell" | "";
  instForeignVol: string;
  instTrustDir: "buy" | "sell" | "";
  instTrustVol: string;
  instDealerDir: "buy" | "sell" | "";
  instDealerVol: string;
  marginDir: "buy" | "sell" | "";
  marginVol: string;
  shortDir: "buy" | "sell" | "";
  shortVol: string;
  minVolume: string; // in lots (1張 = 1000股)
  priceAction: "none" | "limit_up" | "limit_down" | "strong" | "weak";
  consecutivePriceAction: "none" | "limit_up" | "limit_down";
  consecutiveDays: string;
  markets: Array<"TWSE" | "TPEx">;
  assetTypes: Array<"Stock" | "ETF" | "ETN" | "Warrant">;
  techConditions: Array<
    "price_above_20ma" | "price_above_60ma" | "golden_cross_20_60"
  >;
  customTechRules: CustomTechRule[];
}

const DEFAULT_CONFIG: ScreenerConfig = {
  minPrice: "",
  maxPrice: "",
  maxPe: "",
  minYield: "",
  minEps: "",
  minInstNetBuy: "",
  instForeignDir: "",
  instForeignVol: "",
  instTrustDir: "",
  instTrustVol: "",
  instDealerDir: "",
  instDealerVol: "",
  marginDir: "",
  marginVol: "",
  shortDir: "",
  shortVol: "",
  minVolume: "",
  priceAction: "none",
  consecutivePriceAction: "none",
  consecutiveDays: "",
  markets: ["TWSE", "TPEx"],
  assetTypes: ["Stock", "ETF"],
  techConditions: [],
  customTechRules: [],
};

// 全域變數快取，確保切換分頁時狀態不會遺失
let cachedPool: StockPoolItem[] = [];
let cachedFilteredResults: StockPoolItem[] = [];
let cachedLastUpdateTime: string | null = null;
let cachedConfig: ScreenerConfig = DEFAULT_CONFIG;

interface StockScreenerProps {
  onNavigateToMarket: (symbol: string) => void;
}

export default function StockScreener({
  onNavigateToMarket,
}: StockScreenerProps) {
  const [pool, setPool] = useState<StockPoolItem[]>(() => {
    if (cachedPool.length > 0) return cachedPool;
    const local = localStorage.getItem("smartvest_screener_pool");
    if (local) {
      try {
        const data = JSON.parse(local);
        cachedPool = data;
        if (data.length > 0 && typeof data[0].instForeign === "undefined") {
          return [];
        }
        cachedPool = data;
        return data;
      } catch (e) {}
    }
    return [];
  });
  const [filteredResults, setFilteredResults] = useState<StockPoolItem[]>(
    () => {
      if (
        cachedFilteredResults.length > 0 &&
        typeof cachedFilteredResults[0].instForeign === "undefined"
      ) {
        cachedFilteredResults = [];
      }
      return cachedFilteredResults;
    },
  );
  //

  const [isLoadingPool, setIsLoadingPool] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(() => {
    if (cachedLastUpdateTime) return cachedLastUpdateTime;
    return localStorage.getItem("smartvest_screener_update_time");
  });

  const [config, setConfig] = useState<ScreenerConfig>(cachedConfig);
  const [presets, setPresets] = useState<Record<string, ScreenerConfig>>(() => {
    const saved = localStorage.getItem("smartvest_screener_presets");
    return saved ? JSON.parse(saved) : {};
  });
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    // Load from electron on mount
    const loadElectronData = async () => {
      if (
        (window as any).electronAPI &&
        (window as any).electronAPI.isElectron
      ) {
        try {
          const savedPool = await (
            window as any
          ).electronAPI.loadScreenerPool();
          if (savedPool && savedPool.length > 0 && cachedPool.length === 0) {
            setPool(savedPool);
            cachedPool = savedPool;
          }
        } catch (e) {
          console.error("Failed to load screener pool from electron", e);
        }
      }
    };
    loadElectronData();
  }, []);

  useEffect(() => {
    cachedPool = pool;
    if (pool.length > 0) {
      try {
        localStorage.setItem("smartvest_screener_pool", JSON.stringify(pool));
      } catch (e) {
        console.warn("儲存失敗", e);
      }
      if (
        (window as any).electronAPI &&
        (window as any).electronAPI.isElectron
      ) {
        (window as any).electronAPI
          .saveScreenerPool(pool)
          .catch((e: any) => console.error("Electron save fail", e));
      }
    }
  }, [pool]);

  useEffect(() => {
    cachedFilteredResults = filteredResults;
  }, [filteredResults]);

  useEffect(() => {
    cachedLastUpdateTime = lastUpdateTime;
    if (lastUpdateTime)
      localStorage.setItem("smartvest_screener_update_time", lastUpdateTime);
  }, [lastUpdateTime]);

  useEffect(() => {
    cachedConfig = config;
  }, [config]);

  useEffect(() => {
    localStorage.setItem("smartvest_screener_presets", JSON.stringify(presets));
  }, [presets]);

  const getAssetType = (symbol: string): "Stock" | "ETF" | "ETN" | "Warrant" => {
    if (symbol.length >= 6) {
        if (symbol.startsWith("02")) return "ETN";
        if (symbol.startsWith("00") || symbol.startsWith("01")) return "ETF";
        return "Warrant";
    }
    if (symbol.startsWith("00") || symbol.startsWith("01")) return "ETF";
    return "Stock";
  };

  // Helper for safe integer parsing
  const safeParseInt = (val: any): number => {
    if (val == null) return 0;
    const str = String(val).replace(/,/g, "").trim();
    const num = parseInt(str);
    return isNaN(num) ? 0 : num;
  };

  // Helper for safe float parsing
  const safeParseFloat = (val: any): number => {
    if (val == null) return 0;
    const str = String(val).replace(/,/g, "").trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  // 取得所有上市櫃基本資料
  const fetchStockPool = async () => {
    setIsLoadingPool(true);
    try {
      const results: StockPoolItem[] = [];
      const isElectron = (window as any).electronAPI && (window as any).electronAPI.isElectron;

      // 1. TWSE 股價
      let twsePrices: any = [];
      try {
        if (isElectron) {
          twsePrices = await (window as any).electronAPI.fetchTwsePrices();
        } else {
          twsePrices = await fetchTwseOpenDataDirect('prices');
        }
      } catch (err: any) {
        console.error("Failed to fetch TWSE prices:", err);
      }

      // 2. TWSE PE/PB/Yield
      let twsePes: any = [];
      try {
        if (isElectron) {
          twsePes = await (window as any).electronAPI.fetchTwsePe();
        } else {
          twsePes = await fetchTwseOpenDataDirect('pe');
        }
      } catch (err: any) {
        console.error("Failed to fetch TWSE PE:", err);
      }

      // 3. TPEx 股價
      let tpexPrices: any = [];
      try {
        if (isElectron) {
          tpexPrices = await (window as any).electronAPI.fetchTpexPrices();
        } else {
          tpexPrices = await fetchTwseOpenDataDirect('prices');
        }
      } catch (err: any) {
        console.error("Failed to fetch TPEx prices:", err);
      }

      // 4. TPEx PE/PB/Yield
      let tpexPes: any = [];
      try {
        if (isElectron) {
          tpexPes = await (window as any).electronAPI.fetchTpexPe();
        } else {
          tpexPes = await fetchTwseOpenDataDirect('pe');
        }
      } catch (err: any) {
        console.error("Failed to fetch TPEx PE:", err);
      }

      // 5. TWSE Inst
      let twseInst: any = null;
      try {
        if (isElectron) {
          twseInst = await (window as any).electronAPI.fetchTwseInst();
        } else {
          twseInst = await fetchTwseOpenDataDirect('inst');
        }
      } catch (err: any) {
        console.error("Failed to fetch TWSE Inst:", err);
      }
      const twseInstMap = new Map();
      if (twseInst && Array.isArray(twseInst.data)) {
        twseInst.data.forEach((row: any) => {
          if (!row || row.length < 19) return;
          const symbol = String(row[0]).trim();
          twseInstMap.set(symbol, {
            foreign: (safeParseFloat(row[4]) + safeParseFloat(row[7])) / 1000,
            trust: safeParseFloat(row[10]) / 1000,
            dealer: safeParseFloat(row[11]) / 1000,
            net: safeParseFloat(row[18]) / 1000,
          });
        });
      }

      // 6. TPEx Inst
      let tpexInst: any = null;
      try {
        if (isElectron) {
          tpexInst = await (window as any).electronAPI.fetchTpexInst();
        } else {
          const tpexInstRes = await fetch("/api/tpex/inst");
          if (tpexInstRes.ok) {
            tpexInst = await tpexInstRes.json();
          } else {
            console.warn("TPEx Inst status error:", tpexInstRes.status);
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch TPEx Inst:", err);
      }
      const tpexInstMap = new Map();
      if (tpexInst && tpexInst.tables && Array.isArray(tpexInst.tables) && tpexInst.tables[0] && Array.isArray(tpexInst.tables[0].data)) {
        tpexInst.tables[0].data.forEach((row: any) => {
          if (!row || row.length < 24) return;
          const symbol = String(row[0]).trim();
          tpexInstMap.set(symbol, {
            foreign: safeParseFloat(row[10]) / 1000,
            trust: safeParseFloat(row[13]) / 1000,
            dealer: safeParseFloat(row[22]) / 1000,
            net: safeParseFloat(row[23]) / 1000,
          });
        });
      }

      // 7. TWSE Margin
      let twseMargin: any = null;
      try {
        if (isElectron) {
          twseMargin = await (window as any).electronAPI.fetchTwseMargin();
        } else {
          const twseMarginRes = await fetch("/api/twse/margin");
          if (twseMarginRes.ok) {
            twseMargin = await twseMarginRes.json();
          } else {
            console.warn("TWSE Margin status error:", twseMarginRes.status);
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch TWSE Margin:", err);
      }
      const twseMarginMap = new Map();
      if (Array.isArray(twseMargin)) {
        twseMargin.forEach((row: any) => {
          if (!row || !row['股票代號']) return;
          const symbol = String(row['股票代號']).trim();
          const todayBal = safeParseFloat(row['融資今日餘額']);
          const prevBal = safeParseFloat(row['融資前日餘額']);
          const shortTodayBal = safeParseFloat(row['融券今日餘額']);
          const shortPrevBal = safeParseFloat(row['融券前日餘額']);
          twseMarginMap.set(symbol, {
            marginBalance: todayBal,
            marginDiff: todayBal - prevBal,
            shortBalance: shortTodayBal,
            shortDiff: shortTodayBal - shortPrevBal,
          });
        });
      }

      // 8. TPEx Margin
      let tpexMargin: any = null;
      try {
        if (isElectron) {
          tpexMargin = await (window as any).electronAPI.fetchTpexMargin();
        } else {
          const tpexMarginRes = await fetch("/api/tpex/margin");
          if (tpexMarginRes.ok) {
            tpexMargin = await tpexMarginRes.json();
          } else {
            console.warn("TPEx Margin status error:", tpexMarginRes.status);
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch TPEx Margin:", err);
      }
      const tpexMarginMap = new Map();
      if (Array.isArray(tpexMargin)) {
        tpexMargin.forEach((row: any) => {
          if (!row || !row.SecuritiesCompanyCode) return;
          const symbol = String(row.SecuritiesCompanyCode).trim();
          const todayBal = safeParseFloat(row.MarginPurchaseBalance);
          const prevBal = safeParseFloat(row.MarginPurchaseBalancePreviousDay);
          const shortTodayBal = safeParseFloat(row.ShortSaleBalance);
          const shortPrevBal = safeParseFloat(row.ShortSaleBalancePreviousDay);
          tpexMarginMap.set(symbol, {
            marginBalance: todayBal,
            marginDiff: todayBal - prevBal,
            shortBalance: shortTodayBal,
            shortDiff: shortTodayBal - shortPrevBal,
          });
        });
      }

      // 整理 TWSE
      const twsePeMap = new Map();
      if (Array.isArray(twsePes)) {
        twsePes.forEach((item: any) => {
          if (item && item.Code) {
            twsePeMap.set(item.Code, item);
          }
        });
      }

      if (Array.isArray(twsePrices)) {
        twsePrices.forEach((item: any) => {
          if (!item || !item.Code) return;
          const peItem = twsePeMap.get(item.Code);
          const price = safeParseFloat(item.ClosingPrice);
          const pe = peItem ? safeParseFloat(peItem.PEratio) : 0;
          results.push({
            symbol: item.Code,
            name: item.Name,
            price: price,
            open: safeParseFloat(item.OpeningPrice),
            high: safeParseFloat(item.HighestPrice),
            low: safeParseFloat(item.LowestPrice),
            change: safeParseFloat(item.Change),
            changePercent: 0,
            volume: safeParseFloat(item.TradeVolume) / 1000, 
            pe: pe,
            eps: pe > 0 ? price / pe : 0,
            instForeign: twseInstMap.get(item.Code)?.foreign || 0,
            instTrust: twseInstMap.get(item.Code)?.trust || 0,
            instDealer: twseInstMap.get(item.Code)?.dealer || 0,
            instNetBuy: twseInstMap.get(item.Code)?.net || 0,
            marginBalance: twseMarginMap.get(item.Code)?.marginBalance || 0,
            marginDiff: twseMarginMap.get(item.Code)?.marginDiff || 0,
            shortBalance: twseMarginMap.get(item.Code)?.shortBalance || 0,
            shortDiff: twseMarginMap.get(item.Code)?.shortDiff || 0,
            pb: peItem ? safeParseFloat(peItem.PBratio) : 0,
            dividendYield: peItem ? safeParseFloat(peItem.DividendYield) : 0,
            market: "TWSE",
            assetType: getAssetType(item.Code),
          });
        });
      }

      // 整理 TPEx
      const tpexPeMap = new Map();
      if (Array.isArray(tpexPes)) {
        tpexPes.forEach((item: any) => {
          if (item && item.SecuritiesCompanyCode) {
            tpexPeMap.set(item.SecuritiesCompanyCode, item);
          }
        });
      }

      if (Array.isArray(tpexPrices)) {
        tpexPrices.forEach((item: any) => {
          if (!item || !item.SecuritiesCompanyCode) return;
          const peItem = tpexPeMap.get(item.SecuritiesCompanyCode);
          const price = safeParseFloat(item.Close);
          const pe = peItem ? safeParseFloat(peItem.PriceEarningRatio) : 0;
          results.push({
            symbol: item.SecuritiesCompanyCode,
            name: item.CompanyName,
            price: price,
            open: safeParseFloat(item.Open),
            high: safeParseFloat(item.High),
            low: safeParseFloat(item.Low),
            change: safeParseFloat(item.Change),
            changePercent: 0,
            volume: safeParseFloat(item.TradingShares) / 1000, 
            pe: pe,
            eps: pe > 0 ? price / pe : 0,
            instForeign:
              tpexInstMap.get(item.SecuritiesCompanyCode)?.foreign || 0,
            instTrust: tpexInstMap.get(item.SecuritiesCompanyCode)?.trust || 0,
            instDealer:
              tpexInstMap.get(item.SecuritiesCompanyCode)?.dealer || 0,
            instNetBuy: tpexInstMap.get(item.SecuritiesCompanyCode)?.net || 0,
            marginBalance: tpexMarginMap.get(item.SecuritiesCompanyCode)?.marginBalance || 0,
            marginDiff: tpexMarginMap.get(item.SecuritiesCompanyCode)?.marginDiff || 0,
            shortBalance: tpexMarginMap.get(item.SecuritiesCompanyCode)?.shortBalance || 0,
            shortDiff: tpexMarginMap.get(item.SecuritiesCompanyCode)?.shortDiff || 0,
            pb: peItem ? safeParseFloat(peItem.PriceBookRatio) : 0,
            dividendYield: peItem ? safeParseFloat(peItem.YieldRatio) : 0,
            market: "TPEx",
            assetType: getAssetType(item.SecuritiesCompanyCode),
          });
        });
      }

      if (results.length === 0) {
        throw new Error("未能成功載入股票價格與基本資料，請檢查網路連線。");
      }

      // 更新即時報價(使用 Yahoo Finance bulk API)
      try {
        const batchSize = 150;
        const yahooPromises = [];
        for (let i = 0; i < results.length; i += batchSize) {
          const batchSymbols = results
            .slice(i, i + batchSize)
            .map((r) =>
              r.market === "TWSE" ? `${r.symbol}.TW` : `${r.symbol}.TWO`,
            );
          if (isElectron) {
            yahooPromises.push(
              (window as any).electronAPI.fetchYahooQuotes(batchSymbols).catch((e: any) => [])
            );
          } else {
            yahooPromises.push(
              fetch(`/api/yahoo/quotes?symbols=${batchSymbols.join(",")}`).then(
                (res) => res.json(),
              ).catch(e => [])
            );
          }
        }
        const yahooResultsBatches = await Promise.all(yahooPromises);
        const yahooResults = yahooResultsBatches.flat();

        const yahooMap = new Map();
        yahooResults.forEach((yInfo: any) => {
          if (yInfo && yInfo.symbol) {
            const cleanSymbol = yInfo.symbol
              .replace(".TW", "")
              .replace(".TWO", "");
            yahooMap.set(cleanSymbol, yInfo);
          }
        });

        results.forEach((stock) => {
          const yInfo = yahooMap.get(stock.symbol);
          if (yInfo) {
            if (yInfo.regularMarketPrice != null)
              stock.price = yInfo.regularMarketPrice;
            if (yInfo.regularMarketOpen != null)
              stock.open = yInfo.regularMarketOpen;
            if (yInfo.regularMarketDayHigh != null)
              stock.high = yInfo.regularMarketDayHigh;
            if (yInfo.regularMarketDayLow != null)
              stock.low = yInfo.regularMarketDayLow;
            if (yInfo.regularMarketChange != null)
              stock.change = yInfo.regularMarketChange;
            if (yInfo.regularMarketChangePercent != null) {
              stock.changePercent = yInfo.regularMarketChangePercent;
              const isTW = stock.symbol.endsWith('.TW') || stock.symbol.endsWith('.TWO');
              stock.isLimit = isTW && Math.abs(yInfo.regularMarketChangePercent) > 9.5;
            } else {
              if (stock.price - stock.change > 0) {
                stock.changePercent =
                  (stock.change / (stock.price - stock.change)) * 100;
              }
            }

            if (yInfo.epsTrailingTwelveMonths != null) {
              stock.eps = yInfo.epsTrailingTwelveMonths;
            } else if (yInfo.epsCurrentYear != null) {
              stock.eps = yInfo.epsCurrentYear;
            } else if (stock.pe > 0 && stock.price > 0) {
              stock.eps = stock.price / stock.pe;
            }
            if (yInfo.regularMarketVolume !== undefined)
              stock.volume = (yInfo.regularMarketVolume || 0) / 1000;
            if (
              yInfo.dividendYield !== undefined &&
              yInfo.dividendYield !== null &&
              yInfo.dividendYield > 0
            ) {
              stock.dividendYield = yInfo.dividendYield;
            }
          } else {
            // 如果沒有 Yahoo 資料，自行推算 changePercent
            if (stock.price - stock.change > 0) {
              stock.changePercent =
                (stock.change / (stock.price - stock.change)) * 100;
            }
          }
        });
      } catch (e) {
        console.warn("無法取得 Yahoo 即時報價，將使用過期價格:", e);
      }

      setPool(results);
      setLastUpdateTime(new Date().toLocaleString());
      setFilteredResults([]);
    } catch (err) {
      console.error("Fetch pool error:", err);
      alert("載入股票池失敗，請稍後再試。");
    } finally {
      setIsLoadingPool(false);
    }
  };

  const handleStartScan = async () => {
    if (pool.length === 0) {
      alert("請先載入股票池(取得最新台股資料)！");
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    try {
      // 判斷股票池內是否有載入任何三大法人資料，若全都為 0（或無此資料），則跳過法人相關條件過濾，避免篩選結果全空
      const hasInstData = pool.some(
        (s) => s.instForeign !== 0 || s.instTrust !== 0 || s.instDealer !== 0
      );
      const hasMarginData = pool.some(
        (s) => (s.marginDiff !== undefined && s.marginDiff !== 0) || (s.shortDiff !== undefined && s.shortDiff !== 0)
      );

      // 1. 先用基本面篩選過濾，減少技術面 API 請求次數
      let passBaseFilter = pool.filter((stock) => {
        if (!config.markets.includes(stock.market)) return false;
        if (!config.assetTypes.includes(stock.assetType)) return false;

        if (config.priceAction && config.priceAction !== "none") {
          const cp = stock.changePercent || 0;
          if (config.priceAction === "limit_up" && cp < 9.5) return false;
          if (config.priceAction === "limit_down" && cp > -9.5) return false;
          if (config.priceAction === "strong" && cp < 7.0) return false;
          if (config.priceAction === "weak" && cp > -7.0) return false;
        }

        if (config.minPrice && stock.price < parseFloat(config.minPrice))
          return false;
        if (config.maxPrice && stock.price > parseFloat(config.maxPrice))
          return false;
        if (
          config.maxPe &&
          (stock.pe > parseFloat(config.maxPe) || stock.pe <= 0)
        )
          return false;
        if (
          config.minYield &&
          stock.dividendYield < parseFloat(config.minYield)
        )
          return false;
        if (config.minEps !== "") {
          const val = parseFloat(config.minEps);
          const epsVal = (stock.eps == null || isNaN(stock.eps)) ? 0 : Number(stock.eps);
          if (!isNaN(val) && epsVal < val) {
            return false;
          }
        }
        if (hasInstData && config.minInstNetBuy !== "") {
          const val = parseFloat(config.minInstNetBuy);
          if (
            stock.instNetBuy == null ||
            isNaN(stock.instNetBuy) ||
            stock.instNetBuy < val
          )
            return false;
        }
        if (hasInstData && config.instForeignDir && config.instForeignVol) {
          const v = parseFloat(config.instForeignVol);
          if (stock.instForeign == null || isNaN(stock.instForeign))
            return false;
          if (config.instForeignDir === "buy" && stock.instForeign < v)
            return false;
          if (config.instForeignDir === "sell" && stock.instForeign > -v)
            return false;
        }
        if (hasInstData && config.instTrustDir && config.instTrustVol) {
          const v = parseFloat(config.instTrustVol);
          if (stock.instTrust == null || isNaN(stock.instTrust)) return false;
          if (config.instTrustDir === "buy" && stock.instTrust < v)
            return false;
          if (config.instTrustDir === "sell" && stock.instTrust > -v)
            return false;
        }
        if (hasInstData && config.instDealerDir && config.instDealerVol) {
          const v = parseFloat(config.instDealerVol);
          if (stock.instDealer == null || isNaN(stock.instDealer)) return false;
          if (config.instDealerDir === "buy" && stock.instDealer < v)
            return false;
          if (config.instDealerDir === "sell" && stock.instDealer > -v)
            return false;
        }
        if (hasMarginData && config.marginDir && config.marginVol) {
          const v = parseFloat(config.marginVol);
          const mDiff = stock.marginDiff || 0;
          if (config.marginDir === "buy" && mDiff < v) return false;
          if (config.marginDir === "sell" && mDiff > -v) return false;
        }
        if (hasMarginData && config.shortDir && config.shortVol) {
          const v = parseFloat(config.shortVol);
          const sDiff = stock.shortDiff || 0;
          if (config.shortDir === "buy" && sDiff < v) return false;
          if (config.shortDir === "sell" && sDiff > -v) return false;
        }
        // 嚴格套用成交量篩選
        if (
          config.minVolume &&
          stock.volume < parseFloat(config.minVolume)
        )
          return false;
        return true;
      });

      const requiresHistory = 
        config.techConditions.length > 0 || 
        (config.customTechRules && config.customTechRules.length > 0) ||
        (config.consecutivePriceAction !== "none" && config.consecutiveDays && parseInt(config.consecutiveDays) > 0);

      if (!requiresHistory) {
        setFilteredResults(
          passBaseFilter.map((s) => ({ ...s, status: "passed" })),
        );
        setIsScanning(false);
        return;
      }

      // 2. 如果有技術面條件，則對通過基本面的股票逐一發送 API 請求抓均線
      const processedList: StockPoolItem[] = [];
      setFilteredResults(
        passBaseFilter.map((s) => ({ ...s, status: "pending" })),
      );

      const batchSize = 10;
      const period1 = Math.floor(
        new Date().setFullYear(new Date().getFullYear() - 1) / 1000,
      );
      const period2 = Math.floor(new Date().getTime() / 1000) + 86400;

      for (let i = 0; i < passBaseFilter.length; i += batchSize) {
        const batch = passBaseFilter.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (stock) => {
            let sProcessed: StockPoolItem = { ...stock, status: "scanning" };
            try {
              const symbolQuery =
                stock.market === "TWSE"
                  ? `${stock.symbol}.TW`
                  : `${stock.symbol}.TWO`;
              const history = await fetchYahooHistoryUniversal(
                symbolQuery,
                period1,
                period2,
                "1d",
              );

              if (history && history.indicators?.quote?.[0]?.close && history.timestamp) {
                const rawCloses = history.indicators.quote[0].close;
                const rawTimestamps = history.timestamp || [];
                const validCloses: number[] = [];
                const validTimestamps: number[] = [];
                for(let i=0; i<rawCloses.length; i++) {
                   if (rawCloses[i] !== null && rawCloses[i] !== undefined) {
                       validCloses.push(rawCloses[i]);
                       if (rawTimestamps[i]) validTimestamps.push(rawTimestamps[i]);
                   }
                }
                const closes = validCloses;
                const timestamps = validTimestamps;
                const ma20 = calculateSMA(closes, 20);
                const ma60 = calculateSMA(closes, 60);

                sProcessed.ma20 = ma20;
                sProcessed.ma60 = ma60;

                const curPrice = closes[closes.length - 1] || stock.price;
                let passed = true;

                if (
                  config.techConditions.includes("price_above_20ma") &&
                  (!ma20 || curPrice <= ma20)
                )
                  passed = false;
                if (
                  config.techConditions.includes("price_above_60ma") &&
                  (!ma60 || curPrice <= ma60)
                )
                  passed = false;
                if (
                  config.techConditions.includes("golden_cross_20_60") &&
                  (!ma20 || !ma60 || ma20 <= ma60)
                )
                  passed = false;

                if (
                  config.consecutivePriceAction !== "none" &&
                  config.consecutiveDays &&
                  parseInt(config.consecutiveDays) > 0
                ) {
                  const requiredDays = parseInt(config.consecutiveDays);
                  
                  // Calculate daily changes from history
                  const dailyChanges: number[] = [];
                  for (let i = 1; i < closes.length; i++) {
                     const prev = closes[i-1];
                     const curr = closes[i];
                     if (prev && prev > 0) {
                         dailyChanges.push(((curr - prev) / prev) * 100);
                     }
                  }

                  // Override the last historical change with the real-time quote change 
                  // to ensure the Screener uses the absolute latest price data for today/latest session.
                  if (dailyChanges.length > 0 && timestamps.length > 0) {
                      const lastTs = timestamps[timestamps.length - 1];
                      const lastDate = new Date(lastTs * 1000);
                      const now = new Date();
                      
                      const isSameDay = lastDate.getDate() === now.getDate() && 
                                        lastDate.getMonth() === now.getMonth() && 
                                        lastDate.getFullYear() === now.getFullYear();

                      // Only override the LAST index if the historical array already contains today's candle.
                      // If the historical array does NOT have today's candle, append today's change.
                      // Note: We skip appending on weekends since real-time quote matches the Friday close which is ALREADY the last element.
                      if (isSameDay) {
                          dailyChanges[dailyChanges.length - 1] = stock.changePercent || 0;
                      } else {
                          const isWeekend = now.getDay() === 0 || now.getDay() === 6;
                          if (!isWeekend) {
                              dailyChanges.push(stock.changePercent || 0);
                          }
                      }
                  }

                  if (dailyChanges.length >= requiredDays) {
                    let meetsConsecutive = true;
                    // Check the last `requiredDays` from dailyChanges
                    for (let d = 0; d < requiredDays; d++) {
                      const change = dailyChanges[dailyChanges.length - 1 - d];
                      
                      if (config.consecutivePriceAction === "limit_up" && change < 9.5) {
                        meetsConsecutive = false;
                        break;
                      } else if (config.consecutivePriceAction === "limit_down" && change > -9.5) {
                        meetsConsecutive = false;
                        break;
                      }
                    }
                    if (!meetsConsecutive) {
                      passed = false;
                    }
                  } else {
                     passed = false;
                  }
                }

                // Evaluate custom tech rules
                if (
                  config.customTechRules &&
                  config.customTechRules.length > 0
                ) {
                  for (const rule of config.customTechRules) {
                    if (rule.type === "MA_ARRANGEMENT") {
                      const { maList, priceIncluded } = rule.params;
                      const values = [];
                      if (priceIncluded) values.push(curPrice);
                      for (const p of maList) {
                        values.push(calculateSMA(closes, p));
                      }
                      for (let j = 0; j < values.length - 1; j++) {
                        if (
                          values[j] === undefined ||
                          values[j + 1] === undefined ||
                          values[j] <= values[j + 1]
                        ) {
                          passed = false;
                          break;
                        }
                      }
                    } else if (rule.type === "PRICE_MA_BIAS") {
                      const { maPeriod, minPct, maxPct } = rule.params;
                      const ma = calculateSMA(closes, maPeriod);
                      if (!ma) {
                        passed = false;
                      } else {
                        const bias = ((curPrice - ma) / ma) * 100;
                        if (
                          (minPct !== "" && bias < parseFloat(minPct)) ||
                          (maxPct !== "" && bias > parseFloat(maxPct))
                        ) {
                          passed = false;
                        }
                      }
                    } else if (rule.type === "CONSECUTIVE_PRICE_MA") {
                      const { days, maPeriod, relation } = rule.params;
                      let ok = true;
                      for (let d = 0; d < days; d++) {
                        const idx = closes.length - 1 - d;
                        if (idx < 0) {
                          ok = false;
                          break;
                        }
                        const slice = closes.slice(0, idx + 1);
                        const ma = calculateSMA(slice, maPeriod);
                        if (!ma) {
                          ok = false;
                          break;
                        }
                        const p = closes[idx];
                        if (relation === "greater" && p <= ma) {
                          ok = false;
                          break;
                        }
                        if (relation === "less" && p >= ma) {
                          ok = false;
                          break;
                        }
                      }
                      if (!ok) passed = false;
                    } else if (rule.type === "MA_VS_DEDUCT") {
                      const { maPeriod, relation } = rule.params;
                      const ma = calculateSMA(closes, maPeriod);
                      const deductIdx = closes.length - 1 - (maPeriod - 1);
                      if (!ma || deductIdx < 0) {
                        passed = false;
                      } else {
                        const deductPrice = closes[deductIdx];
                        if (relation === "greater" && ma <= deductPrice)
                          passed = false;
                        if (relation === "less" && ma >= deductPrice)
                          passed = false;
                      }
                    } else if (rule.type === "MA_TREND") {
                      const { maPeriod, days, trend } = rule.params;
                      let ok = true;
                      let prevMa = calculateSMA(closes, maPeriod);
                      if (!prevMa) ok = false;
                      for (let d = 1; ok && d <= days; d++) {
                        const prevSlice = closes.slice(0, closes.length - d);
                        const curMa = calculateSMA(prevSlice, maPeriod);
                        if (!curMa) {
                          ok = false;
                          break;
                        }
                        if (trend === "up" && prevMa <= curMa) {
                          ok = false;
                          break;
                        }
                        if (trend === "down" && prevMa >= curMa) {
                          ok = false;
                          break;
                        }
                        prevMa = curMa;
                      }
                      if (!ok) passed = false;
                    }
                  }
                }

                sProcessed.status = passed ? "passed" : "failed";
              } else {
                sProcessed.status = "failed";
              }
            } catch (e) {
              sProcessed.status = "failed";
            }
            processedList.push(sProcessed);
          }),
        );

        // 更新進度
        setScanProgress(
          Math.min(((i + batchSize) / passBaseFilter.length) * 100, 100),
        );
        setFilteredResults([
          ...processedList,
          ...passBaseFilter
            .slice(i + batchSize)
            .map((s) => ({ ...s, status: "pending" }) as StockPoolItem),
        ]);
      }

      setIsScanning(false);
    } catch (err: any) {
      console.error("Scan failed:", err);
      alert("篩選過程發生錯誤：" + err.message);
      setIsScanning(false);
    }
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      alert("請輸入組合名稱");
      return;
    }
    setPresets({ ...presets, [presetName]: { ...config } });
    setPresetName("");
  };

  const handleLoadPreset = (name: string) => {
    if (presets[name]) {
      setConfig(presets[name]);
      setPresetName(name); // Load name to allow easy updating
    }
  };

  const handleDeletePreset = (name: string) => {
    const newPresets = { ...presets };
    delete newPresets[name];
    setPresets(newPresets);
    if (presetName === name) {
      setPresetName("");
    }
  };

  const handleClearConfig = () => {
    setConfig(DEFAULT_CONFIG);
    setPresetName("");
  };

  const handleClearResults = () => {
    setFilteredResults([]);
    setScanProgress(0);
  };

  const toggleTechCondition = (
    cond: "price_above_20ma" | "price_above_60ma" | "golden_cross_20_60",
  ) => {
    const current = [...config.techConditions];
    if (current.includes(cond)) {
      setConfig({
        ...config,
        techConditions: current.filter((c) => c !== cond),
      });
    } else {
      setConfig({ ...config, techConditions: [...current, cond] });
    }
  };

  const toggleMarket = (m: "TWSE" | "TPEx") => {
    const current = [...config.markets];
    if (current.includes(m)) {
      setConfig({ ...config, markets: current.filter((c) => c !== m) });
    } else {
      setConfig({ ...config, markets: [...current, m] });
    }
  };

  const toggleAssetType = (a: "Stock" | "ETF" | "ETN" | "Warrant") => {
    const current = [...config.assetTypes];
    if (current.includes(a)) {
      setConfig({ ...config, assetTypes: current.filter((c) => c !== a) });
    } else {
      setConfig({ ...config, assetTypes: [...current, a] });
    }
  };

  const hasTechRules =
    config.techConditions.length > 0 ||
    (config.customTechRules && config.customTechRules.length > 0) ||
    (config.consecutivePriceAction !== "none" && config.consecutiveDays && parseInt(config.consecutiveDays) > 0);
  const displayResults = filteredResults
    .filter((r) => !hasTechRules || r.status === "passed")
    .sort((a, b) =>
      a.symbol.localeCompare(b.symbol, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="text-indigo-600" />
            選股池 (Stock Screener)
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            透過公開資料爬取上市櫃股票資料，並根據自訂的多重條件進行篩選
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={fetchStockPool}
            disabled={isLoadingPool || isScanning}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
          >
            {isLoadingPool ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCcw size={16} />
            )}
            {pool.length > 0 ? "更新資料庫" : "載入台股資料庫"}
          </button>
          <button
            onClick={handleClearResults}
            disabled={isScanning || filteredResults.length === 0}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-sm disabled:opacity-50"
          >
            <Eraser size={16} />
            清除快取結果
          </button>
          <button
            onClick={handleStartScan}
            disabled={isScanning || pool.length === 0}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50"
          >
            {isScanning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            開始篩選
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* 篩選條件主版面 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100">
            <h3 className="font-bold flex items-center gap-2 text-slate-700 text-lg">
              <Filter size={20} className="text-indigo-500" /> 篩選條件
            </h3>
            <button
              onClick={handleClearConfig}
              className="text-xs flex items-center gap-1 text-slate-500 hover:text-rose-500 transition-colors bg-slate-50 hover:bg-rose-50 px-3 py-1.5 rounded-lg border border-slate-100"
            >
              <XCircle size={14} /> 清除設定
            </button>
          </div>

          <div className="space-y-6">
            {/* 1. 市場與資產分類 */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
              <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">
                1. 市場與資產分類
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div>
                  <label className="block text-slate-600 mb-2 font-medium">
                    市場分類
                  </label>
                  <div className="flex gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.markets.includes("TWSE")}
                        onChange={() => toggleMarket("TWSE")}
                        className="text-indigo-600 focus:ring-indigo-500 rounded"
                      />
                      <span className="text-slate-700">上市</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.markets.includes("TPEx")}
                        onChange={() => toggleMarket("TPEx")}
                        className="text-indigo-600 focus:ring-indigo-500 rounded"
                      />
                      <span className="text-slate-700">上櫃</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 mb-2 font-medium">
                    資產類型
                  </label>
                  <div className="flex gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.assetTypes.includes("Stock")}
                        onChange={() => toggleAssetType("Stock")}
                        className="text-indigo-600 focus:ring-indigo-500 rounded"
                      />
                      <span className="text-slate-700">股票</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.assetTypes.includes("ETF")}
                        onChange={() => toggleAssetType("ETF")}
                        className="text-indigo-600 focus:ring-indigo-500 rounded"
                      />
                      <span className="text-slate-700">ETF</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.assetTypes.includes("ETN")}
                        onChange={() => toggleAssetType("ETN")}
                        className="text-indigo-600 focus:ring-indigo-500 rounded"
                      />
                      <span className="text-slate-700">ETN</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.assetTypes.includes("Warrant")}
                        onChange={() => toggleAssetType("Warrant")}
                        className="text-indigo-600 focus:ring-indigo-500 rounded"
                      />
                      <span className="text-slate-700">權證</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 籌碼面分類 */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
              <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">
                2. 籌碼面分類
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    價格強弱勢 (今日)
                  </label>
                  <select
                    value={config.priceAction}
                    onChange={(e) =>
                      setConfig({ ...config, priceAction: e.target.value as any })
                    }
                    className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="none">不限</option>
                    <option value="limit_up">漲停 (≥ 9.5%)</option>
                    <option value="limit_down">跌停 (≤ -9.5%)</option>
                    <option value="strong">強勢股 (≥ 7%)</option>
                    <option value="weak">弱勢股 (≤ -7%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    連續天數漲跌停 (將自動抓取歷史)
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={config.consecutivePriceAction}
                      onChange={(e) =>
                        setConfig({ ...config, consecutivePriceAction: e.target.value as any })
                      }
                      className="border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none flex-1"
                    >
                      <option value="none">不限</option>
                      <option value="limit_up">連續漲停</option>
                      <option value="limit_down">連續跌停</option>
                    </select>
                    <input
                      type="number"
                      placeholder="天數"
                      value={config.consecutiveDays}
                      onChange={(e) =>
                        setConfig({ ...config, consecutiveDays: e.target.value })
                      }
                      className="w-20 border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                      disabled={config.consecutivePriceAction === "none"}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    股價範圍 (元)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={config.minPrice}
                      onChange={(e) =>
                        setConfig({ ...config, minPrice: e.target.value })
                      }
                      className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-slate-400">-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={config.maxPrice}
                      onChange={(e) =>
                        setConfig({ ...config, maxPrice: e.target.value })
                      }
                      className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    成交量 (張) 大於
                  </label>
                  <input
                    type="number"
                    value={config.minVolume}
                    onChange={(e) =>
                      setConfig({ ...config, minVolume: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-3 col-span-1 md:col-span-2 lg:col-span-1 border border-slate-200 p-3 rounded-md bg-white">
                  <div className="flex flex-col gap-1 mb-2">
                    <label className="block text-slate-700 font-bold">
                      三大法人買賣超
                    </label>
                    {pool.length > 0 && !pool.some(s => s.instForeign !== 0 || s.instTrust !== 0 || s.instDealer !== 0) && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-2 text-[11px] leading-relaxed mt-1">
                        ⚠️ 系統未成功自證交所載入三大法人買賣超數據（受伺服器 IP 限流 WAF 限制）。此過濾條件暫不生效。
                        <div className="font-semibold text-indigo-800 mt-0.5">
                          💡 點擊「股價更新」多嘗試幾次，或使用桌面端 (Electron) 於個人家用網路運行，可 100% 正常獲取籌碼數據！
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 w-16">合計大於</span>
                    <input
                      type="number"
                      placeholder="張數"
                      value={config.minInstNetBuy}
                      onChange={(e) =>
                        setConfig({ ...config, minInstNetBuy: e.target.value })
                      }
                      className="w-full border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-slate-500 text-xs">張</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 w-12">外資</span>
                    <select
                      value={config.instForeignDir}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          instForeignDir: e.target.value as any,
                        })
                      }
                      className="border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm w-20"
                    >
                      <option value="">不使用</option>
                      <option value="buy">買超</option>
                      <option value="sell">賣超</option>
                    </select>
                    <input
                      type="number"
                      placeholder="大於張數"
                      value={config.instForeignVol}
                      onChange={(e) =>
                        setConfig({ ...config, instForeignVol: e.target.value })
                      }
                      className="flex-1 border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                      disabled={!config.instForeignDir}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 w-12">投信</span>
                    <select
                      value={config.instTrustDir}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          instTrustDir: e.target.value as any,
                        })
                      }
                      className="border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm w-20"
                    >
                      <option value="">不使用</option>
                      <option value="buy">買超</option>
                      <option value="sell">賣超</option>
                    </select>
                    <input
                      type="number"
                      placeholder="大於張數"
                      value={config.instTrustVol}
                      onChange={(e) =>
                        setConfig({ ...config, instTrustVol: e.target.value })
                      }
                      className="flex-1 border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                      disabled={!config.instTrustDir}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 w-12">自營商</span>
                    <select
                      value={config.instDealerDir}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          instDealerDir: e.target.value as any,
                        })
                      }
                      className="border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm w-20"
                    >
                      <option value="">不使用</option>
                      <option value="buy">買超</option>
                      <option value="sell">賣超</option>
                    </select>
                    <input
                      type="number"
                      placeholder="大於張數"
                      value={config.instDealerVol}
                      onChange={(e) =>
                        setConfig({ ...config, instDealerVol: e.target.value })
                      }
                      className="flex-1 border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                      disabled={!config.instDealerDir}
                    />
                  </div>
                </div>
                <div className="space-y-3 col-span-1 md:col-span-2 lg:col-span-1 border border-slate-200 p-3 rounded-md bg-white">
                  <div className="flex flex-col gap-1 mb-2">
                    <label className="block text-slate-700 font-bold">
                      融資融券變動 (張)
                    </label>
                    {pool.length > 0 && !pool.some(s => (s.marginDiff !== undefined && s.marginDiff !== 0) || (s.shortDiff !== undefined && s.shortDiff !== 0)) && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-2 text-[11px] leading-relaxed mt-1">
                        ⚠️ 系統未成功載入融資融券變動數據。
                        <div className="font-semibold text-indigo-800 mt-0.5">
                          💡 點擊「股價更新」多嘗試幾次，或使用桌面端 (Electron) 運行。
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 w-12">融資</span>
                    <select
                      value={config.marginDir}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          marginDir: e.target.value as any,
                        })
                      }
                      className="border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm w-20"
                    >
                      <option value="">不使用</option>
                      <option value="buy">增加</option>
                      <option value="sell">減少</option>
                    </select>
                    <input
                      type="number"
                      placeholder="大於張數"
                      value={config.marginVol}
                      onChange={(e) =>
                        setConfig({ ...config, marginVol: e.target.value })
                      }
                      className="flex-1 border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                      disabled={!config.marginDir}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 w-12">融券</span>
                    <select
                      value={config.shortDir}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          shortDir: e.target.value as any,
                        })
                      }
                      className="border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm w-20"
                    >
                      <option value="">不使用</option>
                      <option value="buy">增加</option>
                      <option value="sell">減少</option>
                    </select>
                    <input
                      type="number"
                      placeholder="大於張數"
                      value={config.shortVol}
                      onChange={(e) =>
                        setConfig({ ...config, shortVol: e.target.value })
                      }
                      className="flex-1 border border-slate-200 rounded-md p-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                      disabled={!config.shortDir}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    主力進出{" "}
                    <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">
                      即將推出
                    </span>
                  </label>
                  <input
                    type="text"
                    disabled
                    placeholder="敬請期待"
                    className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5 text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* 3. 基本面分類 */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
              <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">
                3. 基本面分類
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    本益比 (PE) 小於
                  </label>
                  <input
                    type="number"
                    placeholder="例如: 15"
                    value={config.maxPe}
                    onChange={(e) =>
                      setConfig({ ...config, maxPe: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    殖利率 (%) 大於
                  </label>
                  <input
                    type="number"
                    placeholder="例如: 5"
                    value={config.minYield}
                    onChange={(e) =>
                      setConfig({ ...config, minYield: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium flex items-center justify-between">
                    <span>EPS (近四季) 大於</span>
                  </label>
                  <input
                    type="number"
                    placeholder="例如: 2.5"
                    value={config.minEps}
                    onChange={(e) =>
                      setConfig({ ...config, minEps: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">使用近四季實績、或全年估算值</p>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    月營收成長{" "}
                    <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">
                      即將推出
                    </span>
                  </label>
                  <input
                    type="text"
                    disabled
                    placeholder="敬請期待"
                    className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5 text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* 4. 技術面分類 */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
              <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">
                4. 技術面分類
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-3">
                  <label className="block text-slate-600 mb-2 font-medium">
                    均線條件 (可複選)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.techConditions.includes(
                        "price_above_20ma",
                      )}
                      onChange={() => toggleTechCondition("price_above_20ma")}
                      className="text-indigo-600 focus:ring-indigo-500 rounded"
                    />
                    <span className="text-slate-700">站上月線 (20MA)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.techConditions.includes(
                        "price_above_60ma",
                      )}
                      onChange={() => toggleTechCondition("price_above_60ma")}
                      className="text-indigo-600 focus:ring-indigo-500 rounded"
                    />
                    <span className="text-slate-700">站上季線 (60MA)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.techConditions.includes(
                        "golden_cross_20_60",
                      )}
                      onChange={() => toggleTechCondition("golden_cross_20_60")}
                      className="text-indigo-600 focus:ring-indigo-500 rounded"
                    />
                    <span className="text-slate-700">
                      月線大於季線 (多頭排列)
                    </span>
                  </label>
                </div>
                <div className="space-y-3 opacity-60">
                  <label className="block text-slate-600 mb-2 font-medium flex items-center gap-2">
                    技術指標{" "}
                    <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded font-normal">
                      功能即將推出
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 cursor-not-allowed">
                      <input type="checkbox" disabled className="rounded" />
                      <span className="text-slate-500">K&D 黃金交叉</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-not-allowed">
                      <input type="checkbox" disabled className="rounded" />
                      <span className="text-slate-500">RSI 超賣回升</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-not-allowed">
                      <input type="checkbox" disabled className="rounded" />
                      <span className="text-slate-500">MACD 翻紅</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-not-allowed">
                      <input type="checkbox" disabled className="rounded" />
                      <span className="text-slate-500">布林通道觸下軌</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-not-allowed">
                      <input type="checkbox" disabled className="rounded" />
                      <span className="text-slate-500">DMI 指標</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-not-allowed">
                      <input type="checkbox" disabled className="rounded" />
                      <span className="text-slate-500">CCI 指標</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-not-allowed">
                      <input type="checkbox" disabled className="rounded" />
                      <span className="text-slate-500">威廉指標 (JR)</span>
                    </label>
                  </div>
                </div>
              </div>

              <CustomTechRulesEditor
                rules={config.customTechRules || []}
                onChange={(rules) =>
                  setConfig({ ...config, customTechRules: rules })
                }
              />
            </div>

            {/* 自訂組合 */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
              <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
                <Save size={18} className="text-indigo-500" /> 自訂篩選組合
              </h4>
              <div className="flex flex-col md:flex-row gap-6 text-sm">
                <div className="flex-1">
                  <label className="block text-slate-600 mb-2 font-medium">
                    儲存目前的條件設定
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="輸入組合名稱..."
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      className="flex-1 border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 text-sm focus:outline-none"
                    />
                    <button
                      onClick={handleSavePreset}
                      className="bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-md hover:bg-indigo-200 transition-colors text-sm font-medium whitespace-nowrap"
                    >
                      儲存組合
                    </button>
                  </div>
                </div>
                <div className="flex-1 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6">
                  <label className="block text-slate-600 mb-2 font-medium">
                    已儲存的組合
                  </label>
                  {Object.keys(presets).length > 0 ? (
                    <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2">
                      {Object.entries(presets).map(([name, p]) => (
                        <div
                          key={name}
                          className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg hover:border-indigo-300 transition-colors"
                        >
                          <button
                            onClick={() => handleLoadPreset(name)}
                            className="text-sm text-indigo-600 hover:text-indigo-800 flex-1 text-left font-medium"
                          >
                            {name}
                          </button>
                          <button
                            onClick={() => handleDeletePreset(name)}
                            className="text-slate-400 hover:text-rose-500 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-3 bg-white rounded-lg border border-slate-200 border-dashed text-center">
                      尚未儲存任何組合設定
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Status Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">
                資料庫總數
              </p>
              <div className="text-2xl font-bold text-slate-800">
                {pool.length.toLocaleString()}{" "}
                <span className="text-sm font-normal text-slate-400">檔</span>
              </div>
              {lastUpdateTime && (
                <p className="text-xs text-slate-400 mt-1">
                  更新於 {lastUpdateTime}
                </p>
              )}
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">
                符合條件
              </p>
              <div className="text-2xl font-bold text-indigo-600">
                {displayResults.length.toLocaleString()}{" "}
                <span className="text-sm font-normal text-slate-400">檔</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center min-h-[90px]">
              {isScanning ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>分析中...</span>
                    <span>{Math.round(scanProgress)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${scanProgress}%` }}
                    ></div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 flex justify-center items-center h-full gap-2">
                  <Search size={16} className="text-slate-400" />
                  <span>等待篩選指示</span>
                </div>
              )}
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-medium">代號</th>
                    <th className="px-4 py-3 font-medium">名稱</th>
                    <th className="px-4 py-3 font-medium text-right">開盤價</th>
                    <th className="px-4 py-3 font-medium text-right">最高</th>
                    <th className="px-4 py-3 font-medium text-right">最低</th>
                    <th className="px-4 py-3 font-medium text-right">收盤價</th>
                    <th className="px-4 py-3 font-medium text-right">漲跌</th>
                    <th className="px-4 py-3 font-medium text-right">漲跌幅</th>
                    <th className="px-4 py-3 font-medium text-right">
                      成交量(張)
                    </th>
                    <th
                      className="px-4 py-3 font-medium text-right cursor-help"
                      title="主要來源為近四季 (TTM) EPS，若無則依據證交所本益比推算"
                    >
                      EPS(近四季)
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      三大法人(張)
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      外資(張)
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      投信(張)
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      自營商(張)
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      融資變動(張)
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      融券變動(張)
                    </th>
                    <th className="px-4 py-3 font-medium text-center">市場</th>
                    {isScanning && (
                      <th className="px-4 py-3 font-medium text-center">
                        狀態
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayResults.length > 0 ? (
                    displayResults.map((item, idx) => {
                      const isTW = item.symbol.endsWith('.TW') || item.symbol.endsWith('.TWO');
                      let isLimitUp = false;
                      let isLimitDown = false;
                      if (item.changePercent !== undefined) {
                        isLimitUp = isTW && item.changePercent > 9.5;
                        isLimitDown = isTW && item.changePercent < -9.5;
                      } else {
                        isLimitUp = isTW && !!item.isLimit && item.change > 0;
                        isLimitDown = isTW && !!item.isLimit && item.change < 0;
                      }

                      return (
                        <tr
                          key={`${item.symbol}-${idx}`}
                          onClick={() =>
                            onNavigateToMarket(
                              item.market === "TWSE"
                                ? `${item.symbol}.TW`
                                : `${item.symbol}.TWO`,
                            )
                          }
                          className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 font-bold text-indigo-600">
                            {item.symbol}
                          </td>
                          <td className="px-4 py-3 text-slate-800 font-medium">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.open != null && item.open !== 0
                              ? item.open.toFixed(2)
                              : !item.open && item.price
                                ? "-"
                                : "0.00"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.high != null && item.high !== 0
                              ? item.high.toFixed(2)
                              : !item.high && item.price
                                ? "-"
                                : "0.00"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.low != null && item.low !== 0
                              ? item.low.toFixed(2)
                              : !item.low && item.price
                                ? "-"
                                : "0.00"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            <span
                              className={`${isLimitUp ? "bg-rose-500 text-white px-1.5 py-0.5 rounded" : isLimitDown ? "bg-emerald-500 text-white px-1.5 py-0.5 rounded" : item.change > 0 ? "text-rose-500" : item.change < 0 ? "text-emerald-500" : "text-slate-700"}`}
                            >
                              {item.price?.toFixed(2)}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${item.change > 0 ? "text-rose-500" : item.change < 0 ? "text-emerald-500" : "text-slate-500"}`}
                          >
                            {item.change != null && !isNaN(item.change)
                              ? `${item.change > 0 ? "+" : ""}${item.change.toFixed(2)}`
                              : "-"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${item.changePercent > 0 ? "text-rose-500" : item.changePercent < 0 ? "text-emerald-500" : "text-slate-500"}`}
                          >
                            {item.changePercent != null &&
                            !isNaN(item.changePercent)
                              ? `${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(2)}%`
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {Math.floor(item.volume).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">
                            {item.eps != null ? item.eps.toFixed(2) : "-"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${item.instNetBuy > 0 ? "text-rose-500" : item.instNetBuy < 0 ? "text-emerald-500" : "text-slate-500"}`}
                          >
                            {item.instNetBuy != null
                              ? item.instNetBuy.toLocaleString("en-US", {
                                  maximumFractionDigits: 0,
                                })
                              : "-"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${item.instForeign > 0 ? "text-rose-500" : item.instForeign < 0 ? "text-emerald-500" : "text-slate-500"}`}
                          >
                            {item.instForeign != null
                              ? item.instForeign.toLocaleString("en-US", {
                                  maximumFractionDigits: 0,
                                })
                              : "-"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${item.instTrust > 0 ? "text-rose-500" : item.instTrust < 0 ? "text-emerald-500" : "text-slate-500"}`}
                          >
                            {item.instTrust != null
                              ? item.instTrust.toLocaleString("en-US", {
                                  maximumFractionDigits: 0,
                                })
                              : "-"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${item.instDealer > 0 ? "text-rose-500" : item.instDealer < 0 ? "text-emerald-500" : "text-slate-500"}`}
                          >
                            {item.instDealer != null
                              ? item.instDealer.toLocaleString("en-US", {
                                  maximumFractionDigits: 0,
                                })
                              : "-"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${item.marginDiff && item.marginDiff > 0 ? "text-rose-500" : item.marginDiff && item.marginDiff < 0 ? "text-emerald-500" : "text-slate-500"}`}
                          >
                            {item.marginDiff != null
                              ? item.marginDiff.toLocaleString("en-US", {
                                  maximumFractionDigits: 0,
                                })
                              : "-"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${item.shortDiff && item.shortDiff > 0 ? "text-rose-500" : item.shortDiff && item.shortDiff < 0 ? "text-emerald-500" : "text-slate-500"}`}
                          >
                            {item.shortDiff != null
                              ? item.shortDiff.toLocaleString("en-US", {
                                  maximumFractionDigits: 0,
                                })
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${item.market === "TWSE" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}
                            >
                              {item.market === "TWSE" ? "上市" : "上櫃"}
                            </span>
                          </td>
                          {isScanning && (
                            <td className="px-4 py-3 text-center">
                              {item.status === "scanning" && (
                                <span className="text-indigo-500 font-medium text-xs">
                                  計算中
                                </span>
                              )}
                              {item.status === "passed" && (
                                <span className="text-emerald-500 font-medium text-xs">
                                  符合
                                </span>
                              )}
                              {item.status === "pending" && (
                                <span className="text-slate-400 text-xs">
                                  等待
                                </span>
                              )}
                              {item.status === "failed" && (
                                <span className="text-rose-500 text-xs">
                                  不符
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={isScanning ? 11 : 10}
                        className="px-4 py-16 text-center text-slate-500"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <Search size={32} className="text-slate-300 mb-3" />
                          <p>
                            {isScanning
                              ? "正在篩選中..."
                              : "無符合條件的股票，或您尚未開始篩選。"}
                          </p>
                          {!isScanning &&
                            pool.length > 0 &&
                            displayResults.length === 0 && (
                              <button
                                onClick={handleStartScan}
                                className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium underline"
                              >
                                立即開始篩選
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
