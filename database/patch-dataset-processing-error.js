// Patch DB: add processing_error column if missing on xase_voice_datasets
// Usage:
//   DATABASE_URL="postgres://..." node database/patch-dataset-processing-error.js

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('\n== Patching xase_voice_datasets.processing_error column ==')
  const addColumnSQL = `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'xase_voice_datasets' AND column_name = 'processing_error'
      ) THEN
        ALTER TABLE xase_voice_datasets ADD COLUMN processing_error text;
        RAISE NOTICE 'Column processing_error added to xase_voice_datasets';
      ELSE
        RAISE NOTICE 'Column processing_error already exists';
      END IF;
    END $$;
  `
  await prisma.$executeRawUnsafe(addColumnSQL)
  console.log('== Done ==')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(async () => {
  await prisma.$disconnect()
})
