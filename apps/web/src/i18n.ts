import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en-us.json';
import de from './de.json';
import es from './es.json';
import pl from './pl.json';
import ru from './ru.json';
import uk from './uk.json';

export default async function fetchLocales() {
    const defaultLocale = 'en';
    await i18n.use(LanguageDetector).use(initReactI18next).init({
        debug: false,
        fallbackLng: defaultLocale,
        supportedLngs: ['en', 'de', 'es', 'pl', 'ru', 'uk'],
        nonExplicitSupportedLngs: true,
        resources: {
            en: { translation: en }, de: { translation: de }, es: { translation: es },
            pl: { translation: pl }, ru: { translation: ru }, uk: { translation: uk }
        }
    });
}
