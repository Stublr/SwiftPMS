export const FolioStatus = {
  OPEN: "open",
  SETTLED: "settled",
  VOID: "void",
} as const;

export type FolioStatus = (typeof FolioStatus)[keyof typeof FolioStatus];
