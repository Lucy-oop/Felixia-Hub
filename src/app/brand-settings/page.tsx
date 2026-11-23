"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Empty, Field, inputCls, PageHeader, Panel } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { DEFAULT_HIRING_TEMPLATES } from "@/lib/hiring-templates";
import { useDB } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const areaCls = cn(inputCls, "resize-y py-2.5 leading-loose");

/** AI Brand Settings — the brand voice, templates and rules every Gemini generator uses (manager only). */
export default function BrandSettingsPage() {
  const { role } = useDB();
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [brandVoice, setBrandVoice] = useState("");
  const [hiringTokutei, setHiringTokutei] = useState("");
  const [hiringKatsudo, setHiringKatsudo] = useState("");
  // other saved template keys (e.g. the legacy fb_hiring) are kept as they are on save
  const [otherTemplates, setOtherTemplates] = useState<Record<string, string>>({});
  const [fbEducational, setFbEducational] = useState("");
  const [tiktokScript, setTiktokScript] = useState("");
  const [complianceRules, setComplianceRules] = useState("");

  useEffect(() => {
    if (role !== "manager") return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("brand_settings").select("*").eq("id", 1).maybeSingle();
      if (!alive) return;
      if (error) setMsg({ tone: "err", text: `${t("brand.loadFailed")} (${error.message})` });
      else if (!data) setMsg({ tone: "err", text: t("brand.missing") });
      else {
        setBrandVoice(data.brand_voice || "");
        const tpl = (data.post_templates ?? {}) as Record<string, string>;
        setOtherTemplates(tpl);
        // empty → pre-filled with the default template (saved to the database on the next Save)
        setHiringTokutei(tpl.fb_hiring_tokutei?.trim() ? tpl.fb_hiring_tokutei : DEFAULT_HIRING_TEMPLATES.tokutei);
        setHiringKatsudo(tpl.fb_hiring_katsudo?.trim() ? tpl.fb_hiring_katsudo : DEFAULT_HIRING_TEMPLATES.katsudo);
        setFbEducational(data.post_templates?.fb_educational || "");
        setTiktokScript(data.post_templates?.tiktok_script || "");
        setComplianceRules(data.compliance_rules || "");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "manager") return <Empty>{t("brand.only")}</Empty>;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("brand_settings")
      .upsert({
        id: 1,
        brand_voice: brandVoice,
        post_templates: {
          ...otherTemplates,
          fb_hiring_tokutei: hiringTokutei,
          fb_hiring_katsudo: hiringKatsudo,
          fb_educational: fbEducational,
          tiktok_script: tiktokScript,
        },
        compliance_rules: complianceRules,
        updated_at: new Date().toISOString(),
      });
    setSaving(false);
    setMsg(error ? { tone: "err", text: `${t("brand.saveFailed")} (${error.message})` } : { tone: "ok", text: t("brand.saved") });
  }

  if (loading)
    return (
      <div className="grid place-items-center py-24">
        <span className="h-9 w-9 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-5xl">
      <PageHeader title={t("brand.title")} sub={t("brand.sub")}>
        <Button type="submit" disabled={saving}>
          {saving ? t("brand.saving") : t("brand.save")}
        </Button>
      </PageHeader>

      {msg &&
        (msg.tone === "err" ? (
          <div className="mb-4">
            <Alert onClose={() => setMsg(null)}>⚠ {msg.text}</Alert>
          </div>
        ) : (
          <div className="animate-rise mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{msg.text}</div>
        ))}

      <div className="animate-rise space-y-4">
        <Panel>
          <Field label={t("brand.voice")} hint={t("brand.voiceHint")}>
            <textarea rows={5} value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} className={areaCls} />
          </Field>
        </Panel>

        <Panel>
          <h2 className="mb-4 text-xl font-medium tracking-tight text-ink">{t("brand.templates")}</h2>
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t("brand.hiringTokutei")} hint={t("brand.hiringHint")}>
              <textarea rows={18} value={hiringTokutei} onChange={(e) => setHiringTokutei(e.target.value)} className={areaCls} />
            </Field>
            <Field label={t("brand.hiringKatsudo")} hint={t("brand.hiringHint")}>
              <textarea rows={18} value={hiringKatsudo} onChange={(e) => setHiringKatsudo(e.target.value)} className={areaCls} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t("brand.fbEducational")}>
              <textarea rows={10} value={fbEducational} onChange={(e) => setFbEducational(e.target.value)} className={areaCls} />
            </Field>
            <Field label={t("brand.tiktok")}>
              <textarea rows={10} value={tiktokScript} onChange={(e) => setTiktokScript(e.target.value)} className={areaCls} />
            </Field>
          </div>
        </Panel>

        <Panel>
          <Field label={t("brand.compliance")}>
            <textarea rows={5} value={complianceRules} onChange={(e) => setComplianceRules(e.target.value)} className={areaCls} />
          </Field>
        </Panel>
      </div>
    </form>
  );
}
