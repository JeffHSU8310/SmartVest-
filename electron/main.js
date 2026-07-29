
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const YahooFinance = require('yahoo-finance2').default; // Get the class
const yahooFinance = new YahooFinance();
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// 判斷是否為開發模式
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// [路徑設定 - 修正版]
// 針對 Portable (免安裝) 模式優化
// 如果是打包後的 EXE，process.execPath 是 EXE 的路徑，我們取其目錄
// 如果是開發模式，使用專案根目錄
let BASE_PATH = '';
if (isDev) {
    BASE_PATH = process.cwd();
} else {
    // 優先嘗試讀取 PORTABLE_EXECUTABLE_DIR (Electron Builder Portable 專用環境變數)
    // 如果沒有，則使用執行檔所在目錄
    BASE_PATH = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
}

const DATA_DIR = path.join(BASE_PATH, 'SmartVest_Data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LOG_FILE = path.join(DATA_DIR, 'system_log.txt');

// 輔助：寫入系統日誌
function writeLog(message) {
    try {
        const timestamp = new Date().toLocaleString();
        const logMsg = `[${timestamp}] ${message}\n`;
        // 確保目錄存在
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, logMsg);
        console.log(logMsg.trim());
    } catch (e) {
        console.error("Log failed", e);
    }
}

// 初始化：確保資料夾與檔案存在
function ensureFileSystem() {
    try {
        writeLog(`System Start. Base Path: ${BASE_PATH}`);
        
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            writeLog(`Created Data Dir: ${DATA_DIR}`);
        }
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
            writeLog(`Created Backup Dir: ${BACKUP_DIR}`);
        }

        // [關鍵修復]：如果主資料檔不存在，立即建立一個空的初始檔案
        if (!fs.existsSync(DATA_FILE)) {
            const initialData = {
                appTitle: "SmartVest",
                stocks: [],
                transactions: [],
                accounts: [],
                note: "Initialized by System"
            };
            fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
            writeLog(`Created initial data.json at ${DATA_FILE}`);
        } else {
            writeLog(`Found existing data.json at ${DATA_FILE}`);
        }
    } catch (err) {
        writeLog(`FileSystem Init Error: ${err.message}`);
    }
}

