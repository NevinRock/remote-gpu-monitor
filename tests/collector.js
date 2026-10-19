import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Collector} from '../lib/collector.js';
let count = 0;
function check(value, message) { if (!value) throw new Error(message); count++; }
const path = GLib.build_filenamev([GLib.get_tmp_dir(), `gpu-monitor-ssh-${GLib.get_monotonic_time()}`]);
const childPath = `${path}.child`;
const config = {sshExecutable: path, sshConfigPath: ''};
GLib.file_set_contents(path, `#!/bin/sh\nsleep 30 &\necho $! > '${childPath}'\nwait\n`);
GLib.spawn_command_line_sync(`chmod 700 ${path}`);
const unrelated = Gio.Subprocess.new(['/usr/bin/sleep', '5'], Gio.SubprocessFlags.NONE);
function childRunning() {
    if (!GLib.file_test(childPath, GLib.FileTest.EXISTS)) return false;
    const [, contents] = GLib.file_get_contents(childPath);
    const pid = new TextDecoder().decode(contents).trim();
    const statPath = `/proc/${pid}/stat`;
    if (!GLib.file_test(statPath, GLib.FileTest.EXISTS)) return false;
    const [, stat] = GLib.file_get_contents(statPath);
    return /\)\s+[RSDT]/.test(new TextDecoder().decode(stat));
}
async function settle() { await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => { resolve(); return GLib.SOURCE_REMOVE; })); }
try {
    const collector = new Collector();
    let code = '';
    try { await collector.collect(config, 'host', 1); } catch (e) { code = e.code; }
    check(code === 'TIMEOUT', 'bounded timeout');
    await settle(); check(!childRunning(), 'timeout stops owned child');
    check(GLib.file_test(`/proc/${unrelated.get_identifier()}`, GLib.FileTest.EXISTS), 'unrelated process untouched');
    GLib.unlink(childPath);
    const second = new Collector();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => { second.cancel(); return GLib.SOURCE_REMOVE; });
    code = '';
    try { await second.collect(config, 'host', 15); } catch (e) { code = e.code; }
    check(code === 'CANCELLED', 'cancellation');
    await settle(); check(!childRunning(), 'cancellation stops owned child');
    check(GLib.file_test(`/proc/${unrelated.get_identifier()}`, GLib.FileTest.EXISTS), 'unrelated process still alive');
} finally { unrelated.force_exit(); GLib.unlink(path); if (GLib.file_test(childPath, GLib.FileTest.EXISTS)) GLib.unlink(childPath); }
print(`${count} collector checks passed`);
