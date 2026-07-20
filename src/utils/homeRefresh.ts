type HomeRefreshListener = () => (void | Promise<void>);

const listeners = new Set<HomeRefreshListener>();

export function subscribeHomeRefresh(listener: HomeRefreshListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function requestHomeRefresh(): Promise<void> {
  for (const listener of listeners) {
    await listener();
  }
}
