
const stack: string[] = [];

export function pushPath(path: string): void {
  if (stack[stack.length - 1] === path) return; // ignore repeats (StrictMode re-runs)
  stack.push(path);
  if (stack.length > 30) stack.shift();
}

export function lastVisitedPath(): string | null {
  return stack.length ? stack[stack.length - 1] : null;
}
