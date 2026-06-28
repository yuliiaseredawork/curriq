import { SignIn } from '@clerk/nextjs';
import { HOME_HERO_HEADLINE, HOME_VALUE_PROP } from '@/lib/learnerCopy';
import { pageShell, eyebrow } from '@/lib/ui';

export default function SignInPage() {
  return (
    <main className={`${pageShell} flex items-center justify-center p-8`}>
      <div className="grid w-full max-w-4xl gap-10 md:grid-cols-2 md:items-center">
        {/* Brand + value prop: visible before signing in (above on mobile,
            beside the sign-in card on desktop). */}
        <div className="space-y-4">
          <div className={`${eyebrow} text-blue-300/90`}>Your AI learning coach</div>
          <h1 className="text-4xl font-bold tracking-tight" aria-label="Curriq">
            Curri<span className="text-blue-400">q</span>
          </h1>
          <h2 className="text-2xl font-semibold text-gray-100">{HOME_HERO_HEADLINE}</h2>
          <p className="text-lg text-gray-400">{HOME_VALUE_PROP}</p>
        </div>

        <div className="flex justify-center md:justify-end">
          <SignIn />
        </div>
      </div>
    </main>
  );
}
