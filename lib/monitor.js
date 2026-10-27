import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {Collector} from './collector.js';
import {intervalFor, isStale} from './policy.js';

const MISSING_HOST_ERROR = {
    code: 'CONFIGURATION_ERROR',
    message: 'Set a primary SSH host in Connection Settings',
};

export class Monitor {
    constructor(config, onChange, collector = new Collector()) {
        this.config = config;
        this.onChange = onChange;
        this.collector = collector;
        this.snapshot = null;
        this.error = null;
        this.state = 'CONNECTING';
        this.failed = false;
        this.paused = false;
        this.active = false;
        this.inFlight = false;
        this.pendingRefresh = false;
        // Incremented whenever in-flight results become obsolete (stop, pause, reconfigure).
        this.generation = 0;
        this.timerId = 0;
        this.onBattery = null;
        this.powerProxy = null;
        this.powerSignal = 0;
        this.lastAttemptAt = 0;
    }

    start() {
        this.active = true;
        this._initPower();
        if (this.config.primaryHost) {
            this.refresh();
        } else {
            this.state = 'ERROR';
            this.error = MISSING_HOST_ERROR;
            this.onChange();
        }
    }

    stop() {
        this.active = false;
        this.generation++;
        this._clearTimer();
        this.collector.cancel();
        if (this.powerSignal)
            this.powerProxy.disconnect(this.powerSignal);
        this.powerSignal = 0;
        this.powerProxy = null;
    }

    configure(config) {
        const hostChanged = this.config.primaryHost !== config.primaryHost ||
            this.config.fallbackHost !== config.fallbackHost;
        this.config = config;
        this.generation++;
        this.collector.cancel();
        this._clearTimer();
        if (hostChanged)
            this.snapshot = null;
        this.error = null;
        this.failed = false;
        if (!this.active)
            return;

        if (this.paused) {
            this.state = 'PAUSED';
            this.onChange();
        } else if (config.primaryHost) {
            this.state = 'CONNECTING';
            this.onChange();
            if (this.inFlight)
                this.pendingRefresh = true;
            else
                this.refresh();
        } else {
            this.state = 'ERROR';
            this.error = MISSING_HOST_ERROR;
            this.onChange();
        }
    }

    get interval() {
        return intervalFor(this.config, this.onBattery);
    }

    get stale() {
        return isStale(this.snapshot, this.failed, this.interval);
    }

    _clearTimer() {
        if (this.timerId) {
            GLib.source_remove(this.timerId);
            this.timerId = 0;
        }
    }

    _schedule() {
        this._clearTimer();
        if (!this.active || this.paused || !this.config.primaryHost)
            return;
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.interval, () => {
            this.timerId = 0;
            this.refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _isCurrent(generation) {
        return this.active && this.generation === generation && !this.paused;
    }

    async refresh() {
        if (!this.active || this.paused || !this.config.primaryHost || this.inFlight)
            return;

        this._clearTimer();
        this.inFlight = true;
        const generation = this.generation;
        this.state = this.snapshot ? 'REFRESHING' : 'CONNECTING';
        this.lastAttemptAt = Date.now();
        this.onChange();

        let error = null;
        const routes = [['primary', this.config.primaryHost], ['fallback', this.config.fallbackHost]];
        for (const [route, host] of routes) {
            if (!host)
                continue;
            try {
                const gpus = await this.collector.collect(this.config, host);
                if (!this._isCurrent(generation))
                    break;
                this.snapshot = {gpus, route, serverId: host, lastSuccessAt: Date.now()};
                this.error = null;
                this.failed = false;
                this.state = 'CONNECTED';
                error = null;
                break;
            } catch (e) {
                if (!this._isCurrent(generation))
                    break;
                error = {code: e.code || 'REMOTE_COMMAND_FAILED', message: String(e.message).slice(0, 400)};
            }
        }

        if (this._isCurrent(generation)) {
            if (error) {
                this.error = error;
                this.failed = true;
                this.state = this.snapshot ? 'STALE' : 'ERROR';
            }
            this.onChange();
            this._schedule();
        }
        this.inFlight = false;
        if (this.pendingRefresh && this.active && !this.paused) {
            this.pendingRefresh = false;
            this.refresh();
        }
    }

    pause() {
        this.paused = true;
        this.generation++;
        this._clearTimer();
        this.collector.cancel();
        this.state = 'PAUSED';
        this.onChange();
    }

    resume() {
        this.paused = false;
        if (this.inFlight)
            this.pendingRefresh = true;
        else
            this.refresh();
    }

    _initPower() {
        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            'org.freedesktop.UPower', '/org/freedesktop/UPower', 'org.freedesktop.UPower', null,
            (_source, result) => {
                if (!this.active)
                    return;
                try {
                    this.powerProxy = Gio.DBusProxy.new_for_bus_finish(result);
                    this.onBattery = this._readOnBattery();
                    this.powerSignal = this.powerProxy.connect('g-properties-changed', () => {
                        const previous = this.onBattery;
                        this.onBattery = this._readOnBattery();
                        if (previous !== this.onBattery)
                            this._schedule();
                    });
                    this._schedule();
                } catch {
                    this.onBattery = null;
                }
            });
    }

    _readOnBattery() {
        return this.powerProxy.get_cached_property('OnBattery')?.get_boolean() ?? null;
    }
}
