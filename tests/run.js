import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {parseCsv, parseGpuSnapshot} from '../lib/parser.js';
import {sshArgv, classifyFailure, Collector} from '../lib/collector.js';
import {intervalFor, isStale, memoryLevel} from '../lib/policy.js';
import {readConfig} from '../lib/config.js';

let count = 0;
function check(condition, message) { if (!condition) throw new Error(message); count++; }
function fails(fn, message) { let failed = false; try { fn(); } catch { failed = true; } check(failed, message); }
const row = (index, uuid = `GPU-${index}`, name = 'NVIDIA A800', util = '79', temp = '42', power = '64') =>
    `${index}, ${uuid}, "${name}", 800, 80000, 81920, ${util}, ${temp}, ${power}`;
check(parseGpuSnapshot(row(0)).length === 1, 'one GPU');
check(parseGpuSnapshot(Array.from({length: 8}, (_, i) => row(i)).join('\n')).length === 8, 'eight GPUs');
check(parseGpuSnapshot(Array.from({length: 13}, (_, i) => row(i)).join('\n')).length === 13, 'arbitrary count');
check(parseGpuSnapshot(`${row(3)}\n${row(1)}`)[0].index === 1, 'sort indices');
check(parseGpuSnapshot(row(0, 'changed'))[0].uuid === 'changed', 'changed UUID');
check(parseGpuSnapshot(row(0, 'GPU-0', 'A800, SXM'))[0].name === 'A800, SXM', 'comma name');
check(parseCsv('"a""b",x')[0][0] === 'a"b', 'escaped quotes');
check(parseCsv('a,b\r\nc,d').length === 2, 'CRLF records');
check(parseGpuSnapshot(row(0, 'GPU-0', 'A800', 'N/A', '[N/A]', 'Not Supported'))[0].powerW === null, 'unknown sensors');
check(parseGpuSnapshot(row(0, 'GPU-0', 'A800', 'N/A'))[0].utilizationPercent === null, 'unknown utilization');
for (const [csv, reason] of [['', 'empty'], [`${row(0)}\n${row(0)}`, 'duplicate identity'], ['0, id, name', 'missing columns'],
    [row(0).replace('800, 80000', '-1, 80000'), 'negative memory'], [row(0).replace('81920', '0'), 'zero total'],
    [row(0, 'GPU-0', 'A800', '101'), 'utilization >100'], [row(0).replace('800, 80000', 'Infinity, 80000'), 'nonfinite'],
    ['"unfinished', 'bad quotes']]) fails(() => parseGpuSnapshot(csv), reason);
fails(() => parseGpuSnapshot(`${row(0)}\n${row(0, 'GPU-other')}`), 'duplicate index');
fails(() => parseGpuSnapshot(`${row(0)}\n${row(1, 'GPU-0')}`), 'duplicate UUID');
fails(() => parseGpuSnapshot(row(0).replace('800, 80000', '90000, 80000')), 'used exceeds total');
fails(() => parseGpuSnapshot(row(0, 'GPU-0', 'A800', '79', '42', '-1')), 'negative power');
const config = {sshExecutable: '', sshConfigPath: '', refreshInterval: 60, batteryInterval: 300, powerAware: true};
check(intervalFor(config, false) === 60 && intervalFor(config, true) === 300, 'power intervals');
check(intervalFor({...config, powerAware: false}, true) === 60, 'fixed override');
check(isStale({lastSuccessAt: 0}, false, 60, 200000), 'age stale');
check(isStale({lastSuccessAt: 199000}, true, 60, 200000), 'failure stale');
check(!isStale({lastSuccessAt: 199000}, false, 60, 200000), 'fresh');
check(memoryLevel(79.9) === 'normal', 'memory below 80 is green');
check(memoryLevel(80) === 'warning' && memoryLevel(89.9) === 'warning', 'memory 80 to below 90 is orange');
check(memoryLevel(90) === 'critical', 'memory at 90 is red');
check(sshArgv(config, 'gpu-host').includes('gpu-host'), 'SSH alias');
check(classifyFailure('Permission denied (publickey)', 255).code === 'AUTHENTICATION_FAILED', 'auth classification');
check(classifyFailure('Host key verification failed', 255).code === 'HOST_KEY_ERROR', 'host key classification');
fails(() => sshArgv({...config, sshExecutable: '/missing/ssh'}, 'host'), 'missing SSH');
fails(() => sshArgv(config, '-oProxyCommand=evil'), 'unsafe host');
const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.remote-gpu-monitor'});
check(readConfig(settings).refreshInterval === 60 && readConfig(settings).powerAware, 'default settings');
check(readConfig(settings).primaryHost === '', 'no default host');
settings.set_string('primary-host', 'gpu-alias');
check(readConfig(settings).primaryHost === 'gpu-alias', 'settings persistence');
settings.set_int('refresh-interval', 7);
check(intervalFor(readConfig(settings), false) === 60, 'invalid interval fallback');

// A fake executable proves argv, parsing, nonzero exits and cancellation without a server.
const path = GLib.build_filenamev([GLib.get_tmp_dir(), `remote-gpu-fake-${GLib.get_monotonic_time()}`]);
GLib.file_set_contents(path, `#!/bin/sh\ncase "$1" in\n  slow) sleep 30;;\nesac\nprintf '%s\\n' '${row(0)}'\n`);
GLib.spawn_command_line_sync(`chmod 700 ${path}`);
const collector = new Collector();
try {
    const gpus = await collector.collect({...config, sshExecutable: path}, 'gpu-host');
    check(gpus.length === 1, 'fake SSH success');
} finally { collector.cancel(); GLib.unlink(path); }
print(`${count} checks passed`);
