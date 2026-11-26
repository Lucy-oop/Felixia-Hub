"use client";

import { Avatar, Empty, inputCls, Panel, selectCls } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["manager", "client"];

export default function TeamPage() {
  const s = useDB();
  const { db, role, me } = s;
  const { t } = useT();
  if (role !== "manager") return <Empty>{t("team.only")}</Empty>;

  return (
    <Panel className="animate-rise mx-auto max-w-3xl">
      <h1 className="text-[28px] leading-tight font-medium tracking-tight">{t("team.title")}</h1>
      <p className="mt-0.5 mb-5 text-sm text-ink-soft">{t("team.sub")}</p>
      <ul className="space-y-2">
        {db.profiles.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-surface p-3 shadow-card">
            <Avatar name={p.fullName || "?"} className="h-11 w-11" />
            <input
              className={inputCls + " min-w-40 flex-1"}
              defaultValue={p.fullName}
              placeholder={t("team.fullName")}
              onBlur={(e) => e.target.value !== p.fullName && s.updateProfile(p.id, { fullName: e.target.value })}
            />
            <select className={selectCls + " w-auto"} value={p.role} disabled={p.id === me?.id} onChange={(e) => s.updateProfile(p.id, { role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
            {p.id === me?.id && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">{t("team.you")}</span>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
