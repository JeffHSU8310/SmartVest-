const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  saveDataAs: (data) => ipcRenderer.invoke('save-data-as', data),
  openDataFile: () => ipcRenderer.invoke('open-data-file'),
  openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
  fetchTWSE: () => ipcRenderer.invoke('fetch-twse'),
  fetchYahooQuote: (symbol) => ipcRenderer.invoke('fetch-yahoo-quote', symbol),
  fetchFearGreed: () => ipcRenderer.invoke('fetch-fear-greed'),
  fetchYahooSummary: (symbol) => ipcRenderer.invoke('fetch-yahoo-summary', symbol),
  fetchETFHoldings: (symbol) => ipcRenderer.invoke('fetch-etf-holdings', symbol),
  fetchYahooHistory: (options) => ipcRenderer.invoke('fetch-yahoo-history', options),
  fetchFundNAV: (name) => ipcRenderer.invoke('fetch-fund-nav', name),
  loadScreenerPool: () => ipcRenderer.invoke('load-screener-pool'),
  saveScreenerPool: (data) => ipcRenderer.invoke('save-screener-pool', data),
  fetchTwsePrices: () => ipcRenderer.invoke('fetch-twse-prices'),
  fetchTwsePe: () => ipcRenderer.invoke('fetch-twse-pe'),
  fetchTwseInst: () => ipcRenderer.invoke('fetch-twse-inst'),
  fetchTpexPrices: () => ipcRenderer.invoke('fetch-tpex-prices'),
  fetchTpexPe: () => ipcRenderer.invoke('fetch-tpex-pe'),
  fetchTpexInst: () => ipcRenderer.invoke('fetch-tpex-inst'),
  fetchTwseMargin: () => ipcRenderer.invoke('fetch-twse-margin'),
  fetchTpexMargin: () => ipcRenderer.invoke('fetch-tpex-margin'),
  fetchYahooQuotes: (symbols) => ipcRenderer.invoke('fetch-yahoo-quotes', symbols),
  isElectron: true
});
