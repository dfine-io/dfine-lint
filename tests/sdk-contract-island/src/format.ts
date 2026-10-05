// Project functions another file imports: their call targets are this file, not the importer.
export function formatAmount(x: number): string {
  return String(x);
}

export default function roundAmount(x: number): number {
  return Math.round(x);
}
