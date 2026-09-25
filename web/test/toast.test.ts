import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToastStore } from '../src/ui/toast.ts';

function fakeTimers() {
  let fn: (() => void) | null = null;
  return {
    timers: {
      set: ((cb: () => void) => { fn = cb; return 1; }) as unknown as typeof setTimeout,
      clear: (() => { fn = null; }) as unknown as typeof clearTimeout,
    },
    fire: () => fn?.(),
  };
}

test('show → get возвращает тост, по таймеру исчезает', () => {
  const t = fakeTimers();
  const s = createToastStore(t.timers);
  s.show('Ошибка сети');
  assert.equal(s.get()?.text, 'Ошибка сети');
  t.fire();
  assert.equal(s.get(), null);
});

test('новый тост заменяет старый, у каждого свой id', () => {
  const s = createToastStore(fakeTimers().timers);
  s.show('первый');
  const a = s.get()!.id;
  s.show('второй');
  assert.equal(s.get()?.text, 'второй');
  assert.notEqual(s.get()!.id, a);
});

test('подписчик получает уведомление, отписка работает', () => {
  const s = createToastStore(fakeTimers().timers);
  let n = 0;
  const off = s.subscribe(() => { n += 1; });
  s.show('a');
  s.dismiss();
  off();
  s.show('b');
  assert.equal(n, 2);
});
