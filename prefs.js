import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {Collector} from './lib/collector.js';
import {readConfig} from './lib/config.js';
import {INTERVALS} from './lib/policy.js';
import {LANGUAGES, APPEARANCES, languageOf, appearanceOf, tr} from './lib/i18n.js';

export default class RemoteGpuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const language = () => languageOf(settings);
        let rendering = false;
        const page = new Adw.PreferencesPage({title: 'Remote GPU Monitor', icon_name: 'video-display-symbolic'});

        const appearanceGroup = new Adw.PreferencesGroup();
        const languageRow = new Adw.ComboRow({model: Gtk.StringList.new(['中文', 'English'])});
        const appearanceRow = new Adw.ComboRow();
        appearanceGroup.add(languageRow);
        appearanceGroup.add(appearanceRow);
        page.add(appearanceGroup);

        const connection = new Adw.PreferencesGroup();
        const entryRows = new Map();
        for (const [key, titleKey] of [['display-name', 'displayName'], ['primary-host', 'primaryHost'],
            ['fallback-host', 'fallbackHost'], ['ssh-config-path', 'sshConfigPath'],
            ['ssh-executable', 'sshExecutable']]) {
            const row = new Adw.EntryRow();
            row.text = settings.get_string(key);
            row.connect('changed', () => settings.set_string(key, row.text));
            connection.add(row);
            entryRows.set(titleKey, row);
        }
        const testRow = new Adw.ActionRow();
        const testButton = new Gtk.Button({valign: Gtk.Align.CENTER});
        testRow.add_suffix(testButton);
        connection.add(testRow);
        page.add(connection);

        const polling = new Adw.PreferencesGroup();
        const intervalRows = new Map();
        for (const [key, titleKey] of [['refresh-interval', 'baseInterval'],
            ['battery-interval', 'batteryInterval']]) {
            const row = new Adw.ComboRow();
            row.connect('notify::selected', () => {
                if (rendering) return;
                const seconds = INTERVALS[row.selected];
                if (seconds !== undefined && settings.get_int(key) !== seconds) settings.set_int(key, seconds);
            });
            intervalRows.set(titleKey, {row, key});
            polling.add(row);
        }
        const power = new Adw.SwitchRow();
        settings.bind('power-aware', power, 'active', Gio.SettingsBindFlags.DEFAULT);
        polling.add(power);
        page.add(polling);
        window.add(page);

        const collector = new Collector();
        let testing = false;
        let testState = {kind: 'ready'};
        const renderTestStatus = () => {
            const lang = language();
            if (testing) testRow.subtitle = tr(lang, 'testing');
            else if (testState.kind === 'success') testRow.subtitle = tr(lang, 'testSuccess', {
                route: tr(lang, testState.route === 'fallback' ? 'fallbackRoute' : 'primaryRoute'),
                count: testState.count, name: testState.name});
            else if (testState.kind === 'error') testRow.subtitle = testState.message;
            else testRow.subtitle = tr(lang, 'testHint');
        };
        const renderLabels = () => {
            rendering = true;
            try {
                const lang = language();
                appearanceGroup.title = tr(lang, 'appearance');
                appearanceGroup.description = tr(lang, 'appearanceHint');
                languageRow.title = tr(lang, 'language');
                languageRow.selected = LANGUAGES.indexOf(lang);
                appearanceRow.title = tr(lang, 'theme');
                appearanceRow.model = Gtk.StringList.new(APPEARANCES.map(value => tr(lang, value)));
                appearanceRow.selected = APPEARANCES.indexOf(appearanceOf(settings));
                connection.title = tr(lang, 'connection');
                connection.description = tr(lang, 'connectionHint');
                for (const [titleKey, row] of entryRows) row.title = tr(lang, titleKey);
                testRow.title = tr(lang, 'testConnection');
                testButton.label = tr(lang, 'test');
                renderTestStatus();
                polling.title = tr(lang, 'polling');
                for (const [titleKey, {row, key}] of intervalRows) {
                    row.title = tr(lang, titleKey);
                    row.model = Gtk.StringList.new(INTERVALS.map(seconds => tr(lang, 'secondsOption', {seconds})));
                    row.selected = Math.max(0, INTERVALS.indexOf(settings.get_int(key)));
                }
                power.title = tr(lang, 'powerAware');
                power.subtitle = tr(lang, 'powerAwareHint');
            } finally { rendering = false; }
        };
        languageRow.connect('notify::selected', () => {
            if (rendering) return;
            const value = LANGUAGES[languageRow.selected];
            if (value && settings.get_string('ui-language') !== value) settings.set_string('ui-language', value);
        });
        appearanceRow.connect('notify::selected', () => {
            if (rendering) return;
            const value = APPEARANCES[appearanceRow.selected];
            if (value && settings.get_string('appearance') !== value) settings.set_string('appearance', value);
        });
        const languageSignal = settings.connect('changed::ui-language', renderLabels);
        const appearanceSignal = settings.connect('changed::appearance', () => {
            appearanceRow.selected = APPEARANCES.indexOf(appearanceOf(settings));
        });
        renderLabels();

        testButton.connect('clicked', async () => {
            if (testing) return;
            testing = true;
            testButton.sensitive = false;
            renderTestStatus();
            const config = readConfig(settings);
            try {
                if (!config.primaryHost) throw new Error(tr(language(), 'enterHost'));
                let gpus, route = 'primary';
                try { gpus = await collector.collect(config, config.primaryHost); }
                catch (firstError) {
                    if (!config.fallbackHost) throw firstError;
                    gpus = await collector.collect(config, config.fallbackHost);
                    route = 'fallback';
                }
                testState = {kind: 'success', route, count: gpus.length, name: gpus[0].name};
            } catch (error) {
                testState = {kind: 'error', message: `${error.code || 'ERROR'}: ${String(error.message).slice(0, 180)}`};
            } finally {
                testing = false;
                testButton.sensitive = true;
                renderTestStatus();
            }
        });
        window.connect('close-request', () => {
            collector.cancel();
            settings.disconnect(languageSignal);
            settings.disconnect(appearanceSignal);
        });
    }
}
