/**
 * SmartVest GitHub 雲端存檔與同步服務 (GitHub Sync Service)
 */

export interface GitHubSyncConfig {
  token: string;
  gistId: string;
  autoSync: boolean;
  lastSyncedAt?: string;
}

const SYNC_CONFIG_KEY = 'smartvest_github_sync_config';
const GIST_FILENAME = 'smartvest_backup.json';

// 取得與儲存 GitHub 同步設定
export const getGitHubSyncConfig = (): GitHubSyncConfig => {
  try {
    const data = localStorage.getItem(SYNC_CONFIG_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load GitHub sync config', e);
  }
  return { token: '', gistId: '', autoSync: false };
};

export const saveGitHubSyncConfig = (config: GitHubSyncConfig): void => {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
};

// 打包目前系統中所有的本地記帳數據
export const exportAllAppData = (): Record<string, any> => {
  const backup: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key !== SYNC_CONFIG_KEY) {
      try {
        const val = localStorage.getItem(key);
        backup[key] = val ? JSON.parse(val) : null;
      } catch {
        backup[key] = localStorage.getItem(key);
      }
    }
  }
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    data: backup
  };
};

export interface ImportResult {
  success: boolean;
  warning?: string;
  error?: string;
}

// 可以再從 API 重新抓回來的大型快取。
// iPhone Safari 的 localStorage 上限約 5MB，而且是以 UTF-16 計算
// （字元數要乘 2），光是大盤日 K（1987 年起、上萬筆）就會佔掉 3MB 以上，
// 因此空間不夠時優先捨棄它，保住無法重建的帳務資料。
const REBUILDABLE_CACHE_KEYS = ['marketData'];

// smartvest_backup_00.json ~ smartvest_backup_NN.json
const isChunkFileName = (name: string): boolean =>
  /^smartvest_backup_\d+\.json$/.test(name);

const isQuotaError = (e: any): boolean =>
  !!e && (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 || e.code === 1014
  );

// 恢復雲端數據到 LocalStorage
export const importAllAppData = (backupPayload: Record<string, any>): ImportResult => {
  if (!backupPayload || typeof backupPayload !== 'object') {
    return { success: false, error: '備份內容格式不正確' };
  }

  const dataMap: Record<string, any> =
    (backupPayload.data && typeof backupPayload.data === 'object')
      ? backupPayload.data
      : backupPayload;

  const droppedCaches: string[] = [];

  // 1. 核心帳務資料（交易、記帳、持股）——這些重建不回來，必須優先寫入
  try {
    let core: any = dataMap.smartvest_data_v2;
    // 相容：備份內容直接就是 { stocks, transactions, accounts }
    if (core === undefined && (dataMap.stocks || dataMap.transactions || dataMap.accounts)) {
      core = dataMap;
    }

    if (core !== undefined && core !== null) {
      let coreObj: any = core;
      if (typeof coreObj === 'string') {
        try { coreObj = JSON.parse(coreObj); } catch { coreObj = null; }
      }

      if (coreObj && typeof coreObj === 'object') {
        let written = false;
        try {
          localStorage.setItem('smartvest_data_v2', JSON.stringify(coreObj));
          written = true;
        } catch (e) {
          if (!isQuotaError(e)) throw e;
        }

        // 空間不足：拿掉可重建的快取再寫一次，讓帳務資料仍然完整還原
        if (!written) {
          const slim: Record<string, any> = { ...coreObj };
          for (const k of REBUILDABLE_CACHE_KEYS) {
            if (slim[k] !== undefined) {
              delete slim[k];
              droppedCaches.push(k);
            }
          }
          localStorage.setItem('smartvest_data_v2', JSON.stringify(slim));
        }
      } else {
        localStorage.setItem('smartvest_data_v2', typeof core === 'string' ? core : JSON.stringify(core));
      }
    }
  } catch (e: any) {
    if (isQuotaError(e)) {
      return {
        success: false,
        error: '此裝置的瀏覽器儲存空間不足，連帳務資料都寫不進去（iPhone Safari 上限約 5MB）。請改用電腦還原。'
      };
    }
    console.error('Failed to import core app data', e);
    return { success: false, error: '寫入核心帳務資料失敗' };
  }

  // 2. 其餘附屬 Key：逐一寫入，單一失敗不該讓整次還原被判定失敗
  const failedKeys: string[] = [];
  Object.keys(dataMap).forEach(key => {
    if (key === 'smartvest_data_v2') return;
    const val = dataMap[key];
    if (val === null || val === undefined) return;
    try {
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
    } catch (e) {
      failedKeys.push(key);
    }
  });

  let warning: string | undefined;
  if (droppedCaches.length > 0) {
    warning = '因手機儲存空間有限，已略過大盤走勢快取（下次開啟大盤圖時會自動重新下載，帳務資料完全不受影響）。';
  }
  if (failedKeys.length > 0) {
    warning = (warning ? warning + ' ' : '') + `另有 ${failedKeys.length} 項次要設定未寫入。`;
  }

  return { success: true, warning };
};

