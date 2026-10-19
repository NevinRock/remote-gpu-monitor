import Gio from 'gi://Gio';
import {LANGUAGES, APPEARANCES, languageOf, appearanceOf, tr} from '../lib/i18n.js';

function equal(actual, expected) {
    if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.remote-gpu-monitor'});
equal(languageOf(settings), 'zh');
equal(appearanceOf(settings), 'dark');
equal(tr('zh', 'theme'), '菜单主题');
equal(tr('zh', 'dark'), '深色');
equal(tr('en', 'theme'), 'Menu theme');
equal(tr('en', 'light'), 'Light');
equal(tr('en', 'gpuCount', {count: 8}), '8 GPUs');
equal(tr('zh', 'gpuCount', {count: 8}), '8 张 GPU');
equal(LANGUAGES.join(','), 'zh,en');
equal(APPEARANCES.join(','), 'dark,light');
settings.set_string('ui-language', 'en');
settings.set_string('appearance', 'light');
equal(languageOf(settings), 'en');
equal(appearanceOf(settings), 'light');
equal(tr(languageOf(settings), appearanceOf(settings)), 'Light');
print('13 localization checks passed');
