"use client";

export class NavigationGuard {
  private static instance: NavigationGuard;
  private hasUnsavedChanges = false;
  private warningMessage = "You have unsaved changes. Are you sure you want to leave?";

  private constructor() {}

  static getInstance(): NavigationGuard {
    if (!NavigationGuard.instance) {
      NavigationGuard.instance = new NavigationGuard();
    }
    return NavigationGuard.instance;
  }

  setUnsavedChanges(hasChanges: boolean, message?: string) {
    this.hasUnsavedChanges = hasChanges;
    if (message) {
      this.warningMessage = message;
    }
  }

  
  public setHasUnsavedChanges(state: boolean) {
    this.hasUnsavedChanges = state;
  }

  getHasUnsavedChanges(): boolean {
    return this.hasUnsavedChanges;
  }

  confirmNavigation(): boolean {
    if (this.hasUnsavedChanges) {
      return window.confirm(this.warningMessage);
    }
    return true;
  }

  clearUnsavedChanges() {
    this.hasUnsavedChanges = false;
  }
}