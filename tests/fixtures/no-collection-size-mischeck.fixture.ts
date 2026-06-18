// no-collection-size-mischeck — length/size comparison that is always true/false.
declare const arr: number[];
declare const s: string;
declare const m: Map<string, number>;
declare const st: Set<number>;
declare const obj: { length: number };

export const a1 = arr.length >= 0; // EXPECT: no-collection-size-mischeck
export const a2 = arr.length < 0; // EXPECT: no-collection-size-mischeck
export const a3 = s.length > -1; // EXPECT: no-collection-size-mischeck
export const a4 = m.size < 0; // EXPECT: no-collection-size-mischeck
export const a5 = st.size >= 0; // EXPECT: no-collection-size-mischeck

// NEGATIVE: meaningful comparisons, or a non-collection receiver
export const ok1 = arr.length > 0;
export const ok2 = arr.length === 0;
export const ok3 = arr.length >= 1;
export const ok4 = obj.length >= 0;
