export const SERVER_PORT = 6970;
export const UINT32_SIZE = 4;

export interface WasmCommon {
    wasm: WebAssembly.WebAssemblyInstantiatedSource,
    memory: WebAssembly.Memory,
    _initialize: () => void,
    reset_temp_mark: () => void,
    allocate_temporary_buffer: (size: number) => number,
    allocate_bombs: () => number,
    allocate_default_scene: () => number,
}

export function makeWasmCommon(wasm: WebAssembly.WebAssemblyInstantiatedSource): WasmCommon {
    return {
        wasm,
        memory: wasm.instance.exports.memory  as WebAssembly.Memory,
        _initialize: wasm.instance.exports._initialize as () => void,
        reset_temp_mark: wasm.instance.exports.reset_temp_mark as () => void,
        allocate_temporary_buffer: wasm.instance.exports.allocate_temporary_buffer as (size: number) => number,
        allocate_bombs: wasm.instance.exports.allocate_bombs as () => number,
        allocate_default_scene: wasm.instance.exports.allocate_default_scene as () => number,
    }
}

// NOTE: This is basically the part of the state of the Game that is shared 
// between Client and Server and constantly synced over the network.
export interface Level {
    scenePtr: number,
    bombsPtr: number,
}

export function createLevel(wasmCommon: WasmCommon): Level {
    const scenePtr = wasmCommon.allocate_default_scene();
    const bombsPtr = wasmCommon.allocate_bombs();
    return {scenePtr, bombsPtr};
}

export function arrayBufferAsMessageInWasm(wasmCommon: WasmCommon, buffer: ArrayBuffer): number {
    const wasmBufferSize = buffer.byteLength + UINT32_SIZE;
    const wasmBufferPtr = wasmCommon.allocate_temporary_buffer(wasmBufferSize);
    new DataView(wasmCommon.memory.buffer, wasmBufferPtr, UINT32_SIZE).setUint32(0, wasmBufferSize, true);
    new Uint8ClampedArray(wasmCommon.memory.buffer, wasmBufferPtr + UINT32_SIZE, wasmBufferSize - UINT32_SIZE).set(new Uint8ClampedArray(buffer));
    return wasmBufferPtr;
}
