import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Monitor} from './lib/monitor.js';
import {readConfig} from './lib/config.js';
import {INTERVALS, memoryLevel} from './lib/policy.js';
import {languageOf, appearanceOf, tr} from './lib/i18n.js';

const gib = mib => `${(mib / 1024).toFixed(1)} GiB`;
const gibValue = mib => (mib / 1024).toFixed(1);
const shown = (value, suffix = '') => value === null ? '—' : `${value}${suffix}`;
const stateKeys = {CONNECTING: 'connecting', CONNECTED: 'connected', REFRESHING: 'refreshing',
    STALE: 'stale', ERROR: 'error', PAUSED: 'paused'};
const stateText = (language, state) => tr(language, stateKeys[state] ?? state);
function label(text, style = '') { return new St.Label({text, style_class: style}); }
function verticalBox(styleClass = '') {
    const axis = Number.parseInt(Config.PACKAGE_VERSION, 10) >= 48
        ? {orientation: Clutter.Orientation.VERTICAL} : {vertical: true};
    return new St.BoxLayout({...axis, style_class: styleClass});
}
function compactMenuItem(item, style = 'gpu-menu-small') {
    item.label?.add_style_class_name(style);
    return item;
}
function progress(value, kind, language) {
    const meter = new St.BoxLayout({style_class: 'gpu-meter-row'});
    meter.add_child(label(kind === 'memory' ? tr(language, 'vram') : 'GPU', 'gpu-meter-label'));
    const outer = new St.BoxLayout({style_class: 'gpu-progress', height: 2,
        y_align: Clutter.ActorAlign.CENTER});
    if (value !== null) {
        const color = kind === 'memory' ? `gpu-memory-${memoryLevel(value)}-fill` : 'gpu-utilization-fill';
        outer.add_child(new St.Widget({style_class: `gpu-progress-fill ${color}`,
            width: Math.max(0, Math.round(260 * value / 100)), height: 2}));
    }
    meter.add_child(outer);
    return meter;
}
function gpuRow(gpu, language) {
    const box = verticalBox('gpu-row');
    const header = new St.BoxLayout({style_class: 'gpu-row-header'});
    const title = label(`GPU ${gpu.index} · ${gpu.name}`, 'gpu-title'); title.x_expand = true;
    header.add_child(title);
    header.add_child(label(`${shown(gpu.temperatureC, '°C')} · ${shown(gpu.powerW, ' W')}`, 'gpu-metadata'));
    header.add_child(label(shown(gpu.utilizationPercent, '%'), 'gpu-percent'));
    box.add_child(header);
    box.add_child(progress(gpu.utilizationPercent, 'gpu', language));
    box.add_child(progress(100 * gpu.usedMiB / gpu.totalMiB, 'memory', language));
    box.add_child(label(`${tr(language, 'vram')} ${gibValue(gpu.usedMiB)} / ${gibValue(gpu.totalMiB)} GiB   ${tr(language, 'free')} ${gib(gpu.freeMiB)}`, 'gpu-muted'));
    return box;
}
function copyText(monitor, language) {
    const s = monitor.snapshot, c = monitor.config;
    const lines = ['Remote GPU Monitor', `${tr(language, 'server')}: ${c.displayName}`,
        `${tr(language, 'status')}: ${stateText(language, monitor.state)}`,
        `${tr(language, 'route')}: ${s ? tr(language, s.route === 'fallback' ? 'fallbackRoute' : 'primaryRoute') : '—'}`,
        `${tr(language, 'lastSample')}: ${s ? new Date(s.lastSuccessAt).toLocaleString() : '—'}`,
        `${tr(language, 'isStale')}: ${tr(language, monitor.stale ? 'yes' : 'no')}`,
        `${tr(language, 'refreshInterval')}: ${tr(language, 'secondsOption', {seconds: monitor.interval})}`];
    if (s) for (const g of s.gpus) lines.push('', `GPU ${g.index}`, `UUID: ${g.uuid}`, `Name: ${g.name}`,
        `${tr(language, 'utilization')}: ${shown(g.utilizationPercent, '%')}`,
        `${tr(language, 'vram')}: ${gib(g.usedMiB)} / ${gib(g.totalMiB)}`,
        `${tr(language, 'free')} ${tr(language, 'vram')}: ${gib(g.freeMiB)}`,
        `${tr(language, 'temperature')}: ${shown(g.temperatureC, '°C')}`,
        `${tr(language, 'power')}: ${shown(g.powerW, 'W')}`);
    return lines.join('\n');
}
const Indicator = GObject.registerClass(class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Remote GPU Monitor');
        this.extension = extension;
        const iconFile = Gio.File.new_for_path(`${extension.path}/remote-gpu-panel.png`);
        this.add_child(new St.Icon({gicon: Gio.FileIcon.new(iconFile), icon_size: 20,
            style_class: 'system-status-icon'}));
        this.applyAppearance();
    }
    applyAppearance() {
        this.menu.actor.remove_style_class_name('gpu-theme-dark');
        this.menu.actor.remove_style_class_name('gpu-theme-light');
        this.menu.actor.add_style_class_name(`gpu-theme-${appearanceOf(this.extension.settings)}`);
    }
    update() {
        this.renderMenu();
    }
    updateAge() {
        const snapshot = this.extension.monitor.snapshot;
        if (!snapshot || !this.updatedItem) return;
        const age = Math.max(0, Math.floor((Date.now() - snapshot.lastSuccessAt) / 1000));
        const language = languageOf(this.extension.settings);
        const relative = tr(language, age < 60 ? 'secondsAgo' : 'minutesAgo',
            {count: age < 60 ? age : Math.floor(age / 60)});
        const time = new Date(snapshot.lastSuccessAt).toLocaleTimeString(undefined, {hour12: false});
        this.updatedItem.label.text = tr(language, 'updated', {time, age: relative,
            route: tr(language, snapshot.route === 'fallback' ? 'fallbackRoute' : 'primaryRoute')});
    }
    renderMenu() {
        const m = this.extension.monitor, s = m.snapshot;
        const language = languageOf(this.extension.settings);
        this.menu.removeAll();
        this.updatedItem = null;
        const state = stateText(language, m.state);
        this.menu.addMenuItem(compactMenuItem(new PopupMenu.PopupMenuItem(
            `${m.config.displayName} · ${s ? tr(language, 'gpuCount', {count: s.gpus.length}) : state}`, {reactive: false}), 'gpu-menu-heading'));
        if (s) {
            this.updatedItem = compactMenuItem(new PopupMenu.PopupMenuItem('', {reactive: false}));
            this.menu.addMenuItem(this.updatedItem);
            this.updateAge();
            if (m.stale || m.paused) this.menu.addMenuItem(compactMenuItem(new PopupMenu.PopupMenuItem(tr(language, 'historical', {state}), {reactive: false})));
            const item = new PopupMenu.PopupBaseMenuItem({reactive: false});
            const scroll = new St.ScrollView({style_class: 'gpu-scroll', overlay_scrollbars: true, hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
            const rows = verticalBox();
            for (const gpu of s.gpus) rows.add_child(gpuRow(gpu, language));
            scroll.set_child(rows); item.add_child(scroll); this.menu.addMenuItem(item);
        } else this.menu.addMenuItem(compactMenuItem(new PopupMenu.PopupMenuItem(tr(language, 'noData'), {reactive: false})));
        this.menu.addMenuItem(compactMenuItem(new PopupMenu.PopupMenuItem(
            tr(language, 'refreshStatus', {seconds: m.interval,
                battery: m.onBattery === true ? tr(language, 'batteryMode') : ''}), {reactive: false})));
        if (m.error) {
            const details = compactMenuItem(new PopupMenu.PopupSubMenuMenuItem(tr(language, 'errorDetails')));
            details.menu.addMenuItem(compactMenuItem(new PopupMenu.PopupMenuItem(m.error.code, {reactive: false})));
            details.menu.addMenuItem(compactMenuItem(new PopupMenu.PopupMenuItem(m.error.message, {reactive: false})));
            this.menu.addMenuItem(details);
        }
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const refresh = compactMenuItem(this.menu.addAction(tr(language, 'refreshNow'), () => m.refresh())); refresh.setSensitive(!m.paused && !!m.config.primaryHost);
        compactMenuItem(this.menu.addAction(tr(language, m.paused ? 'resume' : 'pause'), () => m.paused ? m.resume() : m.pause()));
        const intervals = compactMenuItem(new PopupMenu.PopupSubMenuMenuItem(tr(language, 'refreshInterval')));
        for (const seconds of INTERVALS) {
            const text = `${tr(language, 'secondsOption', {seconds})}${m.config.refreshInterval === seconds ? ' ✓' : ''}`;
            compactMenuItem(intervals.menu.addAction(text,
                () => this.extension.settings.set_int('refresh-interval', seconds)));
        }
        this.menu.addMenuItem(intervals);
        compactMenuItem(this.menu.addAction(tr(language, 'copyStatus'), () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, copyText(m, language))));
        compactMenuItem(this.menu.addAction(tr(language, 'connectionSettings'), () => this.extension.openPreferences()));
        compactMenuItem(this.menu.addAction(tr(language, 'stop'), () => m.pause()));
    }
});
export default class RemoteGpuExtension extends Extension {
    enable() {
        this.settings = this.getSettings();
        this.monitor = new Monitor(readConfig(this.settings), () => this.indicator?.update());
        this.indicator = new Indicator(this);
        this.menuOpenSignal = this.indicator.menu.connect('open-state-changed', (_menu, open) => {
            if (open) this.indicator.updateAge();
        });
        Main.panel.addToStatusArea(this.uuid, this.indicator, 0, 'right');
        this.settingsChanged = this.settings.connect('changed', (_settings, key) => {
            if (key === 'ui-language') this.indicator.update();
            else if (key === 'appearance') this.indicator.applyAppearance();
            else this.monitor.configure(readConfig(this.settings));
        });
        this.monitor.start(); this.indicator.update();
    }
    disable() {
        this.monitor?.stop();
        if (this.settingsChanged) this.settings.disconnect(this.settingsChanged);
        if (this.indicator) {
            this.indicator.menu.disconnect(this.menuOpenSignal);
            this.indicator.destroy();
        }
        this.indicator = null; this.monitor = null; this.settings = null;
        this.settingsChanged = 0; this.menuOpenSignal = 0;
    }
}
