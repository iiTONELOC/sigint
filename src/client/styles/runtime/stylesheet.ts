export class RuntimeStylesheet {
  readonly #rules = new Map<string, readonly string[]>();
  #stylesheet: CSSStyleSheet | null = null;

  update(ownerId: string, rules: readonly string[]): void {
    this.#rules.set(ownerId, rules);
    this.#refresh();
  }

  remove(ownerId: string): void {
    this.#rules.delete(ownerId);
    this.#refresh();
  }

  #ensureStylesheet(): CSSStyleSheet | null {
    if (
      this.#stylesheet ||
      typeof document === "undefined" ||
      typeof CSSStyleSheet === "undefined" ||
      !("adoptedStyleSheets" in document)
    ) {
      return this.#stylesheet;
    }

    this.#stylesheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [
      ...document.adoptedStyleSheets,
      this.#stylesheet,
    ];
    return this.#stylesheet;
  }

  #refresh(): void {
    const stylesheet = this.#ensureStylesheet();
    if (!stylesheet) return;
    stylesheet.replaceSync(Array.from(this.#rules.values()).flat().join(""));
  }
}
