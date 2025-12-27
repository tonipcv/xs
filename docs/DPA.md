# Data Processing Addendum (DPA)

**Between**: XASE Technologies Ltd. ("Processor")  
**And**: Customer ("Controller")  
**Effective Date**: [Date of Agreement]  
**Version**: 2.0

---

## 1. Definitions

**1.1** Terms used in this DPA have the meanings set forth in the GDPR and LGPD unless otherwise defined herein.

**1.2** Specific definitions:
- **"Personal Data"**: any information relating to an identified or identifiable natural person
- **"Processing"**: any operation performed on Personal Data
- **"Data Subject"**: the individual to whom Personal Data relates
- **"Sub-processor"**: any third party engaged by Processor to process Personal Data
- **"Services"**: XASE platform for AI decision evidence and audit trail

---

## 2. Scope and Roles

**2.1 Controller and Processor**

The parties acknowledge that:
- **Controller**: Customer determines the purposes and means of Processing Personal Data
- **Processor**: XASE processes Personal Data on behalf of Controller according to Controller's instructions

**2.2 Scope of Processing**

| Element | Description |
|---------|-------------|
| **Subject matter** | AI decision evidence, audit trail, and compliance documentation |
| **Duration** | Term of the Agreement plus retention period (default: 7 years) |
| **Nature and purpose** | Storage, processing, and verification of AI decision records |
| **Type of Personal Data** | Decision inputs/outputs (optional), user metadata, audit logs |
| **Categories of Data Subjects** | End-users of Controller's AI systems, Controller's employees |

---

## 3. Processor Obligations

**3.1 Processing Instructions**

XASE shall:
- Process Personal Data only on documented instructions from Controller
- Not process Personal Data for any other purpose
- Immediately inform Controller if instructions violate GDPR/LGPD

**3.2 Confidentiality**

XASE shall:
- Ensure personnel authorized to process Personal Data are bound by confidentiality
- Maintain confidentiality obligations beyond termination of employment

**3.3 Security Measures**

XASE implements the following technical and organizational measures:

**Technical Measures**:
- ✅ Encryption at rest (AES-256)
- ✅ Encryption in transit (TLS 1.3)
- ✅ Cryptographic signing (AWS KMS ECDSA_SHA_256)
- ✅ Access control (RBAC: OWNER/ADMIN/VIEWER)
- ✅ Authentication (2FA/TOTP, API Keys)
- ✅ Rate limiting (per-tenant, per-action)
- ✅ CSRF protection (double-submit cookie)
- ✅ Security headers (CSP, HSTS, X-Frame-Options)

**Organizational Measures**:
- ✅ Security policies and procedures
- ✅ Employee training (security awareness)
- ✅ Background checks (for personnel with access)
- ✅ Incident response plan
- ✅ Business continuity plan
- ✅ Regular security audits

**3.4 Sub-processors**

Current sub-processors:

| Sub-processor | Service | Location | Purpose |
|---------------|---------|----------|---------|
| **Amazon Web Services (AWS)** | Cloud infrastructure | sa-east-1 (Brazil) | Database, storage, KMS |
| **Vercel** | Hosting | Global (CDN) | Application hosting |
| **Google Cloud** | Email | Global | Transactional emails |

**Sub-processor changes**:
- XASE shall notify Controller 30 days before adding/replacing sub-processors
- Controller may object within 30 days
- If objection, parties shall negotiate alternative solution

**3.5 Data Subject Rights**

XASE shall assist Controller in responding to Data Subject requests:
- Right of access (Art. 15 GDPR, Art. 18(I) LGPD)
- Right to rectification (Art. 16 GDPR, Art. 18(III) LGPD)
- Right to erasure (Art. 17 GDPR, Art. 18(VI) LGPD)
- Right to restriction (Art. 18 GDPR, Art. 18(IV) LGPD)
- Right to data portability (Art. 20 GDPR, Art. 18(V) LGPD)
- Right to object (Art. 21 GDPR, Art. 18(§2) LGPD)

**Assistance provided**:
- API endpoints for data export (JSON/ZIP)
- Soft delete functionality (with audit trail)
- Data anonymization tools
- Response within 72 hours of request

**3.6 Data Breach Notification**

In case of Personal Data breach, XASE shall:
- Notify Controller without undue delay (max 72 hours)
- Provide details: nature, categories, approximate number of Data Subjects
- Describe likely consequences and mitigation measures
- Assist Controller in notifying Data Subjects and authorities

**3.7 Data Protection Impact Assessment (DPIA)**

XASE shall assist Controller in conducting DPIA when required, providing:
- Description of processing operations
- Assessment of necessity and proportionality
- Assessment of risks to Data Subjects
- Measures to address risks

**3.8 Audits and Inspections**

