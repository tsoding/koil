export const SERVER_PORT = 6970;
export const UINT32_SIZE = 4;
const SHORT_STRING_SIZE = 64;   // IMPORTANT! Must be synchronized with the capacity of the ShortString type in server.c3

export interface WasmCommon {
    wasm: WebAssembly.WebAssemblyInstantiatedSource,
    memory: WebAssembly.Memory,
    _initialize: () => void,
    allocate_temporary_buffer: (size: number) => number,
}

export function makeWasmCommon(wasm: WebAssembly.WebAssemblyInstantiatedSource): WasmCommon {
    return {
        wasm,
        memory: wasm.instance.exports.memory  as WebAssembly.Memory,
        _initialize: wasm.instance.exports._initialize as () => void,
        allocate_temporary_buffer: wasm.instance.exports.allocate_temporary_buffer as (size: number) => number,
    }
}

export function arrayBufferAsMessageInWasm(wasmCommon: WasmCommon, buffer: ArrayBuffer): number {
    const wasmBufferSize = buffer.byteLength + UINT32_SIZE;
    const wasmBufferPtr = wasmCommon.allocate_temporary_buffer(wasmBufferSize);
    new DataView(wasmCommon.memory.buffer, wasmBufferPtr, UINT32_SIZE).setUint32(0, wasmBufferSize, true);
    new Uint8ClampedArray(wasmCommon.memory.buffer, wasmBufferPtr + UINT32_SIZE, wasmBufferSize - UINT32_SIZE).set(new Uint8ClampedArray(buffer));
    return wasmBufferPtr;
}

export function stringAsShortStringInWasm(wasmCommon: WasmCommon, s: string): number {
    const shortStringPtr = wasmCommon.allocate_temporary_buffer(SHORT_STRING_SIZE);
    const bytes = new Uint8ClampedArray(wasmCommon.memory.buffer, shortStringPtr, SHORT_STRING_SIZE);
    bytes.fill(0);
    for (let i = 0; i < s.length && i < SHORT_STRING_SIZE-1; ++i) {
        bytes[i] = s.charCodeAt(i);
    }
    return shortStringPtr;
}
