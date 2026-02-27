# Contributing to XASE De-Identification System

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Testing Guidelines](#testing-guidelines)
5. [Code Style](#code-style)
6. [Commit Messages](#commit-messages)
7. [Pull Request Process](#pull-request-process)
8. [Adding New Features](#adding-new-features)

---

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Prioritize patient privacy and data security
- Follow healthcare compliance best practices

---

## Getting Started

### Prerequisites

- Node.js 18+
- TypeScript 5+
- Git
- Docker (optional)
- Kubernetes (optional)

### Setup Development Environment

```bash
# Fork and clone repository
git clone https://github.com/your-username/xase-sheets.git
cd tests/de-identification

# Install dependencies
npm install

# Generate sample data
npm run generate:samples

# Run tests
npm run test:all

# Start development server
npm run start:api
```

---

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Changes

- Write clean, well-documented code
- Add tests for new features
- Update documentation as needed
- Follow TypeScript best practices

### 3. Test Your Changes

```bash
# Run all tests
npm run test:all

# Run specific tests
npm run test:dicom
npm run test:fhir
npm run test:text
npm run test:audio
npm run test:hl7

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance

# Run edge case tests
npm run test:edge-cases
```

### 4. Commit Changes

```bash
git add .
git commit -m "feat: add new feature"
git push origin feature/your-feature-name
```

### 5. Create Pull Request

- Go to GitHub and create a pull request
- Fill out the PR template
- Wait for review and CI/CD checks

---

## Testing Guidelines

### Test Coverage Requirements

- **Minimum Coverage:** 80%
- **Critical Paths:** 100%
- **New Features:** Must include tests

### Test Types

1. **Unit Tests**
   - Test individual functions
   - Mock external dependencies
   - Fast execution (<100ms per test)

2. **Integration Tests**
   - Test complete workflows
   - Use real sample data
   - Validate end-to-end functionality

3. **Performance Tests**
   - Measure throughput
   - Test concurrent processing
   - Monitor memory usage

4. **Edge Case Tests**
   - International formats
   - Unicode characters
   - Complex nested structures
   - Boundary conditions

### Writing Tests

```typescript
// Example test structure
import { TextDeidentifier } from './text-deidentifier';

describe('TextDeidentifier', () => {
  let deidentifier: TextDeidentifier;

  beforeEach(() => {
    deidentifier = new TextDeidentifier();
  });

  it('should redact patient names', async () => {
    const input = 'Patient: John Doe';
    const result = await deidentifier.deidentify(input);
    
    expect(result.deidentified).not.toContain('John Doe');
    expect(result.phiEntities.length).toBeGreaterThan(0);
    expect(result.integrityValid).toBe(true);
  });

  it('should maintain 100% redaction rate', async () => {
    const input = 'Patient: John Doe, MRN: 123456';
    const result = await deidentifier.deidentify(input);
    const metrics = deidentifier.getMetrics();
    
    expect(metrics.redactionRate).toBe(100);
  });
});
```

---

## Code Style

### TypeScript Guidelines

```typescript
// Use strict typing
interface Patient {
  name: string;
  mrn: string;
  dob: Date;
}

// Use async/await
async function processPatient(patient: Patient): Promise<void> {
  // Implementation
}

// Use descriptive names
const redactionRate = (redacted / detected) * 100;

// Add JSDoc comments
/**
 * De-identifies a FHIR resource
 * @param resource - FHIR resource to de-identify
 * @returns De-identified resource with metrics
 */
async function deidentifyFHIR(resource: any): Promise<DeidentificationResult> {
  // Implementation
}
```

### File Organization

```
src/
├── deidentifiers/          # Core de-identification engines
│   ├── text-deidentifier.ts
│   ├── fhir-deidentifier.ts
│   └── dicom-deidentifier.ts
├── tests/                  # Test suites
│   ├── text-tests.ts
│   └── integration-tests.ts
├── api/                    # API server
│   └── api-server.ts
├── utils/                  # Utility functions
│   └── validators.ts
└── types.ts               # Type definitions
```

### Naming Conventions

- **Files:** kebab-case (`text-deidentifier.ts`)
- **Classes:** PascalCase (`TextDeidentifier`)
- **Functions:** camelCase (`deidentifyText`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Interfaces:** PascalCase (`DeidentificationResult`)

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

### Examples

```bash
feat(hl7): add HL7 v2 message de-identification

- Implement segment-based parsing
- Add field-level redaction
- Support ADT, ORU, ORM message types
- Include date shifting for HL7 format

Closes #123

---

fix(text): improve international phone number detection

- Add support for +country code format
- Handle parentheses and dashes
- Test with 10+ international formats

Fixes #456

---

docs(api): update API documentation with new endpoints

- Add /api/v1/deidentify/hl7 endpoint
- Document batch processing
- Include cURL examples

---

perf(batch): optimize concurrent processing

- Increase default concurrency to 8
- Implement worker pool
- Reduce memory usage by 30%

Improves #789
```

---

## Pull Request Process

### Before Submitting

- [ ] All tests pass
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] Commit messages follow conventions
- [ ] No merge conflicts
- [ ] Quality gates pass (≥95% redaction, ≥90% integrity)

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Performance tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added
- [ ] All tests pass
- [ ] No new warnings

## Screenshots (if applicable)

## Related Issues
Closes #123
```

### Review Process

1. **Automated Checks**
   - CI/CD pipeline runs
   - Tests execute
   - Security scan
   - Quality gates validate

2. **Code Review**
   - At least 1 approval required
   - Address all comments
   - Update as needed

3. **Merge**
   - Squash and merge
   - Delete branch after merge

---

## Adding New Features

### New Data Format Support

1. **Create De-identifier**
   ```typescript
   // src/new-format-deidentifier.ts
   export class NewFormatDeidentifier {
     async deidentify(input: string): Promise<DeidentificationResult> {
       // Implementation
     }
     
     getMetrics() {
       return {
         phiDetected: this.phiDetected.length,
         phiRedacted: this.redactionMap.size,
         redactionRate: // calculation
       };
     }
   }
   ```

2. **Add Tests**
   ```typescript
   // src/new-format-tests.ts
   export async function runNewFormatTests(): Promise<TestResult> {
     // Test implementation
   }
   ```

3. **Generate Sample Data**
   ```typescript
   // src/generate-new-format-samples.ts
   async function generateSamples(): Promise<void> {
     // Sample generation
   }
   ```

4. **Update API**
   ```typescript
   // src/api-server.ts
   app.post('/api/v1/deidentify/newformat', async (req, res) => {
     // Endpoint implementation
   });
   ```

5. **Add Documentation**
   - Update README.md
   - Update API_DOCUMENTATION.md
   - Add usage examples

6. **Update Tests**
   - Add to run-all-tests.ts
   - Add to full-integration-test.ts
   - Update package.json scripts

### New API Endpoint

1. **Define Route**
2. **Implement Handler**
3. **Add Validation**
4. **Write Tests**
5. **Document Endpoint**
6. **Update OpenAPI Spec**

### New Quality Metric

1. **Define Metric**
2. **Implement Calculation**
3. **Add to Reports**
4. **Update Dashboard**
5. **Document Metric**

---

## Quality Standards

### Code Quality

- **Redaction Rate:** ≥95%
- **File Integrity:** ≥90%
- **Test Coverage:** ≥80%
- **Performance:** ≥1 MB/s throughput
- **Response Time:** <100ms average

### Security

- No hardcoded secrets
- Input validation
- Error handling
- Audit logging
- HIPAA compliance

### Documentation

- Clear README
- API documentation
- Code comments
- Usage examples
- Deployment guides

---

## Release Process

### Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR:** Breaking changes
- **MINOR:** New features (backward compatible)
- **PATCH:** Bug fixes

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped
- [ ] Git tag created
- [ ] Docker image built
- [ ] Deployment tested
- [ ] Release notes written

---

## Getting Help

- **Documentation:** See all `.md` files
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Email:** support@xase.ai

---

## Recognition

Contributors will be recognized in:
- CHANGELOG.md
- README.md
- Release notes

---

**Thank you for contributing to XASE De-Identification System!**

Your contributions help improve healthcare data privacy and security.
