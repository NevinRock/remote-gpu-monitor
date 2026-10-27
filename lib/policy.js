export const INTERVALS = [30, 60, 120, 300];

export function memoryLevel(percent) {
    if (percent >= 90)
        return 'critical';
    if (percent >= 80)
        return 'warning';
    return 'normal';
}

export function intervalFor(config, onBattery) {
    const base = INTERVALS.includes(config.refreshInterval) ? config.refreshInterval : 60;
    const battery = INTERVALS.includes(config.batteryInterval) ? config.batteryInterval : 300;
    return config.powerAware && onBattery === true ? battery : base;
}

export function isStale(snapshot, failed, interval, nowMs = Date.now()) {
    const maxAgeMs = Math.max(90000, interval * 2500);
    return !!snapshot && (failed || nowMs - snapshot.lastSuccessAt > maxAgeMs);
}
