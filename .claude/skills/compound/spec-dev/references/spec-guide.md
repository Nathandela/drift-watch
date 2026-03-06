# Spec Dev Quick Reference

## EARS Notation Patterns

EARS (Easy Approach to Requirements Syntax) provides five sentence templates:

| Pattern | Template | Example |
|---------|----------|---------|
| **Ubiquitous** | The system shall `<action>`. | The system shall validate all inputs. |
| **Event-driven** | When `<trigger>`, the system shall `<action>`. | When the user submits the form, the system shall validate all fields. |
| **State-driven** | While `<state>`, the system shall `<action>`. | While the system is in maintenance mode, the system shall reject new connections. |
| **Unwanted behavior** | If `<condition>`, then the system shall `<action>`. | If the database connection fails, then the system shall retry with exponential backoff. |
| **Optional** | Where `<feature>`, the system shall `<action>`. | Where SSO is enabled, the system shall redirect to the identity provider. |

**Combined ordering**: Where > While > When > If/then > shall

### Quality Checks for Each Requirement
- [ ] Uses one of the five EARS patterns
- [ ] No vague adjectives (fast, efficient, user-friendly, easy)
- [ ] Quantities specified where applicable (timeouts, limits, thresholds)
- [ ] Edge cases addressed (empty input, max values, concurrent access)
- [ ] Testable — can write a pass/fail test against it
- [ ] Single responsibility — one requirement per sentence

---

## Mermaid Diagram Selection Guide

| Diagram Type | Use When | Syntax |
|-------------|----------|--------|
| `mindmap` | Exploring problem domain, brainstorming | Phase 1 (Explore) |
| `sequenceDiagram` | Showing interactions between components | Phase 2 (Understand) |
| `stateDiagram-v2` | Modeling lifecycle, state transitions | Phase 2 (Understand) |
| `flowchart` | Showing decision logic, data flow | Phase 3 (Specify) |
| `erDiagram` | Defining data models, relationships | Phase 3 (Specify) |
| `C4Context` | System-level architecture boundaries | Phase 3 (Specify) |

### When to Use Diagrams
- **Always** use a mindmap in Explore to surface hidden assumptions
- **Use sequence diagrams** when 2+ components interact
- **Use state diagrams** when an entity has a lifecycle
- **Skip diagrams** only for truly trivial features (<1h of work)

---

## NL Ambiguity Detection Checklist

Watch for these ambiguity patterns in requirements:

| Pattern | Example | Fix |
|---------|---------|-----|
| **Vague adjectives** | "fast response" | Specify: "response within 200ms" |
| **Unclear pronouns** | "it should update" | Name the subject: "the cache should update" |
| **Passive voice** | "data is validated" | Active: "the API validates data" |
| **Compound requirements** | "shall validate and log and notify" | Split into 3 separate requirements |
| **Unbounded lists** | "supports CSV, JSON, etc." | Enumerate all formats explicitly |
| **Missing quantities** | "handles large files" | Specify: "handles files up to 500MB" |
| **Implicit assumptions** | "users can access" | Specify: "authenticated users with role X can access" |
| **Temporal ambiguity** | "after processing" | Specify: "within 5s of processing completion" |

---

## Trade-off Documentation Framework

When requirements conflict, document the trade-off:

### Template
```
### Trade-off: [Short Title]

**Tension**: [Requirement A] conflicts with [Requirement B].

**Options**:
1. [Option 1]: [Description]. Pro: [benefit]. Con: [cost].
2. [Option 2]: [Description]. Pro: [benefit]. Con: [cost].

**Decision**: [Chosen option] because [rationale].

**Consequence**: [What this means for implementation].
```

### Common Trade-off Dimensions
- **Performance vs. Safety**: Validation adds latency
- **Flexibility vs. Simplicity**: Configuration adds complexity
- **Consistency vs. Availability**: Strict consistency limits throughput
- **Security vs. Usability**: Auth steps add friction
- **Completeness vs. Time-to-market**: More features delay delivery

### Decision Criteria
When evaluating trade-offs, consider:
1. **Reversibility**: Can we change this later? Prefer reversible decisions.
2. **Blast radius**: How many components does this affect?
3. **Evidence**: What data supports each option?
4. **Alignment**: Which option best serves the stated goal?
