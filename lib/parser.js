export const PROCESS_MARKER = '##processes';

const GPU_COLUMNS = 9;
const UNKNOWN_VALUE = /^(?:N\/A|\[N\/A\]|\[Not Supported\]|Not Supported)$/i;

export class GpuDataError extends Error {
    constructor(message, code = 'INVALID_GPU_DATA') {
        super(message);
        this.code = code;
    }
}

export function parseCsv(input) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let afterQuote = false;

    const endRecord = (c, i) => {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        // Treat CRLF as a single line break.
        return c === '\r' && input[i + 1] === '\n' ? i + 1 : i;
    };

    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (quoted) {
            if (c !== '"') {
                field += c;
            } else if (input[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                quoted = false;
                afterQuote = true;
            }
        } else if (afterQuote) {
            if (c === ',') {
                row.push(field);
                field = '';
                afterQuote = false;
            } else if (c === '\n' || c === '\r') {
                i = endRecord(c, i);
                afterQuote = false;
            } else if (c !== ' ' && c !== '\t') {
                throw new GpuDataError('Malformed quoted CSV', 'CSV_PARSE_FAILED');
            }
        } else if (c === '"' && field.trim() === '') {
            field = '';
            quoted = true;
        } else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            i = endRecord(c, i);
        } else if (c === '"') {
            throw new GpuDataError('Unexpected CSV quote', 'CSV_PARSE_FAILED');
        } else {
            field += c;
        }
    }

    if (quoted)
        throw new GpuDataError('Unclosed CSV quote', 'CSV_PARSE_FAILED');
    if (afterQuote || row.length || field.length) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

function number(value, name, optional = false) {
    const s = value.trim();
    if (optional && UNKNOWN_VALUE.test(s))
        return null;
    if (!s || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))
        throw new GpuDataError(`Invalid ${name}: ${s}`);
    const n = Number(s);
    if (!Number.isFinite(n))
        throw new GpuDataError(`Invalid ${name}: ${s}`);
    return n;
}

export function parseGpuSnapshot(csv) {
    const rows = parseCsv(csv);
    if (!rows.length)
        throw new GpuDataError('Empty GPU output', 'CSV_PARSE_FAILED');

    const seenIndices = new Set();
    const seenUuids = new Set();
    const gpus = rows.map(row => {
        if (row.length !== GPU_COLUMNS)
            throw new GpuDataError(`Expected ${GPU_COLUMNS} columns, got ${row.length}`, 'CSV_PARSE_FAILED');

        const index = number(row[0], 'GPU index');
        if (!Number.isSafeInteger(index))
            throw new GpuDataError('Invalid GPU index');
        const uuid = row[1].trim();
        const name = row[2].trim();
        if (!uuid || !name || seenIndices.has(index) || seenUuids.has(uuid))
            throw new GpuDataError('Missing or duplicate GPU identity');
        seenIndices.add(index);
        seenUuids.add(uuid);

        const usedMiB = number(row[3], 'used memory');
        const freeMiB = number(row[4], 'free memory');
        const totalMiB = number(row[5], 'total memory');
        const utilizationPercent = number(row[6], 'utilization', true);
        const temperatureC = number(row[7], 'temperature', true);
        const powerW = number(row[8], 'power', true);
        if (totalMiB <= 0 || usedMiB > totalMiB || freeMiB > totalMiB ||
            (utilizationPercent !== null && utilizationPercent > 100))
            throw new GpuDataError('GPU measurement out of range');

        return {index, uuid, name, usedMiB, freeMiB, totalMiB, utilizationPercent, temperatureC, powerW};
    });
    return gpus.sort((a, b) => a.index - b.index);
}

// Process lines are best effort: malformed lines are skipped instead of failing the sample.
export function parseProcesses(text) {
    const processes = [];
    for (const line of text.split(/\r?\n/)) {
        const fields = line.split('\t');
        if (fields.length < 7 || !/^\d+$/.test(fields[1].trim()))
            continue;

        const [gpuUuid, pid, memory, user, elapsed, cwd] = fields.map(f => f.trim());
        processes.push({
            gpuUuid,
            pid: Number(pid),
            usedMiB: /^\d+(?:\.\d+)?$/.test(memory) ? Number(memory) : null,
            user: user || null,
            elapsed: elapsed || null,
            cwd: cwd || null,
            command: fields.slice(6).join(' ').trim(),
        });
    }
    return processes;
}

export function parseRemoteOutput(output) {
    const marker = output.search(new RegExp(`^${PROCESS_MARKER}\\r?$`, 'm'));
    if (marker < 0)
        return parseGpuSnapshot(output).map(gpu => ({...gpu, processes: []}));

    const gpus = parseGpuSnapshot(output.slice(0, marker));
    const processes = parseProcesses(output.slice(marker + PROCESS_MARKER.length));
    return gpus.map(gpu => ({...gpu, processes: processes.filter(p => p.gpuUuid === gpu.uuid)}));
}

// The working directory when it is readable, otherwise the script named on the command line.
export function projectPath(process) {
    const script = process.command.split(/\s+/).find((token, i) => i > 0 && /\.(?:py|sh)$/.test(token));
    const path = process.cwd ?? script ?? null;
    if (!path || !process.user)
        return path;

    const home = `/home/${process.user}`;
    if (path === home || path.startsWith(`${home}/`))
        return `~${path.slice(home.length)}`;
    return path;
}
