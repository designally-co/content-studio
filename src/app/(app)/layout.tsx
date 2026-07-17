import { requireUser } from "@/lib/session";
import { SideNav } from "@/components/side-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <SideNav user={{ name: user.name, email: user.email }} />
      <main className="min-w-0 flex-1 bg-bg">{children}</main>
    </div>
  );
}
