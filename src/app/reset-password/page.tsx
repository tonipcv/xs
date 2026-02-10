'use client';

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import XLogo from '@/components/XLogo';
import AuthLayout from '@/components/AuthLayout';

// Modifique a função validatePassword para retornar um objeto com todos os status
const validatePassword = (password: string) => {
  return {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*]/.test(password)
  };
};

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [validations, setValidations] = useState({
    minLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false,
    hasSpecialChar: false
  });
  const router = useRouter();

  // Adicione esta função para atualizar as validações quando a senha mudar
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    setValidations(validatePassword(newPassword));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setError('');

    // Validar se as senhas são iguais
    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      setIsSubmitting(false);
      return;
    }

    // Verificar se todos os requisitos foram atendidos
    const currentValidations = validatePassword(password);
    if (!Object.values(currentValidations).every(Boolean)) {
      setError('A senha não atende a todos os requisitos');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setMessage('Senha atualizada com sucesso!');
      
      // Redirecionar para a página de login após 2 segundos
      setTimeout(() => {
        router.push('/login');
      }, 2000);

    } catch (error) {
      console.error('Erro ao atualizar senha:', error);
      setError('Ocorreu um erro ao atualizar a senha. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-sm space-y-8">
        <h2 className="text-center text-2xl font-extrabold text-gray-900">
          Redefinir senha
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
          <div>
            <label htmlFor="password" className="block mb-2 text-sm font-medium text-gray-700">
              Nova Senha
            </label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              placeholder="Digite sua nova senha" 
              required 
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:ring-1 focus:ring-pink-400 focus:border-pink-400 transition-colors duration-200 placeholder-gray-400 text-gray-900"
              value={password}
              onChange={handlePasswordChange}
              minLength={8}
            />
          </div>

          <div className="text-sm bg-gray-50 p-4 rounded-xl border border-gray-200">
            <p className="text-gray-700">A senha deve conter:</p>
            <ul className="mt-2 space-y-1">
              <li className={`flex items-center ${validations.minLength ? 'text-green-600' : 'text-gray-500'}`}>
                {validations.minLength ? '✓' : '○'} Mínimo de 8 caracteres
              </li>
              <li className={`flex items-center ${validations.hasUpperCase ? 'text-green-600' : 'text-gray-500'}`}>
                {validations.hasUpperCase ? '✓' : '○'} Pelo menos uma letra maiúscula
              </li>
              <li className={`flex items-center ${validations.hasLowerCase ? 'text-green-600' : 'text-gray-500'}`}>
                {validations.hasLowerCase ? '✓' : '○'} Pelo menos uma letra minúscula
              </li>
              <li className={`flex items-center ${validations.hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                {validations.hasNumber ? '✓' : '○'} Pelo menos um número
              </li>
              <li className={`flex items-center ${validations.hasSpecialChar ? 'text-green-600' : 'text-gray-500'}`}>
                {validations.hasSpecialChar ? '✓' : '○'} Pelo menos um caractere especial (!@#$%^&*)
              </li>
            </ul>
          </div>

          {error && (
            <div className="mb-4 text-center text-red-500">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 text-center text-green-600">
              {message}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full px-4 py-2 text-sm font-medium text-white bg-pink-500 rounded-xl hover:bg-pink-600 transition-all duration-200 shadow-sm"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Atualizando...' : 'Atualizar Senha'}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
