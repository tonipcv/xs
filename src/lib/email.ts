import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

export async function sendEmail({
  to,
  subject,
  html
}: {
  to: string
  subject: string
  html: string
}) {
  try {
    await transporter.verify()
    
    await transporter.sendMail({
      from: {
        name: process.env.EMAIL_FROM_NAME || 'Xase',
        address: process.env.EMAIL_FROM_ADDRESS || 'no-reply@xase.ai'
      },
      to,
      subject,
      html
    })
    
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email:', error)
    throw error
  }
} 