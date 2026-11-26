"use client";

import {
  Bell,
  Briefcase,
  CalendarCheck,
  CalendarRange,
  ChartColumn,
  CircleCheckBig,
  ClipboardPaste,
  Lightbulb,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Sparkles,
  SquareKanban,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useT, type TKey } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Role } from "@/lib/types";
import { cn, visibleCards, waitingPlanMonths } from "@/lib/utils";
import CardDrawer from "./CardDrawer";
import Login from "./Login";
import NewPostDialog from "./NewPostDialog";
import TelegramConnect from "./TelegramConnect";
import { Alert, Avatar, Button, IconButton, LangSwitcher, STAGE_STYLE, ThemeSegmented, ThemeToggle } from "./ui";

type NavItem = { href: string; label: TKey; icon: LucideIcon; roles: Role[]; labelFor?: Partial<Record<Role, TKey>>; short?: TKey };
const ALL: Role[] = ["manager", "client"];

/** Main pages → pill tabs in the top bar (like "Dashboard / Employees / Reports"). */
const TABS: NavItem[] = [
  { href: "/", label: "nav.today", icon: LayoutDashboard, roles: ALL },
  { href: "/pipeline", label: "nav.pipeline", icon: SquareKanban, roles: ["manager"] },
  { href: "/jobs", label: "nav.jobs", icon: Briefcase, roles: ALL },
  { href: "/ideas", label: "nav.ideas", icon: Lightbulb, roles: ALL },
  { href: "/confirm", label: "nav.confirm", icon: CircleCheckBig, roles: ALL },
];
/** Secondary pages → round icons in the left rail. */
const RAIL: (NavItem & { soon?: boolean })[] = [
  { href: "/plan", label: "nav.plan", short: "navs.plan", icon: CalendarRange, roles: ALL },
  { href: "/calendar", label: "nav.posting", short: "navs.posting", icon: CalendarCheck, roles: ALL },
  { href: "/performance", label: "nav.performance", icon: ChartColumn, roles: ALL },
  { href: "/team", label: "nav.team", short: "navs.team", icon: Users, roles: ["manager"] },
  { href: "/brand-settings", label: "nav.brand", short: "navs.brand", icon: Sparkles, roles: ["manager"] },
];

const UICtx = createContext<{ openCard: (id: string | null) => void; newPost: () => void }>({ openCard: () => {}, newPost: () => {} });
export const useUI = () => useContext(UICtx);

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface shadow-raised", className)}>
      <span className="flex items-end gap-[3px]">
        <span className="h-3 w-[5px] rounded-full bg-primary/50" />
        <span className="h-5 w-[5px] rounded-full bg-primary" />
        <span className="h-3.5 w-[5px] rounded-full bg-primary/75" />
      </span>
    </span>
  );
}

