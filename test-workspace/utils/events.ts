// Typed event emitter using generics

type EventMap = Record<string, unknown[]>;
type Listener<T extends unknown[]> = (...args: T) => void;

export class TypedEmitter<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<Listener<Events[keyof Events]>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as Listener<Events[keyof Events]>);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    this.listeners.get(event)?.delete(listener as Listener<Events[keyof Events]>);
    return this;
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as Listener<Events[K]>)(...args);
    }
  }
}
