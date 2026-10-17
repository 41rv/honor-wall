import "fake-indexeddb/auto";
import { writeFileSync } from "node:fs";
import { it, expect, vi } from "vitest";
import { db, create, snapshot, setCycleStatus, setBranchCompletion } from "../app/db";
import { currentCycle } from "../app/taskSchedule";
import { saveProjectGoal, setProjectPaused } from "../app/projectPaceStore";
import { validateBackup } from "../app/model";
import { legacyStores } from "../app/backupTables";

it("عينة إصدار4 واقعية بكل الجداول القديمة12 صالحة للتحقق وترقية النسخة المنشورة", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T08:00:00Z"));
    try {
        await db.transaction("rw", db.tables, async () => {
            for (const table of db.tables) await table.clear();
        });
        const project = await create("project", "مشروع مستخدم قديم — اختبار معزول", "ملاحظات أصلية");
        const step = await create("step", "خطوة مكتملة قديمة", "تفاصيل محفوظة", project);
        await create("step", "خطوة باقية", "", project);
        await setBranchCompletion(step, true);
        const task = await create("task", "مهمة يومية قديمة", "ملاحظات مهمة", undefined, null, false, {
            schedule: { repeat: "daily", date: "2026-10-21", timeZone: "Asia/Riyadh", leadDays: 3 },
            priority: "important-urgent",
        });
        await setCycleStatus(currentCycle((await db.tasks.get(task))!)!.id, "done");
        await create("idea", "فكرة قديمة محفوظة", "نص طويل محفوظ");
        await saveProjectGoal(project, { kind: "duration", value: 20, deadline: "flexible" });
        await setProjectPaused(project, true);
        vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
        await setProjectPaused(project, false);
        await db.recommendations.add({
            id: "phase8-old-decision", key: "phase8-old-decision", type: "focus", projectIds: [project],
            reason: "قرار قديم محفوظ", effect: "لم يطبق", createdAt: new Date().toISOString(),
            status: "rejected", decidedAt: new Date().toISOString(), changes: [{ type: "pause", projectId: project }], basis: "phase8-isolated",
        });
        const data = { ...await snapshot(), version: 4 as const };
        for (const name of ["habitPaths", "habits", "habitPlans", "habitEntries", "habitSuggestions", "reminders", "habitImportReceipts"] as const) delete data[name];
        for (const store of legacyStores) expect(data[store]!.length, store).toBeGreaterThan(0);
        expect(validateBackup(data)).toEqual(data);
        writeFileSync("docs/habits-phase8/schema6-fixture.json", JSON.stringify(data, null, 2) + "\n");
    } finally {
        vi.useRealTimers();
    }
});
