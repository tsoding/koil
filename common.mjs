export const SERVER_PORT = 6970;
export const UINT32_SIZE = 4;
const SHORT_STRING_SIZE = 64;
export function makeWasmCommon(wasm) {
    return {
        wasm,
        memory: wasm.instance.exports.memory,
        _initialize: wasm.instance.exports._initialize,
        allocate_temporary_buffer: wasm.instance.exports.allocate_temporary_buffer,
    };
}
export function arrayBufferAsMessageInWasm(wasmCommon, buffer) {
    const wasmBufferSize = buffer.byteLength + UINT32_SIZE;
    const wasmBufferPtr = wasmCommon.allocate_temporary_buffer(wasmBufferSize);
    new DataView(wasmCommon.memory.buffer, wasmBufferPtr, UINT32_SIZE).setUint32(0, wasmBufferSize, true);
    new Uint8ClampedArray(wasmCommon.memory.buffer, wasmBufferPtr + UINT32_SIZE, wasmBufferSize - UINT32_SIZE).set(new Uint8ClampedArray(buffer));
    return wasmBufferPtr;
}
export function stringAsShortStringInWasm(wasmCommon, s) {
    const shortStringPtr = wasmCommon.allocate_temporary_buffer(SHORT_STRING_SIZE);
    const bytes = new Uint8ClampedArray(wasmCommon.memory.buffer, shortStringPtr, SHORT_STRING_SIZE);
    bytes.fill(0);
    for (let i = 0; i < s.length && i < SHORT_STRING_SIZE - 1; ++i) {
        bytes[i] = s.charCodeAt(i);
    }
    return shortStringPtr;
}
//# sourceMappingURL=common.mjs.map