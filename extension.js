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
import {projectPath} from './lib/parser.js';

const STATE_KEYS = {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    REFRESHING: 'refreshing',
    STALE: 'stale',
    ERROR: 'error',
    PAUSED: 'paused',
};

function gib(mib) {
    return `${(mib / 1024).toFixed(1)} GiB`;
}

function gibValue(mib) {
    return (mib / 1024).toFixed(1);
}

function shown(value, suffix = '') {
    return value === null ? '—' : `${value}${suffix}`;
}

function stateText(language, state) {
    return tr(language, STATE_KEYS[state] ?? state);
}

function routeText(language, route) {
    return tr(language, route === 'fallback' ? 'fallbackRoute' : 'primaryRoute');
}

function label(text, styleClass = '') {
    return new St.Label({text, style_class: styleClass});
}

function verticalBox(styleClass = '') {
    // GNOME 48 replaced the "vertical" property with "orientation".
    const axis = Number.parseInt(Config.PACKAGE_VERSION, 10) >= 48
        ? {orientation: Clutter.Orientation.VERTICAL}
        : {vertical: true};
    return new St.BoxLayout({...axis, style_class: styleClass});
}

function compactMenuItem(item, styleClass = 'gpu-menu-small') {
    item.label?.add_style_class_name(styleClass);
    return item;
}

function infoItem(text, styleClass) {
    return compactMenuItem(new PopupMenu.PopupMenuItem(text, {reactive: false}), styleClass);
}

