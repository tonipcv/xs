/**
 * Internationalization (i18n) System
 * Support for pt-BR, es-ES, en-US
 */

export type Locale = 'en-US' | 'pt-BR' | 'es-ES';

export interface Translation {
  common: {
    loading: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    create: string;
    update: string;
    search: string;
    filter: string;
    export: string;
    import: string;
    download: string;
    upload: string;
    yes: string;
    no: string;
    confirm: string;
    error: string;
    success: string;
    warning: string;
    info: string;
  };
  auth: {
    login: string;
    logout: string;
    register: string;
    email: string;
    password: string;
    forgotPassword: string;
    resetPassword: string;
    confirmPassword: string;
    loginSuccess: string;
    loginError: string;
    registerSuccess: string;
    registerError: string;
  };
  datasets: {
    title: string;
    create: string;
    list: string;
    details: string;
    publish: string;
    unpublish: string;
    delete: string;
    name: string;
    description: string;
    dataType: string;
    region: string;
    size: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  leases: {
    title: string;
    create: string;
    list: string;
    details: string;
    renew: string;
    expire: string;
    autoRenew: string;
    duration: string;
    expiresAt: string;
    status: string;
    active: string;
    expired: string;
    expiringSoon: string;
  };
  members: {
    title: string;
    invite: string;
    remove: string;
    updateRole: string;
    role: string;
    permissions: string;
    owner: string;
    admin: string;
    member: string;
    viewer: string;
    custom: string;
    inviteSent: string;
    inviteError: string;
  };
  billing: {
    title: string;
    usage: string;
    invoices: string;
    reports: string;
    totalCost: string;
    currentPeriod: string;
    paymentMethod: string;
    billingHistory: string;
  };
  compliance: {
    title: string;
    reports: string;
    frameworks: string;
    gdpr: string;
    hipaa: string;
    fca: string;
    bafin: string;
    lgpd: string;
    aiAct: string;
    compliant: string;
    nonCompliant: string;
    partial: string;
  };
  audit: {
    title: string;
    logs: string;
    export: string;
    trail: string;
    action: string;
    user: string;
    timestamp: string;
    resource: string;
    status: string;
  };
}

export const translations: Record<Locale, Translation> = {
  'en-US': {
    common: {
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      update: 'Update',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      import: 'Import',
      download: 'Download',
      upload: 'Upload',
      yes: 'Yes',
      no: 'No',
      confirm: 'Confirm',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      info: 'Information',
    },
    auth: {
      login: 'Login',
      logout: 'Logout',
      register: 'Register',
      email: 'Email',
      password: 'Password',
      forgotPassword: 'Forgot Password?',
      resetPassword: 'Reset Password',
      confirmPassword: 'Confirm Password',
      loginSuccess: 'Login successful',
      loginError: 'Login failed',
      registerSuccess: 'Registration successful',
      registerError: 'Registration failed',
    },
    datasets: {
      title: 'Datasets',
      create: 'Create Dataset',
      list: 'Dataset List',
      details: 'Dataset Details',
      publish: 'Publish',
      unpublish: 'Unpublish',
      delete: 'Delete Dataset',
      name: 'Name',
      description: 'Description',
      dataType: 'Data Type',
      region: 'Region',
      size: 'Size',
      status: 'Status',
      createdAt: 'Created At',
      updatedAt: 'Updated At',
    },
    leases: {
      title: 'Leases',
      create: 'Create Lease',
      list: 'Lease List',
      details: 'Lease Details',
      renew: 'Renew',
      expire: 'Expire',
      autoRenew: 'Auto-Renew',
      duration: 'Duration',
      expiresAt: 'Expires At',
      status: 'Status',
      active: 'Active',
      expired: 'Expired',
      expiringSoon: 'Expiring Soon',
    },
    members: {
      title: 'Team Members',
      invite: 'Invite Member',
      remove: 'Remove Member',
      updateRole: 'Update Role',
      role: 'Role',
      permissions: 'Permissions',
      owner: 'Owner',
      admin: 'Admin',
      member: 'Member',
      viewer: 'Viewer',
      custom: 'Custom',
      inviteSent: 'Invitation sent successfully',
      inviteError: 'Failed to send invitation',
    },
    billing: {
      title: 'Billing',
      usage: 'Usage',
      invoices: 'Invoices',
      reports: 'Reports',
      totalCost: 'Total Cost',
      currentPeriod: 'Current Period',
      paymentMethod: 'Payment Method',
      billingHistory: 'Billing History',
    },
    compliance: {
      title: 'Compliance',
      reports: 'Compliance Reports',
      frameworks: 'Frameworks',
      gdpr: 'GDPR',
      hipaa: 'HIPAA',
      fca: 'FCA',
      bafin: 'BaFin',
      lgpd: 'LGPD',
      aiAct: 'AI Act',
      compliant: 'Compliant',
      nonCompliant: 'Non-Compliant',
      partial: 'Partially Compliant',
    },
    audit: {
      title: 'Audit',
      logs: 'Audit Logs',
      export: 'Export Audit Trail',
      trail: 'Audit Trail',
      action: 'Action',
      user: 'User',
      timestamp: 'Timestamp',
      resource: 'Resource',
      status: 'Status',
    },
  },
  'pt-BR': {
    common: {
      loading: 'Carregando...',
      save: 'Salvar',
      cancel: 'Cancelar',
      delete: 'Excluir',
      edit: 'Editar',
      create: 'Criar',
      update: 'Atualizar',
      search: 'Buscar',
      filter: 'Filtrar',
      export: 'Exportar',
      import: 'Importar',
      download: 'Baixar',
      upload: 'Enviar',
      yes: 'Sim',
      no: 'Não',
      confirm: 'Confirmar',
      error: 'Erro',
      success: 'Sucesso',
      warning: 'Aviso',
      info: 'Informação',
    },
    auth: {
      login: 'Entrar',
      logout: 'Sair',
      register: 'Registrar',
      email: 'E-mail',
      password: 'Senha',
      forgotPassword: 'Esqueceu a senha?',
      resetPassword: 'Redefinir Senha',
      confirmPassword: 'Confirmar Senha',
      loginSuccess: 'Login realizado com sucesso',
      loginError: 'Falha no login',
      registerSuccess: 'Registro realizado com sucesso',
      registerError: 'Falha no registro',
    },
    datasets: {
      title: 'Conjuntos de Dados',
      create: 'Criar Conjunto de Dados',
      list: 'Lista de Conjuntos',
      details: 'Detalhes do Conjunto',
      publish: 'Publicar',
      unpublish: 'Despublicar',
      delete: 'Excluir Conjunto',
      name: 'Nome',
      description: 'Descrição',
      dataType: 'Tipo de Dados',
      region: 'Região',
      size: 'Tamanho',
      status: 'Status',
      createdAt: 'Criado em',
      updatedAt: 'Atualizado em',
    },
    leases: {
      title: 'Licenças',
      create: 'Criar Licença',
      list: 'Lista de Licenças',
      details: 'Detalhes da Licença',
      renew: 'Renovar',
      expire: 'Expirar',
      autoRenew: 'Renovação Automática',
      duration: 'Duração',
      expiresAt: 'Expira em',
      status: 'Status',
      active: 'Ativa',
      expired: 'Expirada',
      expiringSoon: 'Expirando em Breve',
    },
    members: {
      title: 'Membros da Equipe',
      invite: 'Convidar Membro',
      remove: 'Remover Membro',
      updateRole: 'Atualizar Função',
      role: 'Função',
      permissions: 'Permissões',
      owner: 'Proprietário',
      admin: 'Administrador',
      member: 'Membro',
      viewer: 'Visualizador',
      custom: 'Personalizado',
      inviteSent: 'Convite enviado com sucesso',
      inviteError: 'Falha ao enviar convite',
    },
    billing: {
      title: 'Faturamento',
      usage: 'Uso',
      invoices: 'Faturas',
      reports: 'Relatórios',
      totalCost: 'Custo Total',
      currentPeriod: 'Período Atual',
      paymentMethod: 'Método de Pagamento',
      billingHistory: 'Histórico de Faturamento',
    },
    compliance: {
      title: 'Conformidade',
      reports: 'Relatórios de Conformidade',
      frameworks: 'Frameworks',
      gdpr: 'GDPR',
      hipaa: 'HIPAA',
      fca: 'FCA',
      bafin: 'BaFin',
      lgpd: 'LGPD',
      aiAct: 'Lei de IA',
      compliant: 'Conforme',
      nonCompliant: 'Não Conforme',
      partial: 'Parcialmente Conforme',
    },
    audit: {
      title: 'Auditoria',
      logs: 'Logs de Auditoria',
      export: 'Exportar Trilha de Auditoria',
      trail: 'Trilha de Auditoria',
      action: 'Ação',
      user: 'Usuário',
      timestamp: 'Data/Hora',
      resource: 'Recurso',
      status: 'Status',
    },
  },
  'es-ES': {
    common: {
      loading: 'Cargando...',
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      create: 'Crear',
      update: 'Actualizar',
      search: 'Buscar',
      filter: 'Filtrar',
      export: 'Exportar',
      import: 'Importar',
      download: 'Descargar',
      upload: 'Subir',
      yes: 'Sí',
      no: 'No',
      confirm: 'Confirmar',
      error: 'Error',
      success: 'Éxito',
      warning: 'Advertencia',
      info: 'Información',
    },
    auth: {
      login: 'Iniciar Sesión',
      logout: 'Cerrar Sesión',
      register: 'Registrarse',
      email: 'Correo Electrónico',
      password: 'Contraseña',
      forgotPassword: '¿Olvidó su contraseña?',
      resetPassword: 'Restablecer Contraseña',
      confirmPassword: 'Confirmar Contraseña',
      loginSuccess: 'Inicio de sesión exitoso',
      loginError: 'Error al iniciar sesión',
      registerSuccess: 'Registro exitoso',
      registerError: 'Error al registrarse',
    },
    datasets: {
      title: 'Conjuntos de Datos',
      create: 'Crear Conjunto de Datos',
      list: 'Lista de Conjuntos',
      details: 'Detalles del Conjunto',
      publish: 'Publicar',
      unpublish: 'Despublicar',
      delete: 'Eliminar Conjunto',
      name: 'Nombre',
      description: 'Descripción',
      dataType: 'Tipo de Datos',
      region: 'Región',
      size: 'Tamaño',
      status: 'Estado',
      createdAt: 'Creado el',
      updatedAt: 'Actualizado el',
    },
    leases: {
      title: 'Licencias',
      create: 'Crear Licencia',
      list: 'Lista de Licencias',
      details: 'Detalles de la Licencia',
      renew: 'Renovar',
      expire: 'Expirar',
      autoRenew: 'Renovación Automática',
      duration: 'Duración',
      expiresAt: 'Expira el',
      status: 'Estado',
      active: 'Activa',
      expired: 'Expirada',
      expiringSoon: 'Expirando Pronto',
    },
    members: {
      title: 'Miembros del Equipo',
      invite: 'Invitar Miembro',
      remove: 'Eliminar Miembro',
      updateRole: 'Actualizar Rol',
      role: 'Rol',
      permissions: 'Permisos',
      owner: 'Propietario',
      admin: 'Administrador',
      member: 'Miembro',
      viewer: 'Visualizador',
      custom: 'Personalizado',
      inviteSent: 'Invitación enviada con éxito',
      inviteError: 'Error al enviar invitación',
    },
    billing: {
      title: 'Facturación',
      usage: 'Uso',
      invoices: 'Facturas',
      reports: 'Informes',
      totalCost: 'Costo Total',
      currentPeriod: 'Período Actual',
      paymentMethod: 'Método de Pago',
      billingHistory: 'Historial de Facturación',
    },
    compliance: {
      title: 'Cumplimiento',
      reports: 'Informes de Cumplimiento',
      frameworks: 'Marcos',
      gdpr: 'GDPR',
      hipaa: 'HIPAA',
      fca: 'FCA',
      bafin: 'BaFin',
      lgpd: 'LGPD',
      aiAct: 'Ley de IA',
      compliant: 'Conforme',
      nonCompliant: 'No Conforme',
      partial: 'Parcialmente Conforme',
    },
    audit: {
      title: 'Auditoría',
      logs: 'Registros de Auditoría',
      export: 'Exportar Pista de Auditoría',
      trail: 'Pista de Auditoría',
      action: 'Acción',
      user: 'Usuario',
      timestamp: 'Fecha/Hora',
      resource: 'Recurso',
      status: 'Estado',
    },
  },
};

/**
 * Get translation for a specific locale
 */
export function getTranslation(locale: Locale): Translation {
  return translations[locale] || translations['en-US'];
}

/**
 * Get nested translation value
 */
export function t(locale: Locale, key: string): string {
  const translation = getTranslation(locale);
  const keys = key.split('.');
  
  let value: any = translation;
  for (const k of keys) {
    value = value?.[k];
  }
  
  return value || key;
}

/**
 * Detect user locale from browser or headers
 */
export function detectLocale(acceptLanguage?: string): Locale {
  if (!acceptLanguage) {
    return 'en-US';
  }

  const languages = acceptLanguage.split(',').map(lang => {
    const [locale, q = '1'] = lang.trim().split(';q=');
    return { locale: locale.trim(), quality: parseFloat(q) };
  }).sort((a, b) => b.quality - a.quality);

  for (const { locale } of languages) {
    if (locale.startsWith('pt')) return 'pt-BR';
    if (locale.startsWith('es')) return 'es-ES';
    if (locale.startsWith('en')) return 'en-US';
  }

  return 'en-US';
}
