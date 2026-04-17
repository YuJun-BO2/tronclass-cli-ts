/**
 * The nested field flattening/unflattening logic is ported from the original Python implementation:
 * https://github.com/Howyoung/tronclass-cli
 * Copyright (c) 2020 Howyoung (MIT License)
 */
export function unflattenFields(flattenFields: string[]): string {
  const fields: Record<string, any> = {};
  for (const field of flattenFields) {
    let cur = fields;
    for (const layer of field.split(".")) {
      if (!cur[layer]) cur[layer] = {};
      cur = cur[layer];
    }
  }

  function visit(d: Record<string, any>): string {
    return Object.entries(d)
      .map(([k, v]) => {
        const keys = Object.keys(v);
        if (keys.length === 0) return k;
        return `${k}(${visit(v)})`;
      })
      .join(",");
  }

  return visit(fields);
}

export function getNestedValue(obj: any, path: string): any {
  const parts = path.split(".");
  let current: any = obj;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const restPath = parts.slice(i).join(".");
      return current.map((item: any) => getNestedValue(item, restPath)).join(", ");
    }
    current = current[part];
  }
  return current;
}
