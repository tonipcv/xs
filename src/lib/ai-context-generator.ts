import { AgentGoal } from '@prisma/client';

interface ContextFields {
  companyName?: string | null;
  product?: string | null;
  mainPain?: string | null;
  successCase?: string | null;
  priceObjection?: string | null;
  goal: AgentGoal;
}

/**
 * 🧱 Gerador de Contexto Principal
 * Transforma campos guiados em um contexto estruturado para o agente
 */
export class AIContextGenerator {
  
  /**
   * Gera o contexto principal baseado nos campos preenchidos
   */
  static generateMainContext(fields: ContextFields): string {
    const sections: string[] = [];

    // 🏢 Informações da empresa
    if (fields.companyName || fields.product) {
      sections.push(this.generateCompanySection(fields));
    }

    // 🎯 Objetivo e estratégia
    sections.push(this.generateGoalSection(fields.goal));

    // 💡 Problema e solução
    if (fields.mainPain || fields.product) {
      sections.push(this.generateProblemSolutionSection(fields));
    }

    // 📈 Prova social
    if (fields.successCase) {
      sections.push(this.generateSocialProofSection(fields.successCase));
    }

    // 💰 Tratamento de objeções
    if (fields.priceObjection) {
      sections.push(this.generateObjectionSection(fields.priceObjection));
    }

    // 📋 Instruções comportamentais
    sections.push(this.generateBehaviorSection(fields.goal));

    return sections.join('\n\n');
  }

  private static generateCompanySection(fields: ContextFields): string {
    const parts: string[] = [];
    
    if (fields.companyName) {
      parts.push(`Você representa a ${fields.companyName}`);
    }
    
    if (fields.product) {
      parts.push(`oferecemos ${fields.product}`);
    }

    return `🏢 EMPRESA:\n${parts.join(', ')}.`;
  }

  private static generateGoalSection(goal: AgentGoal): string {
    const goalDescriptions = {
      SALES: 'converter leads em vendas, apresentando benefícios e fechando negócios',
      SUPPORT: 'resolver dúvidas e problemas dos clientes com excelência',
      LEAD_GENERATION: 'capturar interesse e qualificar potenciais clientes',
      QUALIFICATION: 'identificar necessidades e fit do cliente com nossa solução',
      RETENTION: 'manter clientes satisfeitos e reduzir churn',
      EDUCATION: 'educar sobre nossos produtos e melhores práticas'
    };

    return `🎯 OBJETIVO:\nSeu foco principal é ${goalDescriptions[goal]}.`;
  }

  private static generateProblemSolutionSection(fields: ContextFields): string {
    const parts: string[] = [];
    
    if (fields.mainPain) {
      parts.push(`O principal problema que resolvemos: ${fields.mainPain}`);
    }
    
    if (fields.product) {
      parts.push(`Nossa solução: ${fields.product}`);
    }

    return `💡 PROBLEMA & SOLUÇÃO:\n${parts.join('\n')}`;
  }

  private static generateSocialProofSection(successCase: string): string {
    return `📈 PROVA SOCIAL:\nCase de sucesso para compartilhar: ${successCase}`;
  }

  private static generateObjectionSection(priceObjection: string): string {
    return `💰 OBJEÇÃO DE PREÇO:\nQuando disserem "tá caro": ${priceObjection}`;
  }

  private static generateBehaviorSection(goal: AgentGoal): string {
    const behaviors = {
      SALES: [
        'Seja consultivo, não apenas vendedor',
        'Faça perguntas para entender necessidades',
        'Apresente benefícios, não apenas features',
        'Crie urgência quando apropriado'
      ],
      SUPPORT: [
        'Seja empático e paciente',
        'Resolva problemas de forma prática',
        'Escale para humano quando necessário',
        'Sempre confirme se o problema foi resolvido'
      ],
      LEAD_GENERATION: [
        'Desperte curiosidade',
        'Ofereça valor antes de pedir algo',
        'Capture informações gradualmente',
        'Mantenha o interesse vivo'
      ],
      QUALIFICATION: [
        'Faça perguntas estratégicas',
        'Identifique dor, orçamento e decisor',
        'Classifique o lead adequadamente',
        'Direcione para próximo passo'
      ],
      RETENTION: [
        'Monitore satisfação constantemente',
        'Antecipe necessidades',
        'Ofereça valor contínuo',
        'Identifique oportunidades de upsell'
      ],
      EDUCATION: [
        'Explique de forma didática',
        'Use exemplos práticos',
        'Confirme entendimento',
        'Incentive aplicação do conhecimento'
      ]
    };

    const behaviorList = behaviors[goal].map(b => `• ${b}`).join('\n');
    
    return `📋 COMPORTAMENTO:\n${behaviorList}`;
  }

  /**
   * Valida se os campos obrigatórios estão preenchidos
   */
  static validateRequiredFields(fields: ContextFields): { isValid: boolean; missingFields: string[] } {
    const required = ['companyName', 'product', 'mainPain'];
    const missing = required.filter(field => !fields[field as keyof ContextFields]);
    
    return {
      isValid: missing.length === 0,
      missingFields: missing
    };
  }

  /**
   * Gera um contexto mínimo para agentes sem configuração completa
   */
  static generateMinimalContext(goal: AgentGoal): string {
    return [
      this.generateGoalSection(goal),
      this.generateBehaviorSection(goal),
      '⚠️ CONFIGURAÇÃO INCOMPLETA:\nPara melhor performance, complete as informações da empresa no painel.'
    ].join('\n\n');
  }
} 