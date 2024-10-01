export const SERVER_PORT = 6970;
export const UINT32_SIZE = 4;
export function makeWasmCommon(wasm) {
    return {
        wasm,
        memory: wasm.instance.exports.memory,
        _initialize: wasm.instance.exports._initialize,
        allocate_items: wasm.instance.exports.allocate_items,
        reset_temp_mark: wasm.instance.exports.reset_temp_mark,
        allocate_temporary_buffer: wasm.instance.exports.allocate_temporary_buffer,
        allocate_bombs: wasm.instance.exports.allocate_bombs,
        throw_bomb: wasm.instance.exports.throw_bomb,
        scene_can_rectangle_fit_here: wasm.instance.exports.scene_can_rectangle_fit_here,
        allocate_default_scene: wasm.instance.exports.allocate_default_scene,
    };
}
export function createLevel(wasmCommon) {
    const scenePtr = wasmCommon.allocate_default_scene();
    const itemsPtr = wasmCommon.allocate_items();
    const bombsPtr = wasmCommon.allocate_bombs();
    return { scenePtr, itemsPtr, bombsPtr };
}
export function arrayBufferAsMessageInWasm(wasmCommon, buffer) {
    const wasmBufferSize = buffer.byteLength + UINT32_SIZE;
    const wasmBufferPtr = wasmCommon.allocate_temporary_buffer(wasmBufferSize);
    new DataView(wasmCommon.memory.buffer, wasmBufferPtr, UINT32_SIZE).setUint32(0, wasmBufferSize, true);
    new Uint8ClampedArray(wasmCommon.memory.buffer, wasmBufferPtr + UINT32_SIZE, wasmBufferSize - UINT32_SIZE).set(new Uint8ClampedArray(buffer));
    return wasmBufferPtr;
}
//# sourceMappingURL=common.mjs.map