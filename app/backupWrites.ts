const pending = new Set<Promise<unknown>>();
export function trackBackupWrite<T>(operation: () => Promise<T>): Promise<T> {
    const write = operation();
    pending.add(write);
    void write.then(
        () => pending.delete(write),
        () => pending.delete(write),
    );
    return write;
}
export async function flushBackupWrites() {
    while (pending.size) await Promise.all(pending);
}
