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
  if (!backupPayload || !backupPayload.data) return false;
  try {
    const data = backupPayload.data;
    Object.keys(data).forEach(key => {
      const val = data[key];
      if (val !== null && val !== undefined) {
        localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
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
  const token = (rawToken || '').trim();
  const existingGistId = (rawGistId || '').trim();

  if (!token) return { success: false, error: '未提供 GitHub Token' };

  const payload = exportAllAppData();
  const content = JSON.stringify(payload, null, 2);

  const body: any = {
    description: 'SmartVest 存股記帳雲端備份',
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: content
      }
    }
  };

  try {
    let url = 'https://api.github.com/gists';
    let method = 'POST';

    if (existingGistId) {
      url = `https://api.github.com/gists/${existingGistId}`;
      method = 'PATCH';
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      return { success: false, error: errJson.message || `HTTP ${response.status}` };
    }

    const resData = await response.json();
    const newGistId = resData.id;

    // 更新存檔時間
    const currentConfig = getGitHubSyncConfig();
    saveGitHubSyncConfig({
      ...currentConfig,
      token,
      gistId: newGistId,
      lastSyncedAt: new Date().toLocaleString('zh-TW')
    });

    return { success: true, gistId: newGistId };
  } catch (e: any) {
    return { success: false, error: e.message || '連線至 GitHub 失敗' };
  }
};

// 從 GitHub Gist 下載並還原資料
export const restoreFromGitHubGist = async (rawToken: string, rawGistId: string): Promise<{ success: boolean; error?: string }> => {
  const token = (rawToken || '').trim();
  const gistId = (rawGistId || '').trim();

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
    const file = resData.files?.[GIST_FILENAME];
    if (!file) {
      return { success: false, error: 'Gist 中找不到 SmartVest 備份檔案' };
    }

    let rawJsonContent = file.content;

    // 關鍵修復：若 Gist 內容被 GitHub API 截斷 (truncated) 或需要下載全量資料
    // 注意：存取 raw_url (gist.githubusercontent.com) 時切勿攜帶 Authorization Header，否則會被瀏覽器 CORS 預檢阻擋！
    if (file.truncated || file.raw_url) {
      try {
        const cacheBusterUrl = file.raw_url.includes('?') 
          ? `${file.raw_url}&_t=${Date.now()}` 
          : `${file.raw_url}?_t=${Date.now()}`;

        // 使用乾淨不帶 Authorization 的 fetch，擺脫 CORS 限制
        const rawRes = await fetch(cacheBusterUrl);
        if (rawRes.ok) {
          const fetchedText = await rawRes.text();
          if (fetchedText && fetchedText.trim().endsWith('}')) {
            rawJsonContent = fetchedText;
          }
        }
      } catch (rawErr) {
        console.warn('Failed to fetch from raw_url, fallbacking...', rawErr);
      }
    }

    if (!rawJsonContent) {
      return { success: false, error: 'Gist 備份內容為空' };
    }

    let backupPayload: any = null;
    try {
      backupPayload = JSON.parse(rawJsonContent);
    } catch (parseErr: any) {
      // 備用二次修正：若字串被極端截斷，嘗試補齊尾部封閉符號
      let repairedText = rawJsonContent.trim();
      if (!repairedText.endsWith('}')) {
        const lastBrace = repairedText.lastIndexOf('}');
        if (lastBrace > 0) {
          repairedText = repairedText.substring(0, lastBrace + 1);
        }
      }
      try {
        backupPayload = JSON.parse(repairedText);
      } catch (e2) {
        return { success: false, error: `雲端資料格式不完整 (${parseErr.message})，請點擊「備份上傳 GitHub」建立最新備份檔。` };
      }
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