function progress(value, kind, language) {
    const meter = new St.BoxLayout({style_class: 'gpu-meter-row'});
    meter.add_child(label(kind === 'memory' ? tr(language, 'vram') : 'GPU', 'gpu-meter-label'));

    const outer = new St.BoxLayout({
        style_class: 'gpu-progress',
        height: 2,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (value !== null) {
        const color = kind === 'memory'
            ? `gpu-memory-${memoryLevel(value)}-fill`
            : 'gpu-utilization-fill';
        outer.add_child(new St.Widget({
            style_class: `gpu-progress-fill ${color}`,
            width: Math.max(0, Math.round(260 * value / 100)),
            height: 2,
        }));
    }
    meter.add_child(outer);
    return meter;
}

function processSummary(process, language) {
    const parts = [
        process.user ?? tr(language, 'unknownUser'),
        `PID ${process.pid}`,
        process.usedMiB === null ? null : gib(process.usedMiB),
        process.elapsed,
    ];
    return parts.filter(Boolean).join(' · ');
}

function processDetails(gpu, language) {
    const box = verticalBox('gpu-process-list');
    if (!gpu.processes.length)
        box.add_child(label(tr(language, 'noProcesses'), 'gpu-muted'));

    for (const process of gpu.processes) {
        const entry = verticalBox('gpu-process');
        entry.add_child(label(processSummary(process, language), 'gpu-process-user'));
        const project = projectPath(process);
        if (project)
            entry.add_child(label(project, 'gpu-process-project'));
        if (process.command)
            entry.add_child(label(process.command, 'gpu-process-command'));
        box.add_child(entry);
    }
    return box;
}

function gpuRow(gpu, language, expanded, onToggle) {
    const titleText = open => `${open ? '▾' : '▸'} GPU ${gpu.index} · ${gpu.name}`;
    const title = label(titleText(expanded), 'gpu-title');
    title.x_expand = true;

    const header = new St.BoxLayout({style_class: 'gpu-row-header'});
    header.add_child(title);
    header.add_child(label(`${shown(gpu.temperatureC, '°C')} · ${shown(gpu.powerW, ' W')}`, 'gpu-metadata'));
    header.add_child(label(shown(gpu.utilizationPercent, '%'), 'gpu-percent'));

    const memory = `${tr(language, 'vram')} ${gibValue(gpu.usedMiB)} / ${gibValue(gpu.totalMiB)} GiB`;
    const free = `${tr(language, 'free')} ${gib(gpu.freeMiB)}`;
    const processes = tr(language, 'processCount', {count: gpu.processes.length});

    const details = processDetails(gpu, language);
    details.visible = expanded;

    const box = verticalBox('gpu-row');
    box.add_child(header);
    box.add_child(progress(gpu.utilizationPercent, 'gpu', language));
    box.add_child(progress(100 * gpu.usedMiB / gpu.totalMiB, 'memory', language));
    box.add_child(label(`${memory}   ${free}   ${processes}`, 'gpu-muted'));
    box.add_child(details);

    const button = new St.Button({
        child: box,
        x_expand: true,
        can_focus: true,
        style_class: 'gpu-row-button',
    });
    button.connect('clicked', () => {
        details.visible = !details.visible;
        title.text = titleText(details.visible);
        onToggle(details.visible);
    });
    return button;
}

function copyText(monitor, language) {
    const snapshot = monitor.snapshot;
    const lines = [
        'Remote GPU Monitor',
        `${tr(language, 'server')}: ${monitor.config.displayName}`,
        `${tr(language, 'status')}: ${stateText(language, monitor.state)}`,
        `${tr(language, 'route')}: ${snapshot ? routeText(language, snapshot.route) : '—'}`,
        `${tr(language, 'lastSample')}: ${snapshot ? new Date(snapshot.lastSuccessAt).toLocaleString() : '—'}`,
        `${tr(language, 'isStale')}: ${tr(language, monitor.stale ? 'yes' : 'no')}`,
        `${tr(language, 'refreshInterval')}: ${tr(language, 'secondsOption', {seconds: monitor.interval})}`,
    ];
    for (const gpu of snapshot?.gpus ?? []) {
        lines.push(
            '',
            `GPU ${gpu.index}`,
            `UUID: ${gpu.uuid}`,
            `Name: ${gpu.name}`,
            `${tr(language, 'utilization')}: ${shown(gpu.utilizationPercent, '%')}`,
            `${tr(language, 'vram')}: ${gib(gpu.usedMiB)} / ${gib(gpu.totalMiB)}`,
            `${tr(language, 'free')} ${tr(language, 'vram')}: ${gib(gpu.freeMiB)}`,
            `${tr(language, 'temperature')}: ${shown(gpu.temperatureC, '°C')}`,
            `${tr(language, 'power')}: ${shown(gpu.powerW, 'W')}`);
        for (const process of gpu.processes) {
            lines.push(`  ${processSummary(process, language)}`);
            for (const text of [projectPath(process), process.command].filter(Boolean))
                lines.push(`    ${text}`);
        }
    }
    return lines.join('\n');
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Remote GPU Monitor');
        this.extension = extension;
        this.expandedGpus = new Set();

        const iconFile = Gio.File.new_for_path(`${extension.path}/remote-gpu-panel.png`);
        this.add_child(new St.Icon({
            gicon: Gio.FileIcon.new(iconFile),
            icon_size: 20,
            style_class: 'system-status-icon',
        }));
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
        if (!snapshot || !this.updatedItem)
            return;

        const language = languageOf(this.extension.settings);
        const age = Math.max(0, Math.floor((Date.now() - snapshot.lastSuccessAt) / 1000));
        const relative = age < 60
            ? tr(language, 'secondsAgo', {count: age})
            : tr(language, 'minutesAgo', {count: Math.floor(age / 60)});
        const time = new Date(snapshot.lastSuccessAt).toLocaleTimeString(undefined, {hour12: false});
        this.updatedItem.label.text = tr(language, 'updated', {
            time,
            age: relative,
            route: routeText(language, snapshot.route),
        });
    }

    renderMenu() {
        const monitor = this.extension.monitor;
        const snapshot = monitor.snapshot;
        const language = languageOf(this.extension.settings);
        const state = stateText(language, monitor.state);
        this.menu.removeAll();
        this.updatedItem = null;

        const summary = snapshot ? tr(language, 'gpuCount', {count: snapshot.gpus.length}) : state;
        this.menu.addMenuItem(infoItem(`${monitor.config.displayName} · ${summary}`, 'gpu-menu-heading'));

        if (snapshot) {
            this.updatedItem = infoItem('');
            this.menu.addMenuItem(this.updatedItem);
            this.updateAge();
            if (monitor.stale || monitor.paused)
                this.menu.addMenuItem(infoItem(tr(language, 'historical', {state})));

            const rows = verticalBox();
            for (const gpu of snapshot.gpus) {
                const expanded = this.expandedGpus.has(gpu.uuid);
                rows.add_child(gpuRow(gpu, language, expanded, open => {
                    if (open)
                        this.expandedGpus.add(gpu.uuid);
                    else
                        this.expandedGpus.delete(gpu.uuid);
                }));
            }
            const scroll = new St.ScrollView({
                style_class: 'gpu-scroll',
                overlay_scrollbars: true,
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.AUTOMATIC,
            });
            scroll.set_child(rows);
            const item = new PopupMenu.PopupBaseMenuItem({reactive: false});
            item.add_child(scroll);
            this.menu.addMenuItem(item);
        } else {
            this.menu.addMenuItem(infoItem(tr(language, 'noData')));
        }

        this.menu.addMenuItem(infoItem(tr(language, 'refreshStatus', {
            seconds: monitor.interval,
            battery: monitor.onBattery === true ? tr(language, 'batteryMode') : '',
        })));

        if (monitor.error) {
            const details = compactMenuItem(new PopupMenu.PopupSubMenuMenuItem(tr(language, 'errorDetails')));
            details.menu.addMenuItem(infoItem(monitor.error.code));
            details.menu.addMenuItem(infoItem(monitor.error.message));
            this.menu.addMenuItem(details);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addAction(tr(language, 'refreshNow'), () => monitor.refresh())
            .setSensitive(!monitor.paused && !!monitor.config.primaryHost);
        this._addAction(tr(language, monitor.paused ? 'resume' : 'pause'), () => {
            if (monitor.paused)
                monitor.resume();
            else
                monitor.pause();
        });

        const intervals = compactMenuItem(new PopupMenu.PopupSubMenuMenuItem(tr(language, 'refreshInterval')));
        for (const seconds of INTERVALS) {
            const check = monitor.config.refreshInterval === seconds ? ' ✓' : '';
            compactMenuItem(intervals.menu.addAction(`${tr(language, 'secondsOption', {seconds})}${check}`,
                () => this.extension.settings.set_int('refresh-interval', seconds)));
        }
        this.menu.addMenuItem(intervals);

        this._addAction(tr(language, 'copyStatus'), () => {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, copyText(monitor, language));
        });
        this._addAction(tr(language, 'connectionSettings'), () => this.extension.openPreferences());
        this._addAction(tr(language, 'stop'), () => monitor.pause());
    }

    _addAction(text, callback) {
        return compactMenuItem(this.menu.addAction(text, callback));
    }
});

export default class RemoteGpuExtension extends Extension {
    enable() {
        this.settings = this.getSettings();
        this.monitor = new Monitor(readConfig(this.settings), () => this.indicator?.update());
        this.indicator = new Indicator(this);
        this.menuOpenSignal = this.indicator.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this.indicator.updateAge();
        });
        Main.panel.addToStatusArea(this.uuid, this.indicator, 0, 'right');

        this.settingsChanged = this.settings.connect('changed', (_settings, key) => {
            if (key === 'ui-language')
                this.indicator.update();
            else if (key === 'appearance')
                this.indicator.applyAppearance();
            else
                this.monitor.configure(readConfig(this.settings));
        });
        this.monitor.start();
        this.indicator.update();
    }

    disable() {
        this.monitor?.stop();
        if (this.settingsChanged)
            this.settings.disconnect(this.settingsChanged);
        if (this.indicator) {
            this.indicator.menu.disconnect(this.menuOpenSignal);
            this.indicator.destroy();
        }
        this.indicator = null;
        this.monitor = null;
        this.settings = null;
        this.settingsChanged = 0;
        this.menuOpenSignal = 0;
    }
}
