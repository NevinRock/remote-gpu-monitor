import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {parseRemoteOutput, PROCESS_MARKER} from './parser.js';

const GPU_FIELDS = [
    'index', 'uuid', 'name', 'memory.used', 'memory.free', 'memory.total',
    'utilization.gpu', 'temperature.gpu', 'power.draw',
];
export const GPU_QUERY = `nvidia-smi --query-gpu=${GPU_FIELDS.join(',')} --format=csv,noheader,nounits`;

// Prints one tab-separated line per compute process: GPU UUID, PID, VRAM, owner, elapsed time,
// working directory and command line. The working directory is only readable for the SSH user's
// own processes (or for every process as root), so it may be empty.
const PROCESS_LOOP = [
    'case "$pid" in ""|*[!0-9]*) continue;; esac',
    'user=$(stat -c %U /proc/$pid 2>/dev/null)',
    'etime=$(ps -o etime= -p $pid 2>/dev/null)',
    'cwd=$(readlink /proc/$pid/cwd 2>/dev/null)',
    'args=$(tr "\\0\\t\\n" "   " < /proc/$pid/cmdline 2>/dev/null | head -c 400)',
    'printf "%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n" "$uuid" "$pid" "$mem" "$user" "$etime" "$cwd" "$args"',
];
const PROCESS_SCRIPT = [
    `echo "${PROCESS_MARKER}"`,
    'nvidia-smi --query-compute-apps=gpu_uuid,pid,used_memory --format=csv,noheader,nounits 2>/dev/null' +
        ` | while IFS=", " read -r uuid pid mem rest; do ${PROCESS_LOOP.join('; ')}; done`,
    'true',
].join('; ');

// The script stays on one line inside sh -c so that it runs the same way whatever the remote
// login shell is (bash, zsh, fish or tcsh). The process list is optional: only a failing GPU
// query makes the command fail.
export const REMOTE_COMMAND = `sh -c 'export LC_ALL=C; ${GPU_QUERY} || exit; ${PROCESS_SCRIPT}'`;

const MAX_OUTPUT_LENGTH = 262144;

export class CollectionError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

export function sshArgv(config, host) {
    const ssh = config.sshExecutable.trim() || GLib.find_program_in_path('ssh');
    if (!ssh || !GLib.file_test(ssh, GLib.FileTest.IS_EXECUTABLE))
        throw new CollectionError('SSH_NOT_FOUND', 'SSH executable not found');
    if (!host || /^-/.test(host) || /[\r\n\0]/.test(host))
        throw new CollectionError('CONFIGURATION_ERROR', 'Invalid SSH host alias');

    const configPath = config.sshConfigPath.trim();
    if (configPath && !GLib.file_test(configPath, GLib.FileTest.IS_REGULAR))
        throw new CollectionError('CONFIGURATION_ERROR', 'SSH config path must name a regular file');

    const argv = [
        ssh, '-T',
        '-o', 'BatchMode=yes',
        '-o', 'NumberOfPasswordPrompts=0',
        '-o', 'ConnectTimeout=8',
        '-o', 'ConnectionAttempts=1',
        '-o', 'RequestTTY=no',
        '-o', 'ClearAllForwardings=yes',
        '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ControlMaster=no',
        '-o', 'ControlPath=none',
        '-o', 'ControlPersist=no',
    ];
    if (configPath)
        argv.push('-F', configPath);

    const setsid = GLib.find_program_in_path('setsid');
    if (!setsid || !GLib.find_program_in_path('kill'))
        throw new CollectionError('CONFIGURATION_ERROR', 'setsid and kill are required for SSH process cleanup');
    return [setsid, ...argv, '--', host, REMOTE_COMMAND];
}

export function classifyFailure(stderr, status) {
    const s = stderr.toLowerCase();
    if (/host key verification failed|remote host identification has changed|no .* host key is known/.test(s))
        return new CollectionError('HOST_KEY_ERROR', 'Verify the host key in a terminal first');
    if (/permission denied|authentication failed/.test(s))
        return new CollectionError('AUTHENTICATION_FAILED', 'SSH authentication failed');
    if (/nvidia-smi: (command )?not found/.test(s))
        return new CollectionError('NVIDIA_SMI_NOT_FOUND', 'Remote nvidia-smi not found');
    if (/could not resolve|connection refused|network is unreachable|timed out/.test(s))
        return new CollectionError('CONNECTION_FAILED', 'SSH connection failed');
    return new CollectionError('REMOTE_COMMAND_FAILED',
        `Remote command failed (exit ${status}): ${stderr.slice(0, 400)}`);
}

export class Collector {
    constructor() {
        this.process = null;
        this.cancellable = null;
        this.timeoutId = 0;
    }

    cancel() {
        if (this.timeoutId) {
            GLib.source_remove(this.timeoutId);
            this.timeoutId = 0;
        }
        this._terminateOwnedGroup();
        this.cancellable?.cancel();
    }

    _terminateOwnedGroup() {
        const proc = this.process;
        if (!proc)
            return;

        const pid = proc.get_identifier();
        const kill = GLib.find_program_in_path('kill');
        // setsid makes the SSH launcher the leader of a new session and group.
        // A negative PID addresses only that owned group, including ProxyJump children.
        if (kill && /^\d+$/.test(pid)) {
            try {
                Gio.Subprocess.new([kill, '-TERM', '--', `-${pid}`], Gio.SubprocessFlags.NONE);
            } catch {
                proc.force_exit();
            }
        } else {
            proc.force_exit();
        }
    }

    async collect(config, host, timeoutSeconds = 15) {
        const argv = sshArgv(config, host);
        const proc = new Gio.Subprocess({
            argv,
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        proc.init(null);

        const cancellable = new Gio.Cancellable();
        this.process = proc;
        this.cancellable = cancellable;

        let timedOut = false;
        this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeoutSeconds, () => {
            this.timeoutId = 0;
            timedOut = true;
            this._terminateOwnedGroup();
            cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });

        try {
            const [stdout, stderr] = await new Promise((resolve, reject) => {
                proc.communicate_utf8_async(null, cancellable, (p, result) => {
                    try {
                        resolve(p.communicate_utf8_finish(result).slice(1));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            if (!proc.get_successful())
                throw classifyFailure(stderr || '', proc.get_exit_status());
            if ((stdout || '').length > MAX_OUTPUT_LENGTH)
                throw new CollectionError('INVALID_GPU_DATA', 'GPU output too large');
            return parseRemoteOutput(stdout || '');
        } catch (e) {
            if (timedOut)
                throw new CollectionError('TIMEOUT', `SSH query exceeded ${timeoutSeconds} seconds`);
            if (cancellable.is_cancelled())
                throw new CollectionError('CANCELLED', 'SSH query cancelled');
            throw e;
        } finally {
            if (this.timeoutId)
                GLib.source_remove(this.timeoutId);
            this.timeoutId = 0;
            if (this.process === proc) {
                this.process = null;
                this.cancellable = null;
            }
        }
    }
}
