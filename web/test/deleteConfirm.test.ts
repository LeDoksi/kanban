import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmStep } from '../src/deleteConfirm.ts';

test('первое «Удалить» только просит подтверждения', () => {
  assert.deepEqual(confirmStep('idle', 'delete'), { state: 'confirm', perform: false });
});

test('второе «Удалить» удаляет', () => {
  assert.deepEqual(confirmStep('confirm', 'delete'), { state: 'idle', perform: true });
});

test('закрытие меню сбрасывает подтверждение', () => {
  assert.deepEqual(confirmStep('confirm', 'close'), { state: 'idle', perform: false });
});
