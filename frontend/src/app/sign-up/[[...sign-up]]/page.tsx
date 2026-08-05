import { SignUp } from "@clerk/nextjs";
import { pageShell } from "@/lib/ui";

export default function SignUpPage() {
  return (
    <main className={`${pageShell} flex items-center justify-center p-8`}>
      <SignUp />
    </main>
  );
}
