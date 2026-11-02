const isValueEmpty = (value: string | null | undefined): boolean => {
  return value === null || value === undefined || value.trim().length == 0;
};

function deepEquals(x: any, y: any) {

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

/**
 * A logging flag, either a fixed boolean or a getter that is read on every
 * log call. Components receive a getter so a logging change made after
 * construction (enableLogging() or AvoInspector.shouldLog) applies immediately.
 */
export type ShouldLogFlag = boolean | (() => boolean);

export const toShouldLogGetter = (flag: ShouldLogFlag): (() => boolean) =>
  typeof flag === "function" ? flag : () => flag;

export { isValueEmpty, deepEquals };
