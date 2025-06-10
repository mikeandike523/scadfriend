export type SerializablePrimitive = string | number | boolean | null;
export type SerializableObject =
  | SerializablePrimitive
  | SerializableObject[]
  | {
      [key: string]: SerializableObject;
    };

export function isSerializablePrimitive(
  value: unknown
): value is SerializablePrimitive {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

export function toSerializableObject(
  obj: unknown,
  {
    enumerableOnly = true,
    undefinedMode = "ignore",
    nonPrimitivesMode = "ignore",
    circularMode = "ignore",
  }: {
    enumerableOnly?: boolean;
    undefinedMode?: "error" | "ignore" | "null" | "preserve";
    nonPrimitivesMode?: "error" | "ignore" | "null" | "reportType";
    circularMode?: "ignore" | "error" | "null" | "reportType";
  } = {}
):
  | SerializableObject
  | Array<SerializableObject | undefined>
  | {
      [key: string]: SerializableObject | undefined;
    }
  | undefined {
  const seen = new Set<unknown>();
  function getKeys(o: object): string[] {
    return enumerableOnly ? Object.keys(o) : Object.getOwnPropertyNames(o);
  }
  function isPrimitive(value: unknown): value is SerializablePrimitive {
    return (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    );
  }
  function inner(objInner: unknown):
    | SerializableObject
    | undefined
    | Array<SerializableObject | undefined>
    | {
        [key: string]: SerializableObject | undefined;
      } {
    if (typeof objInner === "undefined") {
      if (undefinedMode === "error") {
        throw new Error(
          "Got an undefined value in original object at either top lower levels, and `undefinedMode` was set to error."
        );
      }
      return undefined;
    }
    if (isPrimitive(objInner)) {
      return objInner;
    }
    if (typeof objInner === "object") {
      if (seen.has(objInner)) {
        if (circularMode === "error") {
          throw new Error(
            "Circular reference detected in original object at either top lower levels and `circularMode` was set to error."
          );
        } else if (circularMode === "reportType") {
          return {
            name: "CircularReference",
            type: "object",
            kind: Array.isArray(objInner) ? "Array" : "Object",
          };
        } else if (circularMode === "ignore") {
          return undefined;
        } else if (circularMode === "null") {
          return null;
        }
      }
      seen.add(objInner);

      if (Array.isArray(objInner)) {
        const result: (SerializableObject | undefined)[] = [];
        for (const item of objInner) {
          const subResult = inner(item);
          if (typeof subResult === "undefined") {
            if (undefinedMode === "error") {
              throw new Error(
                "Got an undefined value in array at index " +
                  result.length +
                  " and `undefinedMode` was set to error."
              );
            } else if (undefinedMode === "preserve") {
              result.push(undefined);
            } else if (undefinedMode === "null") {
              result.push(null);
            } else if (undefinedMode === "ignore") {
              throw new Error(
                "Got an array with an undefined value and `undefinedMode` was set to 'ignore'. This is an edge case that is not allowed, as it is impossible to ignore items inside an array. You can try setting `undefinedMode` to 'preserve' or 'null'."
              );
            }
          } else {
            result.push(subResult);
          }
        }
        return result;
      } else {
        const keys = getKeys(objInner);
        const result: { [key: string]: SerializableObject | undefined } = {};
        for (const key of keys) {
          const subResult = inner((objInner as Record<string, unknown>)[key]);
          if (typeof subResult === "undefined") {
            if (undefinedMode === "error") {
              throw new Error(
                "Got an undefined value in object at key '" +
                  key +
                  "' and `undefinedMode` was set to error."
              );
            } else if (undefinedMode === "preserve") {
              (result as Record<string, unknown>)[key] = undefined;
            } else if (undefinedMode === "null") {
              (result as Record<string, unknown>)[key] = null;
            } else if (undefinedMode === "ignore") {
              // do nothing / omit key
            }
          } else {
            (result as Record<string, unknown>)[key] = subResult;
          }
        }
        return result;
      }
    }
    if (nonPrimitivesMode === "error") {
      throw new Error(
        "Got a non-primitive value in original object at either top lower levels, and `nonPrimitivesMode` was set to error."
      );
    } else if (nonPrimitivesMode === "ignore") {
      return undefined;
    } else if (nonPrimitivesMode === "null") {
      return null;
    } else if (nonPrimitivesMode === "reportType") {
      return {
        name: "NonPrimitive",
        type: typeof objInner,
      };
    }
  }
  const result = inner(obj);
  if (typeof result === "undefined") {
    if (undefinedMode === "error") {
      throw new Error(
        "Top level value is undefined and `undefinedMode` is set to 'error'"
      );
    } else if (undefinedMode === "ignore") {
      return undefined;
    } else if (undefinedMode === "null") {
      return null;
    } else if (undefinedMode === "preserve") {
      return undefined;
    }
  } else {
    return result;
  }
}

export function formatError(error: unknown): string {
  const serializable = toSerializableObject(error, {
    enumerableOnly: false,
    undefinedMode: "ignore",
    nonPrimitivesMode: "ignore",
    circularMode: "ignore",
  });
  if (isSerializablePrimitive(serializable)) {
    return String(serializable);
  }
  if (typeof serializable === "object") {
    return JSON.stringify(serializable, null, 2);
  }
  return `Unknown Error: (type '${typeof error}')`
}