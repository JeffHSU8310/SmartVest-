
import React, { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, AlertCircle, Trash2, Database, FileJson, HardDriveDownload, FolderOpen, Save, HardDrive, KeyRound, ShieldCheck, Check, X, History, Archive, Cloud, UploadCloud, DownloadCloud, RefreshCw } from 'lucide-react';
import { Stock, Transaction, Account, Market, TransactionType, AssetSnapshot, GeneralAssetItem, CashTransaction, CSVSettings, GeneralAssetType, AmortizationMethod, LoanType, RecurringCashRule, BudgetItem } from '../types';
import { generateId, downloadCSVTemplate, exportToCSV } from '../utils';
import { getGitHubSyncConfig, saveGitHubSyncConfig, syncToGitHubGist, restoreFromGitHubGist } from '../githubSync';

interface Props {
  transactions: Transaction[];
  stocks: Stock[];
  accounts: Account[];
  assetHistory?: AssetSnapshot[];
  cashTransactions?: CashTransaction[]; 
  householdTransactions?: CashTransaction[]; 
  stockOrder?: string[];
  appTitle?: string;
  generalAssets?: GeneralAssetItem[];
  autoSyncStartDate?: string;
  navOrder?: string[];

  recurringCashRules?: RecurringCashRule[];
  budgetItems?: BudgetItem[];
  suggestedCategories?: string[];

  onImportJSON: (data: { 
    stocks: Stock[], 
    transactions: Transaction[], 
    accounts?: Account[], 
    assetHistory?: AssetSnapshot[], 
    stockOrder?: string[], 
    appTitle?: string,
    generalAssets?: GeneralAssetItem[],
    cashTransactions?: CashTransaction[],
    householdTransactions?: CashTransaction[], 
    autoSyncStartDate?: string,
    navOrder?: string[],
    recurringCashRules?: RecurringCashRule[],
    budgetItems?: BudgetItem[],
    customCategories?: string[]
  }) => void;
  onImportCSV: (
      newTransactions: Transaction[], 
      newStocks: Stock[], 
      newAccounts: Account[], 
      newHistory: AssetSnapshot[],
      newGeneralAssets: GeneralAssetItem[],
      newCashTransactions: CashTransaction[],
      newHouseholdTransactions: CashTransaction[],
      newSettings: CSVSettings
  ) => void;
  onClearAllData: () => void;
  
  onSaveToPC: () => void;
  onSaveAsToPC: () => void;
  onOpenFromPC: () => Promise<boolean>;
  currentFileName: string;

  // 完整存檔內容的單一來源（與自動存檔、雲端備份寫入的內容一致）。
  getExportData?: () => Record<string, any>;
  // 上傳／匯出前先把記憶體中的最新資料寫入 localStorage。
  onFlushSave?: () => Promise<void>;

  // New Security Props
  currentAppPassword?: string;
  onUpdateAppPassword?: (newPass: string) => void;
  currentRecoveryKey?: string;
  onUpdateRecoveryKey?: (newKey: string) => void;
}

