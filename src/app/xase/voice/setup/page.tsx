import { AppLayout } from '@/components/AppSidebar'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Playfair_Display } from 'next/font/google'
import { Shield, Mic, BarChart3 } from 'lucide-react'
import SetupClient from './setupClient'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function VoiceSetupPage() {
  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <div className="flex flex-col gap-2">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
                Voice Setup
              </h1>
              <p className="text-sm text-gray-600">
                Complete sua configuração inicial para acessar o sistema de Voice Data
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-800 leading-relaxed">
              Sua conta está autenticada, mas ainda não está vinculada a um tenant (empresa). Escolha como deseja continuar.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center">
                  <Mic className="h-4 w-4 text-gray-700" />
                </div>
                <h3 className="text-gray-900 font-medium">Sou Supplier (Data Holder)</h3>
              </div>
              <p className="text-xs text-gray-600">
                Crie e gerencie datasets, emita políticas de acesso e acompanhe seus créditos.
              </p>
              <SetupClient defaultType="SUPPLIER" />
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-gray-700" />
                </div>
                <h3 className="text-gray-900 font-medium">Sou Client (Empresa de IA)</h3>
              </div>
              <p className="text-xs text-gray-600">
                Consulte políticas concedidas, uso e custos, e acesse datasets de voz.
              </p>
              <SetupClient defaultType="CLIENT" />
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Dica: para vincular usuários a tenants automaticamente em desenvolvimento, use os scripts em <span className="font-mono">scripts/</span>.
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
