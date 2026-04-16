// VCCA - Navigation Mode Filtering Tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, expect, it } from 'vitest';
import {
  getVisibleNavigation,
  getVisibleNavLinks,
  navLinks,
  type NavigationItem,
} from './navigation';

function onlyLinkNames(items: NavigationItem[]): string[] {
  return items
    .filter((item) => item.type === 'link')
    .map((item) => item.name);
}

describe('navigation mode filtering', () => {
  it('hides advanced links in guided mode', () => {
    const visible = getVisibleNavigation('guided');
    const names = onlyLinkNames(visible);

    // Guided mode hides Todos and GSD Preferences; all other links are visible
    expect(names).not.toContain('Todos');
    expect(names).not.toContain('GSD Preferences');
    expect(names).toContain('Projects');
    expect(names).toContain('Terminal');
    expect(names).toContain('Notifications');
    expect(names).toContain('Settings');
  });

  it('keeps all links in expert mode', () => {
    const visible = getVisibleNavigation('expert');
    const names = onlyLinkNames(visible);

    expect(names).toContain('Projects');
    expect(names).toContain('Todos');
    expect(names).toContain('Terminal');
    expect(names).toContain('Notifications');
    expect(names).toContain('GSD Preferences');
    expect(names).toContain('Settings');
  });

  it('drops empty sections after guided filtering', () => {
    const visible = getVisibleNavigation('guided');
    const sections = visible
      .filter((item) => item.type === 'section')
      .map((item) => item.label);

    // All sections that have visible links should be present
    expect(sections).toContain('Workspace');
    expect(sections).toContain('System');
  });

  it('returns only visible links from getVisibleNavLinks', () => {
    const guidedLinks = getVisibleNavLinks('guided').map((link) => link.name);

    expect(guidedLinks).not.toContain('Todos');
    expect(guidedLinks).not.toContain('GSD Preferences');
    expect(guidedLinks).toContain('Projects');
    expect(guidedLinks).toContain('Terminal');
    expect(guidedLinks).toContain('Notifications');
    expect(guidedLinks).toContain('Settings');
  });

  it('keeps navLinks as full unfiltered label lookup source', () => {
    const labels = navLinks.map((link) => link.name);

    expect(labels).toContain('Todos');
    expect(labels).toContain('GSD Preferences');
  });
});
