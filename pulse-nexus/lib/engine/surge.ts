export type SurgeInput = { arrivals: number[]; now: number; windowMinutes?: number; threshold?: number };

export function detectSurge({ arrivals, now, windowMinutes = 10, threshold = 12 }: SurgeInput) {
  const since = now - windowMinutes;
  const count = arrivals.filter((time) => time >= since && time <= now).length;
  return { active: count >= threshold, count, windowMinutes, rate: count / windowMinutes };
}
