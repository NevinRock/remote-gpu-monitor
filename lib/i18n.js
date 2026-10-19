const strings = {
    zh: {
        language: '语言', appearance: '外观', theme: '菜单主题', dark: '深色', light: '浅色',
        appearanceHint: '切换顶栏下拉菜单的颜色',
        connection: '连接', connectionHint: '使用已有 SSH 配置中的别名。请先在终端连接一次，确认主机密钥。',
        displayName: '显示名称', primaryHost: '主要 SSH 别名', fallbackHost: '备用 SSH 别名',
        sshConfigPath: 'SSH 配置路径（可选）', sshExecutable: 'SSH 程序路径（可选）',
        testConnection: '测试连接', testHint: '执行一次限时 GPU 查询并验证数据', test: '测试',
        testing: '正在测试…', enterHost: '请先填写主要 SSH 别名',
        testSuccess: '已通过{route}连接：{count} 张 GPU，{name}',
        polling: '刷新', baseInterval: '基本刷新间隔', batteryInterval: '电池刷新间隔',
        powerAware: '省电模式', powerAwareHint: 'UPower 报告使用电池时采用电池刷新间隔',
        project: '项目', website: '网站', openGitHub: '打开 GitHub',
        secondsOption: '{seconds} 秒',
        vram: '显存', free: '空闲', gpuCount: '{count} 张 GPU',
        updated: '上次更新 {time} · {age} · {route}',
        secondsAgo: '{count} 秒前', minutesAgo: '{count} 分钟前',
        primaryRoute: '主线路', fallbackRoute: '备用线路',
        connecting: '连接中', connected: '已连接', refreshing: '刷新中', stale: '数据已过期',
        error: '连接错误', paused: '已暂停', historical: '{state} · 以下为历史读数',
        noData: '暂无 GPU 数据', refreshStatus: '刷新间隔 {seconds} 秒{battery}', batteryMode: ' · 电池模式',
        errorDetails: '错误详情', refreshNow: '立即刷新', resume: '恢复刷新', pause: '暂停刷新',
        refreshInterval: '刷新间隔', copyStatus: '复制 GPU 状态', connectionSettings: '连接设置…',
        stop: '停止监控',
        server: '服务器', status: '状态', route: '线路', lastSample: '上次成功采样',
        isStale: '数据过期', yes: '是', no: '否', utilization: '利用率', temperature: '温度', power: '功率',
    },
    en: {
        language: 'Language', appearance: 'Appearance', theme: 'Menu theme', dark: 'Dark', light: 'Light',
        appearanceHint: 'Choose the top-bar dropdown color',
        connection: 'Connection', connectionHint: 'Use an alias from your existing SSH config. Connect once in a terminal to verify its host key.',
        displayName: 'Display name', primaryHost: 'Primary SSH alias', fallbackHost: 'Fallback SSH alias',
        sshConfigPath: 'SSH config path (optional)', sshExecutable: 'SSH executable (optional)',
        testConnection: 'Test Connection', testHint: 'Runs one bounded GPU query and validates its data', test: 'Test',
        testing: 'Testing…', enterHost: 'Enter a primary SSH alias first',
        testSuccess: 'Connected via {route}: {count} GPU(s), {name}',
        polling: 'Polling', baseInterval: 'Base refresh interval', batteryInterval: 'Battery refresh interval',
        powerAware: 'Save battery power', powerAwareHint: 'Use the battery interval when UPower reports battery power',
        project: 'Project', website: 'Website', openGitHub: 'Open GitHub',
        secondsOption: '{seconds} seconds',
        vram: 'VRAM', free: 'Free', gpuCount: '{count} GPUs',
        updated: 'Last updated {time} · {age} · {route}',
        secondsAgo: '{count} sec ago', minutesAgo: '{count} min ago',
        primaryRoute: 'Primary', fallbackRoute: 'Fallback',
        connecting: 'Connecting', connected: 'Connected', refreshing: 'Refreshing', stale: 'Data stale',
        error: 'Connection error', paused: 'Paused', historical: '{state} · Historical readings below',
        noData: 'No GPU data yet', refreshStatus: 'Refresh every {seconds} sec{battery}', batteryMode: ' · battery mode',
        errorDetails: 'Error details', refreshNow: 'Refresh now', resume: 'Resume', pause: 'Pause',
        refreshInterval: 'Refresh interval', copyStatus: 'Copy GPU status', connectionSettings: 'Connection settings…',
        stop: 'Stop monitoring',
        server: 'Server', status: 'Status', route: 'Route', lastSample: 'Last successful sample',
        isStale: 'Stale', yes: 'Yes', no: 'No', utilization: 'Utilization', temperature: 'Temperature', power: 'Power',
    },
};

export const LANGUAGES = ['zh', 'en'];
export const APPEARANCES = ['dark', 'light'];
export const languageOf = settings => settings.get_string('ui-language') === 'en' ? 'en' : 'zh';
export const appearanceOf = settings => settings.get_string('appearance') === 'light' ? 'light' : 'dark';
export function tr(language, key, values = {}) {
    const template = strings[language]?.[key] ?? strings.zh[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ''));
}
