import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const { t } = await getDict();
  return (
    <div className="min-h-screen md:flex">
      <AppNav user={{ name: user.name, role: user.role }} roleLabel={t.roles[user.role]} />
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
