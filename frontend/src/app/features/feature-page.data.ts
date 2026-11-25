export interface FeaturePageData {
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  introTitle: string;
  introText: string;
  nextSteps: readonly string[];
  tableTitle: string;
  recordLabel: string;
  columns: readonly [string, string, string];
}
