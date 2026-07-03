// Tracks the path the user visited, so a detail page can send "Back" to where the
// user actually came from (e.g. a profile) instead of always the section root.
//
// We can't use router.back() here: the nav bar remembers deep routes and re-pushes
// them when a tab is tapped, which pollutes browser history and makes back() land in
// the wrong section. This lightweight stack is updated only on real navigations.

const stack: string[] = [];

export function pushPath(path: string): void {
  if (stack[stack.length - 1] === path) return; // ignore repeats (StrictMode re-runs)
  stack.push(path);
  if (stack.length > 30) stack.shift();
}

// The path visited immediately before the page now mounting. A detail page reads
// this in a useState initializer (render time), before its own path is pushed.
export function lastVisitedPath(): string | null {
  return stack.length ? stack[stack.length - 1] : null;
}