Controller may:
- Audit XASE's compliance with this DPA (once per year, with 30 days notice)
- Request SOC 2 reports, ISO 27001 certificates (when available)
- Engage third-party auditors (subject to confidentiality)

---

## 4. International Data Transfers

**4.1 Data Location**

Default data location: **Brazil (sa-east-1)**

**4.2 Transfers Outside Brazil**

If Controller requests data processing outside Brazil, XASE shall:
- Implement Standard Contractual Clauses (SCC) approved by EU Commission
- Ensure adequate level of protection (LGPD Art. 33)
- Obtain Controller's explicit consent
- Provide additional safeguards (encryption, audit trail)

**4.3 Adequacy Decisions**

XASE monitors adequacy decisions by:
- European Commission (GDPR Art. 45)
- ANPD (LGPD Art. 33)

---

## 5. Data Retention and Deletion

**5.1 Retention Period**

Default retention: **7 years** (configurable per tenant)

**5.2 Deletion**

Upon termination or Controller's request, XASE shall:
- Delete or return all Personal Data within 30 days
- Provide certification of deletion
- Exception: data required by law (with legal hold)

**5.3 Backup Retention**

Backups retained for 90 days after deletion, then permanently erased.

---

## 6. Liability and Indemnification

**6.1 Liability**

Each party is liable for damages caused by non-compliance with GDPR/LGPD.

**6.2 Indemnification**

XASE shall indemnify Controller for:
- Fines imposed by supervisory authorities due to XASE's breach
- Claims by Data Subjects due to XASE's breach

**Limitation**: Indemnification capped at 12 months of fees paid by Controller.

---

## 7. Term and Termination

**7.1 Term**

This DPA is effective upon signature and remains in force during the Agreement term.

**7.2 Termination**

Upon termination:
- XASE deletes or returns all Personal Data (see Section 5)
- Obligations survive termination: confidentiality, deletion, indemnification

---

## 8. Governing Law and Jurisdiction

**8.1 Governing Law**

This DPA is governed by:
- Brazilian law (Lei Geral de Proteção de Dados - LGPD)
- EU law (General Data Protection Regulation - GDPR) if applicable

**8.2 Jurisdiction**

Disputes shall be resolved in the courts of São Paulo, Brazil.

---

## 9. Signatures

**XASE Technologies Ltd. (Processor)**

Signature: ___________________________  
Name: [Name]  
Title: [Title]  
Date: [Date]

**[Customer Name] (Controller)**

Signature: ___________________________  
Name: [Name]  
Title: [Title]  
Date: [Date]

---

## Annex 1: Technical and Organizational Measures

### A. Access Control

**Physical Access Control**:
- Data centers: AWS (ISO 27001, SOC 2)
- Biometric access, 24/7 surveillance
- Visitor logs, escort requirements

**Logical Access Control**:
- Role-Based Access Control (RBAC)
- Multi-factor authentication (2FA/TOTP)
- API Keys with bcrypt hash
- Session management (JWT, secure cookies)
- Rate limiting (per-tenant, per-action)

### B. Transmission Control

- TLS 1.3 (HTTPS) for all communications
- Certificate pinning (recommended for mobile)
- VPN for admin access (optional)

### C. Input Control

- Audit log (WORM - Write Once Read Many)
- All actions logged: who, what, when, where
- Immutability via SQL triggers

### D. Availability Control

- Automated backups (daily)
- Point-in-time recovery (35 days)
- Cross-region replication (optional)
- RTO: < 4 hours, RPO: < 1 hour

### E. Separation Control

- Tenant isolation (tenantId in all queries)
- Cross-tenant access blocked
- Separate databases per tenant (optional)

### F. Pseudonymization and Encryption

- Encryption at rest: AES-256 (S3, RDS)
- Encryption in transit: TLS 1.3
- Cryptographic signing: ECDSA_SHA_256 (AWS KMS)
- Hash of PII: SHA-256 (optional, client-side)

### G. Incident Response

- Incident response plan documented
- Security team on-call 24/7
- Breach notification within 72 hours
- Post-mortem and remediation

---

## Annex 2: Sub-processors

| Sub-processor | Service | Data Processed | Location | Safeguards |
|---------------|---------|----------------|----------|------------|
| **AWS** | Infrastructure | All data | sa-east-1 (Brazil) | ISO 27001, SOC 2, DPA |
| **Vercel** | Hosting | Application code, logs | Global (CDN) | ISO 27001, SOC 2, DPA |
| **Google Cloud** | Email | Email addresses, content | Global | ISO 27001, SOC 2, DPA |
| **Sentry** (optional) | Error tracking | Error logs, stack traces | US/EU | ISO 27001, DPA, Privacy Shield successor |

---

**End of Data Processing Addendum**
