import { useCallback, useState, useEffect, FC } from 'react';
import { useTranslation } from 'react-i18next';

import { SplashScreen } from './splash-screen';
import { AppFlow } from './app-flow';
import { FADE_STATUS } from './types';

const App: FC = () => {
    const [isApp, setApp] = useState(false);
    const [isDemoMode, setDemoMode] = useState(false);
    const [fadeState, setFadeState] = useState<FADE_STATUS>(FADE_STATUS.NONE);
    const { t, i18n } = useTranslation();

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
            <label className="languageSelector">
                <span className="visuallyHidden">{t('languageSelector.label')}</span>
                <select value={i18n.resolvedLanguage ?? i18n.language} onChange={event => void i18n.changeLanguage(event.target.value)}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="pl">Polski</option>
                    <option value="de">Deutsch</option>
                    <option value="ru">Русский</option>
                    <option value="uk">Українська</option>
                </select>
            </label>
            {isApp ? (
                <AppFlow onClose={handleUpdateScreen} isDemoMode={isDemoMode} />
            ) : (
                <SplashScreen onOpenApp={handleOpenApp} />
            )}
        </div>
    );
};

export default App;
