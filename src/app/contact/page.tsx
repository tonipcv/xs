export const dynamic = 'force-static'

export default function ContactSalesPage() {
  const calendlyUrl = 'https://app.cal.eu/xaseai/30min';

  return (
    <div className="min-h-screen bg-[#0f1115] text-white">
      <iframe
        title="Book a meeting"
        src={calendlyUrl}
        className="w-full h-screen"
      />
    </div>
  )
}
