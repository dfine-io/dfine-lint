// fix-island overlap input, fixed with fix-overlap-probe only: one fix of two edits overlaps another fix.
declare function pair(x: number, y: number): number;
declare function inner(z: number): number;
declare function wrap(z: number): number;

export const both = pair(1, inner(2));
export const alone = pair(3, 4);
export const wrapped = wrap( 5);
