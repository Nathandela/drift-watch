export interface SummaryData {
  totalFindings: number;
  totalPatterns: number;
  topPatterns: Array<{ name: string; count: number }>;
  mostAffectedProjects: Array<{ project: string; count: number }>;
}

export function formatSummary(data: SummaryData): string {
  const lines: string[] = [
    `Total findings: ${data.totalFindings}`,
    `Total patterns: ${data.totalPatterns}`,
  ];

  const top = data.topPatterns.slice(0, 3);
  if (top.length > 0) {
    lines.push('', 'Top patterns:');
    for (const p of top) {
      lines.push(`  ${p.name} (${p.count})`);
    }
  }

  const projects = data.mostAffectedProjects.slice(0, 3);
  if (projects.length > 0) {
    lines.push('', 'Most affected projects:');
    for (const p of projects) {
      lines.push(`  ${p.project} (${p.count})`);
    }
  }

  return lines.join('\n');
}
