"use server";
import { isAxiosError } from "axios";
import round, { formatAmount } from "./format";
declare function probe(): void;
export const act = async (x: number): Promise<string> => {
  probe();
  const text = isAxiosError(x) ? "" : formatAmount(round(x));
  return text;
};
