// Удаление в два шага внутри меню вместо window.confirm: первый выбор
// превращает пункт в «Удалить навсегда?», второй удаляет. Закрыл меню —
// начинай сначала, чтобы случайный второй тап через минуту не удалил.
export function confirmStep(
  state: 'idle' | 'confirm', event: 'delete' | 'close',
): { state: 'idle' | 'confirm'; perform: boolean } {
  if (event === 'close') return { state: 'idle', perform: false };
  return state === 'idle' ? { state: 'confirm', perform: false } : { state: 'idle', perform: true };
}
