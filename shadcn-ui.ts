import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const componentsToAdd = [
  'button',
  'card',
  'avatar',
  'badge',
  'input'
]

componentsToAdd.forEach(component => {
  try {
    execSync(`npx shadcn-ui@latest add ${component}`, { stdio: 'inherit' })
  } catch (error) {
    console.error(`Failed to add component: ${component}`, error)
  }
})

// Ensure the components directory exists
const componentsDir = path.join(process.cwd(), 'components', 'ui')
if (!fs.existsSync(componentsDir)) {
  fs.mkdirSync(componentsDir, { recursive: true })
}

console.log('Shadcn UI components added successfully!')
