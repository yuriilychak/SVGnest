import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

export default async function fetchLocales() {
    return new Promise<void>(async resolve => {
        const localesRaw = await fetch(`${window.location.origin}/assets/en-us.json`);
        const translation = await localesRaw.json();
        const defaultLocale = 'en-US';

        i18n.use(LanguageDetector)
            .use(initReactI18next)
            .init({
                debug: false,
                fallbackLng: defaultLocale,
                resources: { [defaultLocale]: { translation } }
            })
            .catch(error => {
                throw error;
            });

        resolve();
    });
}
