export class GpuDataError extends Error {
    constructor(message, code = 'INVALID_GPU_DATA') { super(message); this.code = code; }
}
export function parseCsv(input) {
    const rows = [];
    let row = [], field = '', quoted = false, afterQuote = false;
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (quoted) {
            if (c === '"') {
                if (input[i + 1] === '"') { field += '"'; i++; }
                else { quoted = false; afterQuote = true; }
            } else field += c;
        } else if (afterQuote) {
            if (c === ',') { row.push(field); field = ''; afterQuote = false; }
            else if (c === '\n' || c === '\r') {
                row.push(field); rows.push(row); row = []; field = ''; afterQuote = false;
                if (c === '\r' && input[i + 1] === '\n') i++;
            } else if (c !== ' ' && c !== '\t') throw new GpuDataError('Malformed quoted CSV', 'CSV_PARSE_FAILED');
        } else if (c === '"' && field.trim() === '') { field = ''; quoted = true; }
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            row.push(field); rows.push(row); row = []; field = '';
            if (c === '\r' && input[i + 1] === '\n') i++;
        } else if (c === '"') throw new GpuDataError('Unexpected CSV quote', 'CSV_PARSE_FAILED');
        else field += c;
    }
    if (quoted) throw new GpuDataError('Unclosed CSV quote', 'CSV_PARSE_FAILED');
    if (afterQuote || row.length || field.length) { row.push(field); rows.push(row); }
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}
const unknown = /^(?:N\/A|\[N\/A\]|\[Not Supported\]|Not Supported)$/i;
function number(value, label, optional = false) {
    const s = value.trim();
    if (optional && unknown.test(s)) return null;
    if (!s || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) throw new GpuDataError(`Invalid ${label}: ${s}`);
    const n = Number(s);
    if (!Number.isFinite(n)) throw new GpuDataError(`Invalid ${label}: ${s}`);
    return n;
}
export function parseGpuSnapshot(csv) {
    const rows = parseCsv(csv);
    if (!rows.length) throw new GpuDataError('Empty GPU output', 'CSV_PARSE_FAILED');
    const seenIndices = new Set(), seenUuids = new Set();
    return rows.map(row => {
        if (row.length !== 9) throw new GpuDataError(`Expected 9 columns, got ${row.length}`, 'CSV_PARSE_FAILED');
        const index = number(row[0], 'GPU index');
        if (!Number.isSafeInteger(index)) throw new GpuDataError('Invalid GPU index');
        const uuid = row[1].trim(), name = row[2].trim();
        if (!uuid || !name || seenIndices.has(index) || seenUuids.has(uuid)) throw new GpuDataError('Missing or duplicate GPU identity');
        seenIndices.add(index); seenUuids.add(uuid);
        const usedMiB = number(row[3], 'used memory'), freeMiB = number(row[4], 'free memory');
        const totalMiB = number(row[5], 'total memory');
        const utilizationPercent = number(row[6], 'utilization', true);
        const temperatureC = number(row[7], 'temperature', true);
        const powerW = number(row[8], 'power', true);
        if (totalMiB <= 0 || usedMiB > totalMiB || freeMiB > totalMiB || (utilizationPercent !== null && utilizationPercent > 100)) throw new GpuDataError('GPU measurement out of range');
        return {index, uuid, name, usedMiB, freeMiB, totalMiB, utilizationPercent, temperatureC, powerW};
    }).sort((a, b) => a.index - b.index);
}
