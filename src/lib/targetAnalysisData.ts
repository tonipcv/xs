interface TargetData {
  alvo: string;
  operacoes: number;
  vitoria: number;
  lucro: number;
}

export const getTargetAnalysisData = (month: number): TargetData[] => {
  switch (month) {
    case 8:
      return [
        { alvo: "Alvo 2", operacoes: 45, vitoria: 81, lucro: -10 },
        { alvo: "Alvo 3", operacoes: 36, vitoria: 65, lucro: 8 },
        { alvo: "Alvo 4", operacoes: 22, vitoria: 40, lucro: -12 },
        { alvo: "Alvo 5", operacoes: 16, vitoria: 29, lucro: -20 },
        { alvo: "Alvo 6", operacoes: 10, vitoria: 18, lucro: -40 },
        { alvo: "Alvo 7", operacoes: 4, vitoria: 7, lucro: -72 },
        { alvo: "Alvo 8", operacoes: 4, vitoria: 7, lucro: -68 },
        { alvo: "Alvo 9", operacoes: 1, vitoria: 1, lucro: -91 },
        { alvo: "Alvo 10", operacoes: 1, vitoria: 1, lucro: -90 },
        { alvo: "Alvo 11", operacoes: 1, vitoria: 1, lucro: -89 }
      ];
    case 9:
      return [
        { alvo: "Alvo 2", operacoes: 68, vitoria: 75, lucro: 26 },
        { alvo: "Alvo 3", operacoes: 63, vitoria: 70, lucro: 79 },
        { alvo: "Alvo 4", operacoes: 56, vitoria: 62, lucro: 114 },
        { alvo: "Alvo 5", operacoes: 43, vitoria: 47, lucro: 105 },
        { alvo: "Alvo 6", operacoes: 39, vitoria: 43, lucro: 124 },
        { alvo: "Alvo 7", operacoes: 36, vitoria: 40, lucro: 142 },
        { alvo: "Alvo 8", operacoes: 31, vitoria: 34, lucro: 138 },
        { alvo: "Alvo 9", operacoes: 25, vitoria: 27, lucro: 115 },
        { alvo: "Alvo 10", operacoes: 23, vitoria: 25, lucro: 120 },
        { alvo: "Alvo 11", operacoes: 21, vitoria: 23, lucro: 121 }
      ];
    case 10:
    case 11:
      return [
        { alvo: "Alvo 2", operacoes: 95, vitoria: 87, lucro: 60 },
        { alvo: "Alvo 3", operacoes: 84, vitoria: 77, lucro: 122 },
        { alvo: "Alvo 4", operacoes: 69, vitoria: 63, lucro: 146 },
        { alvo: "Alvo 5", operacoes: 56, vitoria: 51, lucro: 150 },
        { alvo: "Alvo 6", operacoes: 47, vitoria: 43, lucro: 152 },
        { alvo: "Alvo 7", operacoes: 43, vitoria: 39, lucro: 171 },
        { alvo: "Alvo 8", operacoes: 38, vitoria: 35, lucro: 174 },
        { alvo: "Alvo 9", operacoes: 32, vitoria: 29, lucro: 158 },
        { alvo: "Alvo 10", operacoes: 29, vitoria: 26, lucro: 160 },
        { alvo: "Alvo 11", operacoes: 24, vitoria: 22, lucro: 134 }
      ];
    case 12:
    case 1:
      return [
        { alvo: "Alvo 2", operacoes: 134, vitoria: 88, lucro: 98 },
        { alvo: "Alvo 3", operacoes: 105, vitoria: 69, lucro: 145 },
        { alvo: "Alvo 4", operacoes: 89, vitoria: 58, lucro: 186 },
        { alvo: "Alvo 5", operacoes: 89, vitoria: 58, lucro: 275 },
        { alvo: "Alvo 6", operacoes: 77, vitoria: 50, lucro: 292 },
        { alvo: "Alvo 7", operacoes: 63, vitoria: 41, lucro: 271 },
        { alvo: "Alvo 8", operacoes: 55, vitoria: 36, lucro: 270 },
        { alvo: "Alvo 9", operacoes: 49, vitoria: 32, lucro: 271 },
        { alvo: "Alvo 10", operacoes: 42, vitoria: 27, lucro: 250 },
        { alvo: "Alvo 11", operacoes: 32, vitoria: 21, lucro: 182 }
      ];
    default:
      return [];
  }
};

export const months = [
  { number: 8, name: 'Agosto' },
  { number: 9, name: 'Setembro' },
  { number: 10, name: 'Outubro' },
  { number: 11, name: 'Novembro' },
  { number: 12, name: 'Dezembro' },
  { number: 1, name: 'Janeiro' }
];

export const getMonthName = (month: number): string => {
  const monthData = months.find(m => m.number === month);
  return monthData ? monthData.name : '';
}; 