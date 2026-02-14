import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function PricingSection() {
  return (
    <section className="w-full">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Plano Anual */}
        <Card className="bg-black border border-zinc-800/50 rounded-2xl hover:border-zinc-700 transition-all duration-300">
          <CardHeader className="pb-6">
            <CardTitle className="text-lg font-bold text-white">Plano Anual</CardTitle>
            <div className="flex items-baseline gap-2 mt-3">
              <span className="text-3xl font-bold text-white">R$ 3.000</span>
              <div className="text-zinc-400 text-xs">
                <span>ou</span>
                <div>12x de R$ 297</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-green-500" strokeWidth={3} />
                Acesso a todas as funcionalidades
              </li>
              <li className="flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-green-500" strokeWidth={3} />
                Suporte prioritário
              </li>
              <li className="flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-green-500" strokeWidth={3} />
                Atualizações exclusivas
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <a 
              href="https://checkout.k17.com.br/subscribe/anual-ft-promocional" 
              target="_blank"
              className="w-full"
            >
              <Button className="w-full bg-white text-black hover:bg-gray-100 font-semibold text-sm py-5">
                Assinar Agora
              </Button>
            </a>
          </CardFooter>
        </Card>

        {/* Plano VIP */}
        <Card className="bg-gradient-to-br from-zinc-900 to-black border-2 border-green-500/20 rounded-2xl relative overflow-hidden hover:border-green-500/40 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent"></div>
          <Badge className="absolute top-4 right-4 bg-green-500 text-black hover:bg-green-600 font-bold text-[10px]">
            Somente 19/03
          </Badge>
          <CardHeader className="pb-6 relative">
            <CardTitle className="text-lg font-bold text-white">Plano VIP + FIP</CardTitle>
            <div className="mt-3">
              <div className="text-4xl font-bold bg-gradient-to-r from-green-400 to-green-500 bg-clip-text text-transparent">
                12x R$ 97
              </div>
              <div className="text-zinc-400 text-xs mt-1">
                ou R$ 997 à vista
              </div>
            </div>
            <div className="text-green-500 text-xs font-medium mt-2">
              Novas 93 vagas somente no dia 18/03 pela última vez, pelo alto custo de desenvolvimento é impossível fazer novamente!
            </div>
          </CardHeader>
          <CardContent className="relative">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-green-500" strokeWidth={3} />
                Tudo do Plano Anual
              </li>
              <li className="flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-green-500" strokeWidth={3} />
                Formação Investidor Profissional
              </li>
              <li className="flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-green-500" strokeWidth={3} />
                Black Book Incluso
              </li>
              <li className="flex items-center gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-green-500" strokeWidth={3} />
                Acesso Vitalício
              </li>
            </ul>
          </CardContent>
          <CardFooter className="relative">
            <a 
              href="https://t.me/+mZs1t5_biYFmMTBh" 
              target="_blank"
              className="w-full"
            >
              <Button className="w-full bg-gradient-to-r from-green-400 to-green-500 text-black hover:from-green-500 hover:to-green-600 font-semibold text-sm py-5">
                Entrar no Grupo
              </Button>
            </a>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
} 