/** Closes a popover when clicking outside it. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return { open, setOpen, ref };
}

const popCls = "animate-rise absolute top-12 right-0 z-50 w-80 rounded-2xl border border-line bg-surface p-2 shadow-float";

export default function Shell({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const { db, role, me, session, authReady, error, clearError, signOut } = store;
  const { t } = useT();
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const search = usePopover();
  const bell = usePopover();
  const user = usePopover();

  if (!authReady)
    return (
      <div className="grid min-h-screen place-items-center">
        <span className="h-9 w-9 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  if (!session) return <Login />;

  const tabs = TABS.filter((n) => n.roles.includes(role));
  const rail = RAIL.filter((n) => n.roles.includes(role));
  const name = me?.fullName || session.user.email || "";
  const cards = db ? visibleCards(db.cards, role) : [];
  const pending = cards.filter((c) => c.review.status === "review").length;
  const planWaiting = cards.filter((c) => c.plan.status === "sent").length;
  const planChanges = cards.filter((c) => c.plan.status === "changes").length;
  // open the calendar on the (first) month that has lines waiting, not always today's month
  const planHref = (() => {
    const m = waitingPlanMonths(cards, role)[0];
    return m ? `/plan?month=${m}` : "/plan";
  })();
  const todayIso = new Date().toISOString().slice(0, 10);
  const toPost = cards.filter((c) => c.stage === "approved" && c.plannedDate <= todayIso).length;
  const changes = cards.filter((c) => c.review.status === "changes").length;
  const newIdeas = db?.ideas.filter((i) => i.status === "new").length ?? 0;
  const toTidy = db?.jobs.filter((j) => j.needsTidy).length ?? 0;
  const bellCount = role === "client" ? pending + planWaiting : role === "manager" ? changes + newIdeas + toTidy + planChanges + toPost : 0;
  const notes: { show: boolean; href: string; dot: string; text: string }[] = [
    { show: role === "client" && pending > 0, href: "/confirm", dot: "bg-yellow-400", text: t("notif.review", { n: pending }) },
    { show: role === "client" && planWaiting > 0, href: planHref, dot: "bg-yellow-400", text: t("notif.plan", { n: planWaiting }) },
    { show: role === "manager" && planChanges > 0, href: planHref, dot: "bg-rose-500", text: t("notif.planChanges", { n: planChanges }) },
    { show: role === "manager" && toPost > 0, href: "/calendar", dot: "bg-green-500", text: t("notif.toPost", { n: toPost }) },
    { show: role === "manager" && changes > 0, href: "/confirm", dot: "bg-rose-500", text: t("notif.changes", { n: changes }) },
    { show: role === "manager" && newIdeas > 0, href: "/ideas", dot: "bg-primary", text: t("notif.ideas", { n: newIdeas }) },
    { show: role === "manager" && toTidy > 0, href: "/jobs", dot: "bg-violet-500", text: t("notif.tidy", { n: toTidy }) },
  ].filter((n) => n.show);
  const results = q.trim() ? cards.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  const quickAction =
    role === "manager" ? (
      <Button size="sm" variant="secondary" className="h-10 px-4" onClick={() => db && setCreating(true)}>
        <Plus className="h-4 w-4" /> {t("qa.newPost")}
      </Button>
    ) : role === "client" ? (
      <Button size="sm" variant="secondary" className="h-10 px-4" onClick={() => router.push("/jobs?new=1")}>
        <ClipboardPaste className="h-4 w-4" /> {t("qa.addJob")}
      </Button>
    ) : null;

  const railNav = (
    <>
      {rail.map((n) =>
        n.soon ? (
          <div key={n.href} className="group relative">
            <IconButton disabled className="opacity-35" aria-label={t(n.label)}>
              <n.icon />
            </IconButton>
            <Tip>
              {t(n.label)} · {t("nav.soon")}
            </Tip>
          </div>
        ) : (
          <div key={n.href} className="group relative w-full px-1.5">
            <Link
              href={n.href}
              onClick={() => setMenu(false)}
              aria-label={t(n.label)}
              aria-current={path === n.href ? "page" : undefined}
              className={cn("flex flex-col items-center gap-1 rounded-2xl py-1.5 transition-all", path === n.href ? "text-ink" : "text-ink-soft hover:text-ink")}
            >
              <span
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-full transition-all",
                  path === n.href ? "border border-line bg-surface shadow-raised ring-4 ring-primary/10" : "group-hover:bg-surface",
                )}
              >
                <n.icon className="h-[18px] w-[18px]" />
              </span>
              <span className={cn("line-clamp-2 w-full text-center text-[11px] leading-tight", path === n.href && "font-medium")}>{t(n.short ?? n.label)}</span>
            </Link>
            <Tip>{t(n.label)}</Tip>
          </div>
        ),
      )}
    </>
  );

  return (
    <UICtx.Provider value={{ openCard: setCardId, newPost: () => setCreating(true) }}>
      <div className="min-h-screen p-0 sm:p-3 lg:p-5">
        <div className="flex min-h-[calc(100vh-2.5rem)] gap-3 rounded-none border-edge bg-frame p-2.5 print:bg-white print:p-0 print:shadow-none sm:rounded-[30px] sm:border sm:p-3 sm:shadow-card">
          {/* left rail */}
          <aside className="sticky top-5 z-40 hidden print:!hidden h-[calc(100vh-4.25rem)] w-[84px] shrink-0 flex-col items-center gap-2 rounded-[22px] border border-edge bg-card py-3 shadow-card lg:flex">
            <Link href="/" aria-label="Felixia Hub">
              <Logo />
            </Link>
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-1.5">{railNav}</div>
            <button onClick={() => signOut()} className="group flex w-full flex-col items-center gap-1 px-1.5 text-ink-soft hover:text-ink">
              <span className="grid h-10 w-10 place-items-center rounded-full group-hover:bg-surface">
                <LogOut className="h-[18px] w-[18px]" />
              </span>
              <span className="line-clamp-2 text-center text-[11px] leading-tight">{t("auth.signOut")}</span>
            </button>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* top bar */}
            <header className="sticky top-2 z-30 flex print:hidden items-center gap-2 rounded-[22px] border border-edge bg-card/90 p-2 shadow-card backdrop-blur sm:top-3 lg:top-5">
              <IconButton className="lg:hidden" onClick={() => setMenu(true)} aria-label={t("nav.menu")}>
                <Menu />
              </IconButton>
              <nav className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map((n) => {
                  const active = path === n.href;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={cn(
                        "flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm transition-all",
                        active ? "border border-line bg-surface font-medium text-ink shadow-raised ring-4 ring-primary/5" : "text-ink-soft hover:bg-surface/70 hover:text-ink",
                      )}
                    >
                      <n.icon className="h-4 w-4" />
                      <span className={cn(!active && "hidden md:inline")}>{t(n.labelFor?.[role] ?? n.label)}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* search */}
              <div ref={search.ref} className="relative">
                <IconButton onClick={() => search.setOpen(!search.open)} aria-label={t("nav.search")} className="bg-surface/60">
                  <Search />
                </IconButton>
                {search.open && (
                  <div className={cn(popCls, "left-0 sm:right-auto")}>
                    <input autoFocus className="w-full rounded-xl bg-frame px-3 py-2 text-sm outline-none" placeholder={`${t("nav.search")}…`} value={q} onChange={(e) => setQ(e.target.value)} />
                    <ul className="mt-1">
                      {results.map((c) => {
                        const S = STAGE_STYLE[c.stage];
                        return (
                          <li key={c.id}>
                            <button
                              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-frame"
                              onClick={() => {
                                setCardId(c.id);
                                search.setOpen(false);
                                setQ("");
                              }}
                            >
                              <span className={cn("grid h-6 w-6 place-items-center rounded-full", S.bar)}>
                                <S.icon className="h-3 w-3" />
                              </span>
                              <span className="truncate">{c.title}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex-1" />

              <div className="hidden sm:block">{quickAction}</div>
              <LangSwitcher className="hidden md:inline-flex" />
              <ThemeToggle className="hidden md:grid" />

              {/* bell */}
              <div ref={bell.ref} className="relative">
                <IconButton onClick={() => bell.setOpen(!bell.open)} className="border border-line bg-surface shadow-raised" aria-label={t("notif.title")}>
                  <Bell />
                  {bellCount > 0 && <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{bellCount}</span>}
                </IconButton>
                {bell.open && (
                  <div className={popCls}>
                    <div className="px-2 py-1.5 text-sm font-medium">{t("notif.title")}</div>
                    {notes.length === 0 ? (
                      <p className="px-2 pb-2 text-sm text-ink-mute">{t("notif.none")}</p>
                    ) : (
                      <div className="space-y-1">
                        {notes.map((n) => (
                          <Link
                            key={n.href + n.dot}
                            href={n.href}
                            onClick={() => {
                              bell.setOpen(false);
                              const m = n.href.match(/^\/plan\?month=(\d{4}-\d{2})$/)?.[1];
                              if (m && path === "/plan") window.dispatchEvent(new CustomEvent("felixia:plan-month", { detail: m }));
                            }} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-frame">
                            <span className={cn("h-2 w-2 rounded-full", n.dot)} /> {n.text}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* user */}
              <div ref={user.ref} className="relative">
                <button onClick={() => user.setOpen(!user.open)} className="block rounded-full shadow-raised" aria-label={name}>
                  <Avatar name={name} className="h-10 w-10" />
                </button>
                {user.open && (
                  <div className={popCls}>
                    <div className="flex items-center gap-3 p-2">
                      <Avatar name={name} className="h-10 w-10" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{name}</div>
                        <div className="text-xs text-ink-mute">{t(`role.${role}`)}</div>
                      </div>
                    </div>
                    <div className="p-2 md:hidden">
                      <LangSwitcher />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                      <span className="text-xs text-ink-mute">{t("theme.title")}</span>
                      <ThemeSegmented />
                    </div>
                    <TelegramConnect />
                    <button onClick={() => signOut()} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-ink-soft hover:bg-frame hover:text-ink">
                      <LogOut className="h-4 w-4" /> {t("auth.signOut")}
                    </button>
                  </div>
                )}
              </div>
            </header>

            {/* mobile sheet */}
            {menu && (
              <div className="fixed inset-0 z-40 lg:hidden">
                <div className="absolute inset-0 bg-ink/25 backdrop-blur-sm" onClick={() => setMenu(false)} />
                <aside className="animate-slide-in absolute inset-y-2 left-2 flex w-72 flex-col gap-1 rounded-[24px] bg-card p-3 shadow-float">
                  <div className="mb-3 flex items-center justify-between">
                    <Logo />
                    <IconButton onClick={() => setMenu(false)} aria-label="Close">
                      <X />
                    </IconButton>
                  </div>
                  {[...tabs, ...rail].map((n) => {
                    const soon = "soon" in n && n.soon === true;
                    return (
                      <Link
                        key={n.href}
                        href={soon ? "#" : n.href}
                        onClick={() => !soon && setMenu(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm",
                          path === n.href ? "border border-line bg-surface font-medium shadow-raised" : "text-ink-soft",
                          soon && "pointer-events-none opacity-40",
                        )}
                      >
                        <n.icon className="h-4 w-4" />
                        {t(n.labelFor?.[role] ?? n.label)}
                        {soon && <span className="ml-auto text-[10px]">{t("nav.soon")}</span>}
                      </Link>
                    );
                  })}
                  <div className="mt-auto space-y-2 pt-3">
                    {quickAction && <div className="sm:hidden">{quickAction}</div>}
                    <LangSwitcher />
                  </div>
                </aside>
              </div>
            )}

            <main className="min-w-0 flex-1 px-1 pb-6 sm:px-2">
              <div className="mb-3 space-y-3 empty:hidden">
                {error && <Alert onClose={clearError}>⚠ {t(error)}</Alert>}
                {db && !me && <Alert tone="amber">{t("err.noProfile")}</Alert>}
                {db && me && !store.roleOk && <Alert tone="amber">{t("err.badRole", { role: String(me.role) })}</Alert>}
                {db && store.schemaMissing.length > 0 && (
                  <Alert tone="amber">{role === "manager" ? t("err.schema", { files: [...store.schemaMissing, "phase7.sql"].join(", ") }) : t("err.schemaClient")}</Alert>
                )}
              </div>
              {db ? (
                children
              ) : (
                !error && (
                  <div className="grid place-items-center py-24">
                    <span className="h-9 w-9 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
                  </div>
                )
              )}
            </main>
          </div>
        </div>

        {db && cardId && <CardDrawer key={cardId} id={cardId} onClose={() => setCardId(null)} />}
        {db && creating && (
          <NewPostDialog
            onClose={() => setCreating(false)}
            onCreate={(init) => {
              setCreating(false);
              setCardId(store.newCard(init));
            }}
          />
        )}
      </div>
    </UICtx.Provider>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-lg bg-ink px-2.5 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-float transition group-hover:opacity-100">
      {children}
    </span>
  );
}