function createWindow() {
  const preloadPath = isDev 
    ? path.join(__dirname, 'preload.js') 
    : path.join(app.getAppPath(), 'electron', 'preload.js');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "SmartVest 存股記帳",
    icon: path.join(__dirname, '../public/vite.svg'), 
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
  });

  win.webContents.on('preload-error', (event, preloadPath, error) => {
    writeLog(`PRELOAD ERROR: ${preloadPath} - ${error.message}`);
    dialog.showErrorBox('Preload Script Failed', `Path: ${preloadPath}\nError: ${error.message}\n\nPlease report this error.`);
  });

  if (isDev) {
    win.loadURL('http://localhost:5173').catch(e => {
      console.error('Error loading URL:', e);
      setTimeout(() => win.loadURL('http://localhost:5173'), 1000);
    });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ensureFileSystem(); // 程式一啟動，立刻檢查/建立檔案
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC 處理 ---

ipcMain.handle('load-data', async () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
    return null;
  } catch (err) {
    writeLog(`Load Error: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('open-backup-folder', async () => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    await shell.openPath(BACKUP_DIR);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-data-as', async (event, data) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultFileName = `smartvest_data_${todayStr}.json`;
    
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: '另存新檔',
      defaultPath: path.join(BASE_PATH, defaultFileName),
      filters: [
        { name: 'JSON Files', extensions: ['json'] }
      ]
    });

    if (canceled || !filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    writeLog(`Save As Success: Saved to ${filePath}`);
    
    return { success: true, filePath, fileName: path.basename(filePath) };
  } catch (err) {
    writeLog(`Save As Error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-data-file', async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: '開啟舊檔',
      defaultPath: BASE_PATH,
      filters: [
        { name: 'JSON Files', extensions: ['json'] }
      ],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    writeLog(`Open File Success: Loaded from ${filePath}`);
    
    return { success: true, data, filePath, fileName: path.basename(filePath) };
  } catch (err) {
    writeLog(`Open File Error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-data', async (event, data) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    
    // 寫入主資料檔
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    
    // 建立自動備份 (直接覆蓋單一備份檔，避免檔案過多)
    const backupFile = path.join(BACKUP_DIR, 'data_backup.json');
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf-8');

    return { success: true };
  } catch (err) {
    writeLog(`Save Error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

const SCREENER_POOL_FILE = path.join(DATA_DIR, 'screener_pool.json');

ipcMain.handle('load-screener-pool', async () => {
  try {
    if (fs.existsSync(SCREENER_POOL_FILE)) {
      return JSON.parse(fs.readFileSync(SCREENER_POOL_FILE, 'utf-8'));
    }
    return null;
  } catch (err) {
    writeLog(`Load Screener Pool Error: ${err.message}`);
    return null;
  }
});

ipcMain.handle('save-screener-pool', async (event, data) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SCREENER_POOL_FILE, JSON.stringify(data), 'utf-8');
    return { success: true };
  } catch (err) {
    writeLog(`Save Screener Pool Error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// API Proxy handlers for Electron Environment (replaces Express endpoints)

ipcMain.handle('fetch-fear-greed', async () => {
    try {
        const resp = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        });
        if (!resp.ok) {
            throw new Error(`HTTP error! status: ${resp.status}`);
        }
        const data = await resp.json();
        return { data };
    } catch (e) {
        writeLog(`fetch-fear-greed Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-twse', async () => {
    try {
      const resp = await fetch("https://mis.twse.com.tw/stock/data/all_etf.txt", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const data = await resp.json();
      return { data };
    } catch (e) {
      writeLog(`fetch-twse Error: ${e.message}`);
      return { error: e.message };
    }
});

ipcMain.handle('fetch-yahoo-quote', async (event, symbol) => {
    try {
      if (!symbol) return { error: "Missing symbol param" };

      let twseName = null;
      let twsePrice = null;
      let twseFallbackClose = null;
      let twseOpen = null;
      let twseHigh = null;
      let twseLow = null;
      let twseVolume = null;
      let twseTime = null;

      if (symbol.endsWith(".TW") || symbol.endsWith(".TWO") || /^[0-9]{4,6}[A-Z]?$/i.test(symbol)) {
          try {
              let cleanSym = symbol.replace('.TWO', '').replace('.TW', '').toUpperCase();
              let prefixes = symbol.endsWith(".TWO") ? ['otc'] : (symbol.endsWith(".TW") ? ['tse', 'otc'] : ['tse', 'otc']);
              
              for (const prefix of prefixes) {
                  const twRes = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${prefix}_${cleanSym}.tw&_=${Date.now()}`);
                  const twData = await twRes.json();
                  if (twData.msgArray && twData.msgArray.length > 0) {
                      const msg = twData.msgArray[0];
                      let p = msg.z;
                      if (p && p !== '-') twsePrice = parseFloat(p);
                      else {
                          const bids = msg.b ? msg.b.split('_').filter(x => x && x !== '-') : [];
                          const asks = msg.a ? msg.a.split('_').filter(x => x && x !== '-') : [];
                          if (bids.length > 0) {
                              twsePrice = parseFloat(bids[0]);
                          } else if (asks.length > 0) {
                              twsePrice = parseFloat(asks[0]);
                          } else if (msg.y && msg.y !== '-') {
                              twsePrice = parseFloat(msg.y);
                          }
                      }
                      
                      if (msg.y && msg.y !== '-') twseFallbackClose = parseFloat(msg.y);
                      twseName = msg.n;
                      twseOpen = msg.o && msg.o !== '-' ? parseFloat(msg.o) : null;
                      twseHigh = msg.h && msg.h !== '-' ? parseFloat(msg.h) : null;
                      twseLow = msg.l && msg.l !== '-' ? parseFloat(msg.l) : null;
                      twseVolume = msg.v ? parseInt(msg.v, 10) * 1000 : null; // MIS API returns lots, scale to shares
                      twseTime = msg.tlong ? Math.floor(parseInt(msg.tlong) / 1000) : (msg.d ? new Date(`${msg.d.substring(0,4)}-${msg.d.substring(4,6)}-${msg.d.substring(6,8)}T00:00:00+08:00`).getTime()/1000 : null);
                      break;
                  }
              }
          } catch(e) {
              writeLog(`TWSE direct fetch error: ${e.message}`);
          }
      }

      const getSafeQuotePrice = async (sym) => {
          try {
              const quote = await yahooFinance.quote(sym);
              return { 
                price: quote?.regularMarketPrice != null ? quote.regularMarketPrice : null, 
                name: quote?.shortName || quote?.longName || null,
                postMarketPrice: quote?.postMarketPrice != null ? quote.postMarketPrice : null,
                preMarketPrice: quote?.preMarketPrice != null ? quote.preMarketPrice : null,
                marketState: quote?.marketState,
                regularMarketOpen: quote?.regularMarketOpen,
                regularMarketDayHigh: quote?.regularMarketDayHigh,
                regularMarketDayLow: quote?.regularMarketDayLow,
                regularMarketVolume: quote?.regularMarketVolume,
                regularMarketTime: quote?.regularMarketTime,
                error: null 
              };
          } catch (err) {
              writeLog(`Yahoo Quote Error for ${sym}: ${err.message}`);
              return { price: null, name: null, postMarketPrice: null, preMarketPrice: null, marketState: null, error: err.message };
          }
      };

      let result = await getSafeQuotePrice(symbol);
      let dataOut = {
          regularMarketPrice: twsePrice != null ? twsePrice : (result.price != null ? result.price : twseFallbackClose),
          shortName: twseName || result.name,
          postMarketPrice: result.postMarketPrice,
          preMarketPrice: result.preMarketPrice,
          marketState: result.marketState,
          regularMarketOpen: twseOpen != null ? twseOpen : result.regularMarketOpen,
          regularMarketDayHigh: twseHigh != null ? twseHigh : result.regularMarketDayHigh,
          regularMarketDayLow: twseLow != null ? twseLow : result.regularMarketDayLow,
          regularMarketVolume: twseVolume != null ? twseVolume : result.regularMarketVolume,
          regularMarketTime: twseTime != null ? twseTime : result.regularMarketTime
      };
      let errStr = result.error;
      
      // Fallback for TW
      if (dataOut.regularMarketPrice == null && symbol.endsWith(".TW")) {
          const fallbackSymbol = symbol.replace(".TW", ".TWO");
          result = await getSafeQuotePrice(fallbackSymbol);
          dataOut.regularMarketPrice = result.price;
          dataOut.shortName = result.name;
          dataOut.postMarketPrice = result.postMarketPrice;
          dataOut.preMarketPrice = result.preMarketPrice;
          dataOut.marketState = result.marketState;
          dataOut.regularMarketOpen = result.regularMarketOpen;
          dataOut.regularMarketDayHigh = result.regularMarketDayHigh;
          dataOut.regularMarketDayLow = result.regularMarketDayLow;
          dataOut.regularMarketVolume = result.regularMarketVolume;
          dataOut.regularMarketTime = result.regularMarketTime;
          if (result.error) errStr = errStr ? errStr + " | " + result.error : result.error;
      }
      
      return { data: dataOut, error: dataOut.regularMarketPrice == null ? errStr : undefined };
    } catch (e) {
      writeLog(`fetch-yahoo-quote Error: ${e.message}`);
      return { error: e.message };
    }
});

ipcMain.handle('fetch-yahoo-summary', async (event, symbol) => {
    try {
      if (!symbol) return { error: "Missing symbol param" };

      const getSafeSummaryNav = async (sym) => {
          try {
              const summary = await yahooFinance.quoteSummary(sym, { modules: ["summaryDetail"] });
              const nav = summary?.summaryDetail?.navPrice;
              return { nav: nav != null ? nav : null, error: null };
          } catch (e) {
              writeLog(`Yahoo Summary Error for ${sym}: ${e.message}`);
              return { nav: null, error: e.message };
          }
      };

      let result = await getSafeSummaryNav(symbol);
      let nav = result.nav;
      let errStr = result.error;

      // Fallback for TW
      if (nav == null && symbol.endsWith(".TW")) {
          const fallbackSymbol = symbol.replace(".TW", ".TWO");
          result = await getSafeSummaryNav(fallbackSymbol);
          nav = result.nav;
          if (result.error) errStr = errStr ? errStr + " | " + result.error : result.error;
      }

      return { data: { nav: nav }, error: nav == null ? errStr : undefined };
    } catch (e) {
      writeLog(`fetch-yahoo-summary Error: ${e.message}`);
      return { error: e.message };
    }
});

ipcMain.handle('fetch-etf-holdings', async (event, symbol) => {
    try {
        if (!symbol) return { error: "Missing symbol param" };

        let qSymbol = symbol;
        if (qSymbol === '00361L' || qSymbol === '00361L.TW') {
            qSymbol = '00631L.TW';
        }

        const isTW = qSymbol.endsWith(".TW") || qSymbol.endsWith(".TWO") || /^[0-9]{4,6}$/.test(qSymbol);

        const SECTOR_TRANSLATIONS = {
          'Technology': '科技',
          'Financial Services': '金融',
          'Consumer Cyclical': '非核心消費',
          'Healthcare': '醫療保健',
          'Communication Services': '通訊',
          'Industrials': '工業',
          'Consumer Defensive': '核心消費',
          'Energy': '能源',
          'Basic Materials': '原物料',
          'Real Estate': '房地產',
          'Utilities': '公用事業'
        };

        const INDUSTRY_TRANSLATIONS = {
          'Semiconductors': '半導體',
          'Semiconductor Equipment & Materials': '半導體設備',
          'Electronic Components': '電子零組件',
          'Computer Hardware': '電腦硬體',
          'Communication Equipment': '通信設備',
          'Insurance - Life': '壽險',
          'Banks - Regional': '銀行',
          'Banks - Diversified': '銀行',
          'Software - Infrastructure': '系統軟體',
          'Software - Application': '應用軟體',
          'Internet Content & Information': '網路服務',
          'Internet Retail': '電子商務',
          'Auto Manufacturers': '汽車製造',
          'Discount Stores': '零售',
          'Consumer Electronics': '消費性電子',
          'Auto Parts': '汽車零組件',
          'Packaged Foods': '食品',
          'Specialty Chemicals': '化學',
          'Steel': '鋼鐵',
          'Marine Shipping': '航運',
        };

        const CUSTOM_GLOBAL_INDUSTRY = {
          'MU': '記憶體',
          'SNDK': '記憶體/儲存',
          'STX': '儲存裝置',
          'WDC': '儲存裝置',
          'NVDA': 'IC設計 (GPU)',
          'AMD': 'IC設計',
          'QCOM': 'IC設計',
          'AVGO': 'IC設計',
          'ARM': 'IC設計',
          'MRVL': 'IC設計',
          'INTC': '半導體製造(IDM)',
          'TSM': '晶圓代工',
          'ASML': '半導體設備',
          'AMAT': '半導體設備',
          'LITE': '光通訊',
          'CIEN': '網通設備',
          '4062': 'IC載板', // IBIDEN
          'SMCI': '伺服器',
          'DELL': '電腦及週邊',
          'HPQ': '電腦及週邊',
        };

        const CUSTOM_TW_INDUSTRY = {
          '2330': '晶圓代工', // 台積電
          '2454': 'IC設計', // 聯發科
          '2303': '晶圓代工', // 聯電
          '3711': '封測', // 日月光投控
          '2317': 'EMS代工', // 鴻海
          '2308': '電源零組件', // 台達電
          '3034': 'IC設計', // 聯詠
          '2379': 'IC設計', // 瑞昱
          '3231': '電腦及週邊', // 緯創
          '2382': '電腦及週邊', // 廣達
          '2327': '被動元件', // 國巨
          '3037': 'PCB', // 欣興
          '2368': 'PCB', // 金像電
          '2383': '銅箔基板', // 台光電
          '3017': '散熱模組', // 奇鋐
          '2345': '網通設備', // 智邦
          '6669': '伺服器', // 緯穎
          '2881': '金控', // 富邦金
          '2891': '金控', // 中信金
          '2882': '金控', // 國泰金
          '2886': '金控', // 兆豐金
          '2884': '金控', // 玉山金
        };

        async function enrichHoldingsWithSector(holdings) {
            await Promise.all(holdings.map(async (h) => {
                if (!h.symbol) return;
                try {
                    let qSym = h.symbol;
                    if (/^[0-9]{4,6}$/.test(qSym)) {
                        qSym = `${qSym}.TW`;
                    }
                    
                    qSym = qSym.replace(/\.US$/i, '');
                    qSym = qSym.replace(/\.JP$/i, '.T');

                    const globalId = qSym.replace(/\.T$/, '');
                    if (CUSTOM_GLOBAL_INDUSTRY[globalId]) {
                        h.sector = CUSTOM_GLOBAL_INDUSTRY[globalId];
                        return;
                    }

                    const stockId = qSym.replace(/\.TW$|\.TWO$/, '');
                    if (CUSTOM_TW_INDUSTRY[stockId]) {
                        h.sector = CUSTOM_TW_INDUSTRY[stockId];
                        return;
                    }

                    const profile = await yahooFinance.quoteSummary(qSym, { modules: ['assetProfile'] });
                    const industry = profile?.assetProfile?.industry;
                    const sector = profile?.assetProfile?.sector;
                    
                    if (industry && INDUSTRY_TRANSLATIONS[industry]) {
                        h.sector = INDUSTRY_TRANSLATIONS[industry];
                    } else if (sector) {
                        h.sector = SECTOR_TRANSLATIONS[sector] || sector;
                    }
                } catch (e) {
                    // ignore
                }
            }));
            return holdings;
        }

        if (isTW) {
            const mdjSymbol = qSymbol.split('.')[0];
            const mdjUrl = `https://www.moneydj.com/ETF/X/Basic/Basic0007.xdjhtm?etfid=${mdjSymbol}.TW`;
            
            try {
                const resp = await fetch(mdjUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
                if (resp.ok) {
                    const html = await resp.text();
                    let $ = cheerio.load(html);
                    
                    const holdings = [];
                    $('table').each((i, el) => {
                       let trs = $(el).find('tr');
                       let headerText = $(trs.eq(0)).text().replace(/\s+/g, '');
                       if (headerText.includes('名稱') && headerText.includes('比例')) {
                           trs.each((j, tr) => {
                               if (j === 0) return;
                               const cells = $(tr).find('td');
                               if (cells.length >= 2) {
                                   let name = cells.eq(0).text().trim();
                                   let weightStr = cells.eq(1).text().trim();
                                   let weight = parseFloat(weightStr);
                                   
                                   let cleanSymbol = "";
                                   const symMatch = name.match(/\((.*?)\)/);
                                   if (symMatch) {
                                       cleanSymbol = symMatch[1];
                                       name = name.replace(/\(.*?\)/, '').trim();
                                   }
                                   
                                   if (name && !isNaN(weight)) {
                                       holdings.push({
                                           symbol: cleanSymbol,
                                           name: name,
                                           weight: weight
                                       });
                                   }
                               }
                           });
                       }
                    });

                    if (holdings.length > 0) {
                        let etfName = qSymbol;
                        let etfYield = undefined;
                        let etfExpenseRatio = undefined;

                        try {
                            const titleText = $('title').text().trim();
                            const titleMatch = titleText.match(/^(.*?)-/);
                            if (titleMatch && titleMatch[1]) {
                                etfName = titleMatch[1].trim();
                            }
                            const summary = await yahooFinance.quoteSummary(qSymbol, { modules: ['price', 'summaryDetail'] });
                            if (etfName === qSymbol && summary?.price?.shortName) etfName = summary.price.shortName;
                            
                            if (summary?.summaryDetail) {
                                etfYield = summary.summaryDetail.yield || summary.summaryDetail.trailingAnnualDividendYield;
                                etfExpenseRatio = summary.summaryDetail.annualReportExpenseRatio;
                            }
                        } catch(e) {}
                        
                        await enrichHoldingsWithSector(holdings);

                        return {
                            data: {
                                ticker: qSymbol,
                                name: etfName,
                                updatedAt: new Date().toISOString(),
                                holdings: holdings.sort((a, b) => b.weight - a.weight),
                                yield: etfYield,
                                expenseRatio: etfExpenseRatio
                            }
                        };
                    }
                }
            } catch (e) {
                writeLog(`twse scraping failed in electron: ${e.message}`);
            }
        }

        // fallback or US
        try {
            const summary = await yahooFinance.quoteSummary(qSymbol, { modules: ["topHoldings", "summaryDetail", "price"] });
            if (summary?.topHoldings?.holdings) {
                const holdings = summary.topHoldings.holdings.map((h) => ({
                    symbol: h.symbol,
                    name: h.holdingName,
                    weight: h.holdingPercent * 100
                }));
                await enrichHoldingsWithSector(holdings);
                
                let etfYield = undefined;
                let expenseRatio = undefined;
                if (summary?.summaryDetail) {
                    etfYield = summary.summaryDetail.yield || summary.summaryDetail.trailingAnnualDividendYield;
                    expenseRatio = summary.summaryDetail.annualReportExpenseRatio;
                }

                return {
                    data: {
                        ticker: qSymbol,
                        name: summary.price?.longName || summary.price?.shortName || qSymbol,
                        updatedAt: new Date().toISOString(),
                        holdings,
                        yield: etfYield,
                        expenseRatio: expenseRatio
                    }
                };
            } else {
                return { error: 'Found no holdings for ' + qSymbol };
            }
        } catch (e) {
            return { error: e.message };
        }
    } catch(e) {
        return { error: e.message };
    }
});

ipcMain.handle('fetch-yahoo-history', async (event, options) => {
    try {
        const { symbol, period1, period2, interval } = options;
        if (!symbol) return { error: "Missing symbol" };
        
        // Transform interval if needed (yahoo-finance2 expects specific strings)
        let queryOptions = {
            period1: new Date(Number(period1) * 1000), // Convert to Date
            period2: new Date(Number(period2) * 1000), // Convert to Date
            interval: interval || '1mo'
        };

        writeLog(`Electron fetching history for ${symbol} with options: ${JSON.stringify(queryOptions)}`);
        
        // Add manual split overrides for symbols Yahoo fails to report
      const KNOWN_SPLITS = {
          "0050.TW": [
              { date: '2025-06-11', ratio: 4 }
          ]
      };

      let dynamicSplits = [];
      try {
          const splitsUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=1mo&events=splits`;
          const splitsRes = await fetch(splitsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const splitsData = await splitsRes.json();
          const fetchedSplits = splitsData.chart?.result?.[0]?.events?.splits;
          if (fetchedSplits) {
              for (const [key, splitObj] of Object.entries(fetchedSplits)) {
                  const s = splitObj;
                  if (s.numerator && s.denominator && s.date) {
                      dynamicSplits.push({
                          date: s.date * 1000, // convert UNIX timestamp to ms
                          ratio: s.numerator / s.denominator
                      });
                  }
              }
          }
      } catch (e) {
          writeLog(`Failed to fetch dynamic splits for ${symbol}: ${e.message}`);
      }

        const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval === '1mo' ? '1mo' : (interval === '1wk' ? '1wk' : '1d')}&events=div,splits`;
        const chartRes = await fetch(chartUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
            if (timestamps.length > 0) {
                const lastIdx = timestamps.length - 1;
                if (closes[lastIdx] == null && opens[lastIdx] != null && result.meta?.regularMarketPrice != null) {
                    closes[lastIdx] = result.meta.regularMarketPrice;
                }
            }
            
            const adjCloses = result.indicators?.adjclose?.[0]?.adjclose || [...closes];
            if (timestamps.length > 0) {
                const lastIdx = timestamps.length - 1;
                if (adjCloses[lastIdx] == null && closes[lastIdx] != null) {
                    adjCloses[lastIdx] = closes[lastIdx];
                }
            }

            // Apply manual and dynamic un-adjustment for splits
          const allSplitsForSymbol = [...(KNOWN_SPLITS[symbol] || [])];
          for (const ds of dynamicSplits) {
              const dsTime = ds.date;
              const isDuplicate = allSplitsForSymbol.some(ks => {
                  const ksTime = typeof ks.date === 'number' ? ks.date : new Date(ks.date).getTime();
                  return Math.abs(ksTime - dsTime) < 3 * 24 * 60 * 60 * 1000;
              });
              if (!isDuplicate) {
                  allSplitsForSymbol.push(ds);
              }
          }

          for (const split of allSplitsForSymbol) {
              const splitTime = typeof split.date === 'number' ? split.date : new Date(split.date).getTime();
              for (let i = 0; i < timestamps.length; i++) {
                  if (timestamps[i] * 1000 < splitTime) {
                      if (opens[i]) opens[i] *= split.ratio;
                      if (highs[i]) highs[i] *= split.ratio;
                      if (lows[i]) lows[i] *= split.ratio;
                      if (closes[i]) closes[i] *= split.ratio;
                  }
              }
          }

            return {
                data: {
                    meta: { symbol: symbol },
                    timestamp: timestamps,
                    indicators: {
                        quote: [{
                            open: opens,
                            high: highs,
                            low: lows,
                            close: closes,
                            volume: volumes
                        }],
                        adjclose: [{ adjclose: adjCloses }]
                    }
                }
            };
        }
        
        return { data: { meta: { symbol }, timestamp: [], indicators: { quote: [], adjclose: [] } } };
    } catch (e) {
        writeLog(`fetch-yahoo-history Error for ${options?.symbol}: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-fund-nav', async (event, name) => {
    try {
        if (!name) return { error: "Missing name param" };
        const searchUrl = `https://www.moneydj.com/funddj/ya/yFundSearch.djhtm?a=${encodeURIComponent(name)}`;
        
        const fetchOptions = {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            }
        };

        const resp = await fetch(searchUrl, fetchOptions);
        if (!resp.ok) throw new Error(`MoneyDJ search failed with status ${resp.status}`);

        const buffer = Buffer.from(await resp.arrayBuffer());
        let html = iconv.decode(buffer, 'big5');
        let $ = cheerio.load(html);
        
        if ($('title').text() === "") {
            html = buffer.toString('utf8');
            $ = cheerio.load(html);
        }

        const rows = [];
        $("tr").each((i, el) => {
            const cells = $(el).find('td').map((j, td) => $(td).text().trim()).get();
            if (cells.length > 0) rows.push(cells);
        });

        const matchedRow = rows.find(r => r.some(c => c.includes(name))) || 
                           rows.find(r => r.some(c => name.includes(c) && c.length > 2));

        if (matchedRow) {
            const dateIdx = matchedRow.findIndex(c => /^\d{2}\/\d{2}$/.test(c));
            if (dateIdx !== -1 && matchedRow[dateIdx + 1]) {
                const nav = parseFloat(matchedRow[dateIdx + 1].replace(/,/g, ''));
                if (!isNaN(nav) && nav > 0) return { data: { nav, date: matchedRow[dateIdx] } };
            }
        }

        const detailLinks = [];
        $("a").each((i, el) => {
            const h = $(el).attr("href") || "";
            if (h.includes("ya01") || h.includes("ya02") || h.includes("Front.djhtm") || h.includes("yp01")) {
                detailLinks.push(h);
            }
        });

        if (detailLinks.length > 0) {
            let fundUrl = detailLinks[0];
            if (!fundUrl.startsWith("http")) {
                fundUrl = new URL(fundUrl, "https://www.moneydj.com/funddj/ya/").href;
            }
            const fundResp = await fetch(fundUrl, fetchOptions);
            const fundHtml = iconv.decode(Buffer.from(await fundResp.arrayBuffer()), 'big5');
            const $f = cheerio.load(fundHtml);
            const navText = $f(".t3n2").first().text() || 
                            $f("td:contains('淨值')").next().text() ||
                            $f("span:contains('最新淨值')").next().text();
            
            const nav = parseFloat(navText.replace(/,/g, '').match(/[\d\.]+/)?.[0] || "");
            // Wait, we need date from detailed page. Actually, let's just return what we can.
            const dateMatch = navText.match(/\d{2}\/\d{2}/) || $f("span:contains('日期')").next().text().match(/\d{2}\/\d{2}/);
            const dateStr = dateMatch ? dateMatch[0] : undefined;
            if (!isNaN(nav) && nav > 0) return { data: { nav, date: dateStr } };
        }
        return { error: "Fund not found" };
    } catch (e) {
        writeLog(`fetch-fund-nav Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-twse-prices', async () => {
    try {
        const resp = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
        const data = await resp.json();
        return data;
    } catch (e) {
        writeLog(`fetch-twse-prices Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-twse-pe', async () => {
    try {
        const resp = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL");
        const data = await resp.json();
        return data;
    } catch (e) {
        writeLog(`fetch-twse-pe Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-twse-inst', async () => {
    try {
        const resp = await fetch("https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALLBUT0999", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.twse.com.tw/zh/page/trading/fund/T86.html",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest"
            },
            signal: AbortSignal.timeout(10000)
        });
        const data = await resp.json();
        return data;
    } catch (e) {
        writeLog(`fetch-twse-inst Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-tpex-prices', async () => {
    try {
        const resp = await fetch("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes");
        const data = await resp.json();
        return data;
    } catch (e) {
        writeLog(`fetch-tpex-prices Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-tpex-pe', async () => {
    try {
        const resp = await fetch("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis");
        const data = await resp.json();
        return data;
    } catch (e) {
        writeLog(`fetch-tpex-pe Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-twse-margin', async () => {
    try {
        const resp = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN");
        const data = await resp.json();
        return data;
    } catch (e) {
        writeLog(`fetch-twse-margin Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-tpex-margin', async () => {
    try {
        const resp = await fetch("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance");
        const data = await resp.json();
        return data;
    } catch (e) {
        writeLog(`fetch-tpex-margin Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-tpex-inst', async () => {
    try {
        const resp = await fetch("https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.tpex.org.tw/zh-tw/im/fund/t86.html",
                "Accept": "application/json, text/javascript, */*; q=0.01"
            },
            signal: AbortSignal.timeout(10000)
        });
        const data = await resp.json();
        return data;
    } catch (e) {
        writeLog(`fetch-tpex-inst Error: ${e.message}`);
        return { error: e.message };
    }
});

ipcMain.handle('fetch-yahoo-quotes', async (event, symbols) => {
    try {
        if (!symbols || symbols.length === 0) return [];
        const results = await yahooFinance.quote(symbols);
        return results;
    } catch (e) {
        writeLog(`fetch-yahoo-quotes Error: ${e.message}`);
        return { error: e.message };
    }
});
