export const PINK = "#ef5a8a";
export const PURPLE = "#8b5cf6";
export const ORANGE = "#c25d35";
export const percent = (value: number) =>
  `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
export const formatIdr = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
