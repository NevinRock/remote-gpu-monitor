import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {parseGpuSnapshot} from './parser.js';

export const REMOTE_COMMAND = 'LC_ALL=C nvidia-smi --query-gpu=index,uuid,name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits';
export class CollectionError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}
export function sshArgv(config, host) {
    const ssh = config.sshExecutable.trim() || GLib.find_program_in_path('ssh');
    if (!ssh || !GLib.file_test(ssh, GLib.FileTest.IS_EXECUTABLE)) throw new CollectionError('SSH_NOT_FOUND', 'SSH executable not found');
    if (!host || /^-/.test(host) || /[\r\n\0]/.test(host)) throw new CollectionError('CONFIGURATION_ERROR', 'Invalid SSH host alias');
    if (config.sshConfigPath.trim() && !GLib.file_test(config.sshConfigPath.trim(), GLib.FileTest.IS_REGULAR))
        throw new CollectionError('CONFIGURATION_ERROR', 'SSH config path must name a regular file');
    const argv = [ssh, '-T', '-o', 'BatchMode=yes', '-o', 'NumberOfPasswordPrompts=0',
        '-o', 'ConnectTimeout=8', '-o', 'ConnectionAttempts=1', '-o', 'RequestTTY=no',
        '-o', 'ClearAllForwardings=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'ControlPersist=no'];
    if (config.sshConfigPath.trim()) argv.push('-F', config.sshConfigPath.trim());
    const setsid = GLib.find_program_in_path('setsid');
    if (!setsid || !GLib.find_program_in_path('kill'))
        throw new CollectionError('CONFIGURATION_ERROR', 'setsid and kill are required for SSH process cleanup');
    return [setsid, ...argv, '--', host, REMOTE_COMMAND];
}
export function classifyFailure(stderr, status) {
    const s = stderr.toLowerCase();
    if (/host key verification failed|remote host identification has changed|no .* host key is known/.test(s)) return new CollectionError('HOST_KEY_ERROR', 'Verify the host key in a terminal first');
    if (/permission denied|authentication failed/.test(s)) return new CollectionError('AUTHENTICATION_FAILED', 'SSH authentication failed');
    if (/nvidia-smi: (command )?not found/.test(s)) return new CollectionError('NVIDIA_SMI_NOT_FOUND', 'Remote nvidia-smi not found');
    if (/could not resolve|connection refused|network is unreachable|timed out/.test(s)) return new CollectionError('CONNECTION_FAILED', 'SSH connection failed');
    return new CollectionError('REMOTE_COMMAND_FAILED', `Remote command failed (exit ${status}): ${stderr.slice(0, 400)}`);
}
export class Collector {
    constructor() { this.process = null; this.cancellable = null; this.timeoutId = 0; }
    cancel() {
        if (this.timeoutId) { GLib.source_remove(this.timeoutId); this.timeoutId = 0; }
        this._terminateOwnedGroup();
        this.cancellable?.cancel();
    }
    _terminateOwnedGroup() {
        const proc = this.process;
        if (!proc) return;
        const pid = proc.get_identifier();
        const kill = GLib.find_program_in_path('kill');
        // setsid makes the SSH launcher the leader of a new session and group.
        // A negative PID addresses only that owned group, including ProxyJump children.
        if (kill && /^\d+$/.test(pid)) {
            try { Gio.Subprocess.new([kill, '-TERM', '--', `-${pid}`], Gio.SubprocessFlags.NONE); }
            catch { proc.force_exit(); }
        } else proc.force_exit();
    }
    async collect(config, host, timeoutSeconds = 15) {
        const argv = sshArgv(config, host);
        const proc = new Gio.Subprocess({argv, flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
        proc.init(null);
        const cancellable = new Gio.Cancellable();
        this.process = proc; this.cancellable = cancellable;
        let timedOut = false;
        this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeoutSeconds, () => {
            this.timeoutId = 0; timedOut = true; this._terminateOwnedGroup(); cancellable.cancel(); return GLib.SOURCE_REMOVE;
        });
        try {
            const [stdout, stderr] = await new Promise((resolve, reject) =>
                proc.communicate_utf8_async(null, cancellable, (p, result) => {
                    try { resolve(p.communicate_utf8_finish(result).slice(1)); }
                    catch (e) { reject(e); }
                }));
            if (!proc.get_successful()) throw classifyFailure(stderr || '', proc.get_exit_status());
            if ((stdout || '').length > 262144) throw new CollectionError('INVALID_GPU_DATA', 'GPU output too large');
            return parseGpuSnapshot(stdout || '');
        } catch (e) {
            if (timedOut) throw new CollectionError('TIMEOUT', `SSH query exceeded ${timeoutSeconds} seconds`);
            if (cancellable.is_cancelled()) throw new CollectionError('CANCELLED', 'SSH query cancelled');
            throw e;
        } finally {
            if (this.timeoutId) GLib.source_remove(this.timeoutId);
            this.timeoutId = 0;
            if (this.process === proc) { this.process = null; this.cancellable = null; }
        }
    }
}
