import * as fs from 'fs';
import * as path from 'path';

async function downloadClinicalTexts(): Promise<void> {
  const outputDir = path.join(__dirname, '../data/text/clinical');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('Generating additional clinical text samples...\n');
  
  // Sample 1: ICU Progress Note
  const icuNote = `INTENSIVE CARE UNIT PROGRESS NOTE

Date: 02/15/2024
Time: 14:30

Patient: Martinez, Carlos A.
MRN: 987654
DOB: 03/22/1965
Attending: Dr. Williams, Sarah
Room: ICU-4B

SUBJECTIVE:
58-year-old male, post-op day 2 s/p CABG x3. Patient reports improved chest pain.
Family contact: Wife Maria Martinez at 617-555-8901.

OBJECTIVE:
Vitals: BP 128/76, HR 82, RR 16, Temp 37.2°C, SpO2 98% on 2L NC
Cardiac: Regular rate and rhythm, no murmurs
Lungs: Clear bilaterally, diminished at bases
Surgical site: Clean, dry, intact. No erythema or drainage.

Labs (02/15/2024 06:00):
WBC 11.2, Hgb 10.8, Plt 245
Na 138, K 4.1, Cr 1.1, BUN 18
Troponin 0.8 (trending down from 2.1)

ASSESSMENT/PLAN:
1. S/P CABG - stable, continue current management
2. Pain control - adequate on current regimen
3. Cardiac rehab consult today
4. Target discharge 02/17/2024

Contact: Home phone 508-555-3421
Insurance: Blue Cross Policy #BC-789456

Electronically signed: Dr. Sarah Williams, MD
NPI: 1234567890
Date: 02/15/2024 14:45`;

  // Sample 2: Emergency Department Note
  const edNote = `EMERGENCY DEPARTMENT NOTE

Patient: Thompson, Jennifer L.
MRN: 456789
DOB: 07/08/1992
SSN: 234-56-7890
Visit Date: 02/20/2024 22:15
Provider: Dr. Chen, Michael

CHIEF COMPLAINT: Severe headache

HPI:
31-year-old female presents with sudden onset severe headache starting 3 hours ago.
Denies trauma, fever, vision changes. No similar episodes in past.
Patient works at Boston General Hospital as a nurse.

PMH: Migraines (last episode 6 months ago)
Medications: Sumatriptan 50mg PRN
Allergies: Penicillin (rash)

PHYSICAL EXAM:
Vitals: BP 142/88, HR 92, RR 18, Temp 37.0°C
Neuro: Alert, oriented x3. CN II-XII intact. No focal deficits.
Neck: Supple, no meningismus

DIAGNOSTIC STUDIES:
CT Head (02/20/2024 22:45): No acute intracranial abnormality

ASSESSMENT: Migraine headache

PLAN:
1. Sumatriptan 6mg SC given with good response
2. Discharge home with migraine precautions
3. Follow-up with PCP Dr. Anderson within 1 week
4. Return precautions discussed

Discharge time: 02/21/2024 01:30
Patient contact: Cell 857-555-2468
Emergency contact: Mother Susan Thompson 781-555-9012

Address: 456 Oak Avenue, Cambridge, MA 02139

Electronically signed: Dr. Michael Chen, MD
Date: 02/21/2024 01:35`;

  // Sample 3: Pathology Report
  const pathologyReport = `SURGICAL PATHOLOGY REPORT

Patient: Davis, Robert M.
MRN: 321654
DOB: 11/30/1958
SSN: 345-67-8901
Accession #: S24-12345
Date Collected: 02/18/2024
Date Received: 02/18/2024
Date Reported: 02/22/2024

Surgeon: Dr. Patel, Anjali
Pathologist: Dr. Lee, James

CLINICAL HISTORY:
65-year-old male with 2cm right upper lobe lung nodule found on screening CT.
History of 40 pack-year smoking. Underwent VATS wedge resection.

SPECIMEN: Right upper lobe lung wedge resection

GROSS DESCRIPTION:
Received fresh labeled with patient name and MRN is a 4.5 x 3.2 x 2.1 cm
wedge of tan-pink lung tissue. Sectioning reveals a 2.1 cm firm, white-gray
nodule with irregular borders located 0.5 cm from the pleural surface.

MICROSCOPIC DESCRIPTION:
Sections show invasive adenocarcinoma with acinar and papillary patterns.
Tumor cells show moderate nuclear pleomorphism. Mitotic activity is 8/10 HPF.
Lymphovascular invasion is present. Pleural surface is uninvolved.
Surgical margins are negative (closest margin 0.8 cm).

DIAGNOSIS:
Lung, right upper lobe, wedge resection:
- Invasive adenocarcinoma, 2.1 cm
- Grade 2 (moderately differentiated)
- pT1c N0 (0/3 lymph nodes positive)
- Margins negative

IMMUNOHISTOCHEMISTRY:
TTF-1: Positive
Napsin A: Positive
PD-L1 (22C3): 45% tumor proportion score

MOLECULAR TESTING: Pending (sent to reference lab 02/22/2024)

Electronically signed: Dr. James Lee, MD
Anatomic Pathology
Phone: 617-555-PATH (7284)
Date: 02/22/2024 16:30`;

  // Sample 4: Discharge Summary
  const dischargeSummary = `DISCHARGE SUMMARY

Patient: Wilson, Patricia Ann
MRN: 654321
DOB: 05/15/1970
SSN: 456-78-9012
Admission Date: 02/10/2024
Discharge Date: 02/16/2024
Length of Stay: 6 days

Attending Physician: Dr. Rodriguez, Maria
Consulting Physicians: Cardiology (Dr. Kim), Endocrinology (Dr. Brown)

ADMITTING DIAGNOSIS: Diabetic ketoacidosis

DISCHARGE DIAGNOSIS:
1. Diabetic ketoacidosis, resolved
2. Type 2 Diabetes Mellitus, uncontrolled
3. Hypertension
4. Hyperlipidemia

HOSPITAL COURSE:
53-year-old female with history of T2DM presented to ED on 02/10/2024 with
nausea, vomiting, and altered mental status. Initial labs showed glucose 487,
pH 7.18, anion gap 24, positive ketones. Started on insulin drip and IVF.
Anion gap closed by hospital day 2. Transitioned to subcutaneous insulin.

Diabetes education provided by RN Sarah Johnson on 02/14/2024.
Patient demonstrated understanding of insulin administration and glucose monitoring.

DISCHARGE MEDICATIONS:
1. Insulin glargine 20 units subcutaneous daily
2. Insulin lispro 6 units subcutaneous with meals
3. Metformin 1000mg PO BID
4. Lisinopril 20mg PO daily
5. Atorvastatin 40mg PO daily

FOLLOW-UP:
1. Endocrinology clinic with Dr. Brown on 02/28/2024 at 10:00 AM
2. PCP Dr. Martinez within 1 week
3. Diabetes education class scheduled for 03/05/2024

PATIENT INSTRUCTIONS:
- Check blood glucose before meals and at bedtime
- Call if glucose >300 or <70
- Follow diabetic diet as instructed
- Exercise 30 minutes daily as tolerated

CONTACT INFORMATION:
Home: 339-555-7890
Cell: 617-555-4567
Emergency Contact: Husband John Wilson 508-555-8901
Address: 789 Maple Drive, Brookline, MA 02445

Primary Care Provider:
Dr. Martinez, Luis
Boston Family Medicine
123 Medical Plaza, Boston, MA 02115
Phone: 617-555-CARE (2273)
Fax: 617-555-2274

Insurance: Medicare #123-45-6789A

Electronically signed: Dr. Maria Rodriguez, MD
Date: 02/16/2024 15:45`;

  // Sample 5: Operative Report
  const operativeReport = `OPERATIVE REPORT

Patient: Anderson, Michael J.
MRN: 789012
DOB: 09/12/1955
SSN: 567-89-0123
Date of Surgery: 02/25/2024
Surgeon: Dr. Thompson, David
Assistant: Dr. Lee, Susan
Anesthesiologist: Dr. Patel, Raj

PREOPERATIVE DIAGNOSIS: Symptomatic cholelithiasis

POSTOPERATIVE DIAGNOSIS: Acute cholecystitis with cholelithiasis

PROCEDURE: Laparoscopic cholecystectomy

ANESTHESIA: General endotracheal

INDICATIONS:
68-year-old male with recurrent right upper quadrant pain, ultrasound showing
multiple gallstones and gallbladder wall thickening. Patient consented for
laparoscopic cholecystectomy after discussion of risks including bleeding,
infection, bile duct injury, and conversion to open procedure.

PROCEDURE IN DETAIL:
Patient identified in pre-op area. Timeout performed confirming patient identity
(Michael Anderson, MRN 789012), procedure, and surgical site. Patient positioned
supine. General anesthesia induced without complication.

Abdomen prepped and draped in sterile fashion. Pneumoperitoneum established
with Veress needle at umbilicus. Four trocars placed: 10mm umbilical, 5mm
epigastric, 5mm right subcostal, 5mm right lateral.

Gallbladder visualized - markedly distended and inflamed. Adhesions lysed.
Cystic duct and artery identified using critical view of safety technique.
Cystic duct clipped x3 and divided. Cystic artery clipped x2 and divided.
Gallbladder dissected from liver bed using electrocautery. Hemostasis confirmed.

Specimen removed through umbilical port. Irrigation performed. No bile leak
identified. Fascia closed with 0-Vicryl. Skin closed with 4-0 Monocryl.

ESTIMATED BLOOD LOSS: 25 mL
SPECIMENS: Gallbladder to pathology
DRAINS: None
COMPLICATIONS: None

Patient tolerated procedure well and transferred to PACU in stable condition.

Contact for questions: Surgical office 617-555-SURG (7874)
On-call pager: 617-555-9999

Electronically signed: Dr. David Thompson, MD, FACS
Date: 02/25/2024 14:20`;

  const files = [
    { name: 'icu_progress_note.txt', content: icuNote },
    { name: 'ed_note.txt', content: edNote },
    { name: 'pathology_report.txt', content: pathologyReport },
    { name: 'discharge_summary.txt', content: dischargeSummary },
    { name: 'operative_report.txt', content: operativeReport }
  ];

  for (const file of files) {
    const filePath = path.join(outputDir, file.name);
    fs.writeFileSync(filePath, file.content);
    console.log(`✓ Created ${file.name}`);
  }

  console.log(`\n✓ Generated ${files.length} clinical text samples`);
  console.log(`Location: ${path.relative(process.cwd(), outputDir)}`);
}

if (require.main === module) {
  downloadClinicalTexts().catch(console.error);
}

export { downloadClinicalTexts };
