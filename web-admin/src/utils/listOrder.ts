export type ListOrder = "LATEST" | "OLDEST";

export function chronological<T>(items: T[], dateOf: (item: T) => string | undefined | null, order: ListOrder) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(dateOf(left) || "") || 0;
    const rightTime = Date.parse(dateOf(right) || "") || 0;
    return order === "LATEST" ? rightTime - leftTime : leftTime - rightTime;
  });
}
