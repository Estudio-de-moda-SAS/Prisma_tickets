// src/features/requests/hooks/useDepartments.ts

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { Department } from '@/types/commons';

const MOCK_DEPARTMENTS: Department[] = [
  { Department_ID: 1, Department_Name: 'Tecnología',    Department_Code: 'tecnologia'    },
  { Department_ID: 2, Department_Name: 'Comercial',     Department_Code: 'comercial'     },
  { Department_ID: 3, Department_Name: 'Operaciones',   Department_Code: 'operaciones'   },
  { Department_ID: 4, Department_Name: 'Administración',Department_Code: 'administracion'},
];

export function useDepartments() {
  return useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: config.USE_MOCK
      ? () => Promise.resolve(MOCK_DEPARTMENTS)
      : () => apiClient.call<Department[]>('getDepartments', {}),
    staleTime: Infinity,
  });
}