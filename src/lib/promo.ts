export const PROMO_CODE = "mateen";
export const PROMO_KEY = "promo_code_active";

export function isPromoActive(): boolean {
  try {
    return localStorage.getItem(PROMO_KEY) === PROMO_CODE;
  } catch {
    return false;
  }
}

export function activatePromo(code: string): boolean {
  if (code.trim().toLowerCase() === PROMO_CODE) {
    localStorage.setItem(PROMO_KEY, PROMO_CODE);
    window.dispatchEvent(new Event("promo-changed"));
    return true;
  }
  return false;
}

export function deactivatePromo() {
  localStorage.removeItem(PROMO_KEY);
  window.dispatchEvent(new Event("promo-changed"));
}
