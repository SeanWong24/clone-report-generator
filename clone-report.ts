export interface CloneFragment {
  classId: number;
  pcId: number;
  startLine: number;
  endLine: number;
  filePath: string;
  additionCount: number;
  deletionCount: number;

  globalId?: number;
}
