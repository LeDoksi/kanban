import { createContext, useContext } from 'react';

const CloseCtx = createContext<() => void>(() => {});
export const CloseProvider = CloseCtx.Provider;
// Кнопки «Закрыть» внутри шторки закрывают её через vaul (с анимацией),
// а не размонтируют сразу. Отдельный файл — иначе экспорт хука рядом с
// компонентами Sheet/SheetCloseButton ломает Fast Refresh (oxlint
// react/only-export-components).
export const useSheetClose = () => useContext(CloseCtx);
