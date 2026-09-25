import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Onest лежит в сборке: без запросов к Google и без подмены шрифта при
// плохой сети. unicode-range в этих CSS грузит только нужные подмножества
// (кириллица, латиница).
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
