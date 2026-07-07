export function getFormType(category: string[] | undefined | null): string {
  if (category?.includes("平模")) return "DieForm";
  if (category?.includes("智能调节器")) return "SmartRegulator";
  if (category?.at(1) == "熔体计量泵") return "MeteringPumpForm";
  if (category?.at(1) == "共挤复合分配器") return "FeedblockForm";
  if (category?.includes("合流器")) return "ManifoldForm";
  if (category?.at(1) == "过滤器") return "FilterForm";
  if (category?.at(1) == "测厚仪") return "ThicknessGaugeForm";
  if (category?.includes("液压站")) return "HydraulicStationForm";
  if (category?.includes("涂布模头")) return "CoatingDieForm";
  if (category?.[1]?.includes("赠品")) return "PartsForm";
  return "OtherForm";
}
