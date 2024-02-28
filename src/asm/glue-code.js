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
          throw Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`);
        })();
      },
    }),
  };
  const instantiated = await WebAssembly.instantiate(module, adaptedImports);
  const { exports } = instantiated.instance;
  const memory = exports.memory || imports.env.memory;
  const adaptedExports = Object.setPrototypeOf({
    getNfp(dataA, dataB, searchEdges) {
      // assembly/index/getNfp(~lib/typedarray/Float32Array, ~lib/typedarray/Float32Array, bool) => ~lib/typedarray/Float32Array
      dataA = __retain(__lowerTypedArray(Float32Array, 4, 2, dataA) || __notnull());
      dataB = __lowerTypedArray(Float32Array, 4, 2, dataB) || __notnull();
      searchEdges = searchEdges ? 1 : 0;
      try {
        return __liftTypedArray(Float32Array, exports.getNfp(dataA, dataB, searchEdges) >>> 0);
      } finally {
        __release(dataA);
      }
    },
    noFitPolygon(a, b, inside, searchEdges) {
      // assembly/index/noFitPolygon(~lib/typedarray/Float32Array, ~lib/typedarray/Float32Array, bool, bool) => ~lib/typedarray/Float32Array
      a = __retain(__lowerTypedArray(Float32Array, 4, 2, a) || __notnull());
      b = __lowerTypedArray(Float32Array, 4, 2, b) || __notnull();
      inside = inside ? 1 : 0;
      searchEdges = searchEdges ? 1 : 0;
      try {
        return __liftTypedArray(Float32Array, exports.noFitPolygon(a, b, inside, searchEdges) >>> 0);
      } finally {
        __release(a);
      }
    },
  }, exports);
  function __liftString(pointer) {
    if (!pointer) return null;
    const
      end = pointer + new Uint32Array(memory.buffer)[pointer - 4 >>> 2] >>> 1,
      memoryU16 = new Uint16Array(memory.buffer);
    let
      start = pointer >>> 1,
      string = "";
    while (end - start > 1024) string += String.fromCharCode(...memoryU16.subarray(start, start += 1024));
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  function __liftTypedArray(constructor, pointer) {
    if (!pointer) return null;
    return new constructor(
      memory.buffer,
      __getU32(pointer + 4),
      __dataview.getUint32(pointer + 8, true) / constructor.BYTES_PER_ELEMENT
    ).slice();
  }
  function __lowerTypedArray(constructor, id, align, values) {
    if (values == null) return 0;
    const
      length = values.length,
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
      else throw Error(`invalid refcount '${refcount}' for reference '${pointer}'`);
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
  function __getU32(pointer) {
    try {
      return __dataview.getUint32(pointer, true);
    } catch {
      __dataview = new DataView(memory.buffer);
      return __dataview.getUint32(pointer, true);
    }
  }
  return adaptedExports;
}
