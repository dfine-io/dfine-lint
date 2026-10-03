"use server";
declare function probe(): void;
export const act = async (x: number): Promise<string> => {
  probe();
  return String(x);
};
