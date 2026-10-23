import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { getStaff } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion du cabinet" };

export default async function LoginPage() {
  if (await getStaff()) redirect("/cabinet");
  return (
    <main id="contenu" className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-7">
        <Logo size={26} />
        <h1 className="mt-6 text-xl font-bold">Connexion du cabinet</h1>
        <p className="mt-1 text-[14px] text-muted">Suivez les consentements de vos patients avant chaque geste.</p>
        <LoginForm />
      </div>
    </main>
  );
}
