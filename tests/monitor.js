import {Monitor} from '../lib/monitor.js';
import {intervalFor} from '../lib/policy.js';
import GLib from 'gi://GLib';
const row = [{index: 0, uuid: 'GPU-0', name: 'A800', usedMiB: 100, freeMiB: 900, totalMiB: 1000, utilizationPercent: 50, temperatureC: 40, powerW: 100}];
const config = {displayName: 'Test', primaryHost: 'first', fallbackHost: 'second', refreshInterval: 60, batteryInterval: 300, powerAware: true};
let count = 0;
function check(value, message) { if (!value) throw new Error(message); count++; }
async function flush() { await new Promise(resolve => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { resolve(); return GLib.SOURCE_REMOVE; })); }
class FakeCollector {
    constructor() { this.calls = []; this.responses = []; this.cancelled = 0; }
    collect(_config, host) { this.calls.push(host); return this.responses.shift()(); }
    cancel() { this.cancelled++; }
}
function monitor(fake) { const m = new Monitor(config, () => {}, fake); m._initPower = () => {}; return m; }
const powerStartup = new Monitor({...config, primaryHost: ''}, () => {}, new FakeCollector());
powerStartup.start(); check(powerStartup.state === 'ERROR', 'real power proxy startup does not throw'); powerStartup.stop();
const fake = new FakeCollector(); fake.responses.push(() => Promise.resolve(row));
const m = monitor(fake); m.start(); await flush();
check(fake.calls.length === 1 && m.state === 'CONNECTED', 'immediate initial poll');
check(m.timerId !== 0, 'scheduled next poll');
const acTimer = m.timerId; m.onBattery = true; m._schedule();
check(m.interval === 300 && m.timerId !== acTimer, 'battery event reschedules one timer');
m.onBattery = null; m._schedule(); check(m.interval === 60, 'unavailable power uses base interval');
const oldTime = m.snapshot.lastSuccessAt;
fake.responses.push(() => Promise.reject(Object.assign(new Error('offline'), {code: 'CONNECTION_FAILED'})));
fake.responses.push(() => Promise.resolve(row));
await m.refresh();
check(fake.calls.join(',') === 'first,first,second', 'fallback after primary failure');
check(m.snapshot.route === 'fallback', 'fallback route');
check(!m.stale && m.snapshot.lastSuccessAt >= oldTime, 'fallback fresh');
fake.responses.push(() => Promise.reject(new Error('offline')));
fake.responses.push(() => Promise.reject(new Error('offline')));
await m.refresh();
check(m.state === 'STALE' && m.snapshot.route === 'fallback', 'last-good snapshot');
check(m.stale, 'failure stale');
m.pause(); check(m.timerId === 0 && m.state === 'PAUSED', 'pause timer');
const calls = fake.calls.length; await m.refresh(); check(fake.calls.length === calls, 'paused prevents query');
fake.responses.push(() => Promise.resolve(row)); m.resume(); await flush();
check(fake.calls.length === calls + 1 && m.state === 'CONNECTED', 'resume refresh');
let release;
fake.responses.push(() => new Promise(resolve => { release = resolve; }));
const active = m.refresh(); await flush(); await m.refresh();
check(fake.calls.length === calls + 2, 'single in-flight query');
fake.responses.push(() => Promise.resolve(row));
m.configure({...config, primaryHost: 'new-server', fallbackHost: ''});
check(m.snapshot === null, 'server switch clears old data');
release(row); await active; await flush();
check(m.snapshot?.serverId === 'new-server', 'obsolete result ignored');
check(fake.calls.at(-1) === 'new-server', 'new server queried');
m.stop(); check(m.timerId === 0 && fake.cancelled > 0, 'shutdown cleanup');
check(intervalFor(config, true) === 300 && intervalFor(config, false) === 60, 'power policy');
print(`${count} monitor checks passed`);
