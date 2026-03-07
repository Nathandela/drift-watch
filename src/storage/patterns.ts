import type { Repository } from './repository.js';
import type { Finding } from '../analysis/schema.js';

export async function matchOrCreatePattern(
  repo: Repository,
  finding: Finding,
  findingId: string,
): Promise<string> {
  const existing = await repo.findPatternByCategory(finding.category, finding.title);

  let patternId: string;

  if (existing) {
    patternId = existing.id;
    await repo.updatePatternOccurrence(patternId);
  } else {
    patternId = await repo.insertPattern({
      name: finding.title,
      description: finding.description,
      severity: String(finding.severity),
      category: finding.category,
    });
  }

  await repo.linkFindingPattern({
    finding_id: findingId,
    pattern_id: patternId,
    confidence: 1.0,
  });

  return patternId;
}
