export const primarySections = ["habits", "home", "projects"] as const;
export type PrimarySection = (typeof primarySections)[number];

/** Legacy URLs retain their meaning; only their primary parent changes. */
export function primarySection(route: string): PrimarySection | null {
    const page = route.split("/")[0];
    if (page === "home" || page === "today") return "home";
    if (["habits", "habit", "habit-path"].includes(page)) return "habits";
    if (
        [
            "projects",
            "project",
            "step",
            "tasks",
            "task",
            "calendar",
            "ideas",
            "idea",
            "progress",
        ].includes(page)
    )
        return "projects";
    return null;
}

export function workspacePage(route: string) {
    return ["tasks", "ideas", "progress", "calendar"].includes(
        route.split("/")[0],
    );
}
