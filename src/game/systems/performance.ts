export class PerformanceTracker {
  private marks = new Map<string, number>()

  mark(label: string): void {
    this.marks.set(label, performance.now())
  }

  since(label: string): number | null {
    const startedAt = this.marks.get(label)

    if (startedAt === undefined) {
      return null
    }

    return performance.now() - startedAt
  }
}
