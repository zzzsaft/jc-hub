import type { AnalysisPlanTimeRange } from "../planner/index.js";

const firstHalf = /今年上半年/u;
const relativeMonths = /(?:最近|近)\s*(\d{1,2})\s*个?月/u;
const relativeQuarter = /(?:最近|近)\s*(?:一个|一)季度/u;
const relativeMonth = /(?:最近|近)\s*(?:一个|一)月/u;
const relativeHalfYear = /(?:最近|近)\s*半年/u;
const relativeDays = /(?:最近|近)\s*(\d{1,4})\s*天/u;
const previousMonth = /上个?月|上月/u;
const currentMonth = /本月|这个月|当月/u;
const calendarMonth = /(?:^|\D)(1[0-2]|0?[1-9])\s*月份?/u;
const yearOverYear = /同比|今年.*去年|去年.*今年|(?:与|和|较)?去年(?:同期)?(?:比较|对比)|(?:比较|对比).*去年/u;
const currentYear = /今年/u;

export function parseExplicitAnalysisTimeRange(
  question: string,
): { timeRange: AnalysisPlanTimeRange; sourceText: string } | undefined {
  const firstHalfMatch = firstHalf.exec(question);
  if (firstHalfMatch) return match({ kind: "current_year_first_half" }, firstHalfMatch[0]);
  const relativeMonthsMatch = relativeMonths.exec(question);
  if (relativeMonthsMatch) return match({ kind: "relative", days: Number(relativeMonthsMatch[1]) * 30 }, relativeMonthsMatch[0]);
  const relativeQuarterMatch = relativeQuarter.exec(question);
  if (relativeQuarterMatch) return match({ kind: "relative", days: 90 }, relativeQuarterMatch[0]);
  const relativeMonthMatch = relativeMonth.exec(question);
  if (relativeMonthMatch) return match({ kind: "relative", days: 30 }, relativeMonthMatch[0]);
  const relativeHalfYearMatch = relativeHalfYear.exec(question);
  if (relativeHalfYearMatch) return match({ kind: "relative", days: 180 }, relativeHalfYearMatch[0]);
  const relativeDaysMatch = relativeDays.exec(question);
  if (relativeDaysMatch) return match({ kind: "relative", days: Number(relativeDaysMatch[1]) }, relativeDaysMatch[0]);
  const previousMonthMatch = previousMonth.exec(question);
  if (previousMonthMatch) return match({ kind: "previous_month" }, previousMonthMatch[0]);
  const currentMonthMatch = currentMonth.exec(question);
  if (currentMonthMatch) return match({ kind: "current_month" }, currentMonthMatch[0]);
  const calendarMonthMatch = calendarMonth.exec(question);
  if (calendarMonthMatch) return match({ kind: "month", month: Number(calendarMonthMatch[1]) }, calendarMonthMatch[0].replace(/^\D(?=\d)/u, "").trim());
  const yearOverYearMatch = yearOverYear.exec(question);
  if (yearOverYearMatch) return match({ kind: "year_over_year" }, yearOverYearMatch[0]);
  const currentYearMatch = currentYear.exec(question);
  return currentYearMatch ? match({ kind: "current_year" }, currentYearMatch[0]) : undefined;
}

function match(timeRange: AnalysisPlanTimeRange, sourceText: string) {
  return { timeRange, sourceText };
}
