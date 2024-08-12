import { useCallback, useState, useMemo, memo, FC } from 'react';
import { useTranslation } from 'react-i18next';

import { HelpItem } from './help-item';
import { ButtonGroup, SharedDrawer } from '../shared';
import { BUTTON_CONFIG, HELP_CONTENT_CONFIG } from './constants';
import { BUTTON_ACTION } from '../types';
import { SplashScreenProps } from './types';
import { Logo } from '../assets';

import './styles.scss';

const SplashScreen: FC<SplashScreenProps> = ({ onOpenApp }) => {
    const { t } = useTranslation();
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const helpContent = useMemo(() => HELP_CONTENT_CONFIG.map(config => <HelpItem {...config} key={config.id} t={t} />), [t]);

    const handleAction = useCallback(
        (action: BUTTON_ACTION) => {
            switch (action) {
                case BUTTON_ACTION.DEMO:
                case BUTTON_ACTION.OPEN:
                    onOpenApp(action === BUTTON_ACTION.DEMO);
                    break;
                case BUTTON_ACTION.CODE:
                    window.open('https://github.com/Jack000/SVGnest', '_blank');
                    break;
                default:
                    setDrawerOpen(action === BUTTON_ACTION.OPEN_FAQ);
            }
        },
        [onOpenApp]
    );

    return (
        <div className="flexCenter splashScreenRoot">
            <Logo />
            <p className="splashScreenTitle">{t('splashScreen.title')}</p>
            <p className="splashScreenSubtitle">{t('splashScreen.subtitle')}</p>
            <ButtonGroup buttonsConfig={BUTTON_CONFIG} onClick={handleAction} localePrefix="splashScreen.buttons" />
            <SharedDrawer
                isOpen={isDrawerOpen}
                onClose={handleAction}
                closeAction={BUTTON_ACTION.CLOSE_FAQ}
                title={t('splashScreen.helpDrawer.title')}
            >
                {helpContent}
            </SharedDrawer>
        </div>
    );
};

export default memo(SplashScreen);
