import { requireUser } from "@/lib/session";
import { SideNav } from "@/components/side-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await requireUser();

  return (
    /* Named so page-level background overrides can reach the shell without
       reaching every portal that lands beside it under <body>. */
    <div data-app-shell className="flex min-h-screen flex-col lg:flex-row">
      <SideNav email={currentUser.email} isAdmin={currentUser.role === "admin"} />
      <main className="min-w-0 flex-1 bg-bg">{children}</main>
    </div>
  );
}
