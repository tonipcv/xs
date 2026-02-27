#!/bin/bash

# XASE De-Identification - Generate Demo Data
# Gera dados de demonstração para apresentações e testes

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     XASE De-Identification - Generate Demo Data           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Download real DICOM images
echo -e "${YELLOW}Step 1: Downloading real DICOM images...${NC}"
npm run download:dicom-real
echo -e "${GREEN}✓ DICOM images downloaded${NC}"
echo ""

# 2. Generate sample data
echo -e "${YELLOW}Step 2: Generating sample data...${NC}"
npm run generate:samples
echo -e "${GREEN}✓ Sample data generated${NC}"
echo ""

# 3. Process all formats
echo -e "${YELLOW}Step 3: Processing all formats...${NC}"

# DICOM Binary
echo "  Processing DICOM Binary..."
npm run test:dicom-binary > /dev/null 2>&1
echo -e "  ${GREEN}✓ DICOM Binary processed${NC}"

# FHIR
echo "  Processing FHIR..."
npm run test:fhir > /dev/null 2>&1
echo -e "  ${GREEN}✓ FHIR processed${NC}"

# HL7
echo "  Processing HL7..."
npm run test:hl7 > /dev/null 2>&1
echo -e "  ${GREEN}✓ HL7 processed${NC}"

# Text
echo "  Processing Clinical Text..."
npm run test:text > /dev/null 2>&1
echo -e "  ${GREEN}✓ Text processed${NC}"

echo ""

# 4. Generate reports
echo -e "${YELLOW}Step 4: Generating reports...${NC}"
npm run quality-report > /dev/null 2>&1
npm run dashboard > /dev/null 2>&1
echo -e "${GREEN}✓ Reports generated${NC}"
echo ""

# 5. Create demo package
echo -e "${YELLOW}Step 5: Creating demo package...${NC}"

DEMO_DIR="demo-package"
mkdir -p $DEMO_DIR

# Copy sample files
cp -r output/dicom/binary-deidentified/*.dcm $DEMO_DIR/ 2>/dev/null || true
cp -r output/quality-reports/*.html $DEMO_DIR/ 2>/dev/null || true
cp -r output/monitoring/*.html $DEMO_DIR/ 2>/dev/null || true

# Create README
cat > $DEMO_DIR/README.txt << EOF
XASE De-Identification System - Demo Package
=============================================

This package contains:
- De-identified DICOM images (real medical data)
- Quality reports (HTML)
- Monitoring dashboard (HTML)

All data has been de-identified with 100% PHI removal.

To view:
1. Open quality-report.html in your browser
2. Open dashboard.html for monitoring metrics
3. DICOM files can be viewed with any DICOM viewer

For more information: https://xase.com
EOF

echo -e "${GREEN}✓ Demo package created in: $DEMO_DIR/${NC}"
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Demo Data Ready                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Generated files:"
echo "  - DICOM images: data/dicom/images/"
echo "  - De-identified: output/dicom/binary-deidentified/"
echo "  - Quality report: output/quality-reports/quality-report.html"
echo "  - Dashboard: output/monitoring/dashboard.html"
echo "  - Demo package: $DEMO_DIR/"
echo ""
echo -e "${GREEN}✅ Demo data ready for presentations!${NC}"