// 建立或更新 GitHub Gist
export const syncToGitHubGist = async (rawToken: string, rawGistId?: string): Promise<{ success: boolean; gistId?: string; error?: string }> => {
  const token = (rawToken || '').trim().replace(/^["']|["']$/g, '');
  let existingGistId = (rawGistId || '').trim();

  if (existingGistId.includes('/')) {
    const parts = existingGistId.split('/').filter(Boolean);
    existingGistId = parts[parts.length - 1];
  }

  if (!token) return { success: false, error: '未提供 GitHub Token' };

  const payload = exportAllAppData();
  const content = JSON.stringify(payload);

  try {
    const CHUNK_SIZE = 800000; // 800KB
    const numChunks = Math.ceil(content.length / CHUNK_SIZE);

    const sendGistReq = async (url: string, method: string, filesObj: any) => {
      if (method === 'POST') {
        for (const k of Object.keys(filesObj)) {
          if (filesObj[k] === null) delete filesObj[k];
        }
      }
      return await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: 'SmartVest 存股記帳雲端備份', public: false, files: filesObj })
      });
    };

    let currentUrl = existingGistId ? `https://api.github.com/gists/${existingGistId}` : 'https://api.github.com/gists';
    let currentMethod = existingGistId ? 'PATCH' : 'POST';
    let finalGistId = existingGistId;
    let existingFiles: Record<string, any> = {};

    if (existingGistId) {
      try {
        const checkRes = await fetch(currentUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          existingFiles = checkData.files || {};
        } else if (checkRes.status === 404) {
          currentUrl = 'https://api.github.com/gists';
          currentMethod = 'POST';
          existingGistId = ''; // Reset so we don't try to PATCH
        }
      } catch(e) {}
    }

    if (numChunks <= 1) {
      const filesPayload: any = { [GIST_FILENAME]: { content: content } };
      if (currentMethod === 'PATCH') {
        // 舊版只清 00~09，一旦某次備份超過 10 個分割檔，殘留的 chunk 會在
        // 還原時被優先讀取（chunkKeys 優先於單一檔案），把使用者帶回舊資料。
        // 這裡改成把 Gist 上所有既有的 chunk 全部刪掉。
        Object.keys(existingFiles).forEach(k => {
          if (isChunkFileName(k)) filesPayload[k] = null;
        });
      }
      
      let res = await sendGistReq(currentUrl, currentMethod, filesPayload);
      
      if (!res.ok) {
        let errStr = `HTTP ${res.status}`;
        try { const errJson = await res.json(); if (errJson.message) errStr = errJson.message; } catch(e){}
        return { success: false, error: errStr };
      }
      
      const resData = await res.json();
      finalGistId = resData.id;
    } else {
      for (let i = 0; i < numChunks; i++) {
        const chunkStr = content.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkName = `smartvest_backup_${i.toString().padStart(2, '0')}.json`;
        const filesPayload: any = { [chunkName]: { content: chunkStr } };
        
        if (i === 0 && currentMethod === 'PATCH') {
          if (existingFiles[GIST_FILENAME]) {
            filesPayload[GIST_FILENAME] = null; 
          }
        }

        let res = await sendGistReq(currentUrl, currentMethod, filesPayload);
        
        if (!res.ok) {
           let errStr = `HTTP ${res.status}`;
           try { const errJson = await res.json(); if (errJson.message) errStr = errJson.message; } catch(e){}
           return { success: false, error: errStr };
        }
        
        if (i === 0 && currentMethod === 'POST') {
          const resData = await res.json();
          finalGistId = resData.id;
          currentUrl = `https://api.github.com/gists/${finalGistId}`;
          currentMethod = 'PATCH';
        }
      }
      
      // 清理多餘的舊 chunk
      if (currentMethod === 'PATCH') {
        const cleanupPayload: any = {};
        let hasCleanup = false;
        Object.keys(existingFiles).forEach(k => {
          if (isChunkFileName(k)) {
            const idx = parseInt(k.replace('smartvest_backup_', '').replace('.json', ''), 10);
            if (!isNaN(idx) && idx >= numChunks) {
              cleanupPayload[k] = null;
              hasCleanup = true;
            }
          }
        });
        if (hasCleanup) {
          await sendGistReq(currentUrl, currentMethod, cleanupPayload);
        }
      }
    }

    const currentConfig = getGitHubSyncConfig();
    saveGitHubSyncConfig({
      ...currentConfig,
      token,
      gistId: finalGistId,
      lastSyncedAt: new Date().toLocaleString('zh-TW')
    });

    return { success: true, gistId: finalGistId };
  } catch (e: any) {
    return { success: false, error: e.message || '連線至 GitHub 失敗' };
  }
};

