// Preact + htm одним файлом с CDN: JSX-подобная разметка без сборки.
// Service worker кэширует этот файл, поэтому приложение работает и офлайн.
export {
  html,
  render,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useContext,
  createContext,
} from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
