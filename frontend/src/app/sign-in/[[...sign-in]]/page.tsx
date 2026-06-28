import { SignIn } from '@clerk/nextjs';
import { HOME_HERO_HEADLINE, HOME_VALUE_PROP } from '@/lib/learnerCopy';

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
      <div className="w-full max-w-4xl grid gap-10 md:grid-cols-2 md:items-center">
        {/* Brand + value prop: visible before signing in (above on mobile,
            beside the sign-in card on desktop). */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold">Curriq</h1>
          <h2 className="text-2xl font-semibold text-gray-100">{HOME_HERO_HEADLINE}</h2>
          <p className="text-gray-400">{HOME_VALUE_PROP}</p>
        </div>

        <div className="flex justify-center md:justify-end">
          <SignIn />
        </div>
      </div>
    </main>
  );
}