// 從 GitHub Gist 下載並還原資料
export const restoreFromGitHubGist = async (rawToken: string, rawGistId: string): Promise<{ success: boolean; error?: string; warning?: string }> => {
  const token = (rawToken || '').trim().replace(/^["']|["']$/g, '');
  let gistId = (rawGistId || '').trim();

  if (gistId.includes('/')) {
    const parts = gistId.split('/').filter(Boolean);
    gistId = parts[parts.length - 1];
  }

  if (!token || !gistId) return { success: false, error: '未提供完整 GitHub Token 或 Gist ID' };

  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      }
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      return { success: false, error: errJson.message || `無法取得 Gist 資料 (HTTP ${response.status})` };
    }

    const resData = await response.json();

    // 尋找分割的 chunk 檔案 (smartvest_backup_00.json, etc.)，依編號排序
    const chunkEntries = Object.keys(resData.files || {})
      .filter(isChunkFileName)
      .map(name => ({
        name,
        idx: parseInt(name.replace('smartvest_backup_', '').replace('.json', ''), 10),
      }))
      .sort((a, b) => a.idx - b.idx);

    // 合法的分割備份一定是 00、01、…、N-1 連續編號。只要缺了開頭或中間斷號，
    // 就代表這是舊版清理不乾淨留下的碎片（舊版只刪 00~09），
    // 此時 Gist 上的單一檔案才是真正的最新備份，必須優先採用。
    const hasContiguousChunks =
      chunkEntries.length > 0 && chunkEntries.every((e, i) => e.idx === i);
    const hasSingleFile = !!resData.files?.[GIST_FILENAME];

    const tryParse = (text?: string): any => {
      if (!text) return null;
      try { return JSON.parse(text); } catch { return null; }
    };

    // 組合分割檔內容
    const readChunks = async (): Promise<{ content?: string; error?: string }> => {
      let combined = '';
      for (const { name } of chunkEntries) {
        const chunkFile = resData.files[name];
        if (chunkFile.truncated && chunkFile.raw_url) {
          try {
            const rawRes = await fetch(chunkFile.raw_url, { cache: 'no-cache' });
            if (!rawRes.ok) throw new Error(`HTTP ${rawRes.status}`);
            combined += await rawRes.text();
          } catch (err) {
            return { error: `下載分割檔 ${name} 失敗，請重試。` };
          }
        } else {
          combined += (chunkFile.content || '');
        }
      }
      return { content: combined };
    };

    // 單一檔案模式 (Legacy)
    const readSingleFile = async (): Promise<{ content?: string; error?: string }> => {
      // 注意不能退回「第一個檔案」，否則在殘留 chunk 的 Gist 上會誤抓到分割檔碎片。
      const file: any = resData.files?.[GIST_FILENAME]
        || Object.entries(resData.files || {}).find(([k]) => !isChunkFileName(k))?.[1];
      if (!file) {
        return { error: 'Gist 中找不到 SmartVest 備份檔案' };
      }

      const urlsToTry: string[] = [];
      if (file.raw_url) urlsToTry.push(file.raw_url);
      if (resData.owner?.login) {
        urlsToTry.push(`https://gist.githubusercontent.com/${resData.owner.login}/${gistId}/raw/${GIST_FILENAME}`);
      }
      urlsToTry.push(`https://gist.githubusercontent.com/raw/${gistId}/${GIST_FILENAME}`);

      for (const url of urlsToTry) {
        try {
          const rawRes = await fetch(url, { cache: 'no-cache' });
          if (rawRes.ok) {
            const text = await rawRes.text();
            if (text && text.trim().endsWith('}')) return { content: text };
          }
        } catch (err) {
          console.warn(`Fetch from ${url} failed`, err);
        }
      }

      if (!file.truncated && file.content && file.content.trim().endsWith('}')) {
        return { content: file.content };
      }
      return { error: '舊版備份資料過大被 GitHub 截斷。請在「電腦端」先點擊「備份上傳」轉換為新版分割格式後，再於手機下載！' };
    };

    // 依可信度排序來源，取第一個能解析成合法 JSON 的
    const sources: Array<() => Promise<{ content?: string; error?: string }>> = [];
    if (hasContiguousChunks) {
      sources.push(readChunks);
      if (hasSingleFile) sources.push(readSingleFile);
    } else if (hasSingleFile) {
      sources.push(readSingleFile);
      if (chunkEntries.length > 0) sources.push(readChunks);
    } else if (chunkEntries.length > 0) {
      sources.push(readChunks);
    } else {
      sources.push(readSingleFile);
    }

    let backupPayload: any = null;
    let rawJsonContent = '';
    let readError: string | undefined;

    for (const read of sources) {
      const res = await read();
      if (res.error && !readError) readError = res.error;
      if (!res.content) continue;
      if (!rawJsonContent) rawJsonContent = res.content;
      const parsed = tryParse(res.content);
      if (parsed) {
        backupPayload = parsed;
        rawJsonContent = res.content;
        break;
      }
    }

    if (!rawJsonContent) {
      return { success: false, error: readError || 'Gist 備份內容為空' };
    }

    if (!backupPayload) {
      return { success: false, error: '雲端資料格式不完整，請於電腦端再次按下「備份上傳至 GitHub」更新存檔。' };
    }

    const imported = importAllAppData(backupPayload);
    if (imported.success) {
      const currentConfig = getGitHubSyncConfig();
      saveGitHubSyncConfig({
        ...currentConfig,
        token,
        gistId,
        lastSyncedAt: new Date().toLocaleString('zh-TW')
      });
      return { success: true, warning: imported.warning };
    }
    return { success: false, error: imported.error || '解析或還原備份資料失敗' };
  } catch (e: any) {
    return { success: false, error: e.message || '連線至 GitHub 失敗' };
  }
};
