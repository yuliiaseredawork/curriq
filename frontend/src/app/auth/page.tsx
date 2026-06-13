'use client';

import { useState } from 'react';
import {
  signIn,
  signUp,
  confirmSignUp,
} from 'aws-amplify/auth';
import { configureAuth } from '@/lib/auth';

configureAuth();

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'confirm'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function handleSignUp() {
    setError('');

    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });

      setMode('confirm');
    } catch (e: any) {
      setError(e.message ?? 'Sign up failed');
    }
  }

  async function handleConfirm() {
    setError('');

    try {
      await confirmSignUp({
        username: email,
        confirmationCode: code,
      });

      setMode('signin');
    } catch (e: any) {
      setError(e.message ?? 'Confirmation failed');
    }
  }

  async function handleSignIn() {
    setError('');

    try {
      await signIn({
        username: email,
        password,
      });

      window.location.href = '/';
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed');
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-md mx-auto space-y-5">
        <h1 className="text-3xl font-bold">Curriq</h1>

        {error && (
          <div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">
            {error}
          </div>
        )}

        <input
          className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {mode !== 'confirm' && (
          <input
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}

        {mode === 'confirm' && (
          <input
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3"
            placeholder="Confirmation code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}

        {mode === 'signin' && (
          <button
            className="w-full rounded-lg bg-white text-black px-5 py-3 font-medium"
            onClick={handleSignIn}
          >
            Sign in
          </button>
        )}

        {mode === 'signup' && (
          <button
            className="w-full rounded-lg bg-white text-black px-5 py-3 font-medium"
            onClick={handleSignUp}
          >
            Sign up
          </button>
        )}

        {mode === 'confirm' && (
          <button
            className="w-full rounded-lg bg-white text-black px-5 py-3 font-medium"
            onClick={handleConfirm}
          >
            Confirm email
          </button>
        )}

        {mode === 'signin' && (
          <button
            className="text-blue-400"
            onClick={() => setMode('signup')}
          >
            Create account
          </button>
        )}

        {mode === 'signup' && (
          <button
            className="text-blue-400"
            onClick={() => setMode('signin')}
          >
            Already have an account?
          </button>
        )}
      </div>
    </main>
  );
}