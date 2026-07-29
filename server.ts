import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import YahooFinance from "yahoo-finance2";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

const yahooFinance = new YahooFinance();

const SECTOR_TRANSLATIONS: Record<string, string> = {
  Technology: "科技",
  "Financial Services": "金融",
  "Consumer Cyclical": "非核心消費",
  Healthcare: "醫療保健",
  "Communication Services": "通訊",
  Industrials: "工業",
  "Consumer Defensive": "核心消費",
  Energy: "能源",
  "Basic Materials": "原物料",
  "Real Estate": "房地產",
  Utilities: "公用事業",
};

const INDUSTRY_TRANSLATIONS: Record<string, string> = {
  Semiconductors: "半導體",
  "Semiconductor Equipment & Materials": "半導體設備",
  "Electronic Components": "電子零組件",
  "Computer Hardware": "電腦硬體",
  "Communication Equipment": "通信設備",
  "Insurance - Life": "壽險",
  "Banks - Regional": "銀行",
  "Banks - Diversified": "銀行",
  "Software - Infrastructure": "系統軟體",
  "Software - Application": "應用軟體",
  "Internet Content & Information": "網路服務",
  "Internet Retail": "電子商務",
  "Auto Manufacturers": "汽車製造",
  "Discount Stores": "零售",
  "Consumer Electronics": "消費性電子",
  "Auto Parts": "汽車零組件",
  "Packaged Foods": "食品",
  "Specialty Chemicals": "化學",
  Steel: "鋼鐵",
  "Marine Shipping": "航運",
};

const CUSTOM_GLOBAL_INDUSTRY: Record<string, string> = {
  MU: "記憶體",
  SNDK: "記憶體/儲存",
  STX: "儲存裝置",
  WDC: "儲存裝置",
  NVDA: "IC設計 (GPU)",
  AMD: "IC設計",
  QCOM: "IC設計",
  AVGO: "IC設計",
  ARM: "IC設計",
  MRVL: "IC設計",
  INTC: "半導體製造(IDM)",
  TSM: "晶圓代工",
  ASML: "半導體設備",
  AMAT: "半導體設備",
  LITE: "光通訊",
  CIEN: "網通設備",
  "4062": "IC載板", // IBIDEN
  SMCI: "伺服器",
  DELL: "電腦及週邊",
  HPQ: "電腦及週邊",
};

const CUSTOM_TW_INDUSTRY: Record<string, string> = {
  "2330": "晶圓代工", // 台積電
  "2454": "IC設計", // 聯發科
  "2303": "晶圓代工", // 聯電
  "3711": "封測", // 日月光投控
  "2317": "EMS代工", // 鴻海
  "2308": "電源零組件", // 台達電
  "3034": "IC設計", // 聯詠
  "2379": "IC設計", // 瑞昱
  "3231": "電腦及週邊", // 緯創
  "2382": "電腦及週邊", // 廣達
  "2327": "被動元件", // 國巨
  "3037": "PCB", // 欣興
  "2368": "PCB", // 金像電
  "2383": "銅箔基板", // 台光電
  "3017": "散熱模組", // 奇鋐
  "2345": "網通設備", // 智邦
  "6669": "伺服器", // 緯穎
  "2881": "金控", // 富邦金
  "2891": "金控", // 中信金
  "2882": "金控", // 國泰金
  "2886": "金控", // 兆豐金
  "2884": "金控", // 玉山金
};

