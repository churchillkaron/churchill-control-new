export function getBranding() {
  if (typeof window === "undefined") return defaultBrand;

  const stored = localStorage.getItem("brand");

  if (!stored) return defaultBrand;

  return JSON.parse(stored);
}

export function setBranding(brand) {
  localStorage.setItem("brand", JSON.stringify(brand));
}

const defaultBrand = {
  name: "Churchill",
  logo: "CC",
  primary: "#f97316", // orange
};