import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Collector} from '../lib/collector.js';

const path = GLib.build_filenamev([GLib.get_tmp_dir(), `gpu-monitor-ssh-${GLib.get_monotonic_time()}`]);
const childPath = `${path}.child`;
const config = {sshExecutable: path, sshConfigPath: ''};
let count = 0;

function check(value, message) {
    if (!value)
        throw new Error(message);
    count++;
}

function childRunning() {
    if (!GLib.file_test(childPath, GLib.FileTest.EXISTS))
        return false;
    const [, contents] = GLib.file_get_contents(childPath);
    const pid = new TextDecoder().decode(contents).trim();
    const statPath = `/proc/${pid}/stat`;
    if (!GLib.file_test(statPath, GLib.FileTest.EXISTS))
        return false;
    const [, stat] = GLib.file_get_contents(statPath);
    return /\)\s+[RSDT]/.test(new TextDecoder().decode(stat));
}

function unrelatedAlive(process) {
    return GLib.file_test(`/proc/${process.get_identifier()}`, GLib.FileTest.EXISTS);
}

function settle() {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

async function collectError(collector, timeoutSeconds) {
    try {
        await collector.collect(config, 'host', timeoutSeconds);
    } catch (e) {
        return e.code;
    }
    return '';
}

// The fake SSH starts a child and waits, so the test can tell whether the whole group was stopped.
GLib.file_set_contents(path, `#!/bin/sh\nsleep 30 &\necho $! > '${childPath}'\nwait\n`);
GLib.spawn_command_line_sync(`chmod 700 ${path}`);
const unrelated = Gio.Subprocess.new(['/usr/bin/sleep', '5'], Gio.SubprocessFlags.NONE);

try {
    check(await collectError(new Collector(), 1) === 'TIMEOUT', 'bounded timeout');
    await settle();
    check(!childRunning(), 'timeout stops owned child');
    check(unrelatedAlive(unrelated), 'unrelated process untouched');
    GLib.unlink(childPath);

    const second = new Collector();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        second.cancel();
        return GLib.SOURCE_REMOVE;
    });
    check(await collectError(second, 15) === 'CANCELLED', 'cancellation');
    await settle();
    check(!childRunning(), 'cancellation stops owned child');
    check(unrelatedAlive(unrelated), 'unrelated process still alive');
} finally {
    unrelated.force_exit();
    GLib.unlink(path);
    if (GLib.file_test(childPath, GLib.FileTest.EXISTS))
        GLib.unlink(childPath);
}
print(`${count} collector checks passed`);
