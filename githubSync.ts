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

// 恢復雲端數據到 LocalStorage
export const importAllAppData = (backupPayload: Record<string, any>): boolean => {
  if (!backupPayload || typeof backupPayload !== 'object') return false;
  try {
    let dataMap: Record<string, any> = {};

    if (backupPayload.data && typeof backupPayload.data === 'object') {
      dataMap = backupPayload.data;
    } else {
      dataMap = backupPayload;
    }

    // 1. 若內容包含 smartvest_data_v2 核心主物件
    if (dataMap.smartvest_data_v2) {
      const val = dataMap.smartvest_data_v2;
      localStorage.setItem('smartvest_data_v2', typeof val === 'string' ? val : JSON.stringify(val));
    } 
    // 2. 若內容為直接的股票/交易/帳戶物件 { stocks, transactions, accounts }
    else if (dataMap.stocks || dataMap.transactions || dataMap.accounts) {
      localStorage.setItem('smartvest_data_v2', JSON.stringify(dataMap));
    }
    
    // 3. 同步寫入所有包含的附屬 Key
    Object.keys(dataMap).forEach(key => {
      if (key !== 'smartvest_data_v2') {
        const val = dataMap[key];
        if (val !== null && val !== undefined) {
          localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
        }
      }
    });

    return true;
  } catch (e) {
    console.error('Failed to import app data', e);
    return false;
  }
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

    if (numChunks <= 1) {
      const filesPayload: any = { [GIST_FILENAME]: { content: content } };
      if (currentMethod === 'PATCH') {
        for (let i = 0; i < 10; i++) filesPayload[`smartvest_backup_${i.toString().padStart(2, '0')}.json`] = null;
      }
      
      let res = await sendGistReq(currentUrl, currentMethod, filesPayload);
      if (!res.ok && res.status === 404 && existingGistId) {
        currentUrl = 'https://api.github.com/gists';
        currentMethod = 'POST';
        for (let i = 0; i < 10; i++) delete filesPayload[`smartvest_backup_${i.toString().padStart(2, '0')}.json`];
        res = await sendGistReq(currentUrl, currentMethod, filesPayload);
      }
      
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
          filesPayload[GIST_FILENAME] = null; 
        }

        let res = await sendGistReq(currentUrl, currentMethod, filesPayload);
        
        if (i === 0 && !res.ok && res.status === 404 && existingGistId) {
          currentUrl = 'https://api.github.com/gists';
          currentMethod = 'POST';
          delete filesPayload[GIST_FILENAME];
          res = await sendGistReq(currentUrl, currentMethod, filesPayload);
        }
        
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
export const restoreFromGitHubGist = async (rawToken: string, rawGistId: string): Promise<{ success: boolean; error?: string }> => {
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
    // 尋找分割的 chunk 檔案 (smartvest_backup_00.json, etc.)
    const chunkKeys = Object.keys(resData.files || {}).filter(k => k.startsWith('smartvest_backup_') && k.endsWith('.json')).sort();
    
    let rawJsonContent = '';
    let rawFetchSuccess = false;

    if (chunkKeys.length > 0) {
      // 組合所有 chunks
      for (const k of chunkKeys) {
        const chunkFile = resData.files[k];
        if (chunkFile.truncated) {
          // 極端情況防呆：理論上 800KB 不會被 truncated
          return { success: false, error: '部分分割檔案意外遭到 GitHub 截斷，請重新備份上傳。' };
        }
        rawJsonContent += (chunkFile.content || '');
      }
      rawFetchSuccess = true;
    } else {
      // 退回單一檔案模式 (Legacy)
      const file = resData.files?.[GIST_FILENAME] || (resData.files ? Object.values(resData.files)[0] : null) as any;
      if (!file) {
        return { success: false, error: 'Gist 中找不到 SmartVest 備份檔案' };
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
            if (text && text.trim().endsWith('}')) {
              rawJsonContent = text;
              rawFetchSuccess = true;
              break;
            }
          }
        } catch (err) {
          console.warn(`Fetch from ${url} failed`, err);
        }
      }

      if (!rawFetchSuccess) {
        if (!file.truncated && file.content && file.content.trim().endsWith('}')) {
          rawJsonContent = file.content;
          rawFetchSuccess = true;
        } else {
          return { success: false, error: '舊版備份資料過大被 GitHub 截斷。請在「電腦端」先點擊「備份上傳」轉換為新版分割格式後，再於手機下載！' };
        }
      }
    }

    if (!rawJsonContent) {
      return { success: false, error: 'Gist 備份內容為空' };
    }

    let backupPayload: any = null;
    try {
      backupPayload = JSON.parse(rawJsonContent);
    } catch (parseErr: any) {
      return { success: false, error: `雲端資料格式不完整 (${parseErr.message})，請於電腦端再次按下「備份上傳至 GitHub」更新存檔。` };
    }

    const ok = importAllAppData(backupPayload);
    if (ok) {
      const currentConfig = getGitHubSyncConfig();
      saveGitHubSyncConfig({
        ...currentConfig,
        token,
        gistId,
        lastSyncedAt: new Date().toLocaleString('zh-TW')
      });
      return { success: true };
    } else {
      return { success: false, error: '解析或還原備份資料失敗' };
    }
  } catch (e: any) {
    return { success: false, error: e.message || '連線至 GitHub 失敗' };
  }
};
