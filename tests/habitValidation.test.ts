import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { validateBackup, parseBackup, type Snapshot } from "../app/model";
import { scaledQuantity } from "../app/habitValidation";
import { habitFixture } from "./habitFixtures";
import { habitStores, schema7HabitStores } from "../app/backupTables";

describe("عقد Snapshot5 دون تنفيذ منطق العادات", () => {
    it("يحفظ الخطط والمستويات والعضوية والتسجيلات والقرارات كما هي", () => {
        const data = habitFixture();
        expect(validateBackup(data)).toEqual(data);
        expect(parseBackup(JSON.stringify(data))).toEqual(data);
        const cloned = validateBackup(data);
        cloned.habits![0].title = "تغيير";
        expect(data.habits![0].title).toBe("قراءة");
    });
    it.each([1, 2, 3, 4] as const)(
        "يقبل النسخة القديمة %s دون أقسام جديدة",
        (version) => {
            const data = habitFixture();
            data.version = version;
            for (const key of habitStores) delete data[key];
            expect(validateBackup(data).version).toBe(version);
        },
    );
    it.each(schema7HabitStores)(
        "يشترط مصفوفة %s في الإصدار5 حتى إن كانت فارغة",
        (name) => {
            const data = habitFixture();
            delete data[name];
            expect(() => validateBackup(data)).toThrow("غير صالحة");
        },
    );
    it.each(habitStores)(
        "Snapshot6 requires explicit section %s including empty assessments",
        (name) => {
            const data = habitFixture();
            data.version = 6;
            data.habitAssessments = [];
            expect(() => validateBackup(data)).not.toThrow();
            delete data[name];
            expect(() => validateBackup(data)).toThrow("غير صالحة");
        },
    );
    const mutations: [string, (data: Snapshot) => void][] = [
        [
            "قسم جديد داخل نسخة قديمة",
            (d) => {
                d.version = 4;
            },
        ],
        [
            "قائمة غير مصفوفة",
            (d) => {
                Object.assign(d, { habitEntries: {} });
            },
        ],
        [
            "معرف مسار مكرر",
            (d) => {
                d.habitPaths!.push({ ...d.habitPaths![0] });
            },
        ],
        [
            "معرف عادة مكرر",
            (d) => {
                d.habits!.push({ ...d.habits![0] });
            },
        ],
        [
            "علاقة مسار مفقودة",
            (d) => {
                d.habits![0].pathId = "missing";
            },
        ],
        [
            "عادة بلا خطة",
            (d) => {
                d.habits!.push({ ...d.habits![0], id: "orphan" });
            },
        ],
        [
            "خطة بلا عادة",
            (d) => {
                d.habitPlans![0].habitId = "missing";
            },
        ],
        [
            "رقم مراجعة مكرر",
            (d) => {
                d.habitPlans![1].revision = 1;
            },
        ],
        [
            "مراجعة مفقودة",
            (d) => {
                d.habitPlans![1].revision = 3;
            },
        ],
        [
            "تاريخ سريان عكسي",
            (d) => {
                d.habitPlans![1].effectiveDate = "2026-09-30";
            },
        ],
        [
            "تاريخ مستحيل",
            (d) => {
                d.habitPlans![0].effectiveDate = "2026-02-30";
            },
        ],
        [
            "منطقة زمنية غير صالحة",
            (d) => {
                d.habits![0].timeZone = "Not/AZone";
            },
        ],
        [
            "تغيير منطقة دون سياسة",
            (d) => {
                d.habitPlans![1].timeZone = "UTC";
            },
        ],
        [
            "أسبوع بلا أيام",
            (d) => {
                d.habitPlans![2].schedule = { repeat: "weekly", weekdays: [] };
            },
        ],
        [
            "أيام مكررة",
            (d) => {
                d.habitPlans![2].schedule = {
                    repeat: "weekly",
                    weekdays: [0, 0],
                };
            },
        ],
        [
            "يوم خارج الأسبوع",
            (d) => {
                d.habitPlans![2].schedule = { repeat: "weekly", weekdays: [7] };
            },
        ],
        [
            "مرحلة كمية في البسيطة",
            (d) => {
                d.habitPlans![2].phases = [d.habitPlans![0].phases[0]];
            },
        ],
        [
            "صفر خطوة الزيادة",
            (d) => {
                d.habitPlans![0].phases[0].step = 0;
            },
        ],
        [
            "قيمة غير منتهية",
            (d) => {
                d.habitPlans![0].phases[0].target = Infinity;
            },
        ],
        [
            "كمية سالبة",
            (d) => {
                d.habitPlans![0].phases[0].start = -1;
            },
        ],
        [
            "أكثر من3 منازل",
            (d) => {
                d.habitPlans![0].phases[0].step = 0.0001;
            },
        ],
        [
            "مستوى خارج الهدف",
            (d) => {
                d.habitPlans![0].current!.target = 21;
            },
        ],
        [
            "مفتاح مرحلة مفقود",
            (d) => {
                d.habitPlans![0].baseline!.phaseKey = "missing";
            },
        ],
        [
            "تغيير وحدة المفتاح التاريخي",
            (d) => {
                d.habitPlans![1].phases[0].unit = "دقائق";
            },
        ],
        [
            "يوم واحد مرتين",
            (d) => {
                d.habitEntries!.push({
                    ...d.habitEntries![0],
                    id: "different",
                });
            },
        ],
        [
            "تسجيل لخطة عادة أخرى",
            (d) => {
                d.habitEntries![0].planId = "bp1";
            },
        ],
        [
            "نسبة التسجيل إلى خطة لاحقة",
            (d) => {
                d.habitEntries![0].planId = "hp2";
            },
        ],
        [
            "نسبة التسجيل إلى خطة منتهية",
            (d) => {
                d.habitEntries![1].planId = "hp1";
            },
        ],
        [
            "بداية يوم UTC خاطئة",
            (d) => {
                d.habitEntries![0].dayStart = "2026-10-05T00:00:00.000Z";
            },
        ],
        [
            "لقطة وحدة مختلفة",
            (d) => {
                Object.assign(d.habitEntries![0].result, { unit: "دقائق" });
            },
        ],
        [
            "لقطة حد مختلفة",
            (d) => {
                Object.assign(d.habitEntries![0].result, { threshold: 2 });
            },
        ],
        [
            "خلط تسجيل بسيط بكمية",
            (d) => {
                d.habitEntries![0].result = { kind: "simple", done: true };
            },
        ],
        [
            "موافقة لا تشير لمراجعة معتمدة",
            (d) => {
                d.habitSuggestions![0].appliedPlanId = "missing";
            },
        ],
        [
            "رفض يحمل تغيير مطبق",
            (d) => {
                d.habitSuggestions![2].appliedPlanId = "hp2";
            },
        ],
        [
            "مقترح آلي يزعم قرار المستخدم",
            (d) => {
                d.habitSuggestions![1].decidedAt = "2026-10-15T00:00:00.000Z";
            },
        ],
        [
            "انتهاء إيقاف قبل بدئه",
            (d) => {
                d.habits![0].pauses = [
                    {
                        start: "2026-10-05T00:00:00.000Z",
                        end: "2026-10-04T00:00:00.000Z",
                    },
                ];
            },
        ],
        [
            "إيقافان متداخلان",
            (d) => {
                d.habits![0].pauses = [
                    { start: "2026-10-05T00:00:00.000Z" },
                    { start: "2026-10-06T00:00:00.000Z" },
                ];
            },
        ],
        [
            "تذكير مجهول التاريخ",
            (d) => {
                d.reminders![0].createdAt = "2026-02-30T00:00:00.000Z";
            },
        ],
        [
            "مراجعة تذكير قبل الإنشاء",
            (d) => {
                d.reminders![0].reviewedAt = "2026-09-01T00:00:00.000Z";
            },
        ],
        [
            "حقل موعد غير مدعوم للتذكير",
            (d) => {
                Object.assign(d.reminders![0], { due: "tomorrow" });
            },
        ],
        [
            "بصمة إيصال غير صالحة",
            (d) => {
                d.habitImportReceipts![0].digest = "bad";
            },
        ],
        [
            "مخزن إيصال غير معروف",
            (d) => {
                Object.assign(d.habitImportReceipts![0].outputs, {
                    unknown: ["id"],
                });
            },
        ],
        [
            "معرف مكرر داخل إيصال",
            (d) => {
                d.habitImportReceipts![0].outputs.habits = [
                    "reading",
                    "reading",
                ];
            },
        ],
    ];
    it.each(mutations)("يرفض %s قبل أي كتابة", (_, change) => {
        const d = habitFixture();
        change(d);
        expect(() => validateBackup(d)).toThrow("غير صالحة");
    });
    it("يسمح بالإيصال التاريخي الذي حذفت عناصره ولا يعيد ربطها تلقائيًا", () => {
        const d = habitFixture();
        d.habitImportReceipts![0].outputs.habits = ["removed"];
        expect(
            validateBackup(d).habitImportReceipts![0].outputs.habits,
        ).toEqual(["removed"]);
    });
    it("يحفظ العضوية التاريخية لمسار محذوف مع عادة مستقلة حاليًا", () => {
        const d = habitFixture();
        d.habitPaths![0].deletedAt = "2026-10-15T00:00:00.000Z";
        d.habitPaths![0].updatedAt = d.habitPaths![0].deletedAt;
        d.habits![0].pathId = null;
        expect(validateBackup(d).habitPlans![0].pathId).toBe("culture");
    });
    it.each(["2026-03-08", "2026-11-01"])(
        "يحفظ حدود اليوم المحلي عند DST في %s",
        (localDate) => {
            const d = habitFixture();
            d.habitSuggestions = [];
            d.habitEntries = [d.habitEntries![0]];
            d.habitPlans![0].effectiveDate = "2026-01-01";
            const e = d.habitEntries[0],
                start =
                    Temporal.PlainDate.from(localDate).toZonedDateTime(
                        "America/New_York",
                    );
            d.habits![0].createdAt = "2026-01-01T00:00:00.000Z";
            d.habits![0].updatedAt = d.habits![0].createdAt;
            d.habitPlans![0].createdAt = d.habits![0].createdAt;
            d.habitPaths![0].createdAt = d.habits![0].createdAt;
            d.habitPaths![0].updatedAt = d.habits![0].createdAt;
            d.habits![0].timeZone = "America/New_York";
            d.habitPlans!.filter((p) => p.habitId === "reading").forEach(
                (p) => (p.timeZone = "America/New_York"),
            );
            e.localDate = localDate;
            e.timeZone = "America/New_York";
            e.dayStart = new Date(start.epochMilliseconds).toISOString();
            e.dayEnd = new Date(
                start.add({ days: 1 }).epochMilliseconds,
            ).toISOString();
            e.recordedAt = e.dayEnd;
            e.updatedAt = e.dayEnd;
            if (localDate >= "2026-10-10") {
                e.planId = "hp2";
                Object.assign(e.result, { threshold: 2 });
            }
            expect(validateBackup(d).habitEntries).toEqual(d.habitEntries);
            expect(
                (Date.parse(e.dayEnd) - Date.parse(e.dayStart)) / 3600000,
            ).toBe(localDate.includes("03-08") ? 23 : 25);
        },
    );
    it.each([
        [0.001, 1],
        [1.001, 1001],
        [0.125, 125],
        [0, 0],
        [NaN, null],
        [Infinity, null],
        [-1, null],
        [0.0001, null],
    ])("دقة الكمية %s→%s", (value, expected) =>
        expect(scaledQuantity(value)).toBe(expected),
    );
});

it("يرفض بصمات دمج تالفة بدل حفظ إعداد يعطل عمليات الدمج التالية", () => {
    const d = habitFixture();
    Object.assign(d, {
        paceSettings: [{ id: "pace", activeLimit: 3, importDigests: "bad" }],
    });
    expect(() => validateBackup(d)).toThrow("غير صالحة");
});

it("يحافظ على بصمات النصوص القديمة غير القياسية بدل رفض نسخة كانت مدعومة", () => {
    const d = habitFixture();
    d.version = 4;
    for (const key of habitStores) delete d[key];
    d.paceSettings = [
        {
            id: "pace",
            activeLimit: 3,
            importDigests: ["legacy-receipt", "legacy-receipt"],
        },
    ];
    expect(validateBackup(d).paceSettings![0].importDigests).toEqual([
        "legacy-receipt",
        "legacy-receipt",
    ]);
});
