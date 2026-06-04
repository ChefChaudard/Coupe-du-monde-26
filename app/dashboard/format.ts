const oneDecimalFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatOneDecimal(value: number) {
  return oneDecimalFormatter.format(value);
}