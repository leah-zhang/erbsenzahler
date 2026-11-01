// Read the same tokens used by the rest of the interface for canvas charts.
export function getChartTheme() {
  const styles = typeof window === 'undefined' ? null : getComputedStyle(document.documentElement);
  const value = (name, fallback) => styles?.getPropertyValue(name).trim() || fallback;
  return {
    text: value('--text-primary', '#3d3553'),
    muted: value('--text-secondary', '#71677f'),
    border: value('--panel-border', '#e3deef'),
    surface: value('--panel-background', '#fffeff'),
    hover: value('--chart-hover', '#9474bd'),
    font: value('--font-body', 'Trebuchet MS, sans-serif'),
    palette: [
      ['--chart-lavender', '#aa92cf'], ['--chart-blue', '#86b4d3'],
      ['--chart-mint', '#88bda7'], ['--chart-rose', '#cb98b6'],
      ['--chart-sand', '#cdb276'], ['--chart-periwinkle', '#8fa3ce'],
      ['--chart-stone', '#bca18f'],
    ].map(([name, fallback]) => value(name, fallback)),
  };
}
