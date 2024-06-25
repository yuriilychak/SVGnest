import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enUsLocales from './en-us.json';

i18n.use(LanguageDetector)
    .use(initReactI18next)
    .init({
        debug: false,
        fallbackLng: 'en-US',
        resources: {
            'en-US': { translation: enUsLocales }
        }
    })
    .catch(error => {
        throw error;
    });

export default i18n;
