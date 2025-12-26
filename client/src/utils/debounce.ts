export function debounce<Args extends unknown[], R>(fn: (...args: Args) => R, ms: number) {
  let t: ReturnType<typeof globalThis.setTimeout> | undefined;

  return (...args: Args) => {
    if (t !== undefined) globalThis.clearTimeout(t);
    t = globalThis.setTimeout(() => {
      fn(...args);
    }, ms);
  };
}
