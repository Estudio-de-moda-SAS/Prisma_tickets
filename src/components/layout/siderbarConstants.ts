import { Code2, Users, Server, LineChart } from 'lucide-react';
import type { Equipo } from '@/features/requests/types';

export const EQUIPO_COLORSSIDEBARLABELS: Record<Equipo, { dot: string; glow: string; border: string }> = {
  desarrollo: { dot: '#ffffff', glow: 'rgba(55,138,221,0.28)',  border: 'rgba(90,175,245,0.65)'  },
  crm:        { dot: '#ffffff', glow: 'rgba(29,158,117,0.28)',  border: 'rgba(37,201,146,0.65)'  },
  sistemas:   { dot: '#ffffff', glow: 'rgba(239,159,39,0.28)',  border: 'rgba(245,181,68,0.65)'  },
  analisis:   { dot: '#ffffff', glow: 'rgba(127,119,221,0.28)', border: 'rgba(155,148,240,0.65)' },
};
export const EQUIPO_COLORS: Record<Equipo, { dot: string; glow: string; border: string }> = {
  desarrollo: { dot: '#5AAFF5', glow: 'rgba(55,138,221,0.28)',  border: 'rgba(90,175,245,0.65)'  },
  crm:        { dot: '#25C992', glow: 'rgba(29,158,117,0.28)',  border: 'rgba(37,201,146,0.65)'  },
  sistemas:   { dot: '#F5B544', glow: 'rgba(239,159,39,0.28)',  border: 'rgba(245,181,68,0.65)'  },
  analisis:   { dot: '#9B94F0', glow: 'rgba(127,119,221,0.28)', border: 'rgba(155,148,240,0.65)' },
  
};

export const EQUIPO_ICONS: Record<Equipo, React.ElementType> = {
  desarrollo: Code2,
  crm:        Users,
  sistemas:   Server,
  analisis:   LineChart,
};