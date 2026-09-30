import { getDict } from "@/i18n/server";
import { LoginForm } from "./login-form";
import { LanguageSwitch } from "@/components/language-switch";

export default async function LoginPage() {
  const { t } = await getDict();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-xl font-bold text-white">
            AQ
          </div>
          <h1 className="text-xl font-bold">{t.shopName}</h1>
          <p className="text-sm text-muted">{t.login.title}</p>
        </div>
        <div className="card p-6">
          <LoginForm />
        </div>
        <div className="mt-4 flex justify-center">
          <LanguageSwitch />
        </div>
      </div>
    </main>
  );
}
