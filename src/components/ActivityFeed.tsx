import { useTheme } from '../contexts/ThemeContext';
import { FiActivity } from 'react-icons/fi';

const activities = [
  { id: 1, action: 'Seguiu um novo sinal', date: '2023-06-01' },
  { id: 2, action: 'Completou um curso', date: '2023-05-28' },
  { id: 3, action: 'Atualizou o perfil', date: '2023-05-25' },
  { id: 4, action: 'Fez login', date: '2023-05-22' },
];

export default function ActivityFeed() {
  const { theme } = useTheme();

  return (
    <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg p-6`}>
      <h2 className="text-2xl font-semibold mb-4">Atividade Recente</h2>
      <ul className="space-y-4">
        {activities.map((activity) => (
          <li key={activity.id} className="flex items-start">
            <div className={`${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-full p-2 mr-3`}>
              <FiActivity className="text-blue-500" />
            </div>
            <div>
              <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{activity.action}</p>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{activity.date}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
