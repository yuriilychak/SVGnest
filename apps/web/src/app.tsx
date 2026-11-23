import { useCallback, useState, useEffect, FC } from 'react';
import { useTranslation } from 'react-i18next';

import { SplashScreen } from './splash-screen';
import { AppFlow } from './app-flow';
import { FADE_STATUS } from './types';

const LANGUAGES = ['en', 'es', 'pl', 'de', 'ru', 'uk'] as const;

const App: FC = () => {
    const [isApp, setApp] = useState(false);
    const [isDemoMode, setDemoMode] = useState(false);
    const [fadeState, setFadeState] = useState<FADE_STATUS>(FADE_STATUS.NONE);
    const { t, i18n } = useTranslation();
    const locale = (i18n.resolvedLanguage ?? i18n.language).split('-')[0];
    const language = LANGUAGES.includes(locale as typeof LANGUAGES[number]) ? locale : 'en';
    const switchLanguage = useCallback(() => {
        const index = LANGUAGES.indexOf(language as typeof LANGUAGES[number]);
        void i18n.changeLanguage(LANGUAGES[(index + 1) % LANGUAGES.length]);
    }, [i18n, language]);

    const handleUpdateScreen = useCallback((nextDemoMode: boolean = false, nextApp: boolean = false) => {
        setFadeState(FADE_STATUS.FADING); // Start fading out

        setTimeout(() => {
            setDemoMode(nextDemoMode);
            setApp(nextApp);
            setFadeState(FADE_STATUS.FADED); // Start fading in
        }, 300); // Duration of fade-out animation
    }, []);

    const handleOpenApp = useCallback((nextDemoMode: boolean) => handleUpdateScreen(nextDemoMode, true), [handleUpdateScreen]);

    useEffect(() => {
        const metaElement = document.getElementById('metaDescription');
        document.title = t('root.title');

        metaElement.setAttribute('content', t('root.description'));
    }, [t]);

    return (
        <div className={`fadeContainer ${fadeState}`}>
            <button className="languageSelector" type="button" onClick={switchLanguage} title={t('languageSelector.label')} aria-label={`${t('languageSelector.label')}: ${language.toUpperCase()}`}>
                {language.toUpperCase()}
            </button>
            {isApp ? (
                <AppFlow onClose={handleUpdateScreen} isDemoMode={isDemoMode} />
            ) : (
                <SplashScreen onOpenApp={handleOpenApp} />
            )}
        </div>
    );
};

export default App;
