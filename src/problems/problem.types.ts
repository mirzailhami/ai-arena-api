export interface SourceProblem {
  problemId: string
  problemName: string
  description?: string | null
  zipFileName: string
  status: string
  isContestReady: boolean
  isTested: boolean
  uploadDate: string
}
