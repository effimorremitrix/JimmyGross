import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Logo } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { config } from "@/lib/config";
import { logout } from "../login/actions";
import { NavLink } from "./nav-link";

export default async function CabinetLayout({ children }: LayoutProps<"/cabinet">) {
  const staff = await requireStaff();
  const practice = await db.query.practices.findFirst({ where: eq(schema.practices.id, staff.practiceId) });
  const c = config();
  return (
    <div className="min-h-dvh bg-canvas">
      {(c.SIGNATURE_PROVIDER === "mock" || c.DEMO_MODE) && (
        <p className="bg-warn-soft px-4 py-2 text-center text-[13px] font-medium text-warn">
          Environnement de démonstration : signatures simulées, SMS non envoyés. Aucune donnée réelle de patient.
        </p>
      )}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/cabinet" className="rounded-lg">
              <Logo />
            </Link>
            <span className="text-[14px] text-muted">· {practice?.name}</span>
          </div>
          <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1">
            <NavLink href="/cabinet">Agenda</NavLink>
            <NavLink href="/cabinet/nouveau">Nouvelle demande</NavLink>
            <NavLink href="/cabinet/modeles">Modèles</NavLink>
            <form action={logout} className="ml-2 flex items-center gap-2 border-l border-line pl-3">
              <span className="text-[14px] text-muted">{staff.name}</span>
              <button type="submit" className="min-h-11 rounded-lg px-2 text-[14px] font-medium text-brand hover:underline">
                Déconnexion
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main id="contenu" className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
        {children}
      </main>
    </div>
  );
}
