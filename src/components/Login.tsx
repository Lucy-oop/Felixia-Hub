"use client";

import { ArrowRight, CalendarDays, CircleCheck, Lock, Mail, Sparkles } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { Logo } from "./Shell";
import { Alert, Button, GrayChip, LangSwitcher } from "./ui";

export default function Login() {
  const { signIn } = useStore();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const input = "w-full bg-transparent py-3 text-sm outline-none placeholder:text-ink-mute";

  return (
    <div className="flex min-h-screen items-center justify-center p-3 sm:p-6">
      <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-white bg-frame shadow-card lg:flex-row">
        {/* left: product panel */}
        <div className="relative hidden flex-1 flex-col justify-between p-10 lg:flex">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-lg font-medium">Felixia Hub</span>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="orb animate-float h-32 w-32" />
            <h1 className="mt-8 max-w-sm text-3xl leading-tight font-medium tracking-tight">{t("login.heroTitle")}</h1>
            <p className="mt-3 max-w-sm text-ink-soft">{t("login.heroSub")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <GrayChip icon={CircleCheck} className="bg-white">
                {t("login.f1")}
              </GrayChip>
              <GrayChip icon={CalendarDays} className="bg-white">
                {t("login.f2")}
              </GrayChip>
              <GrayChip icon={Sparkles} className="bg-white">
                {t("login.f3")}
              </GrayChip>
            </div>
          </div>
          <div className="text-xs text-ink-mute">© Felixia Recruitment</div>
        </div>

        {/* right: form */}
        <div className="m-2.5 flex flex-1 flex-col rounded-[24px] border border-white bg-card p-6 shadow-card sm:p-10 lg:max-w-md">
          <div className="flex items-center justify-between">
            <div className="lg:hidden">
              <Logo />
            </div>
            <LangSwitcher className="ml-auto" />
          </div>
          <form
            className="my-auto space-y-4 pt-10"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError((await signIn(email.trim(), password)) ?? "");
              setBusy(false);
            }}
          >
            <div>
              <h2 className="text-[28px] font-medium tracking-tight">{t("login.welcome")}</h2>
              <p className="mt-1 text-sm text-ink-soft">{t("login.sub")}</p>
            </div>
            <label className="flex items-center gap-2.5 rounded-2xl border border-line bg-white px-3.5 shadow-raised focus-within:ring-4 focus-within:ring-primary/10">
              <Mail className="h-4 w-4 text-ink-mute" />
              <input type="email" required autoComplete="email" placeholder={t("login.email")} className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="flex items-center gap-2.5 rounded-2xl border border-line bg-white px-3.5 shadow-raised focus-within:ring-4 focus-within:ring-primary/10">
              <Lock className="h-4 w-4 text-ink-mute" />
              <input type="password" required autoComplete="current-password" placeholder={t("login.password")} className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" disabled={busy} className="h-12 w-full">
              {busy ? t("login.signingIn") : t("login.signIn")} {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>
            <p className="text-center text-xs text-ink-mute">{t("login.noAccount")}</p>
          </form>
        </div>
      </div>
    </div>
  );
}
