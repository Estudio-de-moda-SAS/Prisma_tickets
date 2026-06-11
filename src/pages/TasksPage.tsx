// src/pages/TasksPage.tsx
import { useParams } from 'react-router-dom';
import { TasksTable } from '@/features/requests/components/TasksTable';


export function TasksPage() {
  
  const { equipo = '' } = useParams<{ equipo: string }>();
  return <TasksTable teamCode={equipo} />;
  
}