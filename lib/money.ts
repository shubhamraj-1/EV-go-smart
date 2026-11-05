const wholeRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const exactRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format an integer paise amount for display.
 * Money is always stored as integer paise — never as a float.
 */
export function formatInr(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error("formatInr expects an integer number of paise.");
  }

  const rupees = paise / 100;
  return paise % 100 === 0
    ? wholeRupees.format(rupees)
    : exactRupees.format(rupees);
}
