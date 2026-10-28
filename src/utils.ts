const isValueEmpty = (value: string | null | undefined): boolean => {
  return value === null || value === undefined || value.trim().length == 0;
};

/**
 * A logging-flag argument: either a fixed boolean or a getter read live. The
 * logging components take this and normalise it to a getter with
 * `toShouldLogGetter`, so a shared static flag is read live (and a bare
 * `if (this.shouldLog)` on the stored getter is a compile error, not an
 * always-truthy silent bug). See AVO-3079.
 */
export type ShouldLogFlag = boolean | (() => boolean);

export const toShouldLogGetter = (flag: ShouldLogFlag): (() => boolean) =>
  typeof flag === "function" ? flag : () => flag;

function deepEquals (x: any, y: any) {
  if (x === y) {
    return true;
  }

  if (!(x instanceof Object) || !(y instanceof Object)) {
    return false;
  }

  if (x.constructor !== y.constructor) {
    return false;
  }

  for (var p in x) {
    if (!x.hasOwnProperty(p)) {
      continue;
    }

    if (!y.hasOwnProperty(p)) {
      return false;
    }

    if (x[p] === y[p]) {
      continue;
    }

    if (typeof x[p] !== "object") {
      return false;
    }

    if (!deepEquals(x[p], y[p])) {
      return false;
    }
  }

  for (p in y) {
    if (y.hasOwnProperty(p) && !x.hasOwnProperty(p)) {
      return false;
    }
  }
  return true;
}

export { isValueEmpty, deepEquals };
