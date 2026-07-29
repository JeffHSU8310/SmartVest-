const fs = require('fs');
const file = '/app/applet/components/StockScreener.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetPattern = /<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">[\s\S]*?{Object\.entries\(presets\)\.map\(\(\[name, p\]\) => \([\s\S]*?<\/div>\s*\)\s*:\s*\([\s\S]*?<\/div>[\s\S]*?<\/div>/;

const replacement = `<div className="space-y-8">
                        {/* 1. 市場與資產類型 */}
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                            <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">1. 市場與資產分類</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                <div>
                                    <label className="block text-slate-600 mb-2 font-medium">市場分類</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={config.markets.includes('TWSE')} onChange={() => toggleMarket('TWSE')} className="text-indigo-600 focus:ring-indigo-500 rounded" />
                                            <span className="text-slate-700">上市</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={config.markets.includes('TPEx')} onChange={() => toggleMarket('TPEx')} className="text-indigo-600 focus:ring-indigo-500 rounded" />
                                            <span className="text-slate-700">上櫃</span>
                                        </label>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-slate-600 mb-2 font-medium">資產類型</label>
                                    <div className="flex gap-4 flex-wrap">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={config.assetTypes.includes('Stock')} onChange={() => toggleAssetType('Stock')} className="text-indigo-600 focus:ring-indigo-500 rounded" />
                                            <span className="text-slate-700">股票</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={config.assetTypes.includes('ETF')} onChange={() => toggleAssetType('ETF')} className="text-indigo-600 focus:ring-indigo-500 rounded" />
                                            <span className="text-slate-700">ETF</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={config.assetTypes.includes('ETN')} onChange={() => toggleAssetType('ETN')} className="text-indigo-600 focus:ring-indigo-500 rounded" />
                                            <span className="text-slate-700">ETN</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. 籌碼面分類 */}
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                            <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">2. 籌碼面分類</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                                <div>
                                    <label className="block text-slate-600 mb-1 font-medium">股價範圍 (元)</label>
                                    <div className="flex items-center gap-2">
                                        <input type="number" placeholder="Min" value={config.minPrice} onChange={e => setConfig({...config, minPrice: e.target.value})} className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                                        <span className="text-slate-400">-</span>
                                        <input type="number" placeholder="Max" value={config.maxPrice} onChange={e => setConfig({...config, maxPrice: e.target.value})} className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-slate-600 mb-1 font-medium">成交量 (張) 大於</label>
                                    <input type="number" value={config.minVolume} onChange={e => setConfig({...config, minVolume: e.target.value})} className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-slate-400 mb-1 font-medium">三大法人買賣超 <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">即將推出</span></label>
                                    <input type="text" disabled placeholder="敬請期待" className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5 text-slate-400 cursor-not-allowed" />
                                </div>
                                <div>
                                    <label className="block text-slate-400 mb-1 font-medium">融資融券 <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">即將推出</span></label>
                                    <input type="text" disabled placeholder="敬請期待" className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5 text-slate-400 cursor-not-allowed" />
                                </div>
                                <div>
                                    <label className="block text-slate-400 mb-1 font-medium">主力進出 <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">即將推出</span></label>
                                    <input type="text" disabled placeholder="敬請期待" className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5 text-slate-400 cursor-not-allowed" />
                                </div>
                            </div>
                        </div>

                        {/* 3. 基本面分類 */}
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                            <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">3. 基本面分類</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                                <div>
                                    <label className="block text-slate-600 mb-1 font-medium">本益比 (PE) 小於</label>
                                    <input type="number" placeholder="例如: 15" value={config.maxPe} onChange={e => setConfig({...config, maxPe: e.target.value})} className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-slate-600 mb-1 font-medium">殖利率 (%) 大於</label>
                                    <input type="number" placeholder="例如: 5" value={config.minYield} onChange={e => setConfig({...config, minYield: e.target.value})} className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-slate-400 mb-1 font-medium">EPS <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">即將推出</span></label>
                                    <input type="text" disabled placeholder="敬請期待" className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5 text-slate-400 cursor-not-allowed" />
                                </div>
                                <div>
                                    <label className="block text-slate-400 mb-1 font-medium">月營收成長 <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">即將推出</span></label>
                                    <input type="text" disabled placeholder="敬請期待" className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5 text-slate-400 cursor-not-allowed" />
                                </div>
                            </div>
                        </div>

                        {/* 4. 技術面分類 */}
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                            <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">4. 技術面分類</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                <div className="space-y-3">
                                    <label className="block text-slate-600 mb-2 font-medium">均線條件 (可複選)</label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={config.techConditions.includes('price_above_20ma')} onChange={() => toggleTechCondition('price_above_20ma')} className="text-indigo-600 focus:ring-indigo-500 rounded" />
                                        <span className="text-slate-700">站上月線 (20MA)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={config.techConditions.includes('price_above_60ma')} onChange={() => toggleTechCondition('price_above_60ma')} className="text-indigo-600 focus:ring-indigo-500 rounded" />
                                        <span className="text-slate-700">站上季線 (60MA)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={config.techConditions.includes('golden_cross_20_60')} onChange={() => toggleTechCondition('golden_cross_20_60')} className="text-indigo-600 focus:ring-indigo-500 rounded" />
                                        <span className="text-slate-700">月線大於季線 (多頭排列)</span>
                                    </label>
                                </div>
                                <div className="space-y-3 opacity-60">
                                    <label className="block text-slate-600 mb-2 font-medium flex items-center gap-2">技術指標 <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded font-normal">功能即將推出</span></label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="flex items-center gap-2 cursor-not-allowed"><input type="checkbox" disabled className="rounded" /><span className="text-slate-500">K&D 黃金交叉</span></label>
                                        <label className="flex items-center gap-2 cursor-not-allowed"><input type="checkbox" disabled className="rounded" /><span className="text-slate-500">RSI 超賣回升</span></label>
                                        <label className="flex items-center gap-2 cursor-not-allowed"><input type="checkbox" disabled className="rounded" /><span className="text-slate-500">MACD 翻紅</span></label>
                                        <label className="flex items-center gap-2 cursor-not-allowed"><input type="checkbox" disabled className="rounded" /><span className="text-slate-500">布林通道觸下軌</span></label>
                                        <label className="flex items-center gap-2 cursor-not-allowed"><input type="checkbox" disabled className="rounded" /><span className="text-slate-500">DMI 指標</span></label>
                                        <label className="flex items-center gap-2 cursor-not-allowed"><input type="checkbox" disabled className="rounded" /><span className="text-slate-500">CCI 指標</span></label>
                                        <label className="flex items-center gap-2 cursor-not-allowed"><input type="checkbox" disabled className="rounded" /><span className="text-slate-500">威廉指標 (JR)</span></label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 自訂組合 */}
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                            <h4 className="font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
                                <Save size={18} className="text-indigo-500"/> 自訂篩選組合
                            </h4>
                            <div className="flex flex-col md:flex-row gap-6 text-sm">
                                <div className="flex-1">
                                    <label className="block text-slate-600 mb-2 font-medium">儲存目前的條件設定</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="輸入組合名稱..." 
                                            value={presetName}
                                            onChange={e => setPresetName(e.target.value)}
                                            className="flex-1 border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 text-sm focus:outline-none" 
                                        />
                                        <button onClick={handleSavePreset} className="bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-md hover:bg-indigo-200 transition-colors text-sm font-medium">
                                            儲存組合
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6">
                                    <label className="block text-slate-600 mb-2 font-medium">已儲存的組合</label>
                                    {Object.keys(presets).length > 0 ? (
                                        <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2">
                                            {Object.entries(presets).map(([name, p]) => (
                                                <div key={name} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg hover:border-indigo-300 transition-colors">
                                                    <button onClick={() => handleLoadPreset(name)} className="text-sm text-indigo-600 hover:text-indigo-800 flex-1 text-left font-medium">
                                                        {name}
                                                    </button>
                                                    <button onClick={() => handleDeletePreset(name)} className="text-slate-400 hover:text-rose-500 p-1">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-400 py-3 bg-white rounded-lg border border-slate-200 border-dashed text-center">尚未儲存任何組合設定</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>`;

if(targetPattern.test(content)) {
    content = content.replace(targetPattern, replacement);
    fs.writeFileSync(file, content);
    console.log("Success");
} else {
    console.log("Pattern not found");
}
