import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type TooltipItem,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type BarDatum = { label: string; value: number; color: string };

/** Gráfico de barras (Chart.js) con colores por barra y tema claro/oscuro. */
export function BarChart({ id, data, height = 180 }: { id: string; data: BarDatum[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (chartRef.current) chartRef.current.destroy();
    const isDark    = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    const tickColor = isDark ? '#5a6a8a' : '#888';
    chartRef.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderColor: data.map(d => d.color), borderWidth: 1, borderRadius: 5, borderSkipped: false }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.parsed.y} solicitudes` } } },
        scales: {
          x: { ticks: { color: tickColor, font: { size: 11 }, autoSkip: false }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: tickColor, font: { size: 11 } }, grid: { color: gridColor }, border: { display: false }, beginAtZero: true },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [data]);

  return <div style={{ position: 'relative', height }}><canvas ref={canvasRef} id={id} role="img" aria-label="Gráfico de barras" /></div>;
}
