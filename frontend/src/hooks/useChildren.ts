import { useState, useCallback } from 'react';

export interface ChildRecord {
  child_id: string;
  nickname: string;
  age: number;
  gender: string;
}

const CHILDREN_KEY = 'storybook_children';
const ACTIVE_ID_KEY = 'storybook_active_child_id';

function load(): ChildRecord[] {
  try { return JSON.parse(localStorage.getItem(CHILDREN_KEY) || '[]'); } catch { return []; }
}

export function useChildren() {
  const [children, setChildren] = useState<ChildRecord[]>(load);
  const [activeId, setActiveIdState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_ID_KEY)
  );

  const activeChild = children.find(c => c.child_id === activeId) ?? null;

  /** 保存孩子档案（新建或更新），返回 child_id */
  const saveChild = useCallback((
    data: { nickname: string; age: number; gender: string },
    existingId?: string
  ): string => {
    const id = existingId ?? 'ch_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const child: ChildRecord = { child_id: id, ...data };
    setChildren(prev => {
      const idx = prev.findIndex(c => c.child_id === id);
      const next = idx >= 0 ? prev.map(c => c.child_id === id ? child : c) : [...prev, child];
      localStorage.setItem(CHILDREN_KEY, JSON.stringify(next));
      return next;
    });
    setActiveIdState(id);
    localStorage.setItem(ACTIVE_ID_KEY, id);
    return id;
  }, []);

  const selectChild = useCallback((child_id: string | null) => {
    setActiveIdState(child_id);
    if (child_id) localStorage.setItem(ACTIVE_ID_KEY, child_id);
    else localStorage.removeItem(ACTIVE_ID_KEY);
  }, []);

  return { children, activeChild, activeId, saveChild, selectChild };
}
