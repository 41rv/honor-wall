import type { Step } from "./model";

export const PROJECT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export interface ImportStep {
    title: string;
    notes?: string;
    children?: ImportStep[];
}
export interface ImportStage {
    title: string;
    notes?: string;
    steps: ImportStep[];
}
export interface ProjectImportFile {
    format: "masar.project";
    version: 1;
    project: { title: string; description?: string; stages: ImportStage[] };
}
export interface ImportNode {
    title: string;
    notes: string;
    kind: Step["kind"];
    parent: number | null;
    order: number;
    number: string;
}
function fail(path: string, message: string): never {
    throw new Error(`ملف المشروع غير صالح: ${path} — ${message}`);
}
function object(value: unknown, path: string, allowed: string[]) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        fail(path, "يجب أن يكون كائنًا.");
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record))
        if (!allowed.includes(key)) fail(`${path}.${key}`, "حقل غير معتمد.");
    return record;
}
function title(value: unknown, path: string): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 300)
        fail(path, "الاسم مطلوب، من ١ إلى ٣٠٠ حرف بعد إزالة الفراغات الطرفية.");
    return value.trim();
}
function notes(value: unknown, path: string): string {
    if (value === undefined) return "";
    if (typeof value !== "string" || value.length > 100000)
        fail(path, "يجب أن يكون نصًا لا يتجاوز ١٠٠٬٠٠٠ حرف.");
    return value;
}
function array(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) fail(path, "يجب أن يكون مصفوفة JSON.");
    return value;
}
// Produce a validated, detached tree before any database mutation.
export function validateProjectImport(value: unknown): ProjectImportFile {
    const root = object(value, "الملف", ["format", "version", "project"]);
    if (root.format !== "masar.project")
        fail(
            "format",
            'القيمة المطلوبة "masar.project"؛ هذا استيراد مشروع وليس نسخة احتياطية.',
        );
    if (root.version !== 1) fail("version", "الإصدار المدعوم هو الرقم 1.");
    const p = object(root.project, "project", [
        "title",
        "description",
        "stages",
    ]);
    const result: ProjectImportFile = {
        format: "masar.project",
        version: 1,
        project: {
            title: title(p.title, "project.title"),
            description: notes(p.description, "project.description"),
            stages: [],
        },
    };
    let count = 0;
    const visit = (
        value: unknown,
        path: string,
        depth: number,
        stage: boolean,
    ): ImportStep | ImportStage => {
        if (depth > 20) fail(path, "الحد الأقصى ٢٠ مستوى، بما فيها المرحلة.");
        if (++count > 5000) fail(path, "الحد الأقصى ٥٠٠٠ مرحلة وخطوة معًا.");
        const childKey = stage ? "steps" : "children";
        const row = object(value, path, ["title", "notes", childKey]);
        const item = {
            title: title(row.title, path + ".title"),
            notes: notes(row.notes, path + ".notes"),
        };
        const entries =
            !stage && row.children === undefined
                ? []
                : array(row[childKey], path + "." + childKey);
        const nested = entries.map(
            (entry, i) =>
                visit(
                    entry,
                    `${path}.${childKey}[${i}]`,
                    depth + 1,
                    false,
                ) as ImportStep,
        );
        return stage
            ? { ...item, steps: nested }
            : { ...item, children: nested };
    };
    result.project.stages = array(p.stages, "project.stages").map(
        (entry, i) =>
            visit(entry, `project.stages[${i}]`, 1, true) as ImportStage,
    );
    return result;
}
export function parseProjectImport(text: string): ProjectImportFile {
    if (new TextEncoder().encode(text).length > PROJECT_IMPORT_MAX_BYTES)
        throw new Error("ملف المشروع أكبر من ٥ ميجابايت.");
    let value: unknown;
    try {
        value = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
        throw new Error(
            "تعذر قراءة JSON: تأكد من الأقواس والفواصل، واحذف تعليقات النص وعلامات ``` من الملف.",
        );
    }
    return validateProjectImport(value);
}
export function importNodes(file: ProjectImportFile): ImportNode[] {
    const nodes: ImportNode[] = [];
    function visit(
        item: ImportStage | ImportStep,
        parent: number | null,
        order: number,
        number: string,
        stage: boolean,
    ) {
        const index = nodes.length;
        nodes.push({
            title: item.title,
            notes: item.notes ?? "",
            parent,
            order,
            number,
            kind: stage ? "stage" : "step",
        });
        const nested = "steps" in item ? item.steps : (item.children ?? []);
        nested.forEach((child, i) =>
            visit(child, index, i, `${number}.${i + 1}`, false),
        );
    }
    file.project.stages.forEach((stage, i) =>
        visit(stage, null, i, String(i + 1), true),
    );
    return nodes;
}
