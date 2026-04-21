// Template grid sub-component for project-wizard-dialog
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectTemplate } from "@/lib/tauri";

export const CATEGORY_ORDER = ["Web", "API/Backend", "CLI", "Desktop", "Other"];

export const CATEGORY_LABELS: Record<string, string> = {
  web: "Web",
  "api/backend": "API/Backend",
  api: "API/Backend",
  backend: "API/Backend",
  cli: "CLI",
  desktop: "Desktop",
};

export const LANGUAGE_BADGE_COLORS: Record<string, string> = {
  typescript: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  javascript: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  rust: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  python: "border-green-500/30 bg-green-500/10 text-green-400",
  go: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  none: "border-muted bg-muted/50 text-muted-foreground",
};

export const ARCHETYPE_BADGE_COLORS: Record<string, string> = {
  webapp: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  web_app: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  api: "border-green-500/30 bg-green-500/10 text-green-400",
  cli: "border-pink-500/30 bg-pink-500/10 text-pink-400",
  desktop: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  library: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  blank: "border-muted bg-muted/50 text-muted-foreground",
};

export function normalizeCategory(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return CATEGORY_LABELS[lower] ?? raw;
}

export function groupTemplatesByCategory(
  templates: ProjectTemplate[]
): Array<{ category: string; templates: ProjectTemplate[] }> {
  const map = new Map<string, ProjectTemplate[]>();
  for (const t of templates) {
    const cat = normalizeCategory(t.category);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(t);
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
    category: c,
    templates: map.get(c)!,
  }));
}

interface TemplateCardProps {
  template: ProjectTemplate;
  selected: boolean;
  onSelect: () => void;
}

function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  const langColor = LANGUAGE_BADGE_COLORS[template.language.toLowerCase()] ?? LANGUAGE_BADGE_COLORS.none;
  const archColor = ARCHETYPE_BADGE_COLORS[template.archetype.toLowerCase()] ?? ARCHETYPE_BADGE_COLORS.blank;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex flex-col gap-2 p-3 rounded-lg border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border/50 bg-card hover:border-border hover:bg-muted/30"
      )}
    >
      {selected && <CheckCircle className="absolute top-2 right-2 h-4 w-4 text-primary" />}
      <span className="font-medium text-sm leading-tight pr-5">{template.name}</span>
      <span className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{template.description}</span>
      <div className="flex gap-1 flex-wrap mt-auto pt-1">
        <span className={cn("inline-flex items-center rounded border px-1.5 py-0 text-[10px] font-semibold", langColor)}>
          {template.language}
        </span>
        {template.archetype !== "blank" && (
          <span className={cn("inline-flex items-center rounded border px-1.5 py-0 text-[10px] font-semibold", archColor)}>
            {template.archetype}
          </span>
        )}
      </div>
    </button>
  );
}

interface TemplateGridProps {
  templates: ProjectTemplate[];
  selectedId: string | undefined;
  onSelect: (template: ProjectTemplate) => void;
  isLoading: boolean;
}

export function TemplateGrid({ templates, selectedId, onSelect, isLoading }: TemplateGridProps) {
  const grouped = groupTemplatesByCategory(templates);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">Loading templates…</p>
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No templates available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ category, templates: cats }) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {category}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {cats.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={selectedId === t.id}
                onSelect={() => onSelect(t)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
