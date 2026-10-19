import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {Collector} from './collector.js';
import {intervalFor, isStale} from './policy.js';

export class Monitor {
    constructor(config, onChange, collector = new Collector()) {
        this.config = config; this.onChange = onChange; this.collector = collector;
        this.snapshot = null; this.error = null; this.state = 'CONNECTING';
        this.failed = false; this.paused = false; this.active = false; this.generation = 0;
        this.timerId = 0; this.onBattery = null; this.powerProxy = null; this.powerSignal = 0;
        this.lastAttemptAt = 0;
    }
    start() {
        this.active = true;
        this._initPower();
        if (this.config.primaryHost) this.refresh();
        else {
            this.state = 'ERROR';
            this.error = {code: 'CONFIGURATION_ERROR', message: 'Set a primary SSH host in Connection Settings'};
            this.onChange();
        }
    }
    stop() {
        this.active = false;
        this.generation++;
        this._clearTimer();
        this.collector.cancel();
        if (this.powerSignal) this.powerProxy.disconnect(this.powerSignal);
        this.powerSignal = 0;
        this.powerProxy = null;
    }
    configure(config) {
        const oldHost = this.config.primaryHost, oldFallback = this.config.fallbackHost;
        this.config = config; this.generation++; this.collector.cancel(); this._clearTimer();
        if (oldHost !== config.primaryHost || oldFallback !== config.fallbackHost) this.snapshot = null;
        this.error = null; this.failed = false;
        if (!this.active) return;
        if (this.paused) { this.state = 'PAUSED'; this.onChange(); }
        else if (config.primaryHost) { this.state = 'CONNECTING'; this.onChange(); if (this.inFlight) this.pendingRefresh = true; else this.refresh(); }
        else { this.state = 'ERROR'; this.error = {code: 'CONFIGURATION_ERROR', message: 'Set a primary SSH host in Connection Settings'}; this.onChange(); }
    }
    get interval() { return intervalFor(this.config, this.onBattery); }
    get stale() { return isStale(this.snapshot, this.failed, this.interval); }
    _clearTimer() { if (this.timerId) { GLib.source_remove(this.timerId); this.timerId = 0; } }
    _schedule() {
        this._clearTimer(); if (!this.active || this.paused || !this.config.primaryHost) return;
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.interval, () => {
            this.timerId = 0; this.refresh(); return GLib.SOURCE_REMOVE;
        });
    }
    async refresh() {
        if (!this.active || this.paused || !this.config.primaryHost || this.inFlight) return;
        this._clearTimer(); this.inFlight = true; const generation = this.generation;
        this.state = this.snapshot ? 'REFRESHING' : 'CONNECTING'; this.lastAttemptAt = Date.now(); this.onChange();
        let error = null;
        for (const [route, host] of [['primary', this.config.primaryHost], ['fallback', this.config.fallbackHost]]) {
            if (!host) continue;
            try {
                const gpus = await this.collector.collect(this.config, host);
                if (!this.active || this.generation !== generation || this.paused) break;
                this.snapshot = {gpus, route, serverId: host, lastSuccessAt: Date.now()};
                this.error = null; this.failed = false; this.state = 'CONNECTED'; error = null; break;
            } catch (e) {
                if (!this.active || this.generation !== generation || this.paused) break;
                error = {code: e.code || 'REMOTE_COMMAND_FAILED', message: String(e.message).slice(0, 400)};
            }
        }
        if (this.active && this.generation === generation && !this.paused) {
            if (error) { this.error = error; this.failed = true; this.state = this.snapshot ? 'STALE' : 'ERROR'; }
            this.onChange(); this._schedule();
        }
        this.inFlight = false;
        if (this.pendingRefresh && this.active && !this.paused) { this.pendingRefresh = false; this.refresh(); }
    }
    pause() { this.paused = true; this.generation++; this._clearTimer(); this.collector.cancel(); this.state = 'PAUSED'; this.onChange(); }
    resume() { this.paused = false; if (this.inFlight) this.pendingRefresh = true; else this.refresh(); }
    _initPower() {
        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE,
            null, 'org.freedesktop.UPower', '/org/freedesktop/UPower', 'org.freedesktop.UPower', null,
            (source, result) => {
                if (!this.active) return;
                try {
                    this.powerProxy = Gio.DBusProxy.new_for_bus_finish(result);
                    this.onBattery = this.powerProxy.get_cached_property('OnBattery')?.get_boolean() ?? null;
                    this.powerSignal = this.powerProxy.connect('g-properties-changed', () => {
                        const previous = this.onBattery;
                        this.onBattery = this.powerProxy.get_cached_property('OnBattery')?.get_boolean() ?? null;
                        if (previous !== this.onBattery) this._schedule();
                    });
                    this._schedule();
                } catch { this.onBattery = null; }
            });
    }
}
