import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import translation from './en-us.json';

export default async function fetchLocales() {
    const defaultLocale = 'en-US';
    await i18n.use(LanguageDetector).use(initReactI18next).init({
        debug: false,
        fallbackLng: defaultLocale,
        resources: { [defaultLocale]: { translation } }
    });
}
