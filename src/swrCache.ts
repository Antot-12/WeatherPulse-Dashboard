export type CacheEntry<T> = {
    value: T;
    updatedAt: number;
    freshUntil: number;
    staleUntil: number;
};

export class SwrCache {
    private map = new Map<string, CacheEntry<any>>();
    constructor(private maxEntries = 500) {}

    get<T>(key: string): CacheEntry<T> | null {
        return (this.map.get(key) as CacheEntry<T> | undefined) ?? null;
    }

    set<T>(key: string, entry: CacheEntry<T>) {
        this.map.set(key, entry);
        this.evictIfNeeded();
    }

    delete(key: string) {
        this.map.delete(key);
    }

    size() {
        return this.map.size;
    }

    keys() {
        return [...this.map.keys()];
    }

    private evictIfNeeded() {
        if (this.map.size <= this.maxEntries) return;
        // FIFO eviction
        const over = this.map.size - this.maxEntries;
        const it = this.map.keys();
        for (let i = 0; i < over; i++) {
            const k = it.next().value;
            if (k) this.map.delete(k);
        }
    }
}
