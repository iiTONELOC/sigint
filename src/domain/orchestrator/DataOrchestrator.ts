import { type DataProvider } from "@/domain/providers/base/types";

export class DataOrchestrator {
  private readonly providers = new Map<string, DataProvider<unknown>>();

  constructor(providers: Array<DataProvider<unknown>>) {
    providers.forEach((provider) => {
      this.providers.set(provider.id, provider);
    });
  }

  initialize(): void {
    for (const provider of this.providers.values()) {
      provider.hydrate();
    }
  }

  async refresh(providerId?: string): Promise<void> {
    if (providerId) {
      const provider = this.providers.get(providerId);
      if (!provider) return;
      await provider.refresh();
      return;
    }

    await Promise.all(
      Array.from(this.providers.values()).map((p) => p.refresh()),
    );
  }

  getProvider<TEntity>(id: string): DataProvider<TEntity> | undefined {
    return this.providers.get(id) as DataProvider<TEntity> | undefined;
  }
}
