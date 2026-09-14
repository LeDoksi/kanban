import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, prefixify } from '../src/slug.ts';

test('slugify: транслитерация кириллицы, пробелы в дефисы', () => {
  assert.equal(slugify('Семейное приложение'), 'semeynoe-prilozhenie');
});

test('slugify: латиница проходит как есть, пробелы в дефисы', () => {
  assert.equal(slugify('Family App'), 'family-app');
});

test('slugify: схлопывает повторяющиеся разделители и обрезает края', () => {
  assert.equal(slugify('  Тест!!  Проект  '), 'test-proekt');
});

test('slugify: пусто на входе — пусто на выходе', () => {
  assert.equal(slugify(''), '');
});

test('slugify: строка без букв/цифр — пустой слаг', () => {
  assert.equal(slugify('!!!'), '');
});

test('prefixify: первые 3 буквы слага без дефисов, в верхнем регистре', () => {
  assert.equal(prefixify('semeynoe-prilozhenie'), 'SEM');
  assert.equal(prefixify('family-app'), 'FAM');
});

test('prefixify: короткий слаг — берёт сколько есть', () => {
  assert.equal(prefixify('ab'), 'AB');
});

test('prefixify: пустой слаг — пустой префикс', () => {
  assert.equal(prefixify(''), '');
});
