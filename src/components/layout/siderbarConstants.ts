import { Code2, Users, Server, LineChart } from 'lucide-react';
import type { Equipo } from '@/features/requests/types';

export const EQUIPO_COLORS: Record<Equipo, { dot: string; glow: string; border: string }> = {
  desarrollo: { dot: '#378ADD', glow: 'rgba(55,138,221,0.12)',  border: 'rgba(55,138,221,0.30)'  },
  crm:        { dot: '#1D9E75', glow: 'rgba(29,158,117,0.12)',  border: 'rgba(29,158,117,0.30)'  },
  sistemas:   { dot: '#EF9F27', glow: 'rgba(239,159,39,0.12)',  border: 'rgba(239,159,39,0.30)'  },
  analisis:   { dot: '#7F77DD', glow: 'rgba(127,119,221,0.12)', border: 'rgba(127,119,221,0.30)' },
};

export const EQUIPO_ICONS: Record<Equipo, React.ElementType> = {
  desarrollo: Code2,
  crm:        Users,
  sistemas:   Server,
  analisis:   LineChart,
};