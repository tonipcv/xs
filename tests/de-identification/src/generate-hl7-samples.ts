import * as fs from 'fs';
import * as path from 'path';

async function generateHL7Samples(): Promise<void> {
  const outputDir = path.join(__dirname, '../data/hl7');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating HL7 v2 message samples...\n');

  // Sample 1: ADT^A01 - Admit Patient
  const adtA01 = `MSH|^~\\&|SENDING_APP|SENDING_FACILITY|RECEIVING_APP|RECEIVING_FACILITY|20240215120000||ADT^A01|MSG00001|P|2.5
EVN|A01|20240215120000
PID|1||123456789^^^HOSPITAL^MR||DOE^JOHN^ALLEN||19800115|M|||123 MAIN ST^^BOSTON^MA^02101^USA||(617)555-1234|(617)555-5678||S||999-88-7777|||||||||||||||||||
NK1|1|DOE^JANE^MARIE|SPO|456 OAK AVE^^CAMBRIDGE^MA^02139^USA|(617)555-9876
PV1|1|I|ICU^201^A|||||||SMITH^SARAH^MD|||MED||||1|||WILLIAMS^ROBERT^MD|INS|ACC123456789|||||||||||||||||||||||||20240215100000
OBX|1|NM|8310-5^BODY TEMPERATURE^LN||37.2|Cel|36.0-37.5|N|||F|||20240215120000
OBX|2|NM|8867-4^HEART RATE^LN||82|/min|60-100|N|||F|||20240215120000`;

  // Sample 2: ORU^R01 - Observation Result
  const oruR01 = `MSH|^~\\&|LAB_SYSTEM|CENTRAL_LAB|EMR|HOSPITAL|20240220143000||ORU^R01|MSG00002|P|2.5
PID|1||987654321^^^HOSPITAL^MR||SMITH^JANE^BETH||19920708|F|||789 ELM ST^^BROOKLINE^MA^02445^USA||(857)555-2468|(857)555-7890||M||888-77-6666|||||||||||||||||||
OBR|1|ORD123456|RES123456|CBC^COMPLETE BLOOD COUNT^LN|||20240220100000|||||||||CHEN^MICHAEL^MD||||||||LAB|F||||||||||||||||||
OBX|1|NM|718-7^HEMOGLOBIN^LN||13.5|g/dL|12.0-16.0|N|||F|||20240220120000
OBX|2|NM|787-2^MCV^LN||88|fL|80-100|N|||F|||20240220120000
OBX|3|NM|6690-2^WBC^LN||7.2|10*3/uL|4.5-11.0|N|||F|||20240220120000
OBX|4|NM|777-3^PLATELETS^LN||245|10*3/uL|150-400|N|||F|||20240220120000`;

  // Sample 3: ORM^O01 - Order Message
  const ormO01 = `MSH|^~\\&|ORDER_ENTRY|HOSPITAL|PHARMACY|CENTRAL|20240225090000||ORM^O01|MSG00003|P|2.5
PID|1||456789123^^^HOSPITAL^MR||JOHNSON^ROBERT^CHARLES||19651130|M|||321 PINE RD^^NEWTON^MA^02458^USA||(508)555-3421|(508)555-6789||M||777-66-5555|||||||||||||||||||
PV1|1|O|CARDIO^101^B|||||||PATEL^ANJALI^MD|||CARD||||2|||RODRIGUEZ^MARIA^MD|INS|POL987654321|||||||||||||||||||||||||20240225080000
ORC|NW|ORD789456|||||^Q1H^^20240225090000^^R
RXO|ASPIRIN 81MG TAB|81||MG||||||||||||
RXR|PO
OBX|1|TX|INDICATION||CARDIAC PROPHYLAXIS|||||||F|||20240225090000`;

  // Sample 4: MDM^T02 - Document Status Change
  const mdmT02 = `MSH|^~\\&|EMR|HOSPITAL|DOC_SYSTEM|ARCHIVE|20240228153000||MDM^T02|MSG00004|P|2.5
EVN|T02|20240228153000
PID|1||147258369^^^HOSPITAL^MR||WILSON^PATRICIA^ANN||19700515|F|||654 MAPLE DR^^QUINCY^MA^02169^USA||(339)555-7890|(339)555-4321||M||666-55-4444|||||||||||||||||||
PV1|1|O|ENDO^205^A|||||||BROWN^JAMES^MD|||ENDO||||3|||MARTINEZ^LUIS^MD|INS|HMO123456789|||||||||||||||||||||||||20240228100000
TXA|1|DS|TEXT|20240228153000||||||||DOC456789||||||AU|AV|LA
OBX|1|TX|DISCHARGE SUMMARY||Patient discharged in stable condition. Follow-up scheduled with Dr. Martinez in 2 weeks. Medications: Metformin 1000mg BID, Lisinopril 20mg daily.|||||||F|||20240228153000`;

  // Sample 5: SIU^S12 - Appointment Notification
  const siuS12 = `MSH|^~\\&|SCHEDULING|HOSPITAL|EMR|CLINIC|20240301100000||SIU^S12|MSG00005|P|2.5
SCH|APT123456||||||OFFICE VISIT^ROUTINE CHECKUP|||||30|min||||||ANDERSON^MICHAEL^JAMES|||||||BOOKED
PID|1||789012345^^^HOSPITAL^MR||ANDERSON^MICHAEL^JAMES||19550912|M|||987 OAK ST^^WALTHAM^MA^02451^USA||(781)555-8901|(781)555-2345||M||555-44-3333|||||||||||||||||||
PV1|1|O|CLINIC^301^C|||||||THOMPSON^DAVID^MD|||SURG||||4|||LEE^SUSAN^MD|INS|PPO987654321|||||||||||||||||||||||||20240315140000
RGS|1|A
AIG|1||THOMPSON^DAVID^MD^^^^^HOSPITAL
AIL|1||CLINIC^301^C^HOSPITAL`;

  const samples = [
    { name: 'adt_admit_patient.hl7', content: adtA01 },
    { name: 'oru_lab_results.hl7', content: oruR01 },
    { name: 'orm_medication_order.hl7', content: ormO01 },
    { name: 'mdm_discharge_summary.hl7', content: mdmT02 },
    { name: 'siu_appointment.hl7', content: siuS12 }
  ];

  for (const sample of samples) {
    const filePath = path.join(outputDir, sample.name);
    fs.writeFileSync(filePath, sample.content);
    console.log(`✓ Created ${sample.name}`);
  }

  console.log(`\n✓ Generated ${samples.length} HL7 v2 message samples`);
}

if (require.main === module) {
  generateHL7Samples().catch(console.error);
}

export { generateHL7Samples };
