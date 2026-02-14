import Image from 'next/image';
import { useTheme } from '../contexts/ThemeContext';

interface ProfileHeaderProps {
  name: string;
  email: string;
}

export default function ProfileHeader({ name, email }: ProfileHeaderProps) {
  const { theme } = useTheme();

  return (
    <header className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
      <div className="container mx-auto px-4 py-6 flex items-center">
        <Image
          src="/avatar-placeholder.png"
          alt="Profile"
          width={80}
          height={80}
          className="rounded-full mr-4"
        />
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{email}</p>
        </div>
      </div>
    </header>
  );
}