const DataTools: React.FC<Props> = ({ 
  transactions, stocks, accounts, assetHistory = [], cashTransactions = [], householdTransactions = [],
  stockOrder, appTitle, generalAssets, autoSyncStartDate, navOrder, recurringCashRules, budgetItems, suggestedCategories,
  onImportJSON, onImportCSV, onClearAllData,
  onSaveToPC, onSaveAsToPC, onOpenFromPC, currentFileName,
  getExportData, onFlushSave,
  currentAppPassword, onUpdateAppPassword, currentRecoveryKey, onUpdateRecoveryKey
}) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvEncoding, setCsvEncoding] = useState<string>('UTF-8');

  // Password Change States
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [pwdOld, setPwdOld] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  
  // Recovery Key States
  const [showRecForm, setShowRecForm] = useState(false);
  const [recOld, setRecOld] = useState('');
  const [recNew, setRecNew] = useState('');

  // GitHub Cloud Sync States
  const [ghConfig, setGhConfig] = useState(() => getGitHubSyncConfig());
  const [ghTokenInput, setGhTokenInput] = useState(ghConfig.token);
  const [ghGistIdInput, setGhGistIdInput] = useState(ghConfig.gistId);
  const [ghStatusMsg, setGhStatusMsg] = useState('');
  const [isGhSyncing, setIsGhSyncing] = useState(false);

  const handleSaveGhConfig = () => {
    const updated = { ...ghConfig, token: ghTokenInput, gistId: ghGistIdInput };
    saveGitHubSyncConfig(updated);
    setGhConfig(updated);
    setGhStatusMsg('✅ 已儲存 GitHub 雲端設定');
    setTimeout(() => setGhStatusMsg(''), 3000);
  };

  const handleUploadToGitHub = async () => {
    if (!ghTokenInput) {
      alert('請先輸入 GitHub Personal Access Token');
      return;
    }
    setIsGhSyncing(true);
    // 備份是直接從 localStorage 打包的，必須先把記憶體中的最新資料寫進去，
    // 否則上傳到雲端的會是這次編輯開始之前的舊快照。
    setGhStatusMsg('⏳ 正在儲存最新變更...');
    try {
      await onFlushSave?.();
    } catch (e) {
      console.warn('Flush before upload failed', e);
    }
    setGhStatusMsg('⏳ 正在同步上傳至 GitHub Gist...');
    const res = await syncToGitHubGist(ghTokenInput, ghGistIdInput);
    setIsGhSyncing(false);
    if (res.success) {
      const updated = getGitHubSyncConfig();
      setGhConfig(updated);
      setGhGistIdInput(updated.gistId);
      setGhStatusMsg(`✅ 上傳成功！Gist ID: ${res.gistId}`);
    } else {
      setGhStatusMsg(`❌ 同步失敗：${res.error}`);
    }
  };

  const handleRestoreFromGitHub = async () => {
    let token = (ghTokenInput || '').trim();
    let gistId = (ghGistIdInput || '').trim();

    if (gistId.includes('/')) {
      const parts = gistId.split('/').filter(Boolean);
      gistId = parts[parts.length - 1];
      setGhGistIdInput(gistId);
    }

    if (!token || !gistId) {
      alert('請先填寫正確的 GitHub Token 與 Gist ID');
      return;
    }

    setIsGhSyncing(true);
    setGhStatusMsg('⏳ 正在從 GitHub 下載最新雲端備份...');
    const res = await restoreFromGitHubGist(token, gistId);
    setIsGhSyncing(false);
    if (res.success) {
      const updated = getGitHubSyncConfig();
      setGhConfig(updated);

      try {
        const rawSaved = localStorage.getItem('smartvest_data_v2');
        if (rawSaved) {
          const parsed = JSON.parse(rawSaved);
          if (parsed) onImportJSON(parsed);
        }
      } catch (e) {
        console.warn('Failed to parse in-memory restore payload', e);
      }

      if (res.warning) {
        setGhStatusMsg(`🎉 帳務資料已成功還原！\n⚠️ ${res.warning}`);
      } else {
        setGhStatusMsg('🎉 雲端備份已成功還原！畫面即將更新載入最新帳目...');
      }
      setTimeout(() => {
        window.location.reload();
      }, res.warning ? 5000 : 1200);
    } else {
      // 只有在錯誤真的與憑證/找不到有關時才提示檢查 Token，
      // 否則像「儲存空間不足」這類訊息會被這句話帶偏方向。
      const msg = res.error || '';
      const authHint = /token|credential|not found|permission|401|403|404|gist/i.test(msg)
        ? '（請檢查 Token 與 Gist ID 是否複製正確）'
        : '';
      setGhStatusMsg(`❌ 還原失敗：${msg}${authHint}`);
    }
  };

  // Manual JSON Export (Legacy)
  const handleExportJSON = () => {
    // 一律走 getExportData()，與自動存檔／雲端備份使用同一份完整內容，
    // 避免手動匯出漏掉 exchangeRate、performanceRecords、密碼等欄位。
    const payload = getExportData ? getExportData() : {
        stocks, transactions, accounts, assetHistory,
        cashTransactions, householdTransactions, stockOrder,
        appTitle, generalAssets, autoSyncStartDate, navOrder,
        recurringCashRules, budgetItems,
        customCategories: suggestedCategories
    };
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartvest_manual_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Manual JSON Import (Legacy)
  const handleImportJSONInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = event.target?.result as string;
        const data = JSON.parse(rawText);
        if (data && (data.stocks || data.transactions || data.accounts)) {
          onImportJSON(data);
        } else {
          alert('JSON 檔案格式錯誤或不包含必要資料欄位');
        }
      } catch (err) {
        alert('JSON 解析失敗，請確保檔案為正確的 JSON 格式');
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  const handleSmartOpen = async () => {
    if (typeof (window as any).showOpenFilePicker === 'function') {
      try {
        const apiSuccess = await onOpenFromPC();
        if (apiSuccess) return;
      } catch (e) {
        console.warn("File System API failed, falling back to legacy input", e);
      }
    }
    if (jsonInputRef.current) {
       jsonInputRef.current.click();
    }
  };

  const robustCSVParser = (text: string): string[][] => {
    // ... (CSV Parser logic remains same)
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\n' && !inQuotes) {
        currentRow.push(currentCell.trim());
        if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== "")) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    if (currentCell !== '' || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }
    return rows;
  };

  const cleanNum = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleaned = val.replace(/[^\d.-]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const allRows = robustCSVParser(text);
        if (allRows.length < 1) { 
           alert('CSV 內容為空'); 
           return; 
        }

        // New containers
        const newTxs: Transaction[] = [];
        const newStocksMap = new Map<string, Stock>();
        // KEY CHANGE: Store accounts by ID to support duplicates with same name
        const newAccountsMap = new Map<string, Account>(); 
        
        const newHistory: AssetSnapshot[] = [];
        const newGeneralAssets: GeneralAssetItem[] = [];
        const newCashTransactions: CashTransaction[] = [];
        const newHouseholdTransactions: CashTransaction[] = [];
        const newSettings: CSVSettings = {};

        // Section Headers Mapping logic
        let currentSection: 'TRANSACTION' | 'ASSET_HISTORY' | 'GENERAL_ASSET' | 'CASH' | 'SETTINGS' = 'TRANSACTION';
        let colMap = new Map<string, number>();

        // Init Transaction Map (First row)
        allRows[0].forEach((h, i) => colMap.set(h.trim(), i));

        const getCol = (row: string[], ...names: string[]): string => {
          for (const name of names) {
            const idx = colMap.get(name);
            if (idx !== undefined && idx < row.length) return row[idx];
          }
          return '';
        };

        for (let i = 1; i < allRows.length; i++) {
          const row = allRows[i];
          if (row.length < 2) continue;
          
          let isHeaderRow = false;

          // Determine section based on marker
          if (row[0] === '#資產趨勢') {
             currentSection = 'ASSET_HISTORY';
             if (row[1] === '日期') {
                colMap.clear();
                row.forEach((h, i) => colMap.set(h.trim(), i));
                isHeaderRow = true;
             }
          } else if (row[0] === '#一般資產') {
             currentSection = 'GENERAL_ASSET';
             if (row[1] === 'ID') {
                colMap.clear();
                row.forEach((h, i) => colMap.set(h.trim(), i));
                isHeaderRow = true;
             }
          } else if (row[0] === '#現金收支') {
             currentSection = 'CASH';
             if (row[1] === 'ID') {
                colMap.clear();
                row.forEach((h, i) => colMap.set(h.trim(), i));
                isHeaderRow = true;
             }
          } else if (row[0] === '#系統設定') {
             currentSection = 'SETTINGS';
          }

          if (isHeaderRow) continue;

          // --- SECTION: SETTINGS ---
          if (row[0] === '#系統設定' || currentSection === 'SETTINGS') {
              if (row[0] === '#系統設定') {
                  const key = row[1];
                  const val = row[2];
                  if (key === 'APP_TITLE') newSettings.appTitle = val.replace(/"/g, '');
                  if (key === 'STOCK_ORDER') newSettings.stockOrder = val.split('|');
                  if (key === 'NAV_ORDER') newSettings.navOrder = val.split('|');
                  if (key === 'AUTO_SYNC_DATE') newSettings.autoSyncStartDate = val;
              }
              continue;
          }

          // --- SECTION: ASSET HISTORY ---
          if (currentSection === 'ASSET_HISTORY') {
             const hDate = getCol(row, '日期');
             if (hDate && hDate !== '日期') {
                newHistory.push({
                   date: hDate.replace(/\//g, '-'),
                   totalCostTWD: cleanNum(getCol(row, '總成本TWD')),
                   totalMarketValueTWD: cleanNum(getCol(row, '總市值TWD')),
                   unrealizedPLTWD: cleanNum(getCol(row, '未實現損益TWD')),
                   todayDividendTWD: cleanNum(getCol(row, '除息收益(含息變動)')) || undefined
                });
             }
             continue;
          }

          // --- SECTION: GENERAL ASSETS ---
          if (currentSection === 'GENERAL_ASSET') {
              const id = getCol(row, 'ID');
              if (id && id !== 'ID') {
                  newGeneralAssets.push({
                      id,
                      name: getCol(row, '名稱'),
                      type: getCol(row, '類型') as GeneralAssetType,
                      category: getCol(row, '類別'),
                      value: cleanNum(getCol(row, '金額')),
                      isLinked: getCol(row, '連結ID') === 'Y',
                      isExcluded: getCol(row, '排除') === 'Y',
                      note: getCol(row, '備註'),
                      originalAmount: cleanNum(getCol(row, '原始金額')),
                      interestRate: cleanNum(getCol(row, '利率')),
                      amortizationMethod: getCol(row, '還款方式') as AmortizationMethod,
                      monthlyPrincipal: cleanNum(getCol(row, '月本')),
                      monthlyInterest: cleanNum(getCol(row, '月利')),
                      loanDate: getCol(row, '借款日'),
                      maturityDate: getCol(row, '到期日'),
                      bank: getCol(row, '銀行'),
                      loanType: getCol(row, '借款類型') as LoanType,
                      targetStockId: getCol(row, '質押標的ID'),
                      pledgeLots: cleanNum(getCol(row, '質押張數')),
                      collateralValue: cleanNum(getCol(row, '擔保市值'))
                  });
              }
              continue;
          }

          // --- SECTION: CASH TRANSACTIONS ---
          if (currentSection === 'CASH') {
              const id = getCol(row, 'ID');
              if (id && id !== 'ID') {
                  const tx: CashTransaction = {
                      id,
                      date: getCol(row, '日期'),
                      accountId: getCol(row, '帳戶ID'),
                      type: getCol(row, '類型') as any,
                      amount: cleanNum(getCol(row, '金額')),
                      currency: 'TWD',
                      category: getCol(row, '主類別'),
                      subCategory: getCol(row, '子類別'),
                      note: getCol(row, '備註'),
                      sourceTransactionId: getCol(row, '來源ID') || undefined,
                      fromAccountId: getCol(row, '轉出帳戶ID') || undefined,
                      toAccountId: getCol(row, '轉入帳戶ID') || undefined
                  };
                  const group = getCol(row, '群組(Household/Invest)');
                  if (group === 'H') newHouseholdTransactions.push(tx);
                  else newCashTransactions.push(tx);
              }
              continue;
          }

          // --- SECTION: LEGACY METADATA (ACCOUNTS/STOCKS) ---
          if (row[0] === '#系統備份') {
             const backupType = getCol(row, '交易類別');
             if (backupType === '[股票設定]') {
                const ticker = getCol(row, '代號');
                const storedId = getCol(row, '備註'); 
                if (ticker) {
                  newStocksMap.set(ticker, {
                    id: (storedId && storedId.length > 5) ? storedId : generateId(),
                    ticker,
                    name: getCol(row, '名稱') || ticker,
                    market: getCol(row, '市場(TW/US)') === 'US' ? Market.US : Market.TW,
                    category: getCol(row, '分類'),
                    currentPrice: cleanNum(getCol(row, '目前市價')) || undefined
                  });
                }
             } else if (backupType === '[帳戶設定]') {
                const id = getCol(row, '市場(TW/US)'); 
                const isSec = getCol(row, '代號') === 'Y'; 
                const name = getCol(row, '名稱');
                const isCash = getCol(row, '分類') === 'Y'; 
                const isExcluded = getCol(row, '每股股息') === 'Y'; 
                const linkedId = getCol(row, '股數'); 

                if (name) {
                    const finalId = id && id.length > 5 ? id : generateId();
                    // Store by ID to allow multiple accounts with same name
                    newAccountsMap.set(finalId, { 
                        id: finalId, 
                        name,
                        isSecurities: isSec,
                        isCash: isCash,
                        excludeFromTotals: isExcluded,
                        linkedCashAccountId: linkedId || undefined
                    });
                }
             }
             continue;
          }

          // --- SECTION: TRANSACTIONS (Core) ---
          const date = getCol(row, '日期', '日期(YYYY-MM-DD)');
          const ticker = getCol(row, '代號');
          if (!date || !ticker || date === '日期' || row[0].startsWith('#')) continue;

          // Ensure stock exists
          if (!newStocksMap.has(ticker)) {
            newStocksMap.set(ticker, {
              id: generateId(), ticker,
              name: getCol(row, '名稱') || ticker,
              market: getCol(row, '市場(TW/US)') === 'US' ? Market.US : Market.TW,
              category: getCol(row, '分類')
            });
          }
          
          // LINK ACCOUNT LOGIC
          const accName = getCol(row, '帳戶名稱', '帳戶名稱(選填)') || '預設帳戶';
          const accIdFromCsv = getCol(row, '帳戶ID'); // New Column
          
          let accId = '';

          // 1. Try match by ID (Precise)
          if (accIdFromCsv && newAccountsMap.has(accIdFromCsv)) {
              accId = accIdFromCsv;
          } 
          // 2. Try match by Name (Legacy fallback)
          else {
              // Find all accounts with this name
              const candidates = Array.from(newAccountsMap.values()).filter(a => a.name === accName);
              
              if (candidates.length === 1) {
                  accId = candidates[0].id;
              } else if (candidates.length > 1) {
                  // Collision! Prefer Securities account for stock transactions
                  const secAccount = candidates.find(a => a.isSecurities);
                  if (secAccount) accId = secAccount.id;
                  else accId = candidates[0].id; // Fallback to first one
              } else {
                  // No account found, create new
                  accId = generateId();
                  newAccountsMap.set(accId, { id: accId, name: accName, isSecurities: true });
              }
          }

          // Identify stock by ticker
          let stockId = '';
          for (const [key, val] of newStocksMap.entries()) {
              if (key === ticker) stockId = val.id;
          }

          const typeLabel = getCol(row, '交易類別', '交易類別(買進/賣出/領息)');
          let type = TransactionType.BUY;
          if (typeLabel.includes('賣')) type = TransactionType.SELL;
          else if (typeLabel.includes('息')) type = TransactionType.DIVIDEND;

          const qty = cleanNum(getCol(row, '股數', '數量'));
          const total = cleanNum(getCol(row, '總金額', '總金額(必填)'));
          const dps = cleanNum(getCol(row, '每股股息', '每股股息(領息用)'));
          const fee = cleanNum(getCol(row, '手續費', '手續費(選填)'));
          const tax = cleanNum(getCol(row, '稅金', '稅金(選填)'));
          const rate = cleanNum(getCol(row, '匯率')) || 1;

          const dca = getCol(row, '定期定額', '定期定額(Y/N)');
          const drip = getCol(row, '股利再投入', '股利再投入(Y/N)');

          newTxs.push({
            id: generateId(),
            date: date.replace(/\//g, '-'),
            stockId: stockId,
            accountId: accId,
            type,
            price: type === TransactionType.DIVIDEND ? dps : (qty !== 0 ? Math.abs(total / qty) : 0),
            quantity: qty,
            fee: fee,
            tax: tax,
            exchangeRate: rate,
            note: getCol(row, '備註'),
            exDividendDate: getCol(row, '除息日')?.replace(/\//g, '-'),
            paymentDate: getCol(row, '配發日')?.replace(/\//g, '-'),
            isDCA: dca === 'Y' || dca === '是',
            isDRIP: drip === 'Y' || drip === '是',
          });
        }

        onImportCSV(
            newTxs, 
            Array.from(newStocksMap.values()), 
            Array.from(newAccountsMap.values()), 
            newHistory,
            newGeneralAssets,
            newCashTransactions,
            newHouseholdTransactions,
            newSettings
        );
        
      } catch (err) {
        console.error(err);
        alert('CSV 匯入解析出錯: ' + (err as any).message);
      }
    };
    reader.readAsText(file, csvEncoding);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const handleExportCSV = () => {
      exportToCSV(
          transactions, 
          stocks, 
          accounts, 
          assetHistory, 
          generalAssets, 
          cashTransactions, 
          householdTransactions, 
          { stockOrder, appTitle, navOrder, autoSyncStartDate }
      );
  };

  const handleChangePassword = (e: React.FormEvent) => {
      e.preventDefault();
      if (pwdOld !== currentAppPassword) {
          alert('舊密碼錯誤！');
          return;
      }
      if (pwdNew !== pwdConfirm) {
          alert('兩次新密碼輸入不一致！');
          return;
      }
      if (!pwdNew) {
          alert('新密碼不能為空！');
          return;
      }
      onUpdateAppPassword?.(pwdNew);
      alert('登入密碼修改成功！下次登入請使用新密碼。');
      setPwdOld(''); setPwdNew(''); setPwdConfirm(''); setShowPwdForm(false);
  };

  const handleChangeRecovery = (e: React.FormEvent) => {
      e.preventDefault();
      if (recOld !== currentRecoveryKey) {
          alert('舊還原碼錯誤！');
          return;
      }
      if (!recNew) {
          alert('新還原碼不能為空！');
          return;
      }
      onUpdateRecoveryKey?.(recNew);
      alert('還原碼修改成功！若忘記密碼請使用此還原碼。');
      setRecOld(''); setRecNew(''); setShowRecForm(false);
  };

  const handleOpenBackupFolder = async () => {
      if (window.electronAPI?.openBackupFolder) {
          await window.electronAPI.openBackupFolder();
      }
  };

  const supportsFileSystem = 'showOpenFilePicker' in window;
  const isElectron = window.electronAPI?.isElectron;

  const ActionCard = ({ icon: Icon, title, desc, onClick, colorClass, highlight }: any) => (
     <button 
       onClick={onClick}
       className={`group flex flex-col items-start text-left p-6 rounded-2xl shadow-sm border transition-all duration-300 relative overflow-hidden h-full
          ${highlight ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-800 border-slate-100 hover:shadow-xl hover:border-slate-200'}
       `}
     >
        <div className={`absolute top-0 right-0 p-16 rounded-full opacity-5 transform translate-x-8 -translate-y-8 ${colorClass} group-hover:scale-150 transition-transform duration-500`}></div>
        
        <div className={`p-3 rounded-xl mb-4 ${highlight ? 'bg-white/10 text-white' : `${colorClass} bg-opacity-10 text-slate-700`}`}>
           <Icon size={24} className={highlight ? 'text-white' : colorClass.replace('bg-', 'text-')} />
        </div>
        <h3 className={`text-lg font-bold mb-1 ${highlight ? 'text-white' : 'text-slate-800'}`}>{title}</h3>
        <p className={`text-sm ${highlight ? 'text-slate-300' : 'text-slate-500'}`}>{desc}</p>
     </button>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      {/* File System Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-blue-500 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h3 className="text-2xl font-bold flex items-center gap-3 mb-2">
              <HardDrive className="text-blue-400" size={28} /> 
              {isElectron ? '本機檔案存取 (桌面版)' : supportsFileSystem ? '本機檔案存取 (瀏覽器 API)' : '檔案存取 (手動)'}
            </h3>
            <p className="text-slate-300 max-w-xl text-sm leading-relaxed">
              {isElectron 
                ? '桌面版應用程式直接讀寫程式所在目錄 (SmartVest_Data)。系統會自動進行版本備份，確保資料安全。'
                : supportsFileSystem 
                    ? '您可以直接開啟與儲存電腦中的 .json 檔案。資料將儲存在您的硬碟中，完全不受瀏覽器快取清除影響。'
                    : '您的瀏覽器不支援直接讀寫檔案。請使用下方的「下載備份」與「上傳還原」來手動管理您的資料檔案。'
              }
            </p>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10">
             <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">目前運作檔案</p>
             <p className="font-mono text-emerald-400 font-bold flex items-center gap-2">
               <FileJson size={16}/> {currentFileName}
             </p>
          </div>
        </div>
      </div>
      
      {/* Security Management */}
      <h4 className="font-bold text-slate-700 text-lg flex items-center gap-2">
         <ShieldCheck className="text-rose-600" size={20}/> 安全性設定
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Change Password Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
              <div>
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><KeyRound size={24}/></div>
                      <div>
                          <h3 className="font-bold text-slate-800 text-lg">登入密碼</h3>
                          <p className="text-slate-500 text-xs">修改進入系統的歡迎頁面密碼</p>
                      </div>
                  </div>
                  {showPwdForm ? (
                      <form onSubmit={handleChangePassword} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500">舊密碼</label>
                              <input type="password" value={pwdOld} onChange={e => setPwdOld(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm" required />
                          </div>
                          <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500">新密碼</label>
                              <input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm" required />
                          </div>
                          <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500">確認新密碼</label>
                              <input type="password" value={pwdConfirm} onChange={e => setPwdConfirm(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm" required />
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                              <button type="button" onClick={() => { setShowPwdForm(false); setPwdOld(''); setPwdNew(''); setPwdConfirm(''); }} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1">取消</button>
                              <button type="submit" className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700">更新</button>
                          </div>
                      </form>
                  ) : (
                      <button onClick={() => setShowPwdForm(true)} className="text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors border border-indigo-100 w-full">修改密碼</button>
                  )}
              </div>
          </div>

          {/* Recovery Key Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
              <div>
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><ShieldCheck size={24}/></div>
                      <div>
                          <h3 className="font-bold text-slate-800 text-lg">救援還原碼</h3>
                          <p className="text-slate-500 text-xs">忘記密碼時使用的驗證碼 (預設: admin)</p>
                      </div>
                  </div>
                  {showRecForm ? (
                      <form onSubmit={handleChangeRecovery} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500">舊還原碼</label>
                              <input type="password" value={recOld} onChange={e => setRecOld(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm" required />
                          </div>
                          <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500">新還原碼</label>
                              <input type="text" value={recNew} onChange={e => setRecNew(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm" required placeholder="請設定容易記住的代碼" />
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                              <button type="button" onClick={() => { setShowRecForm(false); setRecOld(''); setRecNew(''); }} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1">取消</button>
                              <button type="submit" className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg hover:bg-emerald-700">更新</button>
                          </div>
                      </form>
                  ) : (
                      <button onClick={() => setShowRecForm(true)} className="text-sm font-bold text-emerald-600 hover:bg-emerald-50 px-4 py-2 rounded-lg transition-colors border border-emerald-100 w-full">修改還原碼</button>
                  )}
              </div>
          </div>
      </div>

      {/* GitHub Cloud Sync Section */}
      <h4 className="font-bold text-slate-700 text-lg flex items-center gap-2">
         <Cloud className="text-indigo-600" size={20}/> GitHub 雲端備份與同步
      </h4>
      <div className="bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 p-6 rounded-2xl border border-indigo-100/80 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h5 className="font-bold text-slate-800 flex items-center gap-2">
              <UploadCloud size={18} className="text-indigo-600" /> GitHub Gist 雲端自動同步
            </h5>
            <p className="text-xs text-slate-500 mt-1">
              設定個人的 GitHub Token，即可隨時將記帳資料同步至雲端或跨裝置下載備份。
            </p>
          </div>
          {ghConfig.lastSyncedAt && (
            <div className="text-xs text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              上次同步時間：<span className="font-bold text-indigo-600">{ghConfig.lastSyncedAt}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <KeyRound size={14} /> GitHub Personal Access Token (PAT)
            </label>
            <input 
              type="password"
              value={ghTokenInput}
              onChange={e => setGhTokenInput(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 font-mono shadow-2xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <Database size={14} /> GitHub Gist ID (留空自動建立)
            </label>
            <input 
              type="text"
              value={ghGistIdInput}
              onChange={e => setGhGistIdInput(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="如已有 Gist ID 請填入，否則自動生成"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 font-mono shadow-2xs"
            />
          </div>
        </div>

        {ghStatusMsg && (
          <div className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-indigo-100 text-indigo-800">
            {ghStatusMsg}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button 
            onClick={handleSaveGhConfig}
            className="text-xs font-bold px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-2xs"
          >
            儲存設定
          </button>

          <button 
            onClick={handleUploadToGitHub}
            disabled={isGhSyncing}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <UploadCloud size={15} />
            {isGhSyncing ? '同步上傳中...' : '備份上傳至 GitHub'}
          </button>

          <button 
            onClick={handleRestoreFromGitHub}
            disabled={isGhSyncing}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <DownloadCloud size={15} />
            {isGhSyncing ? '還原下載中...' : '從 GitHub 下載還原'}
          </button>
        </div>
      </div>

      <div className="w-full h-px bg-slate-200 my-4"></div>

      {/* Primary Actions (File System API) */}
      <h4 className="font-bold text-slate-700 text-lg flex items-center gap-2">
         <FolderOpen className="text-blue-600" size={20}/> 專案檔案管理
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ActionCard 
           icon={FolderOpen}
           title="開啟舊檔"
           desc="從電腦中選擇現有的 .json 資料檔並載入。"
           onClick={handleSmartOpen}
           colorClass="bg-blue-500"
           highlight={false}
        />
        <ActionCard 
           icon={Save}
           title="儲存檔案"
           desc={isElectron ? "直接寫入變更至程式目錄。" : supportsFileSystem ? `直接寫入變更至 "${currentFileName}"。` : "下載最新的 .json 檔案到電腦。"}
           onClick={onSaveToPC}
           colorClass="bg-emerald-500"
           highlight={true}
        />
        <ActionCard 
           icon={HardDriveDownload}
           title="另存新檔"
           desc="將目前的資料另存為一個新的 .json 檔案。"
           onClick={onSaveAsToPC}
           colorClass="bg-purple-500"
           highlight={false}
        />
        {isElectron && (
            <ActionCard 
                icon={Archive}
                title="自動備份紀錄"
                desc="開啟系統每 10 秒自動儲存與備份的資料夾。"
                onClick={handleOpenBackupFolder}
                colorClass="bg-orange-500"
                highlight={false}
            />
        )}
      </div>

      <div className="w-full h-px bg-slate-200 my-4"></div>

      {/* Secondary Tools (CSV & Import) */}
      <h4 className="font-bold text-slate-700 text-lg flex items-center gap-2">
         <FileSpreadsheet className="text-emerald-600" size={20}/> CSV 與批次工具
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ActionCard 
           icon={FileSpreadsheet}
           title="下載 CSV 範本"
           desc="取得 Excel 匯入格式，用於大量建立交易。"
           onClick={downloadCSVTemplate}
           colorClass="bg-slate-500"
        />

        <ActionCard 
           icon={Download}
           title="匯出 CSV 報表"
           desc="將完整資料(含資產/收支/設定)匯出為 CSV。"
           onClick={handleExportCSV}
           colorClass="bg-blue-500"
        />
        
        {/* Hidden inputs for legacy/fallback support */}
        <input type="file" accept=".json,application/json,text/plain,*" ref={jsonInputRef} onChange={handleImportJSONInput} className="hidden" />
        <ActionCard 
           icon={Upload}
           title="手動上傳 JSON"
           desc="如果您無法使用直接開檔功能，請由此上傳。"
           onClick={() => jsonInputRef.current?.click()}
           colorClass="bg-amber-500"
        />
        {/* Legacy Import for Manual Restore */}
        <ActionCard 
           icon={Upload}
           title="從檔案還原"
           desc="完整覆蓋還原系統資料 (包含大盤數據)。"
           onClick={() => jsonInputRef.current?.click()}
           colorClass="bg-amber-500"
        />
      </div>

      {/* Separate Layout Sections to prevent 'layout running away' */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Import Section */}
         <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="space-y-4">
               <h4 className="font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet size={18}/> CSV 匯入工具</h4>
               <p className="text-sm text-slate-500">支援完整資料匯入 (一般資產、收支紀錄、系統設定)。請務必使用 UTF-8 編碼。</p>
               
               <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500">檔案編碼</span>
                    <select value={csvEncoding} onChange={(e) => setCsvEncoding(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
                      <option value="UTF-8">UTF-8 (標準)</option>
                      <option value="Big5">Big5 (Excel)</option>
                    </select>
                  </div>
                  <input type="file" accept=".csv" ref={csvInputRef} onChange={handleImportCSV} className="hidden" />
                  <button onClick={() => csvInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg">
                    <Upload size={18} /> 選擇 CSV 檔案
                  </button>
               </div>
            </div>
         </div>

         {/* Danger Zone - Separate Layout */}
         <div className="lg:col-span-1 bg-rose-50 p-6 rounded-2xl border border-rose-100 flex flex-col justify-center">
            <h4 className="font-bold text-rose-700 flex items-center gap-2 mb-3"><AlertCircle size={18}/> 危險區域</h4>
            <p className="text-sm text-slate-500 mb-4">此操作將清除所有暫存資料。若已存檔則無需擔心。</p>
            
            <button onClick={onClearAllData} className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl font-bold transition-all shadow-sm">
               <Trash2 size={18} /> 清空工作區資料
            </button>
         </div>
      </div>
    </div>
  );
};

export default React.memo(DataTools);
