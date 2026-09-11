import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessType, stripPrefix } from '../src/guess.ts';

test('слово "баг" в начале даёт тип bug', () => {
  assert.equal(guessType('баг: календарь не листает'), 'bug');
  assert.equal(guessType('Починить календарь'), 'bug');
  assert.equal(guessType('не работает вход'), 'bug');
});

test('слова про уборку дают тип chore', () => {
  assert.equal(guessType('рефактор гейта'), 'chore');
  assert.equal(guessType('почистить мёртвый код'), 'chore');
});

test('обычный текст остаётся задачей', () => {
  assert.equal(guessType('Добавить экран архива'), 'task');
  assert.equal(guessType(''), 'task');
});

test('слово-признак в середине не считается', () => {
  assert.equal(guessType('Добавить отчёт про баги'), 'task');
});

test('префикс до двоеточия срезается', () => {
  assert.equal(stripPrefix('баг: календарь не листает'),
    'календарь не листает');
  assert.equal(stripPrefix('чиним:   пробелы  '), 'пробелы');
});

test('текст без префикса не трогается', () => {
  assert.equal(stripPrefix('Добавить экран архива'), 'Добавить экран архива');
});

test('текст, состоящий из одного префикса, не превращается в пустоту', () => {
  assert.equal(stripPrefix('баг:'), 'баг:');
});