async function enrichHoldingsWithSector(holdings: any[]) {
  await Promise.all(
    holdings.map(async (h) => {
      if (!h.symbol) return;
      try {
        // Provide a quick check for US vs TW stocks
        let qSym = h.symbol;
        if (/^[0-9]{4,6}$/.test(qSym)) {
          qSym = `${qSym}.TW`; // assumption, might fail for TWO but we try
        }

        qSym = qSym.replace(/\.US$/i, "");
        qSym = qSym.replace(/\.JP$/i, ".T");

        // Check global custom mappings first
        const globalId = qSym.replace(/\.T$/, "");
        if (CUSTOM_GLOBAL_INDUSTRY[globalId]) {
          h.sector = CUSTOM_GLOBAL_INDUSTRY[globalId];
          return;
        }

        // Apply custom granular categorization for popular Taiwan stocks
        const stockId = qSym.replace(/\.TW$|\.TWO$/, "");
        if (CUSTOM_TW_INDUSTRY[stockId]) {
          h.sector = CUSTOM_TW_INDUSTRY[stockId];
          return;
        }

        let profile = null;
        try {
          profile = (await yahooFinance.quoteSummary(qSym, {
            modules: ["assetProfile"],
          })) as any;
        } catch (e: any) {
          if (qSym.endsWith(".TW")) {
            const fallbackSym = qSym.replace(/\.TW$/, ".TWO");
            try {
              profile = (await yahooFinance.quoteSummary(fallbackSym, {
                modules: ["assetProfile"],
              })) as any;
              h.symbol = fallbackSym; // Update the symbol in holdings to use .TWO
            } catch (e2) {}
          }
        }

        const industry = profile?.assetProfile?.industry;
        const sector = profile?.assetProfile?.sector;

        if (industry && INDUSTRY_TRANSLATIONS[industry]) {
          h.sector = INDUSTRY_TRANSLATIONS[industry];
        } else if (sector) {
          h.sector = SECTOR_TRANSLATIONS[sector] || sector;
        }
      } catch (e) {
        console.log("Sector fetch error for", h.symbol, e);
      }
    }),
  );
  return holdings;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/fear-greed", async (req, res) => {
    try {
      const response = await fetch(
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error("Fear and greed API error", e);
      res.status(500).json({ error: e.message });
    }
  });

  // API Route
  app.get("/api/moneydj/fund", async (req, res) => {
    try {
      const name = req.query.name as string;
      if (!name) return res.status(400).json({ error: "Missing name param" });

      // 嘗試 UTF-8 搜尋 (目前 MoneyDJ yFundSearch.djhtm 支援 UTF-8)
      const searchUrl = `https://www.moneydj.com/funddj/ya/yFundSearch.djhtm?a=${encodeURIComponent(name)}`;

      const fetchOptions = {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow" as RequestRedirect,
      };

      const resp = await fetch(searchUrl, fetchOptions);
      if (!resp.ok)
        throw new Error(`MoneyDJ search failed with status ${resp.status}`);

      const buffer = await resp.arrayBuffer();
      // 嘗試 Big5 解碼 (MoneyDJ 網頁主體通常是 Big5)
      let html = iconv.decode(Buffer.from(buffer), "big5");
      let $ = cheerio.load(html);

      // 如果解碼出來標題是空的，嘗試 UTF-8
      if ($("title").text() === "") {
        html = Buffer.from(buffer).toString("utf8");
        $ = cheerio.load(html);
      }

      // 1. 嘗試從搜尋結果表格直接抓取 (效率最高)
      const rows: string[][] = [];
      $("tr").each((i, el) => {
        const cells = $(el)
          .find("td")
          .map((j, td) => $(td).text().trim())
          .get();
        if (cells.length > 0) rows.push(cells);
      });

      // 尋找最匹配的行
      const matchedRow =
        rows.find((r) => r.some((c) => c.includes(name))) ||
        rows.find((r) => r.some((c) => name.includes(c) && c.length > 2));

      if (matchedRow) {
        // 格式通常是: [名稱, 發行公司, 經理人, 日期(MM/DD), 淨值, ...]
        const dateIdx = matchedRow.findIndex((c) => /^\d{2}\/\d{2}$/.test(c));
        if (dateIdx !== -1 && matchedRow[dateIdx + 1]) {
          const navText = matchedRow[dateIdx + 1].replace(/,/g, "");
          const nav = parseFloat(navText);
          if (!isNaN(nav) && nav > 0) {
            return res.json({ nav, date: matchedRow[dateIdx] });
          }
        }
      }

      // 2. 備份方案：尋找基金詳細頁面連結並進入抓取
      const detailLinks: string[] = [];
      $("a").each((i, el) => {
        const h = $(el).attr("href") || "";
        if (
          h.includes("ya01") ||
          h.includes("ya02") ||
          h.includes("Front.djhtm") ||
          h.includes("yp01")
        ) {
          detailLinks.push(h);
        }
      });

      if (detailLinks.length > 0) {
        let fundUrl = detailLinks[0];
        if (!fundUrl.startsWith("http")) {
          fundUrl = new URL(fundUrl, "https://www.moneydj.com/funddj/ya/").href;
        }

        const fundResp = await fetch(fundUrl, fetchOptions);
        const fundBuffer = await fundResp.arrayBuffer();
        const fundHtml = iconv.decode(Buffer.from(fundBuffer), "big5");
        const $f = cheerio.load(fundHtml);

        // 嘗試多種可能存放淨值的 Class/Selector
        const navText =
          $f(".t3n2").first().text() ||
          $f("td:contains('淨值')").next().text() ||
          $f("span:contains('最新淨值')").next().text();

        const nav = parseFloat(
          navText.replace(/,/g, "").match(/[\d\.]+/)?.[0] || "",
        );
        if (!isNaN(nav) && nav > 0) {
          return res.json({ nav });
        }
      }

      // 找不到
      res.status(404).json({ error: "Fund not found" });
    } catch (e: any) {
      console.error("/api/moneydj/fund error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/twse/prices", async (req, res) => {
    try {
      const resp = await fetch(
        "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
        { signal: AbortSignal.timeout(5000) },
      );
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/twse/pe", async (req, res) => {
    try {
      const resp = await fetch(
        "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL",
        { signal: AbortSignal.timeout(5000) },
      );
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/twse/inst", async (req, res) => {
    try {
      const resp = await fetch(
        "https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALLBUT0999",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Referer: "https://www.twse.com.tw/zh/page/trading/fund/T86.html",
            Accept: "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!resp.ok) {
        throw new Error(`HTTP status ${resp.status}`);
      }
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      console.warn(
        "TWSE Inst API load failed, returning fallback empty data:",
        e.message,
      );
      res.json({ stat: "Fail", data: [], error: e.message });
    }
  });

  app.get("/api/tpex/prices", async (req, res) => {
    try {
      const resp = await fetch(
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
        { signal: AbortSignal.timeout(5000) },
      );
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tpex/pe", async (req, res) => {
    try {
      const resp = await fetch(
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis",
        { signal: AbortSignal.timeout(5000) },
      );
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/twse/margin", async (req, res) => {
    try {
      const resp = await fetch(
        "https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN",
        { signal: AbortSignal.timeout(5000) },
      );
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tpex/margin", async (req, res) => {
    try {
      const resp = await fetch(
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance",
        { signal: AbortSignal.timeout(5000) },
      );
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tpex/inst", async (req, res) => {
    try {
      const resp = await fetch(
        "https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Referer: "https://www.tpex.org.tw/zh-tw/im/fund/t86.html",
            Accept: "application/json, text/javascript, */*; q=0.01",
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!resp.ok) {
        throw new Error(`HTTP status ${resp.status}`);
      }
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      console.warn(
        "TPEx Inst API load failed, returning fallback empty data:",
        e.message,
      );
      res.json({ stat: "Fail", tables: [{ data: [] }], error: e.message });
    }
  });

  app.get("/api/yahoo/quotes", async (req, res) => {
    try {
      const symbolsStr = req.query.symbols as string;
      if (!symbolsStr) return res.json([]);
      const symbols = symbolsStr.split(",");
      const results = await yahooFinance.quote(symbols);
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/twse-etfs", async (req, res) => {
    try {
      const resp = await fetch(
        "https://mis.twse.com.tw/stock/data/all_etf.txt",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        },
      );
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      console.error("/api/twse-etfs error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/yahoo/quote", async (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      if (!symbol)
        return res.status(400).json({ error: "Missing symbol param" });

      let twseName = null;
      let twsePrice = null;
      let twseFallbackClose = null;
      let twseOpen = null;
      let twseHigh = null;
      let twseLow = null;
      let twseVolume = null;
      let twseTime = null;
      if (
        symbol.endsWith(".TW") ||
        symbol.endsWith(".TWO") ||
        /^[0-9]{4,6}[A-Z]?$/i.test(symbol)
      ) {
        try {
          let cleanSym = symbol
            .replace(".TWO", "")
            .replace(".TW", "")
            .toUpperCase();
          let prefixes = symbol.endsWith(".TWO")
            ? ["otc"]
            : symbol.endsWith(".TW")
              ? ["tse", "otc"]
              : ["tse", "otc"];

          for (const prefix of prefixes) {
            const twRes = await fetch(
              `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${prefix}_${cleanSym}.tw&_=${Date.now()}`,
              {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
              },
            );
            const twData = await twRes.json();
            if (
              twData.msgArray &&
              twData.msgArray.length > 0 &&
              twData.msgArray[0].n
            ) {
              const msg = twData.msgArray[0];
              let p = msg.z;
              if (p && p !== "-") twsePrice = parseFloat(p);
              else {
                const bids = msg.b
                  ? msg.b.split("_").filter((x) => x && x !== "-")
                  : [];
                const asks = msg.a
                  ? msg.a.split("_").filter((x) => x && x !== "-")
                  : [];
                if (bids.length > 0) {
                  twsePrice = parseFloat(bids[0]);
                } else if (asks.length > 0) {
                  twsePrice = parseFloat(asks[0]);
                } else if (msg.y && msg.y !== "-") {
                  twsePrice = parseFloat(msg.y);
                }
              }
              if (msg.y && msg.y !== "-") twseFallbackClose = parseFloat(msg.y);

              twseName = msg.n;
              twseOpen = msg.o && msg.o !== "-" ? parseFloat(msg.o) : null;
              twseHigh = msg.h && msg.h !== "-" ? parseFloat(msg.h) : null;
              twseLow = msg.l && msg.l !== "-" ? parseFloat(msg.l) : null;
              twseVolume = msg.v ? parseInt(msg.v, 10) * 1000 : null; // MIS API returns lots, convert to shares to match Yahoo
              twseTime = msg.tlong
                ? Math.floor(parseInt(msg.tlong) / 1000)
                : msg.d
                  ? new Date(
                      `${msg.d.substring(0, 4)}-${msg.d.substring(4, 6)}-${msg.d.substring(6, 8)}T00:00:00+08:00`,
                    ).getTime() / 1000
                  : null;
              break;
            }
          }
        } catch (e) {
          console.error("TWSE direct fetch error:", e);
        }
      }

      const getSafeQuotePrice = async (sym: string) => {
        try {
          const quote = (await yahooFinance.quote(sym)) as any;
          return {
            price:
              quote?.regularMarketPrice != null
                ? quote.regularMarketPrice
                : null,
            shortName: quote?.shortName || quote?.longName,
            postMarketPrice:
              quote?.postMarketPrice != null ? quote.postMarketPrice : null,
            preMarketPrice:
              quote?.preMarketPrice != null ? quote.preMarketPrice : null,
            marketState: quote?.marketState,
            regularMarketOpen: quote?.regularMarketOpen,
            regularMarketDayHigh: quote?.regularMarketDayHigh,
            regularMarketDayLow: quote?.regularMarketDayLow,
            regularMarketVolume: quote?.regularMarketVolume,
            regularMarketTime: quote?.regularMarketTime,
          };
        } catch (err) {
          return {
            price: null,
            shortName: null,
            postMarketPrice: null,
            preMarketPrice: null,
            marketState: null,
          };
        }
      };

      let quoteData = await getSafeQuotePrice(symbol);

      // Fallback for TW
      if (quoteData.price == null && symbol.endsWith(".TW")) {
        const fallbackSymbol = symbol.replace(".TW", ".TWO");
        quoteData = await getSafeQuotePrice(fallbackSymbol);
      }

      res.json({
        regularMarketPrice:
          twsePrice != null
            ? twsePrice
            : quoteData.price != null
              ? quoteData.price
              : twseFallbackClose,
        shortName: twseName || quoteData.shortName,
        postMarketPrice: quoteData.postMarketPrice,
        preMarketPrice: quoteData.preMarketPrice,
        marketState: quoteData.marketState,
        regularMarketOpen:
          twseOpen != null ? twseOpen : quoteData.regularMarketOpen,
        regularMarketDayHigh:
          twseHigh != null ? twseHigh : quoteData.regularMarketDayHigh,
        regularMarketDayLow:
          twseLow != null ? twseLow : quoteData.regularMarketDayLow,
        regularMarketVolume:
          twseVolume != null ? twseVolume : quoteData.regularMarketVolume,
        regularMarketTime:
          twseTime != null ? twseTime : quoteData.regularMarketTime,
      });
    } catch (e: any) {
      console.error("/api/yahoo/quote error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/yahoo/summaryDetail", async (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      if (!symbol)
        return res.status(400).json({ error: "Missing symbol param" });

      const getSafeSummaryNav = async (sym: string) => {
        try {
          const summary = (await yahooFinance.quoteSummary(sym, {
            modules: ["summaryDetail"],
          })) as any;
          const nav = summary?.summaryDetail?.navPrice;
          return { nav: nav != null ? nav : null, error: null };
        } catch (e: any) {
          return { nav: null, error: e.message };
        }
      };

      let result = await getSafeSummaryNav(symbol);

      if (result.nav == null && symbol.endsWith(".TW")) {
        const fallbackSymbol = symbol.replace(".TW", ".TWO");
        const fallbackResult = await getSafeSummaryNav(fallbackSymbol);
        if (fallbackResult.nav != null) {
          result = fallbackResult;
        }
      }

      res.json({
        nav: result.nav,
        error: result.nav == null ? result.error : undefined,
      });
    } catch (e: any) {
      console.error("/api/yahoo/summaryDetail error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/yahoo/history", async (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      const period1 = parseInt(req.query.period1 as string); // timestamp
      const period2 = parseInt(req.query.period2 as string); // timestamp
      const interval = (req.query.interval as any) || "1d";

      if (!symbol || !period1 || !period2) {
        return res
          .status(400)
          .json({ error: "Missing required params: symbol, period1, period2" });
      }

      const queryOptions = {
        period1: period1,
        period2: period2,
        interval: interval,
      };

      console.log(`Fetching history for ${symbol} with options:`, queryOptions);

      // Add manual split overrides for symbols Yahoo fails to report
      const KNOWN_SPLITS: Record<
        string,
        { date: string | number; ratio: number }[]
      > = {
        "0050.TW": [{ date: "2025-06-11", ratio: 4 }],
      };

      let dynamicSplits: { date: string | number; ratio: number }[] = [];
      try {
        const splitsUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=1mo&events=splits`;
        const splitsRes = await fetch(splitsUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const splitsData = await splitsRes.json();
        const fetchedSplits = splitsData.chart?.result?.[0]?.events?.splits;
        if (fetchedSplits) {
          for (const [key, splitObj] of Object.entries(fetchedSplits)) {
            const s = splitObj as any;
            if (s.numerator && s.denominator && s.date) {
              dynamicSplits.push({
                date: s.date * 1000, // convert UNIX timestamp to ms
                ratio: s.numerator / s.denominator,
              });
            }
          }
        }
      } catch (e) {
        console.error(`Failed to fetch dynamic splits for ${symbol}:`, e);
      }

      const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${queryOptions.period1}&period2=${queryOptions.period2}&interval=${interval === "1mo" ? "1mo" : interval === "1wk" ? "1wk" : "1d"}&events=div,splits`;
      const chartRes = await fetch(chartUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const chartData = await chartRes.json();

      const result = chartData.chart?.result?.[0];
      if (result && result.timestamp && result.timestamp.length > 0) {
        const timestamps = result.timestamp;
        const quote = result.indicators?.quote?.[0] || {};
        let opens = quote.open || [];
        let highs = quote.high || [];
        let lows = quote.low || [];
        let closes = quote.close || [];
        let volumes = quote.volume || [];

        // Fallback algorithm for Yahoo's "null close on current day" bug
        if (timestamps && timestamps.length > 0) {
          const lastIdx = timestamps.length - 1;
          if (
            closes[lastIdx] == null &&
            opens[lastIdx] != null &&
            result.meta?.regularMarketPrice != null
          ) {
            closes[lastIdx] = result.meta.regularMarketPrice;
          }
        }

        const adjCloses = result.indicators?.adjclose?.[0]?.adjclose || [
          ...closes,
        ];
        if (timestamps && timestamps.length > 0) {
          const lastIdx = timestamps.length - 1;
          if (adjCloses[lastIdx] == null && closes[lastIdx] != null) {
            adjCloses[lastIdx] = closes[lastIdx];
          }
        }

        // Apply manual and dynamic un-adjustment for splits
        const allSplitsForSymbol = [...(KNOWN_SPLITS[symbol] || [])];
        for (const ds of dynamicSplits) {
          const dsTime = ds.date as number;
          const isDuplicate = allSplitsForSymbol.some((ks) => {
            const ksTime =
              typeof ks.date === "number"
                ? ks.date
                : new Date(ks.date).getTime();
            return Math.abs(ksTime - dsTime) < 3 * 24 * 60 * 60 * 1000;
          });
          if (!isDuplicate) {
            allSplitsForSymbol.push(ds);
          }
        }

        for (const split of allSplitsForSymbol) {
          const splitTime =
            typeof split.date === "number"
              ? split.date
              : new Date(split.date).getTime();
          for (let i = 0; i < timestamps.length; i++) {
            if (timestamps[i] * 1000 < splitTime) {
              if (opens[i]) opens[i] *= split.ratio;
              if (highs[i]) highs[i] *= split.ratio;
              if (lows[i]) lows[i] *= split.ratio;
              if (closes[i]) closes[i] *= split.ratio;
            }
          }
        }

        return res.json({
          meta: { symbol: symbol },
          timestamp: timestamps,
          indicators: {
            quote: [
              {
                open: opens,
                high: highs,
                low: lows,
                close: closes,
                volume: volumes,
              },
            ],
            adjclose: [{ adjclose: adjCloses }],
          },
        });
      } else {
        return res.json({
          meta: { symbol },
          timestamp: [],
          indicators: { quote: [], adjclose: [] },
        });
      }
    } catch (e: any) {
      console.error(`/api/yahoo/history error for ${req.query.symbol}:`, e);
      res.status(500).json({ error: e.message, symbol: req.query.symbol });
    }
  });

  app.get("/api/etf/holdings", async (req, res) => {
    try {
      let symbol = req.query.symbol as string;
      if (!symbol)
        return res.status(400).json({ error: "Missing symbol param" });

      if (symbol === "00361L" || symbol === "00361L.TW") {
        symbol = "00631L.TW";
      }

      const isTW =
        symbol.endsWith(".TW") ||
        symbol.endsWith(".TWO") ||
        /^[0-9]{4,6}$/.test(symbol);

      if (isTW) {
        // Use MoneyDJ Web Scraping for TW Holdings
        const mdjSymbol = symbol.split(".")[0]; // Handle '0050.TW' -> '0050'
        const mdjUrl = `https://www.moneydj.com/ETF/X/Basic/Basic0007.xdjhtm?etfid=${mdjSymbol}.TW`;
        const fetchOptions = {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        };

        try {
          const resp = await fetch(mdjUrl, fetchOptions);
          if (resp.ok) {
            const html = await resp.text();
            let $ = cheerio.load(html);

            const holdings: any[] = [];
            $("table").each((i, el) => {
              let trs = $(el).find("tr");
              let headerText = $(trs.eq(0)).text().replace(/\s+/g, "");
              if (headerText.includes("名稱") && headerText.includes("比例")) {
                trs.each((j, tr) => {
                  if (j === 0) return; // skip header
                  const cells = $(tr).find("td");
                  if (cells.length >= 2) {
                    let name = cells.eq(0).text().trim();
                    let weightStr = cells.eq(1).text().trim(); // typically index 1 is 比例
                    let weight = parseFloat(weightStr);

                    // Clean up symbol from name, e.g. "台積電(2330.TW)" -> "台積電"
                    let cleanSymbol = "";
                    const symMatch = name.match(/\((.*?)\)/);
                    if (symMatch) {
                      cleanSymbol = symMatch[1];
                      name = name.replace(/\(.*?\)/, "").trim();
                    }

                    if (name && !isNaN(weight)) {
                      holdings.push({
                        symbol: cleanSymbol,
                        name: name,
                        weight: weight,
                      });
                    }
                  }
                });
              }
            });

            if (holdings.length > 0) {
              // Get the ETF's own name from Yahoo quickly just for completeness
              let etfName = symbol;
              let etfYield = undefined;
              let etfExpenseRatio = undefined;

              try {
                const titleText = $("title").text().trim();
                const titleMatch = titleText.match(/^(.*?)-/);
                if (titleMatch && titleMatch[1]) {
                  etfName = titleMatch[1].trim();
                }

                const summary = (await yahooFinance.quoteSummary(symbol, {
                  modules: ["price", "summaryDetail"],
                })) as any;
                if (
                  etfName === symbol &&
                  (summary?.price?.longName || summary?.price?.shortName)
                ) {
                  etfName = summary.price.longName || summary.price.shortName;
                }
                if (summary?.summaryDetail) {
                  etfYield =
                    summary.summaryDetail.yield ||
                    summary.summaryDetail.trailingAnnualDividendYield;
                  etfExpenseRatio =
                    summary.summaryDetail.annualReportExpenseRatio;
                }
              } catch (e) {
                console.warn("yahoo fetch inside mdj block failed", e);
              }

              console.log(
                "MDJ Block etfYield:",
                etfYield,
                " expenseRatio:",
                etfExpenseRatio,
              );

              await enrichHoldingsWithSector(holdings);
              return res.json({
                ticker: symbol,
                name: etfName,
                updatedAt: new Date().toISOString(),
                holdings: holdings.sort((a, b) => b.weight - a.weight),
                yield: etfYield,
                expenseRatio: etfExpenseRatio,
              });
            }
          }
        } catch (e) {
          console.warn(
            "MoneyDJ TW Web Scraping failed, falling back to API",
            e,
          );
        }

        // Fallback to Yahoo API if Scraping fails
        try {
          const summary = (await yahooFinance.quoteSummary(symbol, {
            modules: ["topHoldings", "summaryDetail", "price"],
          })) as any;
          if (summary?.topHoldings?.holdings) {
            const holdings = summary.topHoldings.holdings.map((h: any) => ({
              symbol: h.symbol,
              name: h.holdingName,
              weight: h.holdingPercent * 100,
            }));
            await enrichHoldingsWithSector(holdings);

            let etfYield = undefined;
            let expenseRatio = undefined;
            if (summary?.summaryDetail) {
              etfYield =
                summary.summaryDetail.yield ||
                summary.summaryDetail.trailingAnnualDividendYield;
              expenseRatio = summary.summaryDetail.annualReportExpenseRatio;
            }
            console.log(
              "Yahoo fallback etfYield:",
              etfYield,
              "expenseRatio:",
              expenseRatio,
            );

            return res.json({
              ticker: symbol,
              name:
                summary.price?.longName || summary.price?.shortName || symbol,
              updatedAt: new Date().toISOString(),
              holdings,
              yield: etfYield,
              expenseRatio: expenseRatio,
            });
          }
        } catch (e) {
          console.error("Yahoo TW holdings failed:", e);
        }

        return res.status(404).json({ error: "無法取得該 ETF 的持股資料" });
      } else {
        // US ETF - Use Yahoo with Chinese language preference
        try {
          // Yahoo Finance supports lang parameter in some implementations
          const summary = (await yahooFinance.quoteSummary(symbol, {
            modules: ["topHoldings", "summaryDetail", "price"],
          })) as any;

          if (!summary?.topHoldings?.holdings) {
            return res
              .status(404)
              .json({ error: "需有 TopHoldings 模組始能查看持股明細" });
          }

          const holdings = summary.topHoldings.holdings.map((h: any) => ({
            symbol: h.symbol,
            name: h.holdingName, // Try to see if this is localized
            weight: h.holdingPercent * 100,
          }));
          await enrichHoldingsWithSector(holdings);

          let etfYield = undefined;
          let etfExpenseRatio = undefined;
          if (summary?.summaryDetail) {
            etfYield =
              summary.summaryDetail.yield ||
              summary.summaryDetail.trailingAnnualDividendYield;
            etfExpenseRatio = summary.summaryDetail.annualReportExpenseRatio;
          }

          return res.json({
            ticker: symbol,
            name: summary.price?.longName || summary.price?.shortName || symbol,
            updatedAt: new Date().toISOString(),
            holdings,
            expenseRatio: etfExpenseRatio,
            yield: etfYield,
          });
        } catch (e) {
          // Fallback if the extended options fail
          const summary = (await yahooFinance.quoteSummary(symbol, {
            modules: ["topHoldings", "summaryDetail", "price"],
          })) as any;
          if (!summary?.topHoldings?.holdings)
            throw new Error("Holdings not found");

          const holdings = summary.topHoldings.holdings.map((h: any) => ({
            symbol: h.symbol,
            name: h.holdingName,
            weight: h.holdingPercent * 100,
          }));
          await enrichHoldingsWithSector(holdings);

          let etfYield = undefined;
          let etfExpenseRatio = undefined;
          if (summary?.summaryDetail) {
            etfYield =
              summary.summaryDetail.yield ||
              summary.summaryDetail.trailingAnnualDividendYield;
            etfExpenseRatio = summary.summaryDetail.annualReportExpenseRatio;
          }

          return res.json({
            ticker: symbol,
            name: summary.price?.longName || summary.price?.shortName || symbol,
            updatedAt: new Date().toISOString(),
            holdings,
            expenseRatio: etfExpenseRatio,
            yield: etfYield,
          });
        }
      }
    } catch (e: any) {
      console.error("/api/etf/holdings error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
