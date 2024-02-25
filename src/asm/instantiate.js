export async function instantiate(module, imports = {}) {
  const adaptedImports = {
    env: Object.assign(Object.create(globalThis), imports.env || {}, {
      abort(message, fileName, lineNumber, columnNumber) {
        // ~lib/builtins/abort(~lib/string/String | null?, ~lib/string/String | null?, u32?, u32?) => void
        message = __liftString(message >>> 0);
        fileName = __liftString(fileName >>> 0);
        lineNumber = lineNumber >>> 0;
        columnNumber = columnNumber >>> 0;
        (() => {
          // @external.js
          throw Error(
            `${message} in ${fileName}:${lineNumber}:${columnNumber}`
          );
        })();
      }
    })
  };
  const instantiated = await WebAssembly.instantiate(module, adaptedImports);
  const { exports } = instantiated.instance;
  const memory = exports.memory || imports.env.memory;
  const adaptedExports = Object.setPrototypeOf(
    {
      pointDistance(importP, importS1, importS2, importNormal, infinite) {
        // assembly/index/pointDistance(~lib/typedarray/Float32Array, ~lib/typedarray/Float32Array, ~lib/typedarray/Float32Array, ~lib/typedarray/Float32Array, bool?) => f32
        importP = __retain(
          __lowerTypedArray(Float32Array, 4, 2, importP) || __notnull()
        );
        importS1 = __retain(
          __lowerTypedArray(Float32Array, 4, 2, importS1) || __notnull()
        );
        importS2 = __retain(
          __lowerTypedArray(Float32Array, 4, 2, importS2) || __notnull()
        );
        importNormal =
          __lowerTypedArray(Float32Array, 4, 2, importNormal) || __notnull();
        infinite = infinite ? 1 : 0;
        try {
          exports.__setArgumentsLength(arguments.length);
          return exports.pointDistance(
            importP,
            importS1,
            importS2,
            importNormal,
            infinite
          );
        } finally {
          __release(importP);
          __release(importS1);
          __release(importS2);
        }
      }
    },
    exports
  );
  function __liftString(pointer) {
    if (!pointer) return null;
    const end =
        (pointer + new Uint32Array(memory.buffer)[(pointer - 4) >>> 2]) >>> 1,
      memoryU16 = new Uint16Array(memory.buffer);
    let start = pointer >>> 1,
      string = "";
    while (end - start > 1024)
      string += String.fromCharCode(
        ...memoryU16.subarray(start, (start += 1024))
      );
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  function __lowerTypedArray(constructor, id, align, values) {
    if (values == null) return 0;
    const length = values.length,
      buffer = exports.__pin(exports.__new(length << align, 1)) >>> 0,
      header = exports.__new(12, id) >>> 0;
    __setU32(header + 0, buffer);
    __dataview.setUint32(header + 4, buffer, true);
    __dataview.setUint32(header + 8, length << align, true);
    new constructor(memory.buffer, buffer, length).set(values);
    exports.__unpin(buffer);
    return header;
  }
  const refcounts = new Map();
  function __retain(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount) refcounts.set(pointer, refcount + 1);
      else refcounts.set(exports.__pin(pointer), 1);
    }
    return pointer;
  }
  function __release(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount === 1) exports.__unpin(pointer), refcounts.delete(pointer);
      else if (refcount) refcounts.set(pointer, refcount - 1);
      else
        throw Error(
          `invalid refcount '${refcount}' for reference '${pointer}'`
        );
    }
  }
  function __notnull() {
    throw TypeError("value must not be null");
  }
  let __dataview = new DataView(memory.buffer);
  function __setU32(pointer, value) {
    try {
      __dataview.setUint32(pointer, value, true);
    } catch {
      __dataview = new DataView(memory.buffer);
      __dataview.setUint32(pointer, value, true);
    }
  }
  return adaptedExports;
}